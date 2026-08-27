import { Router, Request, Response } from 'express';
import {
  getWorkouts,
  createWorkout,
  updateWorkout,
  deleteWorkout,
  getExercises,
  createExercise,
  updateExercise,
  deleteExercise,
  replaceSets,
  getValidSetsProgress,
  getWeeklyTonage,
} from '../db/database.js';

const router = Router();

router.get('/api/workouts/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const weekDate = req.query.weekDate as string | undefined;
    const workouts = getWorkouts(userId, weekDate);

    const workoutsWithExercises = workouts.map((workout) => ({
      ...workout,
      exercises: getExercises(workout.id),
    }));

    return res.json(workoutsWithExercises);
  } catch (err) {
    console.error('GET /api/workouts/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/workouts/:userId', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const { name, day_of_week, workout_type, week_date } = req.body;

    if (!name || day_of_week === undefined || !workout_type || !week_date) {
      return res.status(400).json({
        error: 'Missing required fields: name, day_of_week, workout_type, week_date',
      });
    }

    if (workout_type !== 'fixed' && workout_type !== 'additional') {
      return res.status(400).json({ error: 'workout_type must be "fixed" or "additional"' });
    }

    const workout = createWorkout(userId, { name, day_of_week, workout_type, week_date });
    return res.status(201).json(workout);
  } catch (err) {
    console.error('POST /api/workouts/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/workouts/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid workout id' });
    }

    const { name, day_of_week, workout_type, week_date } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (day_of_week !== undefined) data.day_of_week = day_of_week;
    if (workout_type !== undefined) data.workout_type = workout_type;
    if (week_date !== undefined) data.week_date = week_date;

    const workout = updateWorkout(id, data);
    if (!workout) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    return res.json(workout);
  } catch (err) {
    console.error('PUT /api/workouts/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/workouts/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid workout id' });
    }

    const deleted = deleteWorkout(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Workout not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/workouts/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/workouts/:workoutId/exercises', (req: Request, res: Response) => {
  try {
    const workoutId = Number(req.params.workoutId);
    if (isNaN(workoutId)) {
      return res.status(400).json({ error: 'Invalid workoutId' });
    }

    const { exercise_name, muscle_group, sets } = req.body;

    if (!exercise_name || !muscle_group) {
      return res.status(400).json({
        error: 'Missing required fields: exercise_name, muscle_group',
      });
    }

    if (!Array.isArray(sets) || sets.length === 0) {
      return res.status(400).json({
        error: 'sets must be a non-empty array with objects: { set_number, weight_kg, repetitions, is_valid }',
      });
    }

    const exerciseSets = sets.map((s: any) => ({
      set_number: s.set_number,
      weight_kg: s.weight_kg,
      repetitions: s.repetitions,
      is_valid: s.is_valid,
    }));

    const exercise = createExercise(workoutId, { exercise_name, muscle_group }, exerciseSets);
    return res.status(201).json(exercise);
  } catch (err) {
    console.error('POST /api/workouts/:workoutId/exercises error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/exercises/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid exercise id' });
    }

    const { exercise_name, muscle_group } = req.body;
    const data: Record<string, unknown> = {};
    if (exercise_name !== undefined) data.exercise_name = exercise_name;
    if (muscle_group !== undefined) data.muscle_group = muscle_group;

    const exercise = updateExercise(id, data);
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    return res.json(exercise);
  } catch (err) {
    console.error('PUT /api/exercises/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/exercises/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid exercise id' });
    }

    const deleted = deleteExercise(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/exercises/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/exercises/:id/sets', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid exercise id' });
    }

    const { sets } = req.body;

    if (!Array.isArray(sets)) {
      return res.status(400).json({
        error: 'sets must be an array with objects: { set_number, weight_kg, repetitions, is_valid }',
      });
    }

    const exerciseSets = sets.map((s: any) => ({
      set_number: s.set_number,
      weight_kg: s.weight_kg,
      repetitions: s.repetitions,
      is_valid: s.is_valid,
    }));

    replaceSets(id, exerciseSets);
    return res.json({ success: true, exercise_id: id, sets: exerciseSets });
  } catch (err) {
    console.error('PUT /api/exercises/:id/sets error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/workouts/:userId/progress', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const weekDate = req.query.weekDate as string | undefined;
    if (!weekDate) {
      return res.status(400).json({ error: 'Missing required query parameter: weekDate' });
    }

    const progress = getValidSetsProgress(userId, weekDate);
    return res.json(progress);
  } catch (err) {
    console.error('GET /api/workouts/:userId/progress error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/workouts/:userId/tonnage', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const weekDate = req.query.weekDate as string | undefined;
    if (!weekDate) {
      return res.status(400).json({ error: 'Missing required query parameter: weekDate' });
    }

    const tonnage = getWeeklyTonage(userId, weekDate);
    return res.json(tonnage);
  } catch (err) {
    console.error('GET /api/workouts/:userId/tonnage error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
