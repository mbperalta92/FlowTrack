import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'flowtrack.db');

// Ensure the database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Enable foreign key enforcement
db.pragma('foreign_keys = ON');

/**
 * Initialize the database schema and seed default data.
 */
export function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Execute schema (all CREATE TABLE IF NOT EXISTS statements)
  db.exec(schema);

  // Add manager_id and address columns if they don't exist (backward compatibility)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(processes)").all();
    const hasManagerId = tableInfo.some(col => col.name === 'manager_id');
    if (!hasManagerId) {
      db.exec("ALTER TABLE processes ADD COLUMN manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
      console.log('✅ Added manager_id column to processes table');
    }
    const hasAddress = tableInfo.some(col => col.name === 'address');
    if (!hasAddress) {
      db.exec("ALTER TABLE processes ADD COLUMN address TEXT");
      console.log('✅ Added address column to processes table');
    }
    const hasDriveId = tableInfo.some(col => col.name === 'google_drive_folder_id');
    if (!hasDriveId) {
      db.exec("ALTER TABLE processes ADD COLUMN google_drive_folder_id TEXT");
      console.log('✅ Added google_drive_folder_id column to processes table');
    }
    const hasDriveUrl = tableInfo.some(col => col.name === 'google_drive_folder_url');
    if (!hasDriveUrl) {
      db.exec("ALTER TABLE processes ADD COLUMN google_drive_folder_url TEXT");
      console.log('✅ Added google_drive_folder_url column to processes table');
    }
    const hasCalEventId = tableInfo.some(col => col.name === 'google_calendar_event_id');
    if (!hasCalEventId) {
      db.exec("ALTER TABLE processes ADD COLUMN google_calendar_event_id TEXT");
      console.log('✅ Added google_calendar_event_id column to processes table');
    }

    const attTableInfo = db.prepare("PRAGMA table_info(attachments)").all();
    const hasAttDriveId = attTableInfo.some(col => col.name === 'google_drive_file_id');
    if (!hasAttDriveId) {
      db.exec("ALTER TABLE attachments ADD COLUMN google_drive_file_id TEXT");
      console.log('✅ Added google_drive_file_id column to attachments table');
    }
    const hasAttDriveUrl = attTableInfo.some(col => col.name === 'google_drive_file_url');
    if (!hasAttDriveUrl) {
      db.exec("ALTER TABLE attachments ADD COLUMN google_drive_file_url TEXT");
      console.log('✅ Added google_drive_file_url column to attachments table');
    }

    const evtTableInfo = db.prepare("PRAGMA table_info(events)").all();
    const hasEvtProcId = evtTableInfo.some(col => col.name === 'process_id');
    if (!hasEvtProcId) {
      db.exec("ALTER TABLE events ADD COLUMN process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE");
      console.log('✅ Added process_id column to events table');
    }

    const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
    const hasUserPhone = userTableInfo.some(col => col.name === 'phone');
    if (!hasUserPhone) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
      console.log('✅ Added phone column to users table');
    }
  } catch (err) {
    console.error('Error checking/adding columns:', err);
  }

  // Ensure default Key User (Mauricio Peralta) always has key_user role
  const keyUserExists = db.prepare("SELECT id FROM users WHERE username = 'Peralta.Mauricio' OR full_name LIKE '%Mauricio Peralta%'").get();
  if (!keyUserExists) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('MBPer.597159', salt);

    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run('Peralta.Mauricio', passwordHash, 'Mauricio Peralta', 'mauricio.peralta@repfix.pt', 'key_user');
    console.log('✅ Default Key User created (username: Peralta.Mauricio)');
  } else {
    db.prepare("UPDATE users SET role = 'key_user' WHERE username = 'Peralta.Mauricio' OR full_name LIKE '%Mauricio Peralta%'").run();
    console.log('✅ Key User role ensured for Mauricio Peralta');
  }

  console.log('✅ Database initialized successfully');
}

export default db;
