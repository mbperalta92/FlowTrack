import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('token') || null;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      }
      // Refresh current user data from database to ensure fresh roles
      api.get('/auth/me')
        .then(res => {
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem('user', JSON.stringify(res.user));
          }
        })
        .catch(() => {});
    }
  }, [token]);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { username, password });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  const isMauricioPeralta = user?.username === 'Peralta.Mauricio' || user?.full_name?.toLowerCase().includes('mauricio peralta');
  const isKeyUser = user?.role === 'key_user' || isMauricioPeralta;
  const isAdmin = user?.role === 'admin' || user?.role === 'key_user' || user?.role === 'both' || isMauricioPeralta;
  const isTechnician = user?.role === 'technician' || user?.role === 'both' || user?.role === 'key_user' || isMauricioPeralta;

  const value = {
    user,
    token,
    loading,
    isAdmin,
    isKeyUser,
    isTechnician,
    isAuthenticated: !!token,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

export default AuthContext;
