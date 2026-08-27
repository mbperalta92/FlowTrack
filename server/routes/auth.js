import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/init.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Validate credentials, return JWT token + user info.
 */
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate inputs
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios.' });
    }

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verify password
    const isValidPassword = bcrypt.compareSync(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Role readable names mapping
    const roleNames = {
      key_user: 'Key User',
      admin: 'Administrador',
      technician: 'Técnico',
      both: 'Admin + Técnico'
    };

    // Generate JWT (expires in 24h)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return token and user info (exclude password_hash)
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        role_name: roleNames[user.role] || user.role,
        birth_date: user.birth_date,
        address: user.address,
        nif: user.nif,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

/**
 * GET /api/auth/me
 * Return current logged-in user info from database.
 */
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, full_name, email, role, birth_date, address, nif, created_at FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    const roleNames = {
      key_user: 'Key User',
      admin: 'Administrador',
      technician: 'Técnico',
      both: 'Admin + Técnico'
    };
    res.json({
      user: {
        ...user,
        role_name: roleNames[user.role] || user.role
      }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
});

export default router;
