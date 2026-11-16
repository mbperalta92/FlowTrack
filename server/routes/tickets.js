import { Router } from 'express';
import multer from 'multer';
import db from '../database/init.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendEmail } from '../services/emailService.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB per file
});

const ROLE_LABELS = {
  key_user: 'Key User',
  admin: 'Gestor / Administrador',
  technician: 'Técnico',
  both: 'Gestor + Técnico'
};

/**
 * POST /api/tickets
 * Submit a Bug Report or Improvement Opportunity ticket with optional attachments.
 * Sent directly to geral@repfix.pt with mbperalta92@gmail.com in CC.
 */
router.post('/', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const {
      ticket_type = 'BUG',
      category = 'Outro / Geral',
      impact = 'Médio',
      description = ''
    } = req.body;

    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'Por favor descreva o Bug ou a Oportunidade de Melhoria.' });
    }

    const userRow = db.prepare('SELECT id, username, full_name, email, phone, role FROM users WHERE id = ?').get(req.user.id) || req.user;
    const isBug = ticket_type === 'BUG';
    const typeLabel = isBug ? '🐛 Bug / Erro' : '💡 Oportunidade de Melhoria';
    const typeShort = isBug ? 'BUG' : 'MELHORIA';
    const roleLabel = ROLE_LABELS[userRow.role] || userRow.role;
    const nowStr = new Date().toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });

    const subject = `REPFIX Ticket [${typeShort} | Impacto: ${impact}] - ${category} (por ${userRow.full_name})`;

    const textBody = [
      `Novo Ticket submetido no REPFIX FlowTrack`,
      `--------------------------------------------------`,
      `• Tipo: ${typeLabel}`,
      `• Categoria: ${category}`,
      `• Nível de Impacto: ${impact}`,
      `• Submetido por: ${userRow.full_name} (${roleLabel})`,
      `• Email do Utilizador: ${userRow.email || 'N/A'}`,
      `• Data / Hora: ${nowStr}`,
      `• Anexos: ${req.files?.length || 0} ficheiro(s)`,
      ``,
      `Descrição:`,
      `${String(description).trim()}`,
      `--------------------------------------------------`
    ].join('\n');

    const badgeColor = isBug ? '#ef4444' : '#eab308';
    const impactColor = impact.startsWith('Alto') ? '#ef4444' : impact === 'Médio' ? '#f59e0b' : '#22c55e';

    const htmlBody = `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
        <div style="background: #1e293b; padding: 20px 24px; border-bottom: 2px solid ${badgeColor};">
          <h2 style="margin: 0; color: #facc15; font-size: 18px;">🎫 REPFIX FlowTrack — Novo Ticket</h2>
          <p style="margin: 6px 0 0; color: #94a3b8; font-size: 13px;">Submetido em ${nowStr}</p>
        </div>
        <div style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8; width: 160px;"><strong>Tipo:</strong></td>
              <td style="padding: 8px 0;"><span style="background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}; padding: 3px 10px; border-radius: 6px; font-weight: 700;">${typeLabel}</span></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;"><strong>Categoria:</strong></td>
              <td style="padding: 8px 0; color: #f8fafc; font-weight: 600;">${category}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;"><strong>Nível de Impacto:</strong></td>
              <td style="padding: 8px 0;"><span style="color: ${impactColor}; font-weight: 700;">${impact}</span></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;"><strong>Utilizador:</strong></td>
              <td style="padding: 8px 0; color: #f8fafc;">${userRow.full_name} <span style="color: #94a3b8;">(${roleLabel})</span></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;"><strong>Contacto:</strong></td>
              <td style="padding: 8px 0; color: #cbd5e1;">${[userRow.email, userRow.phone].filter(Boolean).join(' | ') || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;"><strong>Anexos:</strong></td>
              <td style="padding: 8px 0; color: #cbd5e1;">${req.files?.length || 0} ficheiro(s)</td>
            </tr>
          </table>

          <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; font-weight: 700;">Descrição Detalhada</div>
            <div style="white-space: pre-wrap; line-height: 1.6; color: #f8fafc; font-size: 14px;">${String(description).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>
        </div>
      </div>
    `;

    const attachments = (req.files || []).map(f => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype
    }));

    const sent = await sendEmail(
      'geral@repfix.pt',
      subject,
      textBody,
      htmlBody,
      {
        cc: 'mbperalta92@gmail.com',
        replyTo: userRow.email || undefined,
        attachments
      }
    );

    if (!sent) {
      return res.status(500).json({ error: 'Não foi possível enviar o ticket por e-mail. Tente novamente.' });
    }

    res.status(201).json({ message: 'Ticket enviado com sucesso! Obrigado pelo seu contributo.' });
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json({ error: 'Erro ao submeter ticket.' });
  }
});

export default router;
