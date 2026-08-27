import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';
import db from '../database/init.js';
import { authenticateToken, requireRole, canEditProcess } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Multer config for Excel imports
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `import-${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const importUpload = multer({
  storage: importStorage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas ficheiros Excel (.xlsx, .xls) ou CSV são permitidos.'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const VALID_TYPES = ['PROC', 'ADT', 'ESC'];
const VALID_STATUSES = ['ABERTO', 'FECHADO'];
const VALID_MILESTONES = ['FILA', 'AGENDADO', 'PENDENTE', 'ELABORAÇÃO', 'ANÁLISE', 'SUPERVISÃO'];
const VALID_PRIORITIES = ['Baixa', 'Media', 'Alta'];

/**
 * Generate the next process_id for a given type.
 * Format: TYPE-001, TYPE-002, etc.
 */
function generateProcessId(type) {
  const prefix = type || 'PROC';
  const lastProcess = db.prepare(`
    SELECT process_id FROM processes
    WHERE process_id LIKE ? || '-%'
    ORDER BY id DESC LIMIT 1
  `).get(prefix);

  let nextNum = 1;
  if (lastProcess) {
    const parts = lastProcess.process_id.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  return `${prefix}-${String(nextNum).padStart(3, '0')}`;
}

/**
 * Create notifications for milestone changes and technician assignments.
 */
function createMilestoneNotifications(processId, processDisplayId, newMilestone) {
  if (newMilestone === 'SUPERVISÃO') {
    // Notify all admin and key_user users
    const admins = db.prepare(`
      SELECT id, email, full_name FROM users WHERE role IN ('key_user', 'admin', 'both')
    `).all();

    const notifStmt = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, process_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const admin of admins) {
      notifStmt.run(
        admin.id,
        'milestone_supervisao',
        'Processo em Supervisão',
        `O processo ${processDisplayId} avançou para a fase de SUPERVISÃO.`,
        processId
      );
      
      // Send Email
      if (admin.email) {
        sendEmail(
          admin.email,
          `REPFIX - Processo em Supervisão (${processDisplayId})`,
          `Olá ${admin.full_name},\n\nO processo ${processDisplayId} avançou para a fase de SUPERVISÃO.\nPor favor, verifique a plataforma FlowTrack para mais detalhes.\n\nCom os melhores cumprimentos,\nEquipa REPFIX`
        );
      }
    }
  }
}

function createAssignmentNotification(processId, processDisplayId, technicianId) {
  const notifStmt = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, process_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  notifStmt.run(
    technicianId,
    'assignment',
    'Processo Atribuído',
    `O processo ${processDisplayId} foi-lhe atribuído.`,
    processId
  );
  
  // Send Email
  const tech = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(technicianId);
  if (tech && tech.email) {
    sendEmail(
      tech.email,
      `REPFIX - Novo Processo Atribuído (${processDisplayId})`,
      `Olá ${tech.full_name},\n\nFoi-lhe atribuído o processo ${processDisplayId}.\nPor favor, verifique a plataforma FlowTrack para mais detalhes e acompanhamento.\n\nCom os melhores cumprimentos,\nEquipa REPFIX`
    );
  }
}

/**
 * GET /api/processes
 * List all processes with joins. Support filtering.
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, milestone, technician_id, priority, client, type } = req.query;

    let sql = `
      SELECT
        p.*,
        u.full_name AS technician_name,
        m.full_name AS manager_name,
        c.full_name AS created_by_name
      FROM processes p
      LEFT JOIN users u ON p.technician_id = u.id
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN users c ON p.created_by = c.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      sql += ' AND p.status = ?';
      params.push(status);
    }
    if (milestone) {
      sql += ' AND p.milestone = ?';
      params.push(milestone);
    }
    if (req.user.role === 'technician') {
      sql += ' AND p.technician_id = ?';
      params.push(req.user.id);
    } else if (technician_id) {
      sql += ' AND p.technician_id = ?';
      params.push(parseInt(technician_id, 10));
    }
    const { manager_id } = req.query;
    if (manager_id) {
      sql += ' AND p.manager_id = ?';
      params.push(parseInt(manager_id, 10));
    }
    if (priority) {
      sql += ' AND p.priority = ?';
      params.push(priority);
    }
    if (client) {
      sql += ' AND (p.client LIKE ? OR p.client_code LIKE ? OR p.process_id LIKE ?)';
      const term = `%${client}%`;
      params.push(term, term, term);
    }
    if (type) {
      sql += ' AND p.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY p.created_at DESC';

    const processes = db.prepare(sql).all(...params);
    res.json(processes);
  } catch (err) {
    console.error('List processes error:', err);
    res.status(500).json({ error: 'Erro ao listar processos.' });
  }
});

/**
 * POST /api/processes
 * Create a new process (admin/key_user only).
 */
router.post('/', authenticateToken, requireRole('admin', 'key_user'), (req, res) => {
  try {
    const {
      type = 'PROC',
      parent_id,
      client,
      client_code,
      address,
      description,
      technician_id,
      manager_id,
      priority = 'Media',
      milestone = 'FILA',
      schedule_date,
      next_intervention_date
    } = req.body;

    let final_next_intervention_date = next_intervention_date;
    if (!final_next_intervention_date && schedule_date) {
      final_next_intervention_date = schedule_date;
    }

    // Validate required fields
    if (!client) {
      return res.status(400).json({ error: 'Campo "client" é obrigatório.' });
    }

    // Validate enums
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Valores: ${VALID_TYPES.join(', ')}` });
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `Prioridade inválida. Valores: ${VALID_PRIORITIES.join(', ')}` });
    }
    if (!VALID_MILESTONES.includes(milestone)) {
      return res.status(400).json({ error: `Milestone inválido. Valores: ${VALID_MILESTONES.join(', ')}` });
    }

    // Validate parent_id if provided
    if (parent_id) {
      const parent = db.prepare('SELECT id FROM processes WHERE id = ?').get(parent_id);
      if (!parent) {
        return res.status(400).json({ error: 'Processo pai não encontrado.' });
      }
    }

    // Validate technician_id if provided
    if (technician_id) {
      const tech = db.prepare('SELECT id, role FROM users WHERE id = ?').get(technician_id);
      if (!tech) {
        return res.status(400).json({ error: 'Técnico não encontrado.' });
      }
    }

    // Validate manager_id if provided
    if (manager_id) {
      const manager = db.prepare('SELECT id, role FROM users WHERE id = ?').get(manager_id);
      if (!manager) {
        return res.status(400).json({ error: 'Gestor não encontrado.' });
      }
    }

    // Generate process_id
    const processId = generateProcessId(type);

    const stmt = db.prepare(`
      INSERT INTO processes (process_id, type, parent_id, client, client_code, address, description, technician_id, manager_id, priority, milestone, schedule_date, next_intervention_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      processId,
      type,
      parent_id || null,
      client,
      client_code || null,
      address || null,
      description || null,
      technician_id || null,
      manager_id || null,
      priority,
      milestone,
      schedule_date || null,
      final_next_intervention_date || null,
      req.user.id
    );

    const newId = result.lastInsertRowid;

    // Create history entry for creation
    db.prepare(`
      INSERT INTO process_history (process_id, user_id, action_type, new_value, comment)
      VALUES (?, ?, 'creation', ?, ?)
    `).run(newId, req.user.id, processId, `Processo ${processId} criado.`);

    // Create assignment notification if technician assigned
    if (technician_id) {
      createAssignmentNotification(newId, processId, technician_id);
    }

    // Fetch the created process with joins
    const newProcess = db.prepare(`
      SELECT p.*, u.full_name AS technician_name, m.full_name AS manager_name, c.full_name AS created_by_name
      FROM processes p
      LEFT JOIN users u ON p.technician_id = u.id
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN users c ON p.created_by = c.id
      WHERE p.id = ?
    `).get(newId);

    res.status(201).json(newProcess);
  } catch (err) {
    console.error('Create process error:', err);
    res.status(500).json({ error: 'Erro ao criar processo.' });
  }
});

/**
 * POST /api/processes/import
 * Import processes from an Excel file.
 */
router.post('/import', authenticateToken, requireRole('admin', 'key_user'), importUpload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ficheiro não fornecido.' });
    }

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Ficheiro Excel vazio.' });
    }

    const created = [];
    const errors = [];

    const insertProcess = db.prepare(`
      INSERT INTO processes (process_id, type, client, client_code, description, priority, milestone, schedule_date, next_intervention_date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO process_history (process_id, user_id, action_type, new_value, comment)
      VALUES (?, ?, 'creation', ?, ?)
    `);

    const importTransaction = db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 for header row + 0-index

        // Map columns (support various common names)
        const client = row.client || row.Client || row.cliente || row.Cliente || row.CLIENTE;
        const client_code = row.client_code || row.codigo_cliente || row['Código Cliente'] || row.codigo || null;
        const type = row.type || row.Type || row.tipo || row.Tipo || row.TIPO || 'PROC';
        const description = row.description || row.Description || row.descricao || row.Descricao || row.DESCRICAO || row['Descrição'] || null;
        const priority = row.priority || row.Priority || row.prioridade || row.Prioridade || row.PRIORIDADE || 'Media';
        const milestone = row.milestone || row.Milestone || row.MILESTONE || row.fase || row.Fase || 'FILA';
        const schedule_date = row.schedule_date || row.data_agendamento || row['Data Agendamento'] || null;
        const next_intervention_date = row.next_intervention_date || row.proxima_intervencao || row['Próxima Intervenção'] || null;

        if (!client) {
          errors.push({ row: rowNum, error: 'Campo "client" em falta.' });
          continue;
        }

        if (!VALID_TYPES.includes(type)) {
          errors.push({ row: rowNum, error: `Tipo inválido: ${type}` });
          continue;
        }

        if (!VALID_PRIORITIES.includes(priority)) {
          errors.push({ row: rowNum, error: `Prioridade inválida: ${priority}` });
          continue;
        }

        if (!VALID_MILESTONES.includes(milestone)) {
          errors.push({ row: rowNum, error: `Milestone inválido: ${milestone}` });
          continue;
        }

        const processId = generateProcessId(type);

        const result = insertProcess.run(
          processId, type, client, client_code, description, priority, milestone,
          schedule_date || null, next_intervention_date || null, req.user.id
        );

        insertHistory.run(
          result.lastInsertRowid, req.user.id, processId,
          `Processo ${processId} importado via Excel.`
        );

        created.push({ row: rowNum, process_id: processId });
      }
    });

    importTransaction();

    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

    res.status(201).json({
      message: `Importação concluída. ${created.length} processos criados.`,
      created,
      errors,
      total_rows: rows.length
    });
  } catch (err) {
    console.error('Import processes error:', err);
    // Clean up uploaded file on error
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
    }
    res.status(500).json({ error: 'Erro ao importar processos.' });
  }
});

/**
 * GET /api/processes/:id
 * Get full process details including technician info and parent process info.
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const process = db.prepare(`
      SELECT
        p.*,
        u.full_name AS technician_name,
        u.email AS technician_email,
        m.full_name AS manager_name,
        m.email AS manager_email,
        c.full_name AS created_by_name,
        pp.process_id AS parent_process_id,
        pp.client AS parent_client,
        pp.status AS parent_status
      FROM processes p
      LEFT JOIN users u ON p.technician_id = u.id
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN users c ON p.created_by = c.id
      LEFT JOIN processes pp ON p.parent_id = pp.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!process) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    // Get child processes
    const children = db.prepare(`
      SELECT id, process_id, type, status, milestone, client
      FROM processes WHERE parent_id = ?
    `).all(process.id);

    res.json({ ...process, children });
  } catch (err) {
    console.error('Get process error:', err);
    res.status(500).json({ error: 'Erro ao obter processo.' });
  }
});

/**
 * PUT /api/processes/:id
 * Update process with permission checks and history tracking.
 */
router.put('/:id', authenticateToken, canEditProcess, (req, res) => {
  try {
    const process = req.process;
    let {
      status, milestone, client, client_code, address, description,
      technician_id, manager_id, priority, schedule_date, next_intervention_date, type, parent_id
    } = req.body;

    const historyEntries = [];

    let final_schedule = schedule_date !== undefined ? schedule_date : process.schedule_date;
    let final_next_int = next_intervention_date !== undefined ? next_intervention_date : process.next_intervention_date;
    
    if (!final_next_int && final_schedule) {
      final_next_int = final_schedule;
    }

    // Track changes and build update
    const updates = {};

    if (status !== undefined && status !== process.status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Valores: ${VALID_STATUSES.join(', ')}` });
      }
      updates.status = status;
      historyEntries.push({ type: 'status_change', old: process.status, new: status });
    }

    if (milestone !== undefined && milestone !== process.milestone) {
      if (!VALID_MILESTONES.includes(milestone)) {
        return res.status(400).json({ error: `Milestone inválido. Valores: ${VALID_MILESTONES.join(', ')}` });
      }
      if (req.user.role === 'technician' && ['ANÁLISE', 'SUPERVISÃO'].includes(milestone)) {
        return res.status(403).json({ error: 'Técnicos não têm permissão para mover processos para Análise ou Supervisão.' });
      }
      updates.milestone = milestone;
      historyEntries.push({ type: 'milestone_change', old: process.milestone, new: milestone });
    }

    if (client !== undefined && client !== process.client) {
      updates.client = client;
      historyEntries.push({ type: 'client_change', old: process.client, new: client });
    }

    if (client_code !== undefined && client_code !== process.client_code) {
      updates.client_code = client_code;
      historyEntries.push({ type: 'client_code_change', old: process.client_code, new: client_code });
    }

    if (address !== undefined && address !== process.address) {
      updates.address = address;
    }

    if (description !== undefined && description !== process.description) {
      updates.description = description;
    }

    if (technician_id !== undefined && technician_id !== process.technician_id) {
      if (technician_id !== null) {
        const tech = db.prepare('SELECT id FROM users WHERE id = ?').get(technician_id);
        if (!tech) {
          return res.status(400).json({ error: 'Técnico não encontrado.' });
        }
      }
      updates.technician_id = technician_id;
      const oldTechName = process.technician_id
        ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(process.technician_id)?.full_name || 'N/A'
        : 'Nenhum';
      const newTechName = technician_id
        ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(technician_id)?.full_name || 'N/A'
        : 'Nenhum';
      historyEntries.push({ type: 'assignment', old: oldTechName, new: newTechName, comment: 'Técnico alterado' });
    }

    if (manager_id !== undefined && manager_id !== process.manager_id) {
      if (manager_id !== null) {
        const manager = db.prepare('SELECT id FROM users WHERE id = ?').get(manager_id);
        if (!manager) {
          return res.status(400).json({ error: 'Gestor não encontrado.' });
        }
      }
      updates.manager_id = manager_id;
      const oldManagerName = process.manager_id
        ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(process.manager_id)?.full_name || 'N/A'
        : 'Nenhum';
      const newManagerName = manager_id
        ? db.prepare('SELECT full_name FROM users WHERE id = ?').get(manager_id)?.full_name || 'N/A'
        : 'Nenhum';
      historyEntries.push({ type: 'manager_assignment', old: oldManagerName, new: newManagerName, comment: 'Gestor alterado' });
    }

    if (priority !== undefined && priority !== process.priority) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Prioridade inválida. Valores: ${VALID_PRIORITIES.join(', ')}` });
      }
      updates.priority = priority;
      historyEntries.push({ type: 'priority_change', old: process.priority, new: priority });
    }

    if (schedule_date !== undefined && schedule_date !== process.schedule_date) {
      updates.schedule_date = schedule_date;
      historyEntries.push({ type: 'date_change', old: process.schedule_date || 'N/A', new: schedule_date || 'N/A' });
    }

    if (final_next_int !== undefined && final_next_int !== process.next_intervention_date) {
      updates.next_intervention_date = final_next_int;
      historyEntries.push({ type: 'date_change', old: process.next_intervention_date, new: final_next_int, comment: 'Próxima intervenção alterada' });
    }

    if (type !== undefined && type !== process.type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: `Tipo inválido. Valores: ${VALID_TYPES.join(', ')}` });
      }
      updates.type = type;
    }

    if (parent_id !== undefined && parent_id !== process.parent_id) {
      if (parent_id !== null) {
        const parent = db.prepare('SELECT id FROM processes WHERE id = ?').get(parent_id);
        if (!parent) {
          return res.status(400).json({ error: 'Processo pai não encontrado.' });
        }
        if (parent_id === process.id) {
          return res.status(400).json({ error: 'Um processo não pode ser pai de si mesmo.' });
        }
      }
      updates.parent_id = parent_id;
    }

    // Nothing to update
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    }

    // Build dynamic UPDATE query
    const setClauses = Object.keys(updates).map(k => `${k} = ?`);
    setClauses.push("updated_at = datetime('now')");
    const values = Object.values(updates);
    values.push(process.id);

    db.prepare(`UPDATE processes SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    // Insert history entries
    const historyStmt = db.prepare(`
      INSERT INTO process_history (process_id, user_id, action_type, old_value, new_value, comment)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const entry of historyEntries) {
      historyStmt.run(process.id, req.user.id, entry.type, entry.old, entry.new, entry.comment || null);
    }

    // Notifications
    if (updates.milestone === 'SUPERVISÃO') {
      createMilestoneNotifications(process.id, process.process_id, 'SUPERVISÃO');
    }

    if (updates.milestone === 'ELABORAÇÃO' && req.user.role === 'technician') {
      const adminsAndKeyUsers = db.prepare(`
        SELECT id, email, full_name FROM users WHERE role IN ('key_user', 'admin', 'both')
      `).all();

      const notifStmt = db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, process_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      const messageText = `O Técnico ${req.user.full_name} concluiu a fase de campo do Processo ${process.process_id} e passou-o para Elaboração.`;

      for (const recipient of adminsAndKeyUsers) {
        notifStmt.run(
          recipient.id,
          'milestone_elaboracao',
          'Fase de Campo Concluída',
          messageText,
          process.id
        );

        if (recipient.email) {
          sendEmail(
            recipient.email,
            `REPFIX - Fase de Campo Concluída (${process.process_id})`,
            `Olá ${recipient.full_name},\n\n${messageText}\nPor favor, verifique a plataforma FlowTrack.\n\nCom os melhores cumprimentos,\nEquipa REPFIX`
          );
        }
      }
    }

    if (updates.technician_id && updates.technician_id !== null) {
      createAssignmentNotification(process.id, process.process_id, updates.technician_id);
    }

    if (updates.manager_id && updates.manager_id !== null) {
      createAssignmentNotification(process.id, process.process_id, updates.manager_id);
    }

    // Fetch updated process
    const updated = db.prepare(`
      SELECT p.*, u.full_name AS technician_name, m.full_name AS manager_name, c.full_name AS created_by_name
      FROM processes p
      LEFT JOIN users u ON p.technician_id = u.id
      LEFT JOIN users m ON p.manager_id = m.id
      LEFT JOIN users c ON p.created_by = c.id
      WHERE p.id = ?
    `).get(process.id);

    res.json(updated);
  } catch (err) {
    console.error('Update process error:', err);
    res.status(500).json({ error: 'Erro ao atualizar processo.' });
  }
});

/**
 * GET /api/processes/:id/export-attachments
 * Export attachments as a ZIP file.
 * Query param: ?files=1,2,3 (optional attachment IDs to filter)
 */
router.get('/:id/export-attachments', authenticateToken, (req, res) => {
  try {
    const processId = req.params.id;
    const fileIdsParam = req.query.files;
    
    // Validate process access
    const process = db.prepare('SELECT process_id FROM processes WHERE id = ?').get(processId);
    if (!process) {
      return res.status(404).json({ error: 'Processo não encontrado.' });
    }

    // Get all attachments for this process
    const attachments = db.prepare(`
      SELECT a.* 
      FROM attachments a
      JOIN process_history h ON a.history_id = h.id
      WHERE h.process_id = ?
    `).all(processId);

    if (attachments.length === 0) {
      return res.status(404).json({ error: 'Nenhum anexo encontrado para este processo.' });
    }

    let filesToZip = attachments;
    if (fileIdsParam) {
      const selectedIds = fileIdsParam.split(',').map(id => parseInt(id, 10));
      filesToZip = attachments.filter(a => selectedIds.includes(a.id));
    }

    if (filesToZip.length === 0) {
      return res.status(404).json({ error: 'Nenhum anexo válido selecionado.' });
    }

    // Set headers for ZIP download
    res.attachment(`${process.process_id}-anexos.zip`);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      res.status(500).end();
    });

    archive.pipe(res);

    // Append files
    for (const file of filesToZip) {
      const filePath = path.join(uploadsDir, 'attachments', file.filename);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file.original_name });
      }
    }

    archive.finalize();

  } catch (err) {
    console.error('Export attachments error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao exportar anexos.' });
    }
  }
});

export default router;
