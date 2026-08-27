import { Router } from 'express';
import db from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/notifications
 * Get notifications for the logged-in user (most recent first).
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT
        n.*,
        p.process_id AS process_display_id,
        p.client AS process_client,
        e.title AS event_title
      FROM notifications n
      LEFT JOIN processes p ON n.process_id = p.id
      LEFT JOIN events e ON n.event_id = e.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
    `).all(req.user.id);

    // Also return unread count
    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = 0
    `).get(req.user.id);

    res.json({
      notifications,
      unread_count: unreadCount.count
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Erro ao obter notificações.' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read.
 */
router.put('/:id/read', authenticateToken, (req, res) => {
  try {
    const notifId = req.params.id;

    // Verify notification belongs to the user
    const notif = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(notifId, req.user.id);
    if (!notif) {
      return res.status(404).json({ error: 'Notificação não encontrada.' });
    }

    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notifId);

    res.json({ message: 'Notificação marcada como lida.' });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Erro ao marcar notificação como lida.' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the logged-in user.
 */
router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const result = db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(req.user.id);

    res.json({
      message: 'Todas as notificações marcadas como lidas.',
      updated: result.changes
    });
  } catch (err) {
    console.error('Mark all notifications read error:', err);
    res.status(500).json({ error: 'Erro ao marcar notificações como lidas.' });
  }
});

export default router;
