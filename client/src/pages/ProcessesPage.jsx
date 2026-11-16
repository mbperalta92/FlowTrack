import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import ProcessDetailModal from '../components/ProcessDetailModal';
import api from '../services/api';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import './ProcessesPage.css';
import * as XLSX from 'xlsx';

const formatShortName = (fullName) => {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return fullName;
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

export default function ProcessesPage() {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  
  // State variables
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // View controls
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban'
  const [myProcessesOnly, setMyProcessesOnly] = useState(false);
  
  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [milestoneFilter, setMilestoneFilter] = useState('');
  const [techFilter, setTechFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [overdueOnlyFilter, setOverdueOnlyFilter] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState('process_id');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  
  // Modal controls
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Create Form State
  const [createForm, setCreateForm] = useState({
    type: 'PROC',
    parent_id: '',
    client: '',
    client_code: '',
    address: '',
    description: '',
    priority: 'Media',
    milestone: 'FILA',
    schedule_date: '',
    next_intervention_date: '',
    technician_id: '',
    manager_id: ''
  });
  const [formSaving, setFormSaving] = useState(false);
  
  // Users state
  const [allUsers, setAllUsers] = useState([]);
  
  // Import Form State
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Load data
  useEffect(() => {
    loadProcesses();
    loadUsers();
  }, []);

  // Handle opening process from notification
  useEffect(() => {
    if (location.state?.openProcessId) {
      setSelectedProcessId(location.state.openProcessId);
      // Optional: clear the state so it doesn't reopen if the user refreshes the page
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  async function loadProcesses() {
    setLoading(true);
    try {
      const data = await api.get('/processes');
      setProcesses(data);
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar processos.');
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const data = await api.get('/users');
      setAllUsers(data);
    } catch (err) {
      console.error('Erro ao carregar utilizadores:', err);
    }
  }

  // Extract users by role
  const technicians = useMemo(() => {
    if (user?.role === 'technician') {
      return allUsers.filter(u => u.id === user?.id)
        .map(u => ({ id: u.id, name: u.full_name }));
    }
    return allUsers.filter(u => u.role === 'technician' || u.role === 'both' || u.role === 'key_user')
      .map(u => ({ id: u.id, name: u.full_name }));
  }, [allUsers, user]);

  const managers = useMemo(() => {
    return allUsers.filter(u => u.role === 'admin' || u.role === 'key_user' || u.role === 'both')
      .map(u => ({ id: u.id, name: u.full_name }));
  }, [allUsers]);

  // Extract available PROC type processes for parent selection dropdown
  const parentProcesses = useMemo(() => {
    return processes.filter(p => p.type === 'PROC' && p.status === 'ABERTO');
  }, [processes]);

  // Compute live KPI Statistics
  const stats = useMemo(() => {
    const now = new Date();
    let totalAbertos = 0;
    let emElaboracao = 0;
    let emSupervisao = 0;
    let atrasados = 0;
    let totalFechados = 0;

    processes.forEach(p => {
      if (p.status === 'ABERTO') {
        totalAbertos++;
        if (p.milestone === 'ELABORAÇÃO') emElaboracao++;
        if (p.milestone === 'SUPERVISÃO') emSupervisao++;
        if (p.next_intervention_date && new Date(p.next_intervention_date) < now) {
          atrasados++;
        }
      } else if (p.status === 'FECHADO') {
        totalFechados++;
      }
    });

    return { totalAbertos, emElaboracao, emSupervisao, atrasados, totalFechados };
  }, [processes]);

  // Filtered and Sorted Processes
  const processedProcesses = useMemo(() => {
    let result = [...processes];
    
    if (myProcessesOnly) {
      result = result.filter(p => p.technician_id === user?.id);
    }

    if (overdueOnlyFilter) {
      const now = new Date();
      result = result.filter(p => p.status === 'ABERTO' && p.next_intervention_date && new Date(p.next_intervention_date) < now);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.process_id.toLowerCase().includes(query) || 
        p.client.toLowerCase().includes(query) ||
        (p.client_code && p.client_code.toLowerCase().includes(query))
      );
    }
    
    if (statusFilter) result = result.filter(p => p.status === statusFilter);
    if (milestoneFilter) result = result.filter(p => p.milestone === milestoneFilter);
    if (techFilter) result = result.filter(p => p.technician_id === parseInt(techFilter, 10));
    if (managerFilter) result = result.filter(p => p.manager_id === parseInt(managerFilter, 10));
    if (priorityFilter) result = result.filter(p => p.priority === priorityFilter);
    if (typeFilter) result = result.filter(p => p.type === typeFilter);
    
    result.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [processes, myProcessesOnly, overdueOnlyFilter, searchQuery, statusFilter, milestoneFilter, techFilter, managerFilter, priorityFilter, typeFilter, sortField, sortOrder, user]);

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  async function handleCreateProcess(e) {
    e.preventDefault();
    setFormSaving(true);
    try {
      const payload = { ...createForm };
      if (!payload.technician_id) delete payload.technician_id;
      else payload.technician_id = parseInt(payload.technician_id, 10);
      
      if (!payload.manager_id) delete payload.manager_id;
      else payload.manager_id = parseInt(payload.manager_id, 10);
      
      if (!payload.parent_id) delete payload.parent_id;
      else payload.parent_id = parseInt(payload.parent_id, 10);

      await api.post('/processes', payload);
      toast.success('Processo criado com sucesso!');
      setShowCreateModal(false);
      
      setCreateForm({
        parent_id: '',
        client: '',
        client_code: '',
        description: '',
        priority: 'Media',
        milestone: 'FILA',
        schedule_date: '',
        next_intervention_date: '',
        technician_id: '',
        manager_id: '',
        type: 'PROC'
      });
      
      loadProcesses();
    } catch (err) {
      toast.error(err.message || 'Erro ao criar processo.');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleImportExcel(e) {
    e.preventDefault();
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const res = await api.upload('/processes/import', formData);
      toast.success(res.message || 'Ficheiro importado com sucesso!');
      setShowImportModal(false);
      loadProcesses();
    } catch (err) {
      toast.error(err.message || 'Erro ao importar ficheiro.');
    } finally {
      setImporting(false);
    }
  }

  async function handleDragEnd(result) {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;

    if (source.droppableId !== destination.droppableId) {
      const processId = draggableId;
      const newMilestone = destination.droppableId;
      
      if (user?.role === 'technician' && ['ANÁLISE', 'SUPERVISÃO'].includes(newMilestone)) {
        toast.error('Técnicos não têm permissão para mover processos para Análise ou Supervisão.');
        return;
      }
      
      // Optimistic UI update
      const processIndex = processes.findIndex(p => p.id.toString() === processId);
      if (processIndex > -1) {
        const updatedProcesses = [...processes];
        updatedProcesses[processIndex] = { ...updatedProcesses[processIndex], milestone: newMilestone };
        setProcesses(updatedProcesses);
      }
      
      // API Call
      try {
        await api.put(`/processes/${processId}`, { milestone: newMilestone });
        toast.success(`Movido para ${newMilestone}`);
        // Refresh in background to sync dates/history
        const data = await api.get('/processes');
        setProcesses(data);
      } catch (err) {
        toast.error(err.message || 'Erro ao mover processo');
        loadProcesses(); // Revert on failure
      }
    }
  }

  const milestoneColumns = ['FILA', 'AGENDADO', 'PENDENTE', 'ELABORAÇÃO', 'ANÁLISE', 'SUPERVISÃO'];
  
  const kanbanGroups = useMemo(() => {
    const groups = {
      FILA: [],
      AGENDADO: [],
      PENDENTE: [],
      ELABORAÇÃO: [],
      ANÁLISE: [],
      SUPERVISÃO: []
    };
    processedProcesses.forEach(p => {
      if (groups[p.milestone]) {
        groups[p.milestone].push(p);
      }
    });
    return groups;
  }, [processedProcesses]);

  return (
    <div className="processes-layout">
      <Header />
      
      <main className="processes-container animate-fade-in">
        <section className="processes-top-bar">
          <div className="title-section">
            <h1>Gestão de Processos</h1>
            <p className="subtitle">Listagem de tickets, peritagens e workflow</p>
          </div>
          
          <div className="actions-section">
            <div className="view-toggle-group" data-tour="view-toggle" style={{ display: 'flex', gap: '6px' }}>
              <button 
                className={`btn btn-outline toggle-view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                📋 Tabela
              </button>
              <button 
                className={`btn btn-outline toggle-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
                onClick={() => setViewMode('kanban')}
              >
                🗂️ Kanban
              </button>
            </div>
            
            <button 
              className={`btn btn-outline my-proc-btn ${myProcessesOnly ? 'active' : ''}`}
              data-tour="my-processes-btn"
              onClick={() => setMyProcessesOnly(prev => !prev)}
            >
              👤 Meus Processos
            </button>
            
            <div className="export-import-group" data-tour="export-import-actions" style={{ display: 'flex', gap: '8px' }}>
              <a
                href="https://drive.google.com/drive/folders/1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline drive-main-btn"
                title="Abrir Pasta Geral da REPFIX no Google Drive (geral@repfix.pt)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                📁 Google Drive
              </a>
              <button 
                className="btn btn-outline export-btn"
                onClick={() => {
                  if (processedProcesses.length === 0) {
                    toast.error('Não há processos para exportar.');
                    return;
                  }
                  const dataToExport = processedProcesses.map(p => ({
                    'ID Processo': p.process_id,
                    'Tipo': p.type,
                    'Cliente': p.client,
                    'Cód. Cliente': p.client_code || '',
                    'Gestor': p.manager_name || 'N/A',
                    'Técnico': p.technician_name || 'Sem Técnico',
                    'Prioridade': p.priority,
                    'Estado': p.status,
                    'Milestone': p.milestone,
                    'Data de Abertura': new Date(p.open_date).toLocaleDateString('pt-PT'),
                    'Próxima Intervenção': p.next_intervention_date ? new Date(p.next_intervention_date).toLocaleDateString('pt-PT') : ''
                  }));
                  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                  const workbook = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(workbook, worksheet, 'Processos');
                  const colWidths = [
                    { wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 15 }, 
                    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, 
                    { wch: 15 }, { wch: 20 }, { wch: 20 }
                  ];
                  worksheet['!cols'] = colWidths;
                  XLSX.writeFile(workbook, `Processos_${new Date().toISOString().split('T')[0]}.xlsx`);
                  toast.success('Excel exportado com sucesso!');
                }}
              >
                📤 Exportar Lista
              </button>
              
              {isAdmin && (
                <button 
                  className="btn btn-outline import-btn"
                  onClick={() => {
                    setImportFile(null);
                    setShowImportModal(true);
                  }}
                >
                  📥 Importar Excel
                </button>
              )}
            </div>

            {isAdmin && (
              <button 
                className="btn btn-gold create-btn new-process-button"
                data-tour="new-process-btn"
                onClick={() => setShowCreateModal(true)}
              >
                + Novo Processo
              </button>
            )}
          </div>
        </section>

        {/* KPI QUICK STATS PANEL */}
        <section className="kpis-grid" data-tour="kpis-panel">
          <div 
            className={`kpi-card glass-card ${statusFilter === 'ABERTO' && !milestoneFilter && !overdueOnlyFilter ? 'active' : ''}`}
            onClick={() => {
              if (statusFilter === 'ABERTO' && !milestoneFilter && !overdueOnlyFilter) {
                setStatusFilter('');
              } else {
                setStatusFilter('ABERTO');
                setMilestoneFilter('');
                setOverdueOnlyFilter(false);
              }
            }}
            title="Filtrar Processos Abertos"
          >
            <div className="kpi-icon kpi-blue">📂</div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.totalAbertos}</span>
              <span className="kpi-label">Processos Abertos</span>
            </div>
          </div>

          <div 
            className={`kpi-card glass-card ${milestoneFilter === 'ELABORAÇÃO' ? 'active' : ''}`}
            onClick={() => {
              if (milestoneFilter === 'ELABORAÇÃO') {
                setMilestoneFilter('');
              } else {
                setStatusFilter('ABERTO');
                setMilestoneFilter('ELABORAÇÃO');
                setOverdueOnlyFilter(false);
              }
            }}
            title="Filtrar em Elaboração"
          >
            <div className="kpi-icon kpi-amber">✍️</div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.emElaboracao}</span>
              <span className="kpi-label">Em Elaboração</span>
            </div>
          </div>

          <div 
            className={`kpi-card glass-card ${milestoneFilter === 'SUPERVISÃO' ? 'active' : ''}`}
            onClick={() => {
              if (milestoneFilter === 'SUPERVISÃO') {
                setMilestoneFilter('');
              } else {
                setStatusFilter('ABERTO');
                setMilestoneFilter('SUPERVISÃO');
                setOverdueOnlyFilter(false);
              }
            }}
            title="Filtrar em Supervisão"
          >
            <div className="kpi-icon kpi-purple">👁️</div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.emSupervisao}</span>
              <span className="kpi-label">Em Supervisão</span>
            </div>
          </div>

          <div 
            className={`kpi-card glass-card kpi-card-danger ${overdueOnlyFilter ? 'active' : ''}`}
            onClick={() => {
              setOverdueOnlyFilter(prev => !prev);
              if (!overdueOnlyFilter) {
                setStatusFilter('ABERTO');
              }
            }}
            title="Filtrar Intervenções Atrasadas"
          >
            <div className="kpi-icon kpi-red">⚠️</div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.atrasados}</span>
              <span className="kpi-label">Intervenções Atrasadas</span>
            </div>
          </div>

          <div 
            className={`kpi-card glass-card ${statusFilter === 'FECHADO' ? 'active' : ''}`}
            onClick={() => {
              if (statusFilter === 'FECHADO') {
                setStatusFilter('');
              } else {
                setStatusFilter('FECHADO');
                setMilestoneFilter('');
                setOverdueOnlyFilter(false);
              }
            }}
            title="Filtrar Processos Fechados"
          >
            <div className="kpi-icon kpi-green">✅</div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.totalFechados}</span>
              <span className="kpi-label">Processos Fechados</span>
            </div>
          </div>
        </section>

        <section className="processes-filters-bar glass-card filters-container" data-tour="filters-bar">
          <div className="search-input-wrapper">
            <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Procurar Cliente, ID ou Cód..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filters-dropdowns">
            <select className="select-field" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOverdueOnlyFilter(false); }}>
              <option value="">Estado: Todos</option>
              <option value="ABERTO">Aberto</option>
              <option value="FECHADO">Fechado</option>
            </select>
            <select className="select-field" value={milestoneFilter} onChange={e => { setMilestoneFilter(e.target.value); setOverdueOnlyFilter(false); }}>
              <option value="">Milestone: Todos</option>
              {milestoneColumns.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="select-field" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
              {user?.role !== 'technician' && <option value="">Técnico: Todos</option>}
              {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="select-field" value={managerFilter} onChange={e => setManagerFilter(e.target.value)}>
              <option value="">Gestor: Todos</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className="select-field" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="">Prioridade: Todos</option>
              <option value="Baixa">Baixa</option>
              <option value="Media">Média</option>
              <option value="Alta">Alta</option>
            </select>
            <select className="select-field" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Tipo: Todos</option>
              <option value="PROC">Processo (PROC)</option>
              <option value="ADT">Aditamento (ADT)</option>
              <option value="ESC">Escalonamento (ESC)</option>
            </select>
            {(statusFilter || milestoneFilter || techFilter || managerFilter || priorityFilter || typeFilter || searchQuery || overdueOnlyFilter || myProcessesOnly) && (
              <button 
                className="btn btn-outline reset-filters-btn"
                onClick={() => {
                  setStatusFilter('');
                  setMilestoneFilter('');
                  setTechFilter('');
                  setManagerFilter('');
                  setPriorityFilter('');
                  setTypeFilter('');
                  setSearchQuery('');
                  setOverdueOnlyFilter(false);
                  setMyProcessesOnly(false);
                }}
                title="Limpar todos os filtros"
              >
                🔄 Limpar
              </button>
            )}
          </div>
        </section>

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>A carregar processos...</p>
          </div>
        ) : processedProcesses.length === 0 ? (
          <div className="empty-state glass-card">
            <h3>Nenhum processo encontrado</h3>
            <p>Altere os filtros ou adicione um novo processo para começar.</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="list-view-wrapper glass-card" data-tour="kanban-board">
            <table className="processes-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('process_id')}>ID {sortField === 'process_id' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('type')}>Tipo {sortField === 'type' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('status')}>Estado {sortField === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('milestone')}>Milestone {sortField === 'milestone' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('client')}>Cliente {sortField === 'client' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('manager_name')}>Gestor {sortField === 'manager_name' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('technician_name')}>Técnico {sortField === 'technician_name' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('priority')}>Prioridade {sortField === 'priority' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('open_date')}>Data Abertura {sortField === 'open_date' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                  <th onClick={() => handleSort('next_intervention_date')}>Próx. Intervenção {sortField === 'next_intervention_date' && (sortOrder === 'asc' ? '▲' : '▼')}</th>
                </tr>
              </thead>
              <tbody>
                {processedProcesses.map(p => {
                  const isOverdue = p.next_intervention_date && new Date(p.next_intervention_date) < new Date() && p.status === 'ABERTO';
                  return (
                    <tr key={p.id} onClick={() => setSelectedProcessId(p.id)} className="clickable-row">
                      <td><strong className="process-id-cell">{p.process_id}</strong></td>
                      <td><span className={`type-tag type-${p.type.toLowerCase()}`}>{p.type}</span></td>
                      <td><span className={`status-badge status-${p.status.toLowerCase()}`}>{p.status}</span></td>
                      <td><span className="milestone-badge">{p.milestone}</span></td>
                      <td>
                        {p.client}
                        {p.client_code && <span className="muted-text" style={{ marginLeft: '6px', fontSize: '0.85em' }}>({p.client_code})</span>}
                      </td>
                      <td>{formatShortName(p.manager_name) || <span className="unassigned">N/A</span>}</td>
                      <td>{formatShortName(p.technician_name) || <span className="unassigned">Sem Técnico</span>}</td>
                      <td><span className={`badge badge-${p.priority.toLowerCase()}`}>{p.priority}</span></td>
                      <td>{new Date(p.open_date).toLocaleDateString('pt-PT')}</td>
                      <td className={isOverdue ? 'overdue-date-cell' : ''}>
                        {p.next_intervention_date ? (
                          <>{new Date(p.next_intervention_date).toLocaleDateString('pt-PT')}{isOverdue && ' ⚠️'}</>
                        ) : '---'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="kanban-wrapper" data-tour="kanban-board">
              {milestoneColumns.map(milestone => {
                const list = kanbanGroups[milestone] || [];
                return (
                  <div key={milestone} className="kanban-column kanban-column-glass">
                    <div className="kanban-column-header">
                      <h3>{milestone}</h3>
                      <span className="column-count">{list.length}</span>
                    </div>
                    
                    <Droppable droppableId={milestone}>
                      {(provided, snapshot) => (
                        <div 
                          className={`kanban-cards-container ${snapshot.isDraggingOver ? 'dragging-over' : ''}`}
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                        >
                          {list.map((p, index) => {
                            const isOverdue = p.next_intervention_date && new Date(p.next_intervention_date) < new Date() && p.status === 'ABERTO';
                            return (
                              <Draggable key={p.id.toString()} draggableId={p.id.toString()} index={index}>
                                {(provided, snapshot) => (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`kanban-card priority-${p.priority.toLowerCase()} ${isOverdue ? 'overdue-card' : ''} ${snapshot.isDragging ? 'is-dragging' : ''}`}
                                    onClick={() => setSelectedProcessId(p.id)}
                                    style={{ ...provided.draggableProps.style }}
                                  >
                                    <div className="card-top">
                                      <span className={`type-tag type-${p.type.toLowerCase()}`}>{p.type}</span>
                                      <span className="card-id">{p.process_id}</span>
                                    </div>
                                    <div className="card-client">
                                      <strong>{p.client}</strong>
                                      {p.client_code && <span className="muted-text" style={{ fontSize: '0.85em', display: 'block', marginTop: '2px' }}>Cód: {p.client_code}</span>}
                                    </div>
                                    {p.description && (
                                      <p className="card-desc-preview">
                                        {p.description.length > 70 ? p.description.slice(0, 70) + '...' : p.description}
                                      </p>
                                    )}
                                    <div className="card-footer">
                                      <span className="card-tech">👤 {p.technician_name?.split(' ')[0] || 'Sem Técnico'}</span>
                                      <span className="card-date">{new Date(p.open_date).toLocaleDateString('pt-PT')}</span>
                                    </div>
                                    {isOverdue && (
                                      <div className="card-overdue-alert">
                                        <span>⚠️ Intervenção Atrasada</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </main>

      {selectedProcessId && (
        <ProcessDetailModal 
          processId={selectedProcessId}
          onClose={() => setSelectedProcessId(null)}
          onUpdate={loadProcesses}
        />
      )}

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content create-modal animate-scale-in">
            <div className="modal-header">
              <h3>Novo Processo</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleCreateProcess} className="create-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de Processo</label>
                  <select 
                    className="select-field"
                    value={createForm.type}
                    onChange={e => setCreateForm(prev => ({ ...prev, type: e.target.value, parent_id: '' }))}
                  >
                    <option value="PROC">Processo Principal (PROC)</option>
                    <option value="ADT">Aditamento (ADT)</option>
                    <option value="ESC">Escalonamento (ESC)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Prioridade Inicial</label>
                  <select 
                    className="select-field"
                    value={createForm.priority}
                    onChange={e => setCreateForm(prev => ({ ...prev, priority: e.target.value }))}
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Media">Média</option>
                    <option value="Alta">Alta</option>
                  </select>
                </div>
              </div>

              {(createForm.type === 'ADT' || createForm.type === 'ESC') && (
                <div className="form-group">
                  <label>Processo Pai (Principal)</label>
                  <select 
                    className="select-field"
                    value={createForm.parent_id}
                    required
                    onChange={e => setCreateForm(prev => ({ ...prev, parent_id: e.target.value }))}
                  >
                    <option value="">Selecione o Processo PROC...</option>
                    {parentProcesses.map(p => (
                      <option key={p.id} value={p.id}>{p.process_id} - {p.client}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label>Cliente</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input 
                    type="text" 
                    className="input-field"
                    required 
                    placeholder="Nome do Cliente"
                    value={createForm.client}
                    onChange={e => setCreateForm(prev => ({ ...prev, client: e.target.value }))}
                    style={{ flex: 2 }}
                  />
                  <input 
                    type="text" 
                    className="input-field"
                    placeholder="Cód. Cliente (Opcional)"
                    value={createForm.client_code}
                    onChange={e => setCreateForm(prev => ({ ...prev, client_code: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Morada / Local de Peritagem</label>
                <input 
                  type="text" 
                  className="input-field"
                  placeholder="Ex: Av. da Liberdade 100, Lisboa"
                  value={createForm.address}
                  onChange={e => setCreateForm(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Descrição / Detalhes</label>
                <textarea 
                  className="input-field textarea-field"
                  placeholder="Descreva a peritagem..."
                  value={createForm.description}
                  onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Data de Agendamento</label>
                  <input 
                    type="date"
                    className="input-field"
                    value={createForm.schedule_date}
                    onChange={e => setCreateForm(prev => ({ ...prev, schedule_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Data Próxima Intervenção</label>
                  <input 
                    type="date"
                    className="input-field"
                    value={createForm.next_intervention_date}
                    onChange={e => setCreateForm(prev => ({ ...prev, next_intervention_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Gestor de Processo</label>
                  <select 
                    className="select-field"
                    required
                    value={createForm.manager_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, manager_id: e.target.value }))}
                  >
                    <option value="">Selecione o Gestor...</option>
                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Técnico Inicial</label>
                  <select 
                    className="select-field"
                    value={createForm.technician_id}
                    onChange={e => setCreateForm(prev => ({ ...prev, technician_id: e.target.value }))}
                  >
                    <option value="">Não Atribuído</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-gold" disabled={formSaving}>
                  {formSaving ? 'A criar...' : 'Criar Processo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content import-modal animate-scale-in">
            <div className="modal-header">
              <h3>Importar Processos (Excel)</h3>
              <button className="close-btn" onClick={() => setShowImportModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <p className="import-instructions">Carregue um ficheiro Excel (.xlsx, .xls) ou CSV. O sistema criará automaticamente processos sequenciais para as linhas válidas.</p>
              
              <form onSubmit={handleImportExcel} className="import-form">
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv"
                  className="input-field"
                  required
                  onChange={e => setImportFile(e.target.files?.[0] || null)}
                />
                
                <button type="submit" className="btn btn-gold" disabled={importing || !importFile}>
                  {importing ? 'A importar...' : 'Confirmar Importação'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
