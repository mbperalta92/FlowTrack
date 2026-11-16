import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { findOrCreateProcessFolder, uploadFileToDrive } from '../services/googleDriveService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Multer config for comment attachments
const attachmentsDir = path.join(__dirname, '..', 'uploads', 'attachments');
if (!fs.existsSync(attachmentsDir)) {
  fs.mkdirSync(attachmentsDir, { recursive: true });
}

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, attachmentsDir),
  filename: (req, file, cb) => {
    const uniqueName = `att-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
  fileFilter: (req, file, cb) => {
    // Allow common file types
    cb(null, true);
  }
});

/**
 * GET /api/processes/:id/history
 * Get full chronological feed for a process (history entries + attachments).
 */
router.get('/:id/history', authenticateToken, (req, res) => {
  try {
    const processId = req.params.id;

    // Verify process exists
    const process = db.prepare('SELECT id FROM processes WHERE id = ?').get(processId);
    if (!process) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    // Get history entries with user info
    const entries = db.prepare(`
      SELECT
        ph.id,
        ph.process_id,
        ph.user_id,
        u.full_name AS user_name,
        u.role AS user_role,
        ph.action_type,
        ph.old_value,
        ph.new_value,
        ph.comment,
        ph.created_at
      FROM process_history ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE ph.process_id = ?
      ORDER BY ph.created_at ASC
    `).all(processId);

    // Get attachments for all history entries
    if (entries.length > 0) {
      const entryIds = entries.map(e => e.id);
      const placeholders = entryIds.map(() => '?').join(',');
      const attachments = db.prepare(`
        SELECT * FROM attachments WHERE history_id IN (${placeholders})
      `).all(...entryIds);

      // Group attachments by history_id
      const attachmentMap = {};
      for (const att of attachments) {
        if (!attachmentMap[att.history_id]) {
          attachmentMap[att.history_id] = [];
        }
        attachmentMap[att.history_id].push(att);
      }

      // Attach to entries
      for (const entry of entries) {
        entry.attachments = attachmentMap[entry.id] || [];
      }
    }

    res.json(entries);
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ error: 'Erro ao obter histórico.' });
  }
});

/**
 * POST /api/processes/:id/history
 * Add a comment with optional file attachments.
 * Any authenticated user can comment on any process.
 */
router.post('/:id/history', authenticateToken, attachmentUpload.array('files', 10), async (req, res) => {
  try {
    const processId = req.params.id;
    const { comment } = req.body;

    // Verify process exists
    const process = db.prepare('SELECT id, process_id, client, google_drive_folder_id, google_drive_folder_url FROM processes WHERE id = ?').get(processId);
    if (!process) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    // Require at least a comment or files
    if (!comment && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Deve fornecer um comentário ou ficheiro(s).' });
    }

    // Insert history entry
    const historyResult = db.prepare(`
      INSERT INTO process_history (process_id, user_id, action_type, comment)
      VALUES (?, ?, 'comment', ?)
    `).run(processId, req.user.id, comment || null);

    const historyId = historyResult.lastInsertRowid;

    // Insert attachments & sync with Google Drive if credentials are configured
    const attachments = [];
    if (req.files && req.files.length > 0) {
      let targetFolderId = process.google_drive_folder_id;

      // Ensure process has a Google Drive subfolder if credentials exist
      const driveFolder = await findOrCreateProcessFolder(
        process.process_id,
        process.client,
        process.google_drive_folder_id
      );

      if (driveFolder.folderId && driveFolder.folderId !== process.google_drive_folder_id) {
        targetFolderId = driveFolder.folderId;
        db.prepare(`
          UPDATE processes
          SET google_drive_folder_id = ?, google_drive_folder_url = ?
          WHERE id = ?
        `).run(driveFolder.folderId, driveFolder.folderUrl, process.id);
      }

      const attachStmt = db.prepare(`
        INSERT INTO attachments (history_id, filename, original_name, mime_type, size, google_drive_file_id, google_drive_file_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const file of req.files) {
        const localFilePath = path.join(attachmentsDir, file.filename);
        const driveUpload = await uploadFileToDrive(
          targetFolderId,
          localFilePath,
          file.originalname,
          file.mimetype
        );

        attachStmt.run(
          historyId,
          file.filename,
          file.originalname,
          file.mimetype,
          file.size,
          driveUpload.driveFileId,
          driveUpload.driveFileUrl
        );

        attachments.push({
          filename: file.filename,
          original_name: file.originalname,
          mime_type: file.mimetype,
          size: file.size,
          google_drive_file_id: driveUpload.driveFileId,
          google_drive_file_url: driveUpload.driveFileUrl
        });
      }
    }

    // Fetch the created entry
    const entry = db.prepare(`
      SELECT
        ph.id,
        ph.process_id,
        ph.user_id,
        u.full_name AS user_name,
        u.role AS user_role,
        ph.action_type,
        ph.old_value,
        ph.new_value,
        ph.comment,
        ph.created_at
      FROM process_history ph
      LEFT JOIN users u ON ph.user_id = u.id
      WHERE ph.id = ?
    `).get(historyId);

    entry.attachments = attachments;

    res.status(201).json(entry);
  } catch (err) {
    console.error('Add history error:', err);
    res.status(500).json({ error: 'Erro ao adicionar comentário.' });
  }
});

export default router;
