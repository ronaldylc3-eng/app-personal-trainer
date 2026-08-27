import { Router, Request, Response } from 'express';
import {
  getMeals,
  deleteMeal,
  getFixedFoods,
  createFixedFood,
  updateFixedFood,
  deleteFixedFood,
  getDailyMacros,
} from '../db/database.js';

const router = Router();

router.get('/api/diet/:userId/meals', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const date = req.query.date as string | undefined;
    if (!date) {
      return res.status(400).json({ error: 'Missing required query parameter: date' });
    }

    const meals = getMeals(userId, date);
    return res.json(meals);
  } catch (err) {
    console.error('GET /api/diet/:userId/meals error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/diet/meals/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid meal id' });
    }

    const deleted = deleteMeal(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/diet/meals/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/diet/:userId/fixed-foods', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const foods = getFixedFoods(userId);
    return res.json(foods);
  } catch (err) {
    console.error('GET /api/diet/:userId/fixed-foods error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/diet/:userId/fixed-foods', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const { name, calories, carbs, protein, fat, fiber } = req.body;

    if (!name || calories === undefined || carbs === undefined || protein === undefined || fat === undefined || fiber === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name, calories, carbs, protein, fat, fiber',
      });
    }

    const food = createFixedFood(userId, { name, calories, carbs, protein, fat, fiber });
    return res.status(201).json(food);
  } catch (err) {
    console.error('POST /api/diet/:userId/fixed-foods error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/diet/fixed-foods/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid fixed food id' });
    }

    const { name, calories, carbs, protein, fat, fiber } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (calories !== undefined) data.calories = calories;
    if (carbs !== undefined) data.carbs = carbs;
    if (protein !== undefined) data.protein = protein;
    if (fat !== undefined) data.fat = fat;
    if (fiber !== undefined) data.fiber = fiber;

    const food = updateFixedFood(id, data);
    if (!food) {
      return res.status(404).json({ error: 'Fixed food not found' });
    }

    return res.json(food);
  } catch (err) {
    console.error('PUT /api/diet/fixed-foods/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/diet/fixed-foods/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid fixed food id' });
    }

    const deleted = deleteFixedFood(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Fixed food not found' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/diet/fixed-foods/:id error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/diet/:userId/daily-macros', (req: Request, res: Response) => {
  try {
    const userId = Number(req.params.userId);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const date = req.query.date as string | undefined;
    if (!date) {
      return res.status(400).json({ error: 'Missing required query parameter: date' });
    }

    const macros = getDailyMacros(userId, date);
    return res.json(macros);
  } catch (err) {
    console.error('GET /api/diet/:userId/daily-macros error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
