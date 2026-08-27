import { Router, Request, Response } from 'express';
import {
  getUserProfile,
  upsertUserProfile,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getMuscleGroupGoals,
  updateMuscleGroupGoal,
} from '../db/database.js';

const router = Router();

router.get('/api/profile/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const profile = getUserProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const fiberGoal = profile.caloric_goal > 0
      ? Math.round((profile.caloric_goal / 1000) * 15)
      : 0;

    return res.json({ ...profile, fiber_goal: fiberGoal });
  } catch (err) {
    console.error('GET /api/profile/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/profile/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const { name, first_name, last_name, weight, height, age, gender, protein_goal, carb_goal, fat_goal, caloric_goal } = req.body;

    const data: Record<string, unknown> = {};
    if (first_name !== undefined && typeof first_name === 'string') data.first_name = first_name.trim();
    if (last_name !== undefined && typeof last_name === 'string') data.last_name = last_name.trim();
    if (name !== undefined && typeof name === 'string' && name.trim()) data.name = name.trim();
    if (first_name !== undefined || last_name !== undefined) {
      const fn = (first_name ?? '').trim();
      const ln = (last_name ?? '').trim();
      data.name = `${fn} ${ln}`.trim();
    }
    if (weight !== undefined) data.weight = weight;
    if (height !== undefined) data.height = height;
    if (age !== undefined) data.age = age;
    if (gender !== undefined) data.gender = gender;
    if (protein_goal !== undefined) data.protein_goal = protein_goal;
    if (carb_goal !== undefined) data.carb_goal = carb_goal;
    if (fat_goal !== undefined) data.fat_goal = fat_goal;
    if (caloric_goal !== undefined) data.caloric_goal = caloric_goal;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const profile = upsertUserProfile(userId, data);
    return res.json(profile);
  } catch (err) {
    console.error('PUT /api/profile/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/profile/:userId/activities', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const activities = getActivities(userId);
    return res.json(activities);
  } catch (err) {
    console.error('GET /api/profile/:userId/activities error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/profile/:userId/activities', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const { day_of_week, activity_type, duration_minutes } = req.body;

    if (day_of_week === undefined || activity_type === undefined || duration_minutes === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: day_of_week, activity_type, duration_minutes',
      });
    }

    const activity = createActivity(userId, { day_of_week, activity_type, duration_minutes });
    return res.status(201).json(activity);
  } catch (err) {
    console.error('POST /api/profile/:userId/activities error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/activities/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const { day_of_week, activity_type, duration_minutes } = req.body;
    const data: Record<string, unknown> = {};
    if (day_of_week !== undefined) data.day_of_week = day_of_week;
    if (activity_type !== undefined) data.activity_type = activity_type;
    if (duration_minutes !== undefined) data.duration_minutes = duration_minutes;

    const activity = updateActivity(id, data);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    return res.json(activity);
  } catch (err) {
    console.error('PUT /api/activities/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/activities/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid activity id' });
    }

    const deleted = deleteActivity(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/activities/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/profile/:userId/muscle-goals', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const goals = getMuscleGroupGoals(userId);
    return res.json(goals);
  } catch (err) {
    console.error('GET /api/profile/:userId/muscle-goals error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/profile/:userId/muscle-goals', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const { muscle_group, target_valid_sets } = req.body;

    if (!muscle_group || target_valid_sets === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: muscle_group, target_valid_sets',
      });
    }

    const goal = updateMuscleGroupGoal(userId, muscle_group, target_valid_sets);
    return res.json(goal);
  } catch (err) {
    console.error('PUT /api/profile/:userId/muscle-goals error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
