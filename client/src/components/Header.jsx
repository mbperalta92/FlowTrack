import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTour } from '../contexts/TourContext';
import api from '../services/api';
import './Header.css';

export default function Header() {
  const { user, isAdmin, isKeyUser, logout } = useAuth();
  const { startTour } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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
    </header>
  );
}
