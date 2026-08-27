import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import api from '../services/api';
import './HomePage.css';

export default function HomePage() {
  const { user, isAdmin, isKeyUser } = useAuth();
  const navigate = useNavigate();
  const [greeting, setGreeting] = useState('');
  const [stats, setStats] = useState({
    openCount: 0,
    overdueCount: 0,
    supervisionCount: 0,
    loading: true,
  });

  useEffect(() => {
    // Determine greeting based on Portuguese standards
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      setGreeting('Bom dia');
    } else if (hour >= 12 && hour < 20) {
      setGreeting('Boa tarde');
    } else {
      setGreeting('Boa noite');
    }

    // Fetch stats
    async function loadStats() {
      try {
        const processes = await api.get('/processes?status=ABERTO');
        const now = new Date();
        
        let overdue = 0;
        let supervision = 0;
        
        processes.forEach(p => {
          if (p.next_intervention_date && new Date(p.next_intervention_date) < now) {
            overdue++;
          }
          if (p.milestone === 'SUPERVISÃO') {
            supervision++;
          }
        });

        setStats({
          openCount: processes.length,
          overdueCount: overdue,
          supervisionCount: supervision,
          loading: false,
        });
      } catch (err) {
        console.error('Erro ao carregar dados do resumo:', err);
        setStats(prev => ({ ...prev, loading: false }));
      }
    }

    loadStats();
  }, []);

  const cards = [
    {
      id: 'processes',
      title: 'PROCESSOS',
      description: 'Gerir processos, peritagens e milestones.',
      icon: '📋',
      path: '/processos',
      visible: true
    },
    {
      id: 'calendar',
      title: 'CALENDÁRIO',
      description: 'Agenda de intervenções, eventos e aniversários.',
      icon: '📅',
      path: '/calendario',
      visible: true
    },
    {
      id: 'users',
      title: 'UTILIZADORES',
      description: 'Gestão da equipa e dados de utilizador.',
      icon: '👥',
      path: '/utilizadores',
      visible: isKeyUser
    },
    {
      id: 'analytics',
      title: 'ANÁLISE',
      description: 'Estatísticas de produtividade e relatórios.',
      icon: '📊',
      path: '/analise',
      visible: isAdmin
    }
  ];

  return (
    <div className="home-layout">
      <Header />
      
      <main className="home-container animate-fade-in">
        <section className="home-hero">
          <h1 className="greeting-title">
            {greeting}, <span className="user-highlight">{user?.full_name || 'Utilizador'}</span>
          </h1>
          <p className="hero-subtitle">
            Bem-vindo ao painel central do REPFIX FlowTrack. Selecione uma das áreas abaixo para começar.
          </p>
        </section>

        <section className="home-grid">
          {cards.filter(c => c.visible).map(card => (
            <div 
              key={card.id} 
              className="home-card glass-card"
              onClick={() => navigate(card.path)}
            >
              <div className="card-icon-wrapper">
                <span className="card-icon">{card.icon}</span>
              </div>
              <div className="card-content">
                <h3 className="card-title">{card.title}</h3>
                <p className="card-desc">{card.description}</p>
              </div>
              <div className="card-arrow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>
          ))}
        </section>

        <section className="home-summary glass-card">
          <h3 className="summary-title">Resumo Rápido (Abertos)</h3>
          
          {stats.loading ? (
            <div className="summary-loading">A carregar dados...</div>
          ) : (
            <div className="summary-stats-grid">
              <div className="summary-stat-box">
                <span className="stat-value text-info">{stats.openCount}</span>
                <span className="stat-label">Processos Abertos</span>
              </div>
              
              <div className="summary-stat-box">
                <span className="stat-value text-warning">{stats.supervisionCount}</span>
                <span className="stat-label">Em Supervisão</span>
              </div>

              <div className="summary-stat-box">
                <span className={`stat-value ${stats.overdueCount > 0 ? 'text-error animate-pulse' : 'text-success'}`}>
                  {stats.overdueCount}
                </span>
                <span className="stat-label">Intervenções Atrasadas {stats.overdueCount > 0 && '⚠️'}</span>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
