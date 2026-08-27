import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeDatabase } from './db/database';
import profileRoutes from './routes/profile';
import workoutRoutes from './routes/workouts';
import dietRoutes from './routes/diet';
import aiRoutes from './routes/ai';
import authRoutes from './routes/auth';
import fichasRoutes from './routes/fichas';

const PORT = 3000;

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

async function start() {
  try {
    const app = express();

    app.use(cors());
    app.use(express.json());

    // API routes FIRST
    app.use(authRoutes);
    app.use(profileRoutes);
    app.use(workoutRoutes);
    app.use(dietRoutes);
    app.use(aiRoutes);
    app.use(fichasRoutes);

    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    await initializeDatabase();
    console.log('Database initialized successfully');

    // Vite middleware in dev or static files in production
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true, host: '0.0.0.0' },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Fitness App running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

