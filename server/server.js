import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Database initialization (must be imported before routes)
import { initializeDatabase } from './database/init.js';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import processRoutes from './routes/processes.js';
import historyRoutes from './routes/history.js';
import notificationRoutes from './routes/notifications.js';
import eventRoutes from './routes/events.js';
import analyticsRoutes from './routes/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static serving of uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Initialize Database ──────────────────────────────────────
initializeDatabase();

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/processes', historyRoutes);       // /api/processes/:id/history
app.use('/api/notifications', notificationRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/analytics', analyticsRoutes);

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'FlowTrack API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ─── 404 Handler ──────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Ficheiro demasiado grande.' });
  }
  if (err.message && err.message.includes('Apenas ficheiros')) {
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 FlowTrack API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
});
