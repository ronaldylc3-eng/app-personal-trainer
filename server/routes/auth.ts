import { Router, Request, Response } from 'express';
import { getUserProfile, upsertUserProfile } from '../db/database.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'ronaldylc3@gmail.com';

const router = Router();

router.get('/api/auth/me/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    let profile = getUserProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.email === ADMIN_EMAIL) {
      const needsUpdate: Record<string, unknown> = {};
      if (profile.role !== 'admin') needsUpdate.role = 'admin';
      if (Object.keys(needsUpdate).length) {
        upsertUserProfile(userId, needsUpdate);
        profile = getUserProfile(userId)!;
      }
    }

    const isAdmin = profile.email === ADMIN_EMAIL || profile.role === 'admin';
    const firstName = profile.first_name || profile.name?.split(' ')[0] || '';
    const lastName = profile.last_name || profile.name?.split(' ').slice(1).join(' ') || '';

    return res.json({
      userId: profile.id,
      firstName,
      lastName,
      name: profile.name,
      email: profile.email,
      role: isAdmin ? 'admin' : (profile.role ?? 'user'),
      isAdmin,
      createdAt: profile.created_at,
    });
  } catch (err) {
    console.error('GET /api/auth/me/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/auth/admin-check/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const profile = getUserProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const isAdmin = profile.email === ADMIN_EMAIL || profile.role === 'admin';
    return res.json({ isAdmin });
  } catch (err) {
    console.error('GET /api/auth/admin-check/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
