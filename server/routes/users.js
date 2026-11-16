import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../database/init.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { syncProcessToGoogleCalendar } from '../services/googleDriveService.js';

const router = Router();

const ROLE_NAMES = {
  key_user: 'Key User',
  admin: 'Administrador',
  technician: 'Técnico',
  both: 'Admin + Técnico'
};

const VALID_ROLES = ['key_user', 'admin', 'technician', 'both'];

/**
 * GET /api/users
 * List all users (admin/key_user only).
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    let sql = `
      SELECT id, username, full_name, email, phone, birth_date, address, nif, role, created_at, updated_at
      FROM users
    `;
    const params = [];

    if (req.user.role === 'technician') {
      sql += ` WHERE role IN ('key_user', 'admin', 'both') OR id = ?`;
      params.push(req.user.id);
    }

    sql += ` ORDER BY full_name ASC`;

    const users = db.prepare(sql).all(...params);

    const usersWithRoleNames = users.map(u => ({
      ...u,
      role_name: ROLE_NAMES[u.role] || u.role
    }));

    res.json(usersWithRoleNames);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Erro ao listar utilizadores.' });
  }
});

/**
 * POST /api/users
 * Create a new user (admin/key_user only).
 */
router.post('/', authenticateToken, requireRole('key_user'), (req, res) => {
  try {
    const { username, password, full_name, email, phone, birth_date, address, nif, role } = req.body;

    // Validate required fields
    if (!username || !password || !full_name || !email || !role) {
      return res.status(400).json({
        error: 'Campos obrigatórios: username, password, full_name, email, role.'
      });
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Role inválido. Valores permitidos: ${VALID_ROLES.join(', ')}`
      });
    }

    // Only key_user can create other key_users
    if (role === 'key_user' && req.user.role !== 'key_user') {
      return res.status(403).json({ error: 'Apenas Key Users podem criar outros Key Users.' });
    }

    // Validate password length
    if (password.length < 4) {
      return res.status(400).json({ error: 'Password deve ter pelo menos 4 caracteres.' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Formato de email inválido.' });
    }

    // Check for duplicate username
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username já existe.' });
    }

    // Check for duplicate email
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email já está registado.' });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, birth_date, address, nif, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(username, passwordHash, full_name, email, phone || null, birth_date || null, address || null, nif || null, role);

    const newUser = db.prepare(`
      SELECT id, username, full_name, email, phone, birth_date, address, nif, role, created_at, updated_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json({
      ...newUser,
      role_name: ROLE_NAMES[newUser.role] || newUser.role
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Erro ao criar utilizador.' });
  }
});

/**
 * GET /api/users/:id
 * Get user details.
 */
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, full_name, email, phone, birth_date, address, nif, role, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    res.json({
      ...user,
      role_name: ROLE_NAMES[user.role] || user.role
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Erro ao obter utilizador.' });
  }
});

/**
 * PUT /api/users/:id
 * Update user.
 */
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Users can edit themselves; only key_users can edit anyone else
    const userRole = req.user.role;
    if (req.user.id !== userId && userRole !== 'key_user') {
      return res.status(403).json({ error: 'Apenas os Key Users podem editar informações de outros utilizadores.' });
    }

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    const { username, password, full_name, email, phone, birth_date, address, nif, role } = req.body;

    // Only key_user can change roles
    if (role && role !== existing.role) {
      if (userRole !== 'key_user') {
        return res.status(403).json({ error: 'Apenas os Key Users podem alterar os cargos dos utilizadores.' });
      }
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ error: `Role inválido. Valores permitidos: ${VALID_ROLES.join(', ')}` });
      }
    }

    // Check for duplicate username (if changed)
    if (username && username !== existing.username) {
      const dup = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
      if (dup) {
        return res.status(409).json({ error: 'Username já existe.' });
      }
    }

    // Check for duplicate email (if changed)
    if (email && email !== existing.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Formato de email inválido.' });
      }
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
      if (dup) {
        return res.status(409).json({ error: 'Email já está registado.' });
      }
    }

    // Build update
    let passwordHash = existing.password_hash;
    if (password) {
      if (password.length < 4) {
        return res.status(400).json({ error: 'Password deve ter pelo menos 4 caracteres.' });
      }
      const salt = bcrypt.genSaltSync(10);
      passwordHash = bcrypt.hashSync(password, salt);
    }

    const stmt = db.prepare(`
      UPDATE users SET
        username = ?,
        password_hash = ?,
        full_name = ?,
        email = ?,
        phone = ?,
        birth_date = ?,
        address = ?,
        nif = ?,
        role = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      username || existing.username,
      passwordHash,
      full_name || existing.full_name,
      email || existing.email,
      phone !== undefined ? phone : existing.phone,
      birth_date !== undefined ? birth_date : existing.birth_date,
      address !== undefined ? address : existing.address,
      nif !== undefined ? nif : existing.nif,
      role || existing.role,
      userId
    );

    const updated = db.prepare(`
      SELECT id, username, full_name, email, phone, birth_date, address, nif, role, created_at, updated_at
      FROM users WHERE id = ?
    `).get(userId);

    // Sync any open processes assigned to this user so Google Calendar reflects new name/phone/email
    try {
      const userProcs = db.prepare(`
        SELECT p.*, u.full_name AS technician_name, u.email AS technician_email, u.phone AS technician_phone, m.full_name AS manager_name
        FROM processes p
        LEFT JOIN users u ON p.technician_id = u.id
        LEFT JOIN users m ON p.manager_id = m.id
        WHERE p.status = 'ABERTO' AND (p.technician_id = ? OR p.manager_id = ?)
      `).all(userId, userId);

      for (const proc of userProcs) {
        syncProcessToGoogleCalendar(proc).catch(() => {});
      }
    } catch {}

    res.json({
      ...updated,
      role_name: ROLE_NAMES[updated.role] || updated.role
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Erro ao atualizar utilizador.' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (key_user only).
 */
router.delete('/:id', authenticateToken, requireRole('key_user'), (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);

    // Prevent self-deletion
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Não pode eliminar a sua própria conta.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!existing) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.json({ message: 'Utilizador eliminado com sucesso.' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Erro ao eliminar utilizador.' });
  }
});

export default router;
