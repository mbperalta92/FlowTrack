import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared REPFIX Google Drive Parent Folder & Completed Folder
export const PARENT_FOLDER_ID = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID || '1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC';
export const COMPLETED_FOLDER_ID = process.env.GOOGLE_DRIVE_COMPLETED_FOLDER_ID || '1zm67Q9L_V9SN6qHfK_3_lPJO4w6A9JzG';
export const ACCOUNT_EMAIL = 'geral@repfix.pt';

/**
 * Format standard process folder name: {ID}_{Cliente}
 * Example: PROC-001_Indústrias Metálicas SA
 */
export function formatProcessFolderName(processId, clientName) {
  const cleanId = (processId || 'PROC').trim();
  const cleanClient = (clientName || 'Cliente').trim().replace(/[\/\\?%*:|"<>]/g, '_');
  return `${cleanId}_${cleanClient}`;
}

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const OAUTH_CONFIG_PATH = path.join(CONFIG_DIR, 'google-oauth.json');

export function saveOAuthConfig(data) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  let existing = {};
  if (fs.existsSync(OAUTH_CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf-8'));
    } catch {}
  }
  const merged = { ...existing, ...data };
  fs.writeFileSync(OAUTH_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export function getOAuthConfig() {
  if (fs.existsSync(OAUTH_CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf-8'));
      if (cfg?.clientId && cfg?.clientSecret && cfg?.refreshToken) {
        return cfg;
      }
    } catch {}
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/google-drive/callback'
    };
  }
  return null;
}

/**
 * Get Google Drive API v3 authenticated client if credentials exist.
 */
function getDriveClient() {
  try {
    // 0. Check for saved OAuth2 config in config/google-oauth.json
    const oauthCfg = getOAuthConfig();
    if (oauthCfg?.clientId && oauthCfg?.clientSecret && oauthCfg?.refreshToken) {
      const oauth2Client = new google.auth.OAuth2(
        oauthCfg.clientId,
        oauthCfg.clientSecret,
        oauthCfg.redirectUri || 'http://localhost:3001/api/google-drive/callback'
      );
      oauth2Client.setCredentials({ refresh_token: oauthCfg.refreshToken });
      return google.drive({ version: 'v3', auth: oauth2Client });
    }

    // 1. Check for Service Account Key JSON file in config/google-credentials.json
    const credsPath = path.join(__dirname, '..', 'config', 'google-credentials.json');
    if (fs.existsSync(credsPath)) {
      const auth = new google.auth.GoogleAuth({
        keyFile: credsPath,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      return google.drive({ version: 'v3', auth });
    }

    // 2. Check for Service Account in environment variables
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/drive']
      );
      return google.drive({ version: 'v3', auth });
    }

    // 3. Check for OAuth2 tokens in environment variables
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      return google.drive({ version: 'v3', auth: oauth2Client });
    }
  } catch (err) {
    console.error('⚠️ [Google Drive Service] Error initializing Google Auth:', err.message);
  }

  return null;
}

/**
 * Create a subfolder for a process inside parent Google Drive folder 1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC.
 * Folder name format: "{ID}_{Cliente}"
 */
export async function createProcessFolder(processId, clientName, targetParentId = PARENT_FOLDER_ID) {
  const folderName = formatProcessFolderName(processId, clientName);
  const parentFolderUrl = `https://drive.google.com/drive/folders/${targetParentId}`;

  const drive = getDriveClient();

  if (!drive) {
    console.log(`ℹ️ [Google Drive] Credentials not set up yet. Using direct parent folder URL for "${folderName}".`);
    return {
      folderId: null,
      folderUrl: parentFolderUrl,
      folderName,
      created: false,
      note: 'Coloque as credenciais em config/google-credentials.json para criação automática na API.'
    };
  }

  try {
    console.log(`🚀 [Google Drive] Creating folder "${folderName}" inside parent "${targetParentId}"...`);
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [targetParentId]
    };

    const res = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink'
    });

    const folderId = res.data.id;
    const folderUrl = res.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    console.log(`✅ [Google Drive] Folder created successfully: ${folderName} -> ${folderUrl}`);

    return {
      folderId,
      folderUrl,
      folderName,
      created: true
    };
  } catch (err) {
    console.error(`❌ [Google Drive] Error creating folder "${folderName}":`, err.message);
    return {
      folderId: null,
      folderUrl: parentFolderUrl,
      folderName,
      created: false,
      error: err.message
    };
  }
}

/**
 * Find an existing process folder in Google Drive or create it if it does not exist.
 */
export async function findOrCreateProcessFolder(processId, clientName, existingFolderId = null, status = 'ABERTO') {
  const targetParentId = status === 'FECHADO' ? COMPLETED_FOLDER_ID : PARENT_FOLDER_ID;

  if (existingFolderId) {
    return {
      folderId: existingFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${existingFolderId}`,
      folderName: formatProcessFolderName(processId, clientName),
      created: false
    };
  }

  const drive = getDriveClient();
  const folderName = formatProcessFolderName(processId, clientName);
  const parentFolderUrl = `https://drive.google.com/drive/folders/${targetParentId}`;

  if (!drive) {
    return {
      folderId: null,
      folderUrl: parentFolderUrl,
      folderName,
      created: false
    };
  }

  try {
    const escapedName = folderName.replace(/'/g, "\\'");
    const listRes = await drive.files.list({
      q: `('${PARENT_FOLDER_ID}' in parents or '${COMPLETED_FOLDER_ID}' in parents) and mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`,
      fields: 'files(id, name, webViewLink, parents)',
      pageSize: 1
    });

    if (listRes.data.files && listRes.data.files.length > 0) {
      const existing = listRes.data.files[0];
      return {
        folderId: existing.id,
        folderUrl: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
        folderName: existing.name,
        created: false
      };
    }
  } catch (err) {
    console.warn(`⚠️ [Google Drive] Could not search for existing folder "${folderName}":`, err.message);
  }

  return createProcessFolder(processId, clientName, targetParentId);
}

/**
 * Move a process's Google Drive folder to Concluidos (1zm67Q9L_V9SN6qHfK_3_lPJO4w6A9JzG) when FECHADO,
 * or back to REPFIX FlowTrack (1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC) when ABERTO, and keep folder name synced.
 */
export async function syncProcessDriveFolderState(proc) {
  const drive = getDriveClient();
  if (!drive) return null;

  const targetParentId = proc.status === 'FECHADO' ? COMPLETED_FOLDER_ID : PARENT_FOLDER_ID;
  const expectedName = formatProcessFolderName(proc.process_id, proc.client);

  try {
    const driveInfo = await findOrCreateProcessFolder(
      proc.process_id,
      proc.client,
      proc.google_drive_folder_id,
      proc.status
    );

    const folderId = driveInfo.folderId;
    if (!folderId) return null;

    const meta = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, parents, webViewLink'
    });

    const currentParents = meta.data.parents || [];
    const needsMove = !currentParents.includes(targetParentId);
    const needsRename = meta.data.name !== expectedName;

    if (needsMove || needsRename) {
      const updateParams = {
        fileId: folderId,
        fields: 'id, name, parents, webViewLink'
      };
      if (needsMove) {
        updateParams.addParents = targetParentId;
        if (currentParents.length > 0) {
          updateParams.removeParents = currentParents.join(',');
        }
      }
      if (needsRename) {
        updateParams.requestBody = { name: expectedName };
      }

      const updated = await drive.files.update(updateParams);
      console.log(`✅ [Google Drive] Folder "${expectedName}" synced (status=${proc.status}, moved=${needsMove}, renamed=${needsRename})`);
      return {
        folderId: updated.data.id,
        folderUrl: updated.data.webViewLink || `https://drive.google.com/drive/folders/${updated.data.id}`
      };
    }

    return {
      folderId,
      folderUrl: meta.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`
    };
  } catch (err) {
    console.error(`❌ [Google Drive] Error syncing folder state for ${proc.process_id}:`, err.message);
    return null;
  }
}

/**
 * Upload a file from local disk to a Google Drive process folder.
 */
export async function uploadFileToDrive(folderId, localFilePath, originalName, mimeType) {
  const drive = getDriveClient();
  if (!drive) {
    return { driveFileId: null, driveFileUrl: null, uploaded: false };
  }

  const targetParentId = folderId || PARENT_FOLDER_ID;

  try {
    const res = await drive.files.create({
      requestBody: {
        name: originalName,
        parents: [targetParentId]
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: fs.createReadStream(localFilePath)
      },
      fields: 'id, webViewLink, webContentLink'
    });

    const driveFileId = res.data.id;
    const driveFileUrl = res.data.webViewLink || res.data.webContentLink || `https://drive.google.com/file/d/${driveFileId}/view`;

    console.log(`✅ [Google Drive] File uploaded: "${originalName}" -> ${driveFileUrl}`);
    return {
      driveFileId,
      driveFileUrl,
      uploaded: true
    };
  } catch (err) {
    console.error(`❌ [Google Drive] Error uploading file "${originalName}":`, err.message);
    return {
      driveFileId: null,
      driveFileUrl: null,
      uploaded: false,
      error: err.message
    };
  }
}

/**
 * Get Google Calendar API v3 authenticated client.
 */
function getCalendarClient() {
  try {
    const oauthCfg = getOAuthConfig();
    if (oauthCfg?.clientId && oauthCfg?.clientSecret && oauthCfg?.refreshToken) {
      const oauth2Client = new google.auth.OAuth2(
        oauthCfg.clientId,
        oauthCfg.clientSecret,
        oauthCfg.redirectUri || 'http://localhost:3001/api/google-drive/callback'
      );
      oauth2Client.setCredentials({ refresh_token: oauthCfg.refreshToken });
      return google.calendar({ version: 'v3', auth: oauth2Client });
    }
  } catch (err) {
    console.error('⚠️ [Google Calendar] Error initializing auth:', err.message);
  }
  return null;
}

/**
 * Create, update, or delete an event on Google Calendar (primary calendar of geral@repfix.pt)
 * whenever a process has a schedule/intervention date.
 */
export async function syncProcessToGoogleCalendar(proc) {
  const calendar = getCalendarClient();
  if (!calendar) {
    return null;
  }

  // Prefer schedule_date (which holds Date + Time) or next_intervention_date
  const rawDate = proc.schedule_date || proc.next_intervention_date;

  // If date was removed or process is closed, delete existing Google Calendar event if present
  if (!rawDate || proc.status === 'FECHADO') {
    if (proc.google_calendar_event_id) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: proc.google_calendar_event_id
        });
      } catch {}
    }
    return null;
  }

  const datePart = (proc.next_intervention_date || proc.schedule_date).split('T')[0];
  const timePart = (proc.schedule_date && proc.schedule_date.includes('T'))
    ? proc.schedule_date.split('T')[1].substring(0, 5)
    : (proc.next_intervention_date && proc.next_intervention_date.includes('T') ? proc.next_intervention_date.split('T')[1].substring(0, 5) : null);

  const techName = proc.technician_name || 'Sem Técnico';
  const techContactParts = [proc.technician_phone, proc.technician_email].filter(Boolean);
  const techContact = techContactParts.length > 0 ? techContactParts.join(' | ') : 'Sem contacto';
  const locText = proc.address || proc.client || '';
  const refTag = proc.client_code ? ` [Ref: ${proc.client_code}]` : '';
  const summary = `${proc.process_id}${refTag} (${proc.client}) • ${techName}${proc.technician_phone ? ' (' + proc.technician_phone + ')' : ''}${proc.address ? ' • ' + proc.address : ''}`;
  const description = [
    `Processo REPFIX: ${proc.process_id}`,
    `N.º Processo Cliente / Ref.ª: ${proc.client_code || 'Não definido'}`,
    `Cliente: ${proc.client}`,
    `Técnico: ${techName}`,
    `Contacto do Técnico: ${techContact}`,
    `Gestor: ${proc.manager_name || 'Não atribuído'}`,
    `Localidade / Morada: ${proc.address || 'Não definida'}`,
    proc.description ? `\nDescrição: ${proc.description}` : ''
  ].filter(Boolean).join('\n');

  let startObj;
  let endObj;

  if (timePart && /^\d{2}:\d{2}$/.test(timePart)) {
    const [hh, mm] = timePart.split(':').map(Number);
    const startIso = `${datePart}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    const endHour = (hh + 1) % 24;
    const endIso = `${datePart}T${String(endHour).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    startObj = { dateTime: startIso, timeZone: 'Europe/Lisbon' };
    endObj = { dateTime: endIso, timeZone: 'Europe/Lisbon' };
  } else {
    startObj = { date: datePart };
    endObj = { date: datePart };
  }

  const eventBody = {
    summary,
    location: locText,
    description,
    colorId: '10', // Cor Manjericão (Basil - Verde Escuro)
    reminders: {
      useDefault: false,
      overrides: [] // Sem lembretes / Sem notificações
    },
    start: startObj,
    end: endObj
  };

  try {
    if (proc.google_calendar_event_id) {
      try {
        const updated = await calendar.events.update({
          calendarId: 'primary',
          eventId: proc.google_calendar_event_id,
          requestBody: eventBody
        });
        console.log(`✅ [Google Calendar] Event updated for ${proc.process_id}: ${updated.data.id}`);
        return updated.data.id;
      } catch (updateErr) {
        console.warn(`⚠️ [Google Calendar] Update failed, creating new event:`, updateErr.message);
      }
    }

    const created = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody
    });
    console.log(`✅ [Google Calendar] Event created for ${proc.process_id}: ${created.data.id}`);
    return created.data.id;
  } catch (err) {
    console.error(`❌ [Google Calendar] Error syncing ${proc.process_id}:`, err.message);
    return null;
  }
}

// ─── Cloud Database Persistence via Google Drive ──────────────────────────
const DB_SNAPSHOT_FILENAME = '_FlowTrack_Cloud_Database.json';
const SYNC_META_PATH = path.join(__dirname, '..', 'database', '.sync-meta.json');
let cachedSnapshotFileId = null;
let backupTimer = null;
let isBackingUp = false;

async function findSnapshotFileId(drive) {
  if (cachedSnapshotFileId) return cachedSnapshotFileId;
  const res = await drive.files.list({
    q: `name = '${DB_SNAPSHOT_FILENAME}' and trashed = false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 5
  });
  if (res.data.files && res.data.files.length > 0) {
    cachedSnapshotFileId = res.data.files[0].id;
    return cachedSnapshotFileId;
  }
  return null;
}

/**
 * Export all SQLite tables into a JSON snapshot and upload/update on Google Drive.
 */
export async function backupDatabaseToDrive(db) {
  const drive = getDriveClient();
  if (!drive || isBackingUp) return false;

  isBackingUp = true;
  try {
    const updatedAt = new Date().toISOString();
    const snapshot = {
      version: 1,
      updatedAt,
      tables: {
        users: db.prepare('SELECT * FROM users').all(),
        processes: db.prepare('SELECT * FROM processes').all(),
        process_history: db.prepare('SELECT * FROM process_history').all(),
        attachments: db.prepare('SELECT * FROM attachments').all(),
        events: db.prepare('SELECT * FROM events').all(),
        event_participants: db.prepare('SELECT * FROM event_participants').all(),
        notifications: db.prepare('SELECT * FROM notifications').all(),
        sqlite_sequence: db.prepare('SELECT * FROM sqlite_sequence').all()
      }
    };

    const jsonBody = JSON.stringify(snapshot, null, 2);
    const existingFileId = await findSnapshotFileId(drive);

    if (existingFileId) {
      await drive.files.update({
        fileId: existingFileId,
        media: {
          mimeType: 'application/json',
          body: jsonBody
        }
      });
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: DB_SNAPSHOT_FILENAME,
          mimeType: 'application/json'
        },
        media: {
          mimeType: 'application/json',
          body: jsonBody
        },
        fields: 'id'
      });
      cachedSnapshotFileId = created.data.id;
    }

    fs.writeFileSync(SYNC_META_PATH, JSON.stringify({ lastSyncedAt: updatedAt }, null, 2), 'utf-8');
    console.log(`☁️ [Google Drive DB Sync] Base de dados sincronizada na cloud (${updatedAt})`);
    return true;
  } catch (err) {
    console.error('⚠️ [Google Drive DB Sync] Erro ao guardar backup na Drive:', err.message);
    return false;
  } finally {
    isBackingUp = false;
  }
}

/**
 * Debounced background backup triggered automatically after any DB write.
 */
export function scheduleDatabaseBackup(db, delayMs = 1500) {
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    backupDatabaseToDrive(db).catch(() => {});
  }, delayMs);
}

/**
 * Restore SQLite database from Google Drive snapshot on startup if container is fresh
 * or if the cloud snapshot is newer than local `.sync-meta.json`.
 */
export async function restoreDatabaseFromDriveIfNeeded(db) {
  const drive = getDriveClient();
  if (!drive) return false;

  try {
    const fileId = await findSnapshotFileId(drive);
    if (!fileId) {
      // No cloud snapshot exists yet -> create initial snapshot from local DB
      await backupDatabaseToDrive(db);
      return false;
    }

    // Download snapshot JSON from Google Drive
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'json' }
    );
    const snapshot = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    if (!snapshot || !snapshot.tables) return false;

    let localSyncedAt = null;
    if (fs.existsSync(SYNC_META_PATH)) {
      try {
        localSyncedAt = JSON.parse(fs.readFileSync(SYNC_META_PATH, 'utf-8')).lastSyncedAt;
      } catch {}
    }

    // Restore if local has no sync metadata (e.g., fresh Render deploy/restart) or cloud is newer
    const shouldRestore = !localSyncedAt || (snapshot.updatedAt && snapshot.updatedAt > localSyncedAt);
    if (!shouldRestore) {
      console.log('☁️ [Google Drive DB Sync] Base de dados local já está sincronizada com a Google Drive.');
      return false;
    }

    const t = snapshot.tables;
    const restoreTx = db.transaction(() => {
      db.pragma('foreign_keys = OFF');

      db.prepare('DELETE FROM attachments').run();
      db.prepare('DELETE FROM process_history').run();
      db.prepare('DELETE FROM notifications').run();
      db.prepare('DELETE FROM event_participants').run();
      db.prepare('DELETE FROM events').run();
      db.prepare('DELETE FROM processes').run();
      db.prepare('DELETE FROM users').run();
      db.prepare('DELETE FROM sqlite_sequence').run();

      const insertRows = (tableName, rows) => {
        if (!rows || rows.length === 0) return;
        const cols = Object.keys(rows[0]);
        const placeholders = cols.map(() => '?').join(', ');
        const stmt = db.prepare(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`);
        for (const row of rows) {
          stmt.run(...cols.map(c => row[c]));
        }
      };

      insertRows('users', t.users);
      insertRows('processes', t.processes);
      insertRows('process_history', t.process_history);
      insertRows('attachments', t.attachments);
      insertRows('events', t.events);
      insertRows('event_participants', t.event_participants);
      insertRows('notifications', t.notifications);
      insertRows('sqlite_sequence', t.sqlite_sequence);

      db.pragma('foreign_keys = ON');
    });

    restoreTx();
    fs.writeFileSync(SYNC_META_PATH, JSON.stringify({ lastSyncedAt: snapshot.updatedAt || new Date().toISOString() }, null, 2), 'utf-8');
    console.log(`✅ [Google Drive DB Sync] Base de dados restaurada da Google Drive (${(t.processes || []).length} processos, ${(t.users || []).length} utilizadores).`);
    return true;
  } catch (err) {
    console.error('⚠️ [Google Drive DB Sync] Erro ao restaurar da Drive:', err.message);
    return false;
  }
}

/**
 * Download an attachment from Google Drive to local disk if missing after a cloud restart.
 */
export async function downloadDriveFileToLocal(driveFileId, destPath) {
  const drive = getDriveClient();
  if (!drive || !driveFileId) return false;

  try {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const res = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' }
    );
    await new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      res.data
        .on('end', () => resolve())
        .on('error', err => reject(err))
        .pipe(dest);
    });
    return true;
  } catch (err) {
    console.error(`⚠️ [Google Drive] Failed to download attachment ${driveFileId}:`, err.message);
    return false;
  }
}
