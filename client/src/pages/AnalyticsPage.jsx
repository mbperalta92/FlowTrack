import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import api from '../services/api';
import './AnalyticsPage.css';

// ChartJS imports & registration
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
);

export default function AnalyticsPage() {
  const { isAdmin } = useAuth();
  
  // Filters State
  const [period, setPeriod] = useState('30d'); // '7d' | '30d' | '90d' | 'year' | 'all'
  const [techId, setTechId] = useState('');
  const [managerId, setManagerId] = useState('');
  
  // Data State
  const [data, setData] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTechnicians();
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [period, techId, managerId]);

  async function loadTechnicians() {
    try {
      const usersData = await api.get('/users');
      // Filter users who are technicians or both or key_user
      const techs = usersData.filter(u => u.role === 'technician' || u.role === 'both' || u.role === 'key_user');
      setTechnicians(techs);
      
      const mgrs = usersData.filter(u => u.role === 'admin' || u.role === 'both' || u.role === 'key_user');
      setManagers(mgrs);
    } catch { /* silent */ }
  }

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    try {
      // Build date_from based on period
      let dateFrom = '';
      const now = new Date();
      
      if (period === '7d') {
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (period === '30d') {
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (period === '90d') {
        dateFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      } else if (period === 'year') {
        dateFrom = `${now.getFullYear()}-01-01`;
      }

      // Build query string
      let query = `?date_from=${dateFrom}`;
      if (techId) {
        query += `&technician_id=${techId}`;
      }
      if (managerId) {
        query += `&manager_id=${managerId}`;
      }

      const res = await api.get(`/analytics${query}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Erro ao carregar dados de análise.');
    } finally {
      setLoading(false);
    }
  }

  // Chart 1: Doughnut Chart - Milestone Distribution
  const milestoneChartData = useMemo(() => {
    if (!data?.processes_by_milestone) return null;
    
    const labels = data.processes_by_milestone.map(m => m.milestone);
    const counts = data.processes_by_milestone.map(m => m.count);

    return {
      labels,
      datasets: [
        {
          label: 'Processos',
          data: counts,
          backgroundColor: [
            '#6b7a90', // FILA
            '#3b82f6', // AGENDADO
            '#ef4444', // PENDENTE
            '#f59e0b', // ELABORAÇÃO
            '#10b981', // ANÁLISE
            '#c9a84c'  // SUPERVISÃO
          ],
          borderColor: '#141b2d',
          borderWidth: 2,
        }
      ]
    };
  }, [data]);

  // Chart 2: Bar Chart - Priority Distribution
  const priorityChartData = useMemo(() => {
    if (!data?.processes_by_priority) return null;

    const labels = data.processes_by_priority.map(p => p.priority);
    const counts = data.processes_by_priority.map(p => p.count);

    return {
      labels,
      datasets: [
        {
          label: 'Processos por Prioridade',
          data: counts,
          backgroundColor: [
            '#ef4444', // Alta
            '#f59e0b', // Média
            '#10b981'  // Baixa
          ],
          borderWidth: 0,
          borderRadius: 6,
        }
      ]
    };
  }, [data]);

  // Chart styling options
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#b0b8c8',
          font: { family: 'Inter', size: 12 }
        }
      },
      tooltip: {
        padding: 10,
        cornerRadius: 6
      }
    }
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        padding: 10,
        cornerRadius: 6
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#b0b8c8' }
      },
      y: {
        grid: { color: '#2a3548' },
        ticks: { color: '#b0b8c8', stepSize: 1 }
      }
    }
  };

  // Helper helper to avoid standard React useMemo imports in code body
  function useMemo(factory, deps) {
    const [val, setVal] = useState(factory);
    useEffect(() => {
      setVal(factory());
    }, deps);
    return val;
  }

  // Count supervision processes from milestones list
  const supervisionCount = data?.processes_by_milestone?.find(m => m.milestone === 'SUPERVISÃO')?.count || 0;

  return (
    <div className="analytics-layout">
      <Header />
      
      <main className="analytics-container animate-fade-in">
        
        {/* HEADER BAR */}
        <section className="analytics-header-bar" data-tour="analytics-page">
          <div className="title-section">
            <h1>Análise e Métricas</h1>
            <p className="subtitle">Visão geral do progresso, taxas de conclusão e eficiência</p>
          </div>
          
          <div className="analytics-filters-box glass-card">
            <div className="filter-group">
              <label>Período</label>
              <select 
                className="select-field" 
                value={period}
                onChange={e => setPeriod(e.target.value)}
              >
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="90d">Últimos 90 dias</option>
                <option value="year">Este Ano</option>
                <option value="all">Todo o Histórico</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Filtrar por Técnico</label>
              <select 
                className="select-field" 
                value={techId}
                onChange={e => setTechId(e.target.value)}
              >
                <option value="">Todos os Técnicos</option>
                {technicians.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Filtrar por Gestor</label>
              <select 
                className="select-field" 
                value={managerId}
                onChange={e => setManagerId(e.target.value)}
              >
                <option value="">Todos os Gestores</option>
                {managers.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>A carregar estatísticas...</p>
          </div>
        ) : (
          <>
            {/* METRICS GRID */}
            <section className="analytics-metrics-grid" data-tour="analytics-kpis">
              
              <div className="metric-card card-blue glass-card">
                <div className="metric-icon">📋</div>
                <div className="metric-data">
                  <span className="metric-value">{data?.total_processes || 0}</span>
                  <span className="metric-label">Processos Ativos</span>
                </div>
              </div>

              <div className="metric-card card-green glass-card">
                <div className="metric-icon">📈</div>
                <div className="metric-data">
                  <span className="metric-value">{data?.completion_rate || 0}%</span>
                  <span className="metric-label">Taxa de Conclusão</span>
                </div>
              </div>

              <div className="metric-card card-red glass-card">
                <div className="metric-icon">⚠️</div>
                <div className="metric-data">
                  <span className={`metric-value ${data?.overdue_count > 0 ? 'text-error animate-pulse' : ''}`}>
                    {data?.overdue_count || 0}
                  </span>
                  <span className="metric-label">Processos Atrasados</span>
                </div>
              </div>

              <div className="metric-card card-gold glass-card">
                <div className="metric-icon">👑</div>
                <div className="metric-data">
                  <span className="metric-value">{supervisionCount}</span>
                  <span className="metric-label">Em Supervisão</span>
                </div>
              </div>

            </section>

            {/* CHARTS CONTAINER */}
            <section className="analytics-charts-grid">
              
              <div className="chart-box glass-card">
                <h3>Distribuição por Fase (Milestone)</h3>
                <div className="chart-wrapper">
                  {milestoneChartData && (
                    <Doughnut data={milestoneChartData} options={doughnutOptions} />
                  )}
                </div>
              </div>

              <div className="chart-box glass-card">
                <h3>Distribuição por Prioridade</h3>
                <div className="chart-wrapper">
                  {priorityChartData && (
                    <Bar data={priorityChartData} options={barOptions} />
                  )}
                </div>
              </div>

            </section>
          </>
        )}
      </main>
    </div>
  );
}
