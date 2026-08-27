import { Router } from 'express';
import db from '../database/init.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/events
 * Get events visible to the logged-in user + birthdays of all users.
 * Support query params: month (1-12), year.
 */
router.get('/', authenticateToken, (req, res) => {
  try {
    const { month, year } = req.query;
    const userId = req.user.id;

    // Get events where user is participant or creator
    let eventSql = `
      SELECT DISTINCT
        e.*,
        u.full_name AS created_by_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN event_participants ep ON e.id = ep.event_id
      WHERE (e.created_by = ? OR ep.user_id = ?)
    `;
    const params = [userId, userId];

    // Filter by month/year if provided
    if (month && year) {
      const monthPadded = String(month).padStart(2, '0');
      eventSql += ` AND substr(e.event_date, 1, 7) = ?`;
      params.push(`${year}-${monthPadded}`);
    } else if (year) {
      eventSql += ` AND substr(e.event_date, 1, 4) = ?`;
      params.push(String(year));
    }

    eventSql += ' ORDER BY e.event_date ASC, e.event_time ASC';

    const events = db.prepare(eventSql).all(...params);

    // Get participants for each event
    for (const event of events) {
      const participants = db.prepare(`
        SELECT u.id, u.full_name, u.email
        FROM event_participants ep
        JOIN users u ON ep.user_id = u.id
        WHERE ep.event_id = ?
      `).all(event.id);
      event.participants = participants;
    }

    // Get birthdays of all users (for the calendar)
    let birthdaySql = `
      SELECT id, full_name, birth_date
      FROM users
      WHERE birth_date IS NOT NULL AND birth_date != ''
    `;
    const birthdayParams = [];

    if (month) {
      const monthPadded = String(month).padStart(2, '0');
      birthdaySql += ` AND substr(birth_date, 6, 2) = ?`;
      birthdayParams.push(monthPadded);
    }

    const birthdayUsers = db.prepare(birthdaySql).all(...birthdayParams);

    const birthdays = birthdayUsers.map(u => ({
      user_id: u.id,
      full_name: u.full_name,
      birth_date: u.birth_date,
      type: 'birthday'
    }));

    res.json({ events, birthdays });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Erro ao obter eventos.' });
  }
});

/**
 * POST /api/events
 * Create event (admin/key_user only). Accept participant_ids array.
 */
router.post('/', authenticateToken, requireRole('admin', 'key_user'), (req, res) => {
  try {
    const { title, description, event_date, event_time, participant_ids } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ error: 'Campo "title" é obrigatório.' });
    }
    if (!event_date) {
      return res.status(400).json({ error: 'Campo "event_date" é obrigatório.' });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(event_date)) {
      return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD.' });
    }

    // Validate time format if provided (HH:MM)
    if (event_time) {
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(event_time)) {
        return res.status(400).json({ error: 'Formato de hora inválido. Use HH:MM.' });
      }
    }

    // Create event
    const result = db.prepare(`
      INSERT INTO events (title, description, event_date, event_time, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, description || null, event_date, event_time || null, req.user.id);

    const eventId = result.lastInsertRowid;

    // Add participants
    if (participant_ids && Array.isArray(participant_ids) && participant_ids.length > 0) {
      const addParticipant = db.prepare(`
        INSERT INTO event_participants (event_id, user_id) VALUES (?, ?)
      `);

      const notifStmt = db.prepare(`
        INSERT INTO notifications (user_id, type, title, message, event_id)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const participantId of participant_ids) {
        // Verify user exists
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(participantId);
        if (user) {
          addParticipant.run(eventId, participantId);

          // Notify participant (if not the creator)
          if (participantId !== req.user.id) {
            notifStmt.run(
              participantId,
              'event_invite',
              'Novo Evento',
              `Convidado para o evento "${title}" em ${event_date}.`,
              eventId
            );
          }
        }
      }
    }

    // Fetch created event with participants
    const event = db.prepare(`
      SELECT e.*, u.full_name AS created_by_name
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE e.id = ?
    `).get(eventId);

    const participants = db.prepare(`
      SELECT u.id, u.full_name, u.email
      FROM event_participants ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = ?
    `).all(eventId);

    event.participants = participants;

    res.status(201).json(event);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Erro ao criar evento.' });
  }
});

/**
 * PUT /api/events/:id
 * Update event (creator or admin/key_user only).
 */
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const eventId = req.params.id;
    const { title, description, event_date, event_time } = req.body;

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }

    const userRole = req.user.role;
    if (event.created_by !== req.user.id && userRole !== 'key_user' && userRole !== 'admin' && userRole !== 'both') {
      return res.status(403).json({ error: 'Sem permissão para atualizar este evento.' });
    }

    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (event_date !== undefined) updates.event_date = event_date;
    if (event_time !== undefined) updates.event_time = event_time;

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(updates), eventId];
      db.prepare(`UPDATE events SET ${setClauses} WHERE id = ?`).run(...values);
    }

    const updatedEvent = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    res.json(updatedEvent);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Erro ao atualizar evento.' });
  }
});

/**
 * DELETE /api/events/:id
 * Delete event (creator or admin/key_user only).
 */
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const eventId = req.params.id;

    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }

    // Check permission: creator or admin/key_user
    const userRole = req.user.role;
    if (event.created_by !== req.user.id && userRole !== 'key_user' && userRole !== 'admin' && userRole !== 'both') {
      return res.status(403).json({ error: 'Sem permissão para eliminar este evento.' });
    }

    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);

    res.json({ message: 'Evento eliminado com sucesso.' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Erro ao eliminar evento.' });
  }
});

export default router;
