import jwt from 'jsonwebtoken';
import db from '../database/init.js';

const JWT_SECRET = process.env.JWT_SECRET || 'flowtrack-repfix-secret-key-2024';

/**
 * Middleware: Verify JWT from the Authorization header.
 * Attaches the decoded user payload to req.user.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists in database
    const user = db.prepare('SELECT id, username, full_name, email, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Utilizador não encontrado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.' });
    }
    return res.status(403).json({ error: 'Token inválido.' });
  }
}

/**
 * Middleware factory: Checks if the user's role is in the allowed list.
 * - 'key_user' has all permissions (always passes).
 * - 'both' counts as having both 'admin' and 'technician' roles.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const userRole = req.user.role;

    // key_user has all permissions
    if (userRole === 'key_user') {
      return next();
    }

    // 'both' effectively has 'admin' and 'technician'
    if (userRole === 'both') {
      const bothRoles = ['admin', 'technician', 'both'];
      if (roles.some(r => bothRoles.includes(r))) {
        return next();
      }
    }

    // Direct role match
    if (roles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({ error: 'Sem permissão para esta ação.' });
  };
}

/**
 * Middleware: Checks if the user can edit a specific process.
 * - Admins/key_users can edit everything.
 * - Technicians can only edit priority and next_intervention_date on their assigned processes.
 * Attaches the process to req.process.
 */
export function canEditProcess(req, res, next) {
  const processId = req.params.id;
  const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(processId);

  if (!process) {
    return res.status(404).json({ error: 'Processo não encontrado.' });
  }

  req.process = process;
  const userRole = req.user.role;

  // key_user and admin (or both) can edit everything
  if (userRole === 'key_user' || userRole === 'admin' || userRole === 'both') {
    return next();
  }

  // Technicians can only edit their assigned processes
  if (userRole === 'technician') {
    if (process.technician_id !== req.user.id) {
      return res.status(403).json({ error: 'Só pode editar processos que lhe estão atribuídos.' });
    }

    // Technicians can update priority, next_intervention_date, milestone, schedule_date and address on assigned processes
    const allowedFields = ['priority', 'next_intervention_date', 'milestone', 'schedule_date', 'address'];
    const bodyKeys = Object.keys(req.body).filter(k => req.body[k] !== undefined);
    const forbiddenFields = bodyKeys.filter(k => !allowedFields.includes(k));

    if (forbiddenFields.length > 0) {
      return res.status(403).json({
        error: `Técnicos só podem alterar: ${allowedFields.join(', ')}.`,
        campos_não_permitidos: forbiddenFields
      });
    }

    return next();
  }

  return res.status(403).json({ error: 'Sem permissão para editar este processo.' });
}

export { JWT_SECRET };
