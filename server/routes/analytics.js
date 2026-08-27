import { Router } from 'express';
import db from '../database/init.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/analytics
 * Return aggregated data for dashboards (admin/key_user only).
 * Support query params: technician_id, date_from, date_to
 */
router.get('/', authenticateToken, requireRole('admin', 'key_user'), (req, res) => {
  try {
    const { technician_id, manager_id, date_from, date_to } = req.query;

    // Build WHERE clause for optional filters
    let filterSql = '';
    const filterParams = [];

    if (technician_id) {
      filterSql += ' AND p.technician_id = ?';
      filterParams.push(parseInt(technician_id, 10));
    }
    if (manager_id) {
      filterSql += ' AND p.manager_id = ?';
      filterParams.push(parseInt(manager_id, 10));
    }
    if (date_from) {
      filterSql += ' AND p.open_date >= ?';
      filterParams.push(date_from);
    }
    if (date_to) {
      filterSql += ' AND p.open_date <= ?';
      filterParams.push(date_to);
    }

    // Total open processes
    const totalOpen = db.prepare(`
      SELECT COUNT(*) as count FROM processes p
      WHERE p.status = 'ABERTO' ${filterSql}
    `).get(...filterParams);

    // Total processes (all statuses)
    const totalAll = db.prepare(`
      SELECT COUNT(*) as count FROM processes p
      WHERE 1=1 ${filterSql}
    `).get(...filterParams);

    // Total closed processes
    const totalClosed = db.prepare(`
      SELECT COUNT(*) as count FROM processes p
      WHERE p.status = 'FECHADO' ${filterSql}
    `).get(...filterParams);

    // Completion rate
    const completionRate = totalAll.count > 0
      ? Math.round((totalClosed.count / totalAll.count) * 100 * 100) / 100
      : 0;

    // Overdue count (next_intervention_date < now AND status = ABERTO)
    const overdue = db.prepare(`
      SELECT COUNT(*) as count FROM processes p
      WHERE p.status = 'ABERTO'
        AND p.next_intervention_date IS NOT NULL
        AND p.next_intervention_date < datetime('now')
        ${filterSql}
    `).get(...filterParams);

    // Processes by milestone
    const byMilestone = db.prepare(`
      SELECT p.milestone, COUNT(*) as count FROM processes p
      WHERE 1=1 ${filterSql}
      GROUP BY p.milestone
      ORDER BY CASE p.milestone
        WHEN 'FILA' THEN 1
        WHEN 'AGENDADO' THEN 2
        WHEN 'PENDENTE' THEN 3
        WHEN 'ELABORAÇÃO' THEN 4
        WHEN 'ANÁLISE' THEN 5
        WHEN 'SUPERVISÃO' THEN 6
      END
    `).all(...filterParams);

    // Processes by priority
    const byPriority = db.prepare(`
      SELECT p.priority, COUNT(*) as count FROM processes p
      WHERE 1=1 ${filterSql}
      GROUP BY p.priority
      ORDER BY CASE p.priority
        WHEN 'Alta' THEN 1
        WHEN 'Media' THEN 2
        WHEN 'Baixa' THEN 3
      END
    `).all(...filterParams);

    // Processes by status
    const byStatus = db.prepare(`
      SELECT p.status, COUNT(*) as count FROM processes p
      WHERE 1=1 ${filterSql}
      GROUP BY p.status
    `).all(...filterParams);

    // Processes by technician (top technicians)
    const byTechnician = db.prepare(`
      SELECT
        u.id AS technician_id,
        u.full_name AS technician_name,
        COUNT(*) as total,
        SUM(CASE WHEN p.status = 'ABERTO' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN p.status = 'FECHADO' THEN 1 ELSE 0 END) as closed
      FROM processes p
      JOIN users u ON p.technician_id = u.id
      WHERE p.technician_id IS NOT NULL ${filterSql}
      GROUP BY p.technician_id
      ORDER BY total DESC
    `).all(...filterParams);

    // Processes by type
    const byType = db.prepare(`
      SELECT p.type, COUNT(*) as count FROM processes p
      WHERE 1=1 ${filterSql}
      GROUP BY p.type
    `).all(...filterParams);

    // Recent activity (last 30 days count)
    const recentActivity = db.prepare(`
      SELECT COUNT(*) as count FROM processes p
      WHERE p.created_at >= datetime('now', '-30 days') ${filterSql}
    `).get(...filterParams);

    res.json({
      total_processes: totalOpen.count,
      total_all: totalAll.count,
      total_closed: totalClosed.count,
      completion_rate: completionRate,
      overdue_count: overdue.count,
      processes_by_milestone: byMilestone,
      processes_by_priority: byPriority,
      processes_by_status: byStatus,
      processes_by_technician: byTechnician,
      processes_by_type: byType,
      recent_activity_30d: recentActivity.count
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Erro ao obter analytics.' });
  }
});

export default router;
