-- REPFIX FlowTrack Database Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  birth_date TEXT,
  address TEXT,
  nif TEXT,
  role TEXT NOT NULL CHECK(role IN ('key_user', 'admin', 'technician', 'both')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'PROC' CHECK(type IN ('PROC', 'ADT', 'ESC')),
  parent_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK(status IN ('ABERTO', 'FECHADO')),
  milestone TEXT NOT NULL DEFAULT 'FILA' CHECK(milestone IN ('FILA', 'AGENDADO', 'PENDENTE', 'ELABORAÇÃO', 'ANÁLISE', 'SUPERVISÃO')),
  client TEXT NOT NULL,
  client_code TEXT,
  address TEXT,
  description TEXT,
  technician_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'Media' CHECK(priority IN ('Baixa', 'Media', 'Alta')),
  open_date TEXT DEFAULT (datetime('now')),
  schedule_date TEXT,
  next_intervention_date TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS process_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  action_type TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  history_id INTEGER NOT NULL REFERENCES process_history(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL,
  event_time TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
