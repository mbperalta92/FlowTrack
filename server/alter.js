import db from './database/init.js';
try {
  db.exec('ALTER TABLE processes ADD COLUMN client_code TEXT;');
  console.log('Column added successfully');
} catch (e) {
  console.error('Error:', e.message);
}
