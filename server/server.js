import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Database initialization (must be imported before routes)
import db, { initializeDatabase } from './database/init.js';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import processRoutes from './routes/processes.js';
import historyRoutes from './routes/history.js';
import notificationRoutes from './routes/notifications.js';
import eventRoutes from './routes/events.js';
import analyticsRoutes from './routes/analytics.js';
import { google } from 'googleapis';
import {
  saveOAuthConfig,
  getOAuthConfig,
  PARENT_FOLDER_ID,
  syncProcessToGoogleCalendar,
  syncProcessDriveFolderState,
  scheduleDatabaseBackup,
  restoreDatabaseFromDriveIfNeeded,
  downloadDriveFileToLocal
} from './services/googleDriveService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Automatically fetch missing attachments from Google Drive if requested after a cloud restart
app.get('/uploads/attachments/:filename', async (req, res, next) => {
  const filename = path.basename(req.params.filename);
  const localPath = path.join(__dirname, 'uploads', 'attachments', filename);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  try {
    const att = db.prepare('SELECT google_drive_file_id, mime_type FROM attachments WHERE filename = ?').get(filename);
    if (att?.google_drive_file_id) {
      const ok = await downloadDriveFileToLocal(att.google_drive_file_id, localPath);
      if (ok && fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
    }
  } catch (err) {
    console.warn('Error fetching attachment from Drive:', err.message);
  }
  next();
});

// Static serving of uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Initialize Database ──────────────────────────────────────
initializeDatabase();

// Automatically sync SQLite database to Google Drive after any successful write request
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.path.startsWith('/auth/login')) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        scheduleDatabaseBackup(db);
      }
    });
  }
  next();
});

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/processes', historyRoutes);       // /api/processes/:id/history
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/analytics', analyticsRoutes);

// ─── Google Drive OAuth2 Quick Setup ──────────────────────────
const REDIRECT_URI = 'http://localhost:3001/api/google-drive/callback';

app.get('/api/google-drive/setup', (req, res) => {
  const cfg = getOAuthConfig() || {};
  const isConnected = !!(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
  res.send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <title>Conectar Google Drive — REPFIX FlowTrack</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; padding: 40px 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 28px; max-width: 560px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
    h2 { color: #facc15; margin-top: 0; }
    label { display: block; margin-top: 14px; font-weight: 600; font-size: 14px; color: #cbd5e1; }
    input { width: 100%; padding: 10px; margin-top: 6px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; box-sizing: border-box; }
    button { margin-top: 20px; width: 100%; padding: 12px; background: #eab308; color: #0f172a; font-weight: 700; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; }
    .status { padding: 12px; border-radius: 8px; margin-bottom: 16px; font-weight: 600; background: ${isConnected ? '#14532d' : '#1e3a8a'}; color: ${isConnected ? '#86efac' : '#93c5fd'}; }
    code { background: #0f172a; padding: 3px 6px; border-radius: 4px; color: #facc15; user-select: all; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📁 Conectar Google Drive (REPFIX)</h2>
    <div class="status">
      ${isConnected ? '✅ Google Drive já está ligada e pronta a criar pastas automaticamente!' : 'ℹ️ Cole abaixo o ID do Cliente e a Chave Secreta OAuth para ligar a conta geral@repfix.pt'}
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      URI de redirecionamento autorizado a colocar na Google Cloud:<br>
      <code>${REDIRECT_URI}</code>
    </p>
    <form method="POST" action="/api/google-drive/auth">
      <label>ID do cliente (Client ID)</label>
      <input type="text" name="clientId" required placeholder="Ex: 102534...apps.googleusercontent.com" value="${cfg.clientId || ''}" />
      <label>Chave secreta do cliente (Client Secret)</label>
      <input type="password" name="clientSecret" required placeholder="Ex: GOCSPX-..." value="${cfg.clientSecret || ''}" />
      <button type="submit">🔗 Autorizar com a Conta Google (geral@repfix.pt)</button>
    </form>
  </div>
</body>
</html>`);
});

app.post('/api/google-drive/auth', (req, res) => {
  const clientId = (req.body.clientId || '').trim();
  const clientSecret = (req.body.clientSecret || '').trim();
  saveOAuthConfig({ clientId, clientSecret, redirectUri: REDIRECT_URI });

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar'
    ]
  });
  res.redirect(authUrl);
});

app.get('/api/google-drive/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const cfg = getOAuthConfig();
    if (!code || !cfg?.clientId || !cfg?.clientSecret) {
      return res.status(400).send('Faltam parâmetros de autenticação.');
    }
    const oauth2Client = new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, REDIRECT_URI);
    const { tokens } = await oauth2Client.getToken(code);
    saveOAuthConfig({
      refreshToken: tokens.refresh_token || cfg.refreshToken,
      accessToken: tokens.access_token
    });

    // Automatically sync existing open scheduled processes to Google Calendar
    try {
      const openProcs = db.prepare(`
        SELECT p.*, u.full_name AS technician_name, m.full_name AS manager_name
        FROM processes p
        LEFT JOIN users u ON p.technician_id = u.id
        LEFT JOIN users m ON p.manager_id = m.id
        WHERE p.status = 'ABERTO' AND (p.schedule_date IS NOT NULL OR p.next_intervention_date IS NOT NULL)
      `).all();

      for (const proc of openProcs) {
        const gcalEventId = await syncProcessToGoogleCalendar(proc);
        if (gcalEventId) {
          db.prepare('UPDATE processes SET google_calendar_event_id = ? WHERE id = ?').run(gcalEventId, proc.id);
        }
      }
    } catch (syncErr) {
      console.error('Initial Google Calendar sync error:', syncErr.message);
    }

    res.redirect('/api/google-drive/setup');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('Erro ao autenticar com a Google Drive: ' + err.message);
  }
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FlowTrack API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─── 404 Handler for API ──────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// ─── Serve Built Frontend (Production / Unified Mode) ─────────
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Ficheiro demasiado grande.' });
  }
  if (err.message && err.message.includes('Apenas ficheiros')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 FlowTrack API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);

  // 1. Restore or initialize cloud database snapshot on Google Drive
  await restoreDatabaseFromDriveIfNeeded(db);

  // 2. Sync open scheduled processes to Google Calendar (Basil color, no reminders, tech contact)
  try {
    const openProcs = db.prepare(`
      SELECT p.*, u.full_name AS technician_name, u.email AS technician_email, u.phone AS technician_phone, m.full_name AS manager_name
      FROM processes p
      LEFT JOIN users u ON p.technician_id = u.id
      LEFT JOIN users m ON p.manager_id = m.id
      WHERE p.status = 'ABERTO' AND (p.schedule_date IS NOT NULL OR p.next_intervention_date IS NOT NULL)
    `).all();

    for (const proc of openProcs) {
      const gcalEventId = await syncProcessToGoogleCalendar(proc);
      if (gcalEventId && gcalEventId !== proc.google_calendar_event_id) {
        db.prepare('UPDATE processes SET google_calendar_event_id = ? WHERE id = ?').run(gcalEventId, proc.id);
      }
    }

    // Also ensure any already-closed (FECHADO) processes have their Google Drive folder in Concluidos
    const closedProcs = db.prepare(`
      SELECT * FROM processes WHERE status = 'FECHADO' AND google_drive_folder_id IS NOT NULL
    `).all();
    for (const cProc of closedProcs) {
      await syncProcessDriveFolderState(cProc);
    }
  } catch (err) {
    console.error('Startup Google Calendar sync error:', err.message);
  }
});
