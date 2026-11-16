import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import toast from 'react-hot-toast';
import FileManagerModal from './FileManagerModal';
import InlineTimePicker from './InlineTimePicker';
import './ProcessDetailModal.css';

function parseDatePart(dateTimeStr) {
  if (!dateTimeStr) return '';
  if (dateTimeStr.includes('T')) return dateTimeStr.split('T')[0];
  if (dateTimeStr.includes(' ')) return dateTimeStr.split(' ')[0];
  return dateTimeStr;
}

function parseTimePart(dateTimeStr) {
  if (!dateTimeStr) return '';
  if (dateTimeStr.includes('T')) return dateTimeStr.split('T')[1]?.substring(0, 5) || '';
  if (dateTimeStr.includes(' ')) return dateTimeStr.split(' ')[1]?.substring(0, 5) || '';
  return '';
}

function combineDateTime(datePart, timePart) {
  if (!datePart) return null;
  if (!timePart) return datePart;
  return `${datePart}T${timePart}`;
}

export default function ProcessDetailModal({ processId, onClose, onUpdate }) {
  const { user, isAdmin } = useAuth();
  const [proc, setProc] = useState(null);
  const [history, setHistory] = useState([]);
  const [users, setUsers] = useState([]);
  const [commentText, setCommentText] = useState('');
  
  // Image lightbox state
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [expandedComments, setExpandedComments] = useState({});
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // History Tools State
  const [searchQuery, setSearchQuery] = useState('');
  const [showFileManager, setShowFileManager] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  
  const fileInputRef = useRef(null);
  const feedEndRef = useRef(null);

  // Load process data, history, and users (if admin)
  useEffect(() => {
    loadData();
  }, [processId]);

  // Scroll to bottom of history feed when it changes
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get(`/processes/${processId}`);
      setProc(data);

      const histData = await api.get(`/processes/${processId}/history`);
      setHistory(histData);

      const usersData = await api.get('/users');
      setUsers(usersData);
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar detalhes do processo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFieldChange(field, value) {
    if (!proc) return;
    setSaving(true);
    setError('');
    try {
      const updatedProc = await api.put(`/processes/${processId}`, {
        [field]: value
      });
      
      // Reload details & history
      const data = await api.get(`/processes/${processId}`);
      setProc(data);
      
      const histData = await api.get(`/processes/${processId}/history`);
      setHistory(histData);
      
      toast.success('Processo atualizado!');
      if (onUpdate) onUpdate();
    } catch (err) {
      toast.error(err.message || 'Erro ao atualizar campo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseProcess() {
    if (!window.confirm('Tem a certeza que deseja fechar este processo?')) return;
    await handleFieldChange('status', 'FECHADO');
  }

  function handleFileSelect(e) {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  }

  function handleRemoveFile(index) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmitComment(e) {
    e.preventDefault();
    if (!commentText.trim() && files.length === 0) return;

    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('comment', commentText);
      files.forEach(f => {
        formData.append('files', f);
      });

      const newEntry = await api.upload(`/processes/${processId}/history`, formData);
      setHistory(prev => [...prev, newEntry]);
      setCommentText('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Comentário adicionado!');
    } catch (err) {
      toast.error(err.message || 'Erro ao adicionar comentário.');
    } finally {
      setSaving(false);
    }
  }

  // Permission checks
  const isOnlyTechnician = user?.role === 'technician';
  const isAssignedToMe = proc?.technician_id === user?.id;

  // Technicians in ELABORAÇÃO, ANÁLISE, SUPERVISÃO (or FECHADO) are in Read-Only mode
  const isReadOnlyPhaseForTechnician = isOnlyTechnician && (
    ['ELABORAÇÃO', 'ANÁLISE', 'SUPERVISÃO'].includes(proc?.milestone) || proc?.status === 'FECHADO'
  );

  const canEditPriorityAndNextIntervention = !isReadOnlyPhaseForTechnician && (isAdmin || isAssignedToMe);
  const canEditFullProcess = isAdmin && !isOnlyTechnician;
  const canTechnicianEditMilestone = isOnlyTechnician && isAssignedToMe && !isReadOnlyPhaseForTechnician;

  // All attachments for current process
  const allAttachments = history.reduce((acc, entry) => {
    if (entry.attachments) return acc.concat(entry.attachments);
    return acc;
  }, []);

  async function handleExportAll() {
    if (allAttachments.length === 0) {
      toast.error('Não existem ficheiros para exportar.');
      return;
    }
    setExportingAll(true);
    const loadingToast = toast.loading('A preparar o ficheiro ZIP...');
    try {
      const res = await api.get(`/processes/${processId}/export-attachments`, { responseType: 'blob' });
      const blob = new Blob([res], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proc.process_id}-todos-anexos.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Todos os ficheiros exportados!', { id: loadingToast });
    } catch (err) {
      toast.error('Erro ao exportar ficheiros.', { id: loadingToast });
    } finally {
      setExportingAll(false);
    }
  }

  const filteredHistory = history.filter(entry => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    if (entry.action_type === 'comment' && entry.comment?.toLowerCase().includes(query)) return true;
    if (entry.user_name?.toLowerCase().includes(query)) return true;
    if (entry.old_value?.toLowerCase().includes(query)) return true;
    if (entry.new_value?.toLowerCase().includes(query)) return true;
    if (entry.attachments?.some(a => a.original_name.toLowerCase().includes(query))) return true;
    
    return false;
  });

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content detail-modal loading-modal">
          <div className="spinner"></div>
          <p>A carregar detalhes do processo...</p>
        </div>
      </div>
    );
  }

  if (!proc) {
    return (
      <div className="modal-overlay">
        <div className="modal-content detail-modal">
          <div className="modal-header">
            <h3>Erro</h3>
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body error-body">
            <p>{error || 'Processo não encontrado.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isOverdue = proc.next_intervention_date && new Date(proc.next_intervention_date) < new Date() && proc.status === 'ABERTO';

  return (
    <div className="modal-overlay">
      <div className="modal-content detail-modal animate-scale-in">
        
        {/* HEADER */}
        <div className="modal-header">
          <div className="header-left">
            <span className={`type-tag type-${proc.type.toLowerCase()}`}>{proc.type}</span>
            <h2>{proc.process_id}</h2>
            <span className={`status-badge status-${proc.status.toLowerCase()}`}>
              {proc.status}
            </span>
            {isOverdue && <span className="overdue-warning-tag">⚠️ INTERVENÇÃO ATRASADA</span>}
          </div>
          <div className="header-right">
            <a
              href={proc.google_drive_folder_url || `https://drive.google.com/drive/folders/1Y6WnQmk0a8ojNGN3tzE3rPFCLXTU49gC`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline drive-modal-btn"
              title={`Abrir Pasta na Google Drive (${proc.process_id}_${proc.client})`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 14px' }}
            >
              📁 Google Drive ({proc.process_id}_{proc.client})
            </a>
            {saving && <span className="saving-indicator">A guardar...</span>}
            <button className="close-btn" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* BODY */}
        <div className="modal-body detail-grid">
          
          {/* LEFT COLUMN: DETAILS */}
          <div className="detail-panel">
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label>Cliente</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  className="input-field"
                  value={proc.client}
                  disabled={!canEditFullProcess}
                  onChange={e => setProc(prev => ({ ...prev, client: e.target.value }))}
                  onBlur={e => handleFieldChange('client', e.target.value)}
                  style={{ flex: 2 }}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Código Cliente"
                  value={proc.client_code || ''}
                  disabled={!canEditFullProcess}
                  onChange={e => setProc(prev => ({ ...prev, client_code: e.target.value }))}
                  onBlur={e => handleFieldChange('client_code', e.target.value)}
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
                value={proc.address || ''}
                disabled={!canEditFullProcess && !canTechnicianEditMilestone}
                onChange={e => setProc(prev => ({ ...prev, address: e.target.value }))}
                onBlur={e => handleFieldChange('address', e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Fase / Milestone</label>
                <select
                  className="select-field"
                  value={proc.milestone}
                  disabled={!canEditFullProcess && !canTechnicianEditMilestone}
                  onChange={e => handleFieldChange('milestone', e.target.value)}
                >
                  {isOnlyTechnician ? (
                    proc.milestone === 'PENDENTE' ? (
                      <>
                        <option value="PENDENTE">Pendente</option>
                        <option value="ELABORAÇÃO">Elaboração</option>
                      </>
                    ) : (
                      <>
                        <option value="FILA">Fila de Espera</option>
                        <option value="AGENDADO">Agendado</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="ELABORAÇÃO">Elaboração</option>
                      </>
                    )
                  ) : (
                    <>
                      <option value="FILA">Fila de Espera</option>
                      <option value="AGENDADO">Agendado</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="ELABORAÇÃO">Elaboração</option>
                      <option value="ANÁLISE">Análise</option>
                      <option value="SUPERVISÃO">Supervisão</option>
                    </>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Prioridade</label>
                <select
                  className="select-field"
                  value={proc.priority}
                  disabled={!canEditPriorityAndNextIntervention}
                  onChange={e => handleFieldChange('priority', e.target.value)}
                >
                  <option value="Baixa">Baixa</option>
                  <option value="Media">Média</option>
                  <option value="Alta">Alta</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Gestor Atribuído</label>
              <select
                className="select-field"
                value={proc.manager_id || ''}
                disabled={!canEditFullProcess}
                onChange={e => handleFieldChange('manager_id', e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">Não Atribuído</option>
                {users.filter(u => ['admin', 'key_user', 'both'].includes(u.role)).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role_name || u.role})
                  </option>
                ))}
                {!canEditFullProcess && proc.manager_id && !users.find(u => u.id === proc.manager_id) && (
                  <option value={proc.manager_id}>{proc.manager_name}</option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Técnico Atribuído</label>
              <select
                className="select-field"
                value={proc.technician_id || ''}
                disabled={!canEditFullProcess}
                onChange={e => handleFieldChange('technician_id', e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">Não Atribuído</option>
                {users.filter(u => ['technician', 'both', 'key_user'].includes(u.role)).map(u => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role_name || u.role})
                  </option>
                ))}
                {!canEditFullProcess && proc.technician_id && !users.find(u => u.id === proc.technician_id) && (
                  <option value={proc.technician_id}>{proc.technician_name}</option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label>Descrição</label>
              <textarea
                className="input-field textarea-field"
                value={proc.description || ''}
                disabled={!canEditFullProcess}
                onChange={e => setProc(prev => ({ ...prev, description: e.target.value }))}
                onBlur={e => handleFieldChange('description', e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Data de Abertura</label>
                <input
                  type="text"
                  className="input-field"
                  value={new Date(proc.open_date).toLocaleDateString('pt-PT')}
                  disabled
                />
              </div>

              <div className="form-group">
                <label>Data e Hora de Agendamento</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="date"
                    className="input-field"
                    value={parseDatePart(proc.schedule_date || proc.next_intervention_date)}
                    disabled={!canEditFullProcess && !canTechnicianEditMilestone}
                    onChange={e => {
                      const newDate = e.target.value;
                      const timePart = parseTimePart(proc.schedule_date) || parseTimePart(proc.next_intervention_date);
                      handleFieldChange('schedule_date', combineDateTime(newDate, timePart));
                    }}
                    style={{ flex: 2 }}
                  />
                  <InlineTimePicker
                    className="input-field"
                    value={parseTimePart(proc.schedule_date) || parseTimePart(proc.next_intervention_date)}
                    disabled={!canEditFullProcess && !canTechnicianEditMilestone}
                    onSave={newTime => {
                      const datePart = parseDatePart(proc.schedule_date || proc.next_intervention_date) || new Date().toISOString().split('T')[0];
                      handleFieldChange('schedule_date', combineDateTime(datePart, newTime));
                    }}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Data da Próxima Intervenção</label>
              <input
                type="date"
                className="input-field"
                value={parseDatePart(proc.next_intervention_date)}
                disabled={!canEditPriorityAndNextIntervention && !canTechnicianEditMilestone}
                onChange={e => handleFieldChange('next_intervention_date', e.target.value || null)}
              />
            </div>

            {/* PARENT / CHILD RELATIONSHIPS */}
            {proc.parent_id && (
              <div className="relation-box parent-box">
                <h4>Processo Pai</h4>
                <div className="relation-item">
                  <strong>{proc.parent_process_id}</strong> - {proc.parent_client} ({proc.parent_status})
                </div>
              </div>
            )}

            {proc.type === 'PROC' && proc.children && proc.children.length > 0 && (
              <div className="relation-box children-box">
                <h4>Aditamentos / Escalonamentos Associados</h4>
                <div className="children-list">
                  {proc.children.map(child => (
                    <div key={child.id} className="relation-item">
                      <span className={`type-tag type-${child.type.toLowerCase()}`}>{child.type}</span>
                      <strong>{child.process_id}</strong> - {child.client} ({child.milestone})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CLOSE ACTION */}
            {!isOnlyTechnician && isAdmin && proc.status === 'ABERTO' && (
              <button 
                type="button" 
                className="btn btn-danger close-process-btn"
                onClick={handleCloseProcess}
              >
                Fechar Processo
              </button>
            )}
          </div>

          {/* RIGHT COLUMN: HISTORY FEED & COMMENTS */}
          <div className="feed-panel">
            <div className="history-header-tools">
              <h3>Histórico e Comentários</h3>
              <div className="history-actions">
                <input 
                  type="text" 
                  className="input-field search-history-input" 
                  placeholder="Pesquisar..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <button 
                  className="btn btn-outline icon-btn" 
                  title="Gerir Ficheiros"
                  onClick={() => setShowFileManager(true)}
                  disabled={allAttachments.length === 0}
                >
                  📁
                </button>
                <button 
                  className="btn btn-outline icon-btn" 
                  title="Extrair Todos os Ficheiros"
                  onClick={handleExportAll}
                  disabled={exportingAll || allAttachments.length === 0}
                >
                  {exportingAll ? '⏳' : '📥'}
                </button>
              </div>
            </div>
            
            <div className="feed-timeline">
              {filteredHistory.length === 0 && searchQuery && (
                <p style={{textAlign: 'center', color: 'var(--text-muted)', marginTop: 20}}>Nenhum resultado encontrado.</p>
              )}
              {filteredHistory.map(entry => {
                const dateStr = new Date(entry.created_at).toLocaleString('pt-PT', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                
                const initials = entry.user_name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

                if (entry.action_type === 'comment') {
                  return (
                    <div key={entry.id} className="feed-item comment-item">
                      <div className="feed-avatar">{initials}</div>
                      <div className="feed-content-wrapper">
                        <div className="feed-meta">
                          <strong className="user-name">{entry.user_name}</strong>
                          <span className="feed-time">{dateStr}</span>
                        </div>
                        <p className="comment-text">{entry.comment}</p>
                        
                        {entry.attachments && entry.attachments.length > 0 && (() => {
                          const isExpanded = expandedComments[entry.id];
                          const hiddenCount = entry.attachments.length - 1;
                          
                          return (
                            <div className="attachments-list">
                              {entry.attachments.map((att, index) => {
                                if (!isExpanded && index > 0) return null;

                                const isImg = att.mime_type?.startsWith('image/');
                                const fileUrl = `/uploads/attachments/${att.filename}`;
                                
                                const handlePreviewClick = (e) => {
                                  e.preventDefault();
                                  if (!isExpanded && hiddenCount > 0) {
                                    setExpandedComments(prev => ({ ...prev, [entry.id]: true }));
                                  } else if (isImg) {
                                    setFullscreenImage(fileUrl);
                                  } else {
                                    window.open(fileUrl, '_blank');
                                  }
                                };
                                
                                return (
                                  <div key={att.id} className="attachment-preview-card" style={{ position: 'relative' }}>
                                    {isImg ? (
                                      <a 
                                        href={fileUrl} 
                                        className="img-link"
                                        onClick={handlePreviewClick}
                                      >
                                        <img src={fileUrl} alt={att.original_name} className="img-thumbnail" />
                                        {!isExpanded && hiddenCount > 0 && (
                                          <div className="hidden-count-overlay">+{hiddenCount}</div>
                                        )}
                                      </a>
                                    ) : (
                                      <a 
                                        href={fileUrl} 
                                        className="doc-link"
                                        onClick={handlePreviewClick}
                                      >
                                        📁 {att.original_name}
                                        {!isExpanded && hiddenCount > 0 && (
                                          <div className="hidden-count-overlay doc-overlay">+{hiddenCount}</div>
                                        )}
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                } else {
                  // System Log
                  let logMessage = '';
                  let icon = '⚙️';
                  
                  switch (entry.action_type) {
                    case 'creation':
                      logMessage = `Processo criado por ${entry.user_name}.`;
                      icon = '✨';
                      break;
                    case 'status_change':
                      logMessage = `Alterou estado de "${entry.old_value}" para "${entry.new_value}".`;
                      icon = '🔄';
                      break;
                    case 'milestone_change':
                      logMessage = `Alterou milestone de "${entry.old_value}" para "${entry.new_value}".`;
                      icon = '📍';
                      break;
                    case 'assignment':
                      logMessage = `Atribuiu técnico "${entry.new_value}" (anterior: "${entry.old_value}").`;
                      icon = '👤';
                      break;
                    case 'priority_change':
                      logMessage = `Alterou prioridade de "${entry.old_value}" para "${entry.new_value}".`;
                      icon = '⚡';
                      break;
                    case 'date_change':
                      logMessage = `Alterou data de agendamento/intervenção (antes: "${entry.old_value}", nova: "${entry.new_value}").`;
                      icon = '📅';
                      break;
                    default:
                      logMessage = entry.comment || `Ação ${entry.action_type} registada.`;
                  }

                  return (
                    <div key={entry.id} className="feed-item system-item">
                      <div className="system-icon">{icon}</div>
                      <div className="feed-content-wrapper">
                        <span className="system-msg">{logMessage}</span>
                        <span className="feed-time">{dateStr}</span>
                      </div>
                    </div>
                  );
                }
              })}
              <div ref={feedEndRef} />
            </div>

            {/* WRITE COMMENT FORM */}
            <form onSubmit={handleSubmitComment} className="comment-form">
              <textarea
                className="input-field comment-textarea"
                placeholder="Escreva um comentário..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                disabled={saving}
              />
              
              {files.length > 0 && (
                <div className="selected-files">
                  {files.map((f, idx) => (
                    <div key={idx} className="file-pill">
                      <span>{f.name} ({(f.size/1024/1024).toFixed(2)}MB)</span>
                      <button type="button" onClick={() => handleRemoveFile(idx)}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="comment-actions">
                <input
                  type="file"
                  id="comment-files"
                  ref={fileInputRef}
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  📎 Anexar Ficheiro
                </button>
                
                <button
                  type="submit"
                  className="btn btn-gold"
                  disabled={saving || (!commentText.trim() && files.length === 0)}
                >
                  {saving ? 'A enviar...' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* LIGHTBOX OVERLAY */}
      {fullscreenImage && (
        <div className="lightbox-overlay" onClick={() => setFullscreenImage(null)}>
          <button className="lightbox-close" onClick={() => setFullscreenImage(null)}>&times;</button>
          <img src={fullscreenImage} alt="Fullscreen preview" className="lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* FILE MANAGER MODAL */}
      {showFileManager && (
        <FileManagerModal 
          processId={processId}
          processDisplayId={proc.process_id}
          attachments={allAttachments}
          onClose={() => setShowFileManager(false)}
        />
      )}
    </div>
  );
}
