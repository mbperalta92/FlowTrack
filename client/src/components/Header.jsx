import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTour } from '../contexts/TourContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import './Header.css';

const TICKET_CATEGORIES = [
  '📋 Processos & Quadro Kanban',
  '📅 Calendário, Agenda & Mapa de Rotas',
  '📁 Ficheiros, Anexos & Google Drive',
  '🔔 Notificações & E-mails',
  '📊 Análise & Estatísticas',
  '👥 Utilizadores & Acessos',
  '⚡ Velocidade & Desempenho',
  '📱 Aspeto Visual / Uso no Telemóvel',
  '💬 Outro / Geral'
];

export default function Header() {
  const { user, isAdmin, isKeyUser, logout } = useAuth();
  const { startTour } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    ticket_type: 'BUG',
    category: TICKET_CATEGORIES[0],
    impact: 'Médio',
    description: ''
  });
  const [ticketFiles, setTicketFiles] = useState([]);
  const [sendingTicket, setSendingTicket] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (userRef.current && !userRef.current.contains(e.target)) setShowUserMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchNotifications() {
    try {
      const data = await api.get('/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch { /* silent */ }
  }

  async function markAllRead() {
    try {
      await api.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch { /* silent */ }
  }

  async function markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    } catch { /* silent */ }
  }

  function handleNotifClick(notif) {
    if (!notif.is_read) markRead(notif.id);
    setShowNotifications(false);
    if (notif.process_id) navigate('/processos', { state: { openProcessId: notif.process_id } });
  }

  async function handleSendTicket(e) {
    e.preventDefault();
    if (!ticketForm.description.trim()) {
      toast.error('Por favor escreva uma descrição para o ticket.');
      return;
    }
    setSendingTicket(true);
    try {
      const formData = new FormData();
      formData.append('ticket_type', ticketForm.ticket_type);
      formData.append('category', ticketForm.category);
      formData.append('impact', ticketForm.impact);
      formData.append('description', ticketForm.description.trim());
      ticketFiles.forEach(f => formData.append('files', f));

      await api.post('/tickets', formData);
      toast.success('Ticket enviado com sucesso!');
      setShowTicketModal(false);
      setTicketForm({
        ticket_type: 'BUG',
        category: TICKET_CATEGORIES[0],
        impact: 'Médio',
        description: ''
      });
      setTicketFiles([]);
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar ticket.');
    } finally {
      setSendingTicket(false);
    }
  }

  const navLinks = [
    { path: '/processos', label: 'Processos', icon: '📋' },
    { path: '/calendario', label: 'Calendário', icon: '📅' },
    ...(isAdmin ? [
      ...(isKeyUser ? [{ path: '/utilizadores', label: 'Utilizadores', icon: '👥' }] : []),
      { path: '/analise', label: 'Análise', icon: '📈' },
    ] : []),
  ];

  const initials = user?.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

  return (
    <header className="header">
      <Link to="/" className="header-brand" data-tour="header-brand">
        <span className="brand-repfix">REPFIX</span>
        <span className="brand-flow">FlowTrack</span>
      </Link>

      <nav className="header-nav sidebar-nav" data-tour="header-nav">
        {navLinks.map(link => (
          <Link
            key={link.path}
            to={link.path}
            className={`nav-link ${location.pathname === link.path ? 'active' : ''}`}
            {...(link.path === '/calendario' ? { 'data-tour': 'calendar-link' } : {})}
            {...(link.path === '/utilizadores' ? { 'data-tour': 'users-nav-link' } : {})}
            {...(link.path === '/analise' ? { 'data-tour': 'analytics-nav-link' } : {})}
          >
            <span className="nav-icon">{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="header-actions">
        {/* Tour trigger button (i) */}
        <button
          className="tour-trigger-btn"
          onClick={startTour}
          title="Iniciar Guia Interativo (Tour)"
        >
          i
        </button>

        <div className="notif-wrapper" ref={notifRef} data-tour="notifications-btn">
          <button className="notif-btn" onClick={() => setShowNotifications(!showNotifications)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {showNotifications && (
            <div className="notif-dropdown animate-slide-down">
              <div className="notif-header">
                <h4>Notificações</h4>
                {unreadCount > 0 && (
                  <button className="notif-mark-all" onClick={markAllRead}>Marcar todas como lidas</button>
                )}
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <p className="notif-empty">Sem notificações</p>
                ) : (
                  notifications.slice(0, 15).map(n => (
                    <div
                      key={n.id}
                      className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                      onClick={() => handleNotifClick(n)}
                    >
                      <div className="notif-dot" />
                      <div className="notif-content">
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        <span className="notif-time">{new Date(n.created_at).toLocaleString('pt-PT')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="user-wrapper" ref={userRef} data-tour="user-profile">
          <button className="user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className="user-avatar">{initials}</div>
            <span className="user-name">{user?.full_name?.split(' ')[0]}</span>
          </button>

          {showUserMenu && (
            <div className="user-dropdown animate-slide-down">
              <div className="user-info">
                <div className="user-avatar lg">{initials}</div>
                <div>
                  <strong>{user?.full_name}</strong>
                  <span>{user?.role_name || user?.role}</span>
                </div>
              </div>
              <button
                className="user-ticket-btn"
                onClick={() => {
                  setShowUserMenu(false);
                  setShowTicketModal(true);
                }}
              >
                <span style={{ fontSize: '1rem' }}>🎫</span>
                Gerar Ticket
              </button>
              <button className="user-logout" onClick={logout}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Terminar Sessão
              </button>
            </div>
          )}
        </div>
      </div>

      {showTicketModal && createPortal(
        <div className="ticket-modal-overlay" onClick={() => !sendingTicket && setShowTicketModal(false)}>
          <div
            className="ticket-modal animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="ticket-modal-header">
              <h3>🎫 Gerar Ticket — Suporte & Melhoria</h3>
              <button
                type="button"
                className="ticket-close-btn"
                onClick={() => !sendingTicket && setShowTicketModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSendTicket} className="ticket-form">
              <div className="form-group">
                <label>Tipo de Ticket</label>
                <div className="ticket-type-selector">
                  <button
                    type="button"
                    className={`ticket-type-btn ${ticketForm.ticket_type === 'BUG' ? 'active-bug' : ''}`}
                    onClick={() => setTicketForm(prev => ({ ...prev, ticket_type: 'BUG' }))}
                  >
                    <span className="ticket-type-icon">🐛</span>
                    <div>
                      <strong>Bug / Erro</strong>
                      <small>Algo não funcionou como esperado</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`ticket-type-btn ${ticketForm.ticket_type === 'MELHORIA' ? 'active-improvement' : ''}`}
                    onClick={() => setTicketForm(prev => ({ ...prev, ticket_type: 'MELHORIA' }))}
                  >
                    <span className="ticket-type-icon">💡</span>
                    <div>
                      <strong>Oportunidade de Melhoria</strong>
                      <small>Sugestão ou nova funcionalidade</small>
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1.5 }}>
                  <label>Categoria</label>
                  <select
                    className="select-field"
                    value={ticketForm.category}
                    onChange={e => setTicketForm(prev => ({ ...prev, category: e.target.value }))}
                  >
                    {TICKET_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label>Nível de Impacto</label>
                  <select
                    className="select-field"
                    value={ticketForm.impact}
                    onChange={e => setTicketForm(prev => ({ ...prev, impact: e.target.value }))}
                  >
                    <option value="Baixo">Baixo</option>
                    <option value="Médio">Médio</option>
                    <option value="Alto (Impede o trabalho)">Alto (Impede o trabalho)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>
                  {ticketForm.ticket_type === 'BUG' ? 'Descrição do Problema / Erro' : 'Descrição da Oportunidade de Melhoria'}
                </label>
                <textarea
                  className="input-field textarea-field"
                  rows={4}
                  required
                  placeholder={
                    ticketForm.ticket_type === 'BUG'
                      ? 'Explique o que aconteceu, em que ecrã estava e como podemos reproduzir o erro...'
                      : 'Descreva a sua ideia de melhoria e como ajudaria no trabalho diário...'
                  }
                  value={ticketForm.description}
                  onChange={e => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Anexos / Capturas de Ecrã (Opcional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label className="btn btn-outline" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    📎 Anexar Print / Ficheiro(s)
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => {
                        const selected = Array.from(e.target.files || []);
                        if (selected.length > 0) {
                          setTicketFiles(prev => [...prev, ...selected]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {ticketFiles.length === 0 && (
                    <span className="muted-text" style={{ fontSize: '0.8rem' }}>
                      Pode anexar prints do ecrã ou documentos de exemplo.
                    </span>
                  )}
                </div>

                {ticketFiles.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {ticketFiles.map((file, idx) => (
                      <span key={idx} className="ticket-file-pill">
                        📄 {file.name}
                        <button
                          type="button"
                          onClick={() => setTicketFiles(prev => prev.filter((_, i) => i !== idx))}
                          title="Remover ficheiro"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={sendingTicket}
                  onClick={() => setShowTicketModal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={sendingTicket}>
                  {sendingTicket ? 'A enviar ticket...' : '🚀 Enviar Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
