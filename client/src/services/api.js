const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('token');

  const headers = {
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, config);

  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro de servidor' }));
    throw new Error(errorData.error || errorData.message || `Erro ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  if (options.responseType === 'blob') {
    return response.blob();
  }

  return response.json();
}

const api = {
  get(endpoint, options = {}) {
    return request(endpoint, { method: 'GET', ...options });
  },

  post(endpoint, data) {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  put(endpoint, data) {
    return request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  patch(endpoint, data) {
    return request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(endpoint) {
    return request(endpoint, { method: 'DELETE' });
  },

  upload(endpoint, formData) {
    return request(endpoint, {
      method: 'POST',
      body: formData,
    });
  },
};

export default api;
