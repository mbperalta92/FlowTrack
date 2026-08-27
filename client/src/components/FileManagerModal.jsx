import { useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import './FileManagerModal.css';

export default function FileManagerModal({ processId, processDisplayId, attachments, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [exporting, setExporting] = useState(false);

  // Filter valid attachments (with filename)
  const validAttachments = attachments || [];

  function toggleSelect(id) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === validAttachments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(validAttachments.map(a => a.id));
    }
  }

  async function handleExport() {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um ficheiro para exportar.');
      return;
    }

    setExporting(true);
    const loadingToast = toast.loading('A preparar o ficheiro ZIP...');

    try {
      const idsParam = selectedIds.join(',');
      const res = await api.get(`/processes/${processId}/export-attachments?files=${idsParam}`, {
        responseType: 'blob' // Important to handle the binary stream correctly
      });
      
      const blob = new Blob([res], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${processDisplayId}-anexos.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Ficheiros exportados com sucesso!', { id: loadingToast });
      onClose(); // Optional: close the modal after success
    } catch (err) {
      toast.error('Erro ao exportar ficheiros. Tente novamente.', { id: loadingToast });
      console.error(err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="file-manager-modal animate-slide-up">
        <div className="file-manager-header">
          <h2>Ficheiros Anexados: {processDisplayId}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="file-manager-controls">
          <button type="button" className="btn btn-outline" onClick={toggleSelectAll}>
            {selectedIds.length === validAttachments.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
          </button>
          <span>{selectedIds.length} ficheiro(s) selecionado(s)</span>
        </div>

        <div className="file-grid">
          {validAttachments.length === 0 ? (
            <p className="no-files">Nenhum ficheiro encontrado neste processo.</p>
          ) : (
            validAttachments.map(att => {
              const isImg = att.mime_type?.startsWith('image/');
              const fileUrl = `/uploads/attachments/${att.filename}`;
              const isSelected = selectedIds.includes(att.id);

              return (
                <div 
                  key={att.id} 
                  className={`file-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleSelect(att.id)}
                >
                  <div className="file-card-preview">
                    {isImg ? (
                      <img src={fileUrl} alt={att.original_name} />
                    ) : (
                      <div className="doc-icon">📁</div>
                    )}
                    <div className="checkbox-overlay">
                      <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={() => {}} // Controlled by onClick on parent
                      />
                    </div>
                  </div>
                  <div className="file-card-info">
                    <span className="file-name" title={att.original_name}>
                      {att.original_name}
                    </span>
                    <span className="file-size">
                      {(att.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="file-manager-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button 
            className="btn btn-gold" 
            onClick={handleExport}
            disabled={exporting || selectedIds.length === 0}
          >
            {exporting ? 'A Exportar...' : 'Transferir ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
