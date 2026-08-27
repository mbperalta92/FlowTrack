import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import api from '../services/api';
import toast from 'react-hot-toast';
import './UsersPage.css';

export default function UsersPage() {
  const { user: currentUser, isKeyUser } = useAuth();
  
  // State variables
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal controls
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null means creating
  
  // Form State
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    birth_date: '',
    address: '',
    nif: '',
    role: 'technician'
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Roles map
  const rolesMap = {
    key_user: 'Key User',
    admin: 'Administrador / Gestor',
    technician: 'Perito / Técnico',
    both: 'Ambos (Admin + Técnico)'
  };

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/users');
      setUsers(data);
    } catch (err) {
      toast.error(err.message || 'Erro ao carregar utilizadores.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      full_name: '',
      email: '',
      birth_date: '',
      address: '',
      nif: '',
      role: 'technician'
    });
    setFormError('');
    setShowModal(true);
  }

  function handleOpenEdit(u) {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '', // blank password unless changing it
      full_name: u.full_name,
      email: u.email,
      birth_date: u.birth_date ? u.birth_date.split('T')[0] : '',
      address: u.address || '',
      nif: u.nif || '',
      role: u.role
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editingUser) {
        // Edit User
        const payload = { ...formData };
        if (!payload.password) {
          delete payload.password; // Do not update password if left blank
        }
        await api.put(`/users/${editingUser.id}`, payload);
      } else {
        // Create User
        if (!formData.password) {
          throw new Error('A palavra-passe é obrigatória para novos utilizadores.');
        }
        await api.post('/users', formData);
      }
      
      toast.success('Utilizador guardado com sucesso!');
      setShowModal(false);
      loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erro ao guardar utilizador.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id, name) {
    if (id === currentUser.id) {
      toast.error('Não se pode apagar a si próprio!');
      return;
    }
    
    if (!window.confirm(`Tem a certeza que deseja eliminar o utilizador "${name}"? Esta ação é irreversível.`)) {
      return;
    }

    try {
      await api.delete(`/users/${id}`);
      toast.success('Utilizador eliminado com sucesso!');
      loadUsers();
    } catch (err) {
      toast.error(err.message || 'Erro ao eliminar utilizador.');
    }
  }

  return (
    <div className="users-layout">
      <Header />
      
      <main className="users-container animate-fade-in">
        <section className="users-header-bar" data-tour="users-page">
          <div className="title-section">
            <h1>Gestão de Utilizadores</h1>
            <p className="subtitle">Administração da equipa, perfis e permissões de acesso</p>
          </div>
          {isKeyUser && (
            <button className="btn btn-gold" data-tour="new-user-btn" onClick={handleOpenCreate}>
              + Novo Utilizador
            </button>
          )}
        </section>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>A carregar equipa...</p>
          </div>
        ) : (
          <div className="users-list-wrapper glass-card" data-tour="users-table">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Nome Completo</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Cargo / Permissão</th>
                  <th>NIF</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <strong className="user-name-cell">{u.full_name}</strong>
                      {u.id === currentUser.id && <span className="self-badge">Eu</span>}
                    </td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {rolesMap[u.role] || u.role}
                      </span>
                    </td>
                    <td>{u.nif || <span className="muted-text">---</span>}</td>
                    <td className="actions-cell">
                      {(isKeyUser || u.id === currentUser.id) && (
                        <button className="btn-table-edit" onClick={() => handleOpenEdit(u)}>
                          ✏️ Editar
                        </button>
                      )}
                      
                      {isKeyUser && u.id !== currentUser.id && (
                        <button 
                          className="btn-table-delete" 
                          onClick={() => handleDelete(u.id, u.full_name)}
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content user-modal animate-scale-in">
            <div className="modal-header">
              <h3>{editingUser ? 'Editar Utilizador' : 'Novo Utilizador'}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <form onSubmit={handleSubmit} className="user-form">
              {formError && <div className="error-banner">{formError}</div>}
              
              <div className="form-group">
                <label>Nome Completo</label>
                <input 
                  type="text"
                  className="input-field"
                  required
                  value={formData.full_name}
                  onChange={e => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Username</label>
                  <input 
                    type="text"
                    className="input-field"
                    required
                    disabled={!!editingUser}
                    value={formData.username}
                    onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Palavra-passe {editingUser && '(deixe em branco para manter)'}</label>
                  <input 
                    type="password"
                    className="input-field"
                    required={!editingUser}
                    value={formData.password}
                    onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input 
                    type="email"
                    className="input-field"
                    required
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>NIF (Nº Contribuinte)</label>
                  <input 
                    type="text"
                    className="input-field"
                    value={formData.nif}
                    onChange={e => setFormData(prev => ({ ...prev, nif: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Data de Nascimento</label>
                  <input 
                    type="date"
                    className="input-field"
                    value={formData.birth_date}
                    onChange={e => setFormData(prev => ({ ...prev, birth_date: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label>Role / Permissão</label>
                  <select 
                    className="select-field"
                    value={formData.role}
                    disabled={editingUser?.role === 'key_user' && !isKeyUser}
                    onChange={e => setFormData(prev => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="technician">Perito / Técnico</option>
                    <option value="admin">Administrador / Gestor</option>
                    <option value="both">Ambos (Admin + Técnico)</option>
                    {isKeyUser && <option value="key_user">Key User</option>}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Morada Completa</label>
                <input 
                  type="text"
                  className="input-field"
                  value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-gold" disabled={saving}>
                  {saving ? 'A guardar...' : 'Guardar Utilizador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
