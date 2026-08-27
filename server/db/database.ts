import initSqlJs from 'sql.js';
type SqlJsDatabase = any;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import type {
  UserProfile, Activity, Workout, Exercise, ExerciseSet, ExerciseWithSets,
  Meal, FixedFood, MuscleGroupGoal,
  CreateUserProfile, CreateWorkout, UpdateWorkout,
  CreateExercise, UpdateExercise, CreateExerciseSet, UpdateExerciseSet,
  CreateMeal, CreateFixedFood, UpdateFixedFood,
  ValidSetsProgress, DailyMacros, WeeklyTonageResult,
  FichaTreino, PrescricaoExercicio, SessaoRealizada, SerieRealizada,
  CreateFichaTreino, CreatePrescricaoExercicio, UpdatePrescricaoExercicio,
  CreateSessaoRealizada, CreateSerieRealizada,
  PrescricaoComExercicios, SessaoComSeries,
} from '../types/index.js';

const DB_PATH = path.join(process.cwd(), 'fitness.db');
let db: SqlJsDatabase;

function saveDb(): void {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function all<T>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const cols = stmt.getColumnNames();
  const rows: T[] = [];
  while (stmt.step()) {
    const vals = stmt.get();
    const obj: any = {};
    cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
    rows.push(obj as T);
  }
  stmt.free();
  return rows;
}

function get<T>(sql: string, params: any[] = []): T | undefined {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const cols = stmt.getColumnNames();
  if (!stmt.step()) { stmt.free(); return undefined; }
  const vals = stmt.get();
  const obj: any = {};
  cols.forEach((c: string, i: number) => { obj[c] = vals[i]; });
  stmt.free();
  return obj as T;
}

function run(sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDb();
}

function runGetId(sql: string, params: any[] = []): number {
  db.run(sql, params);
  const r = db.exec('SELECT last_insert_rowid() as id');
  const id = r.length > 0 ? r[0].values[0][0] as number : 0;
  saveDb();
  return id;
}

// ========================
// Init
// ========================

export async function initializeDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON;');

  // Schema primeiro: garante que as tabelas existam antes das migracoes/seeds
  // (banco novo nao tem user_profiles ainda)
  let schema = '';
  const schemaPaths = [
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'server/db/schema.sql'),
    path.join(__dirname, '../server/db/schema.sql'),
  ];
  for (const sp of schemaPaths) {
    if (fs.existsSync(sp)) {
      schema = fs.readFileSync(sp, 'utf-8');
      break;
    }
  }

  if (schema) {
    for (const stmt of schema.split(';').filter(s => s.trim())) {
      try { db.run(stmt); } catch (e: any) {
        if (!e.message?.includes('UNIQUE')) console.error('Schema:', e.message);
      }
    }
  }

  const migrations: string[] = [
    "ALTER TABLE user_profiles ADD COLUMN email TEXT UNIQUE",
    "ALTER TABLE user_profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin'))",
    "ALTER TABLE user_profiles ADD COLUMN first_name TEXT DEFAULT ''",
    "ALTER TABLE user_profiles ADD COLUMN last_name TEXT DEFAULT ''",
  ];
  for (const stmt of migrations) {
    try { db.run(stmt); } catch { }
  }

  try {
    db.run(`UPDATE user_profiles SET first_name = 'Ronaldy', last_name = 'Leal Corrêa' WHERE id = 1 AND (first_name IS NULL OR first_name = '')`);
    const adminEmail = process.env.ADMIN_EMAIL ?? 'ronaldylc3@gmail.com';
    db.run(`UPDATE user_profiles SET email = ?, role = 'admin' WHERE id = 1`, [adminEmail]);
    saveDb();
  } catch (e: any) {
    console.error('Seed:', e.message);
  }
}

// ========================
// Profile
// ========================

export function getUserProfile(userId: number): UserProfile | undefined {
  return get<UserProfile>('SELECT * FROM user_profiles WHERE id = ?', [userId]);
}

export function upsertUserProfile(userId: number, data: CreateUserProfile): UserProfile {
  const existing = getUserProfile(userId);
  if (existing) {
    const sets: string[] = []; const vals: any[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (sets.length) { sets.push("updated_at = datetime('now')"); vals.push(userId); run(`UPDATE user_profiles SET ${sets.join(', ')} WHERE id = ?`, vals); }
  } else {
    const cols = ['id']; const ph = ['?']; const vals: any[] = [userId];
    for (const [k, v] of Object.entries(data)) { if (v !== undefined) { cols.push(k); ph.push('?'); vals.push(v); } }
    run(`INSERT INTO user_profiles (${cols.join(',')}) VALUES (${ph.join(',')})`, vals);
  }
  return getUserProfile(userId)!;
}

// ========================
// Activities
// ========================

export function getActivities(userId: number): Activity[] {
  return all<Activity>('SELECT * FROM activities WHERE user_id = ? ORDER BY day_of_week', [userId]);
}

export function createActivity(userId: number, data: { day_of_week: number; activity_type: string; duration_minutes: number }): Activity {
  const id = runGetId('INSERT INTO activities (user_id, day_of_week, activity_type, duration_minutes, is_default) VALUES (?,?,?,?,0)', [userId, data.day_of_week, data.activity_type, data.duration_minutes]);
  return get<Activity>('SELECT * FROM activities WHERE id = ?', [id])!;
}

export function updateActivity(id: number, data: Partial<{ day_of_week: number; activity_type: string; duration_minutes: number }>): Activity | undefined {
  const existing = get<any>('SELECT id FROM activities WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE activities SET ${s.join(',')} WHERE id = ?`, v); }
  return get<Activity>('SELECT * FROM activities WHERE id = ?', [id]);
}

export function deleteActivity(id: number): boolean {
  run('DELETE FROM activities WHERE id = ?', [id]); return true;
}

// ========================
// Workouts
// ========================

export function getWorkouts(userId: number, weekDate?: string): Workout[] {
  if (weekDate) return all<Workout>('SELECT * FROM workouts WHERE user_id = ? AND week_date = ? ORDER BY day_of_week', [userId, weekDate]);
  return all<Workout>('SELECT * FROM workouts WHERE user_id = ? ORDER BY week_date DESC, day_of_week', [userId]);
}

export function createWorkout(userId: number, data: CreateWorkout): Workout {
  const id = runGetId('INSERT INTO workouts (user_id, name, day_of_week, workout_type, week_date) VALUES (?,?,?,?,?)', [userId, data.name, data.day_of_week, data.workout_type, data.week_date]);
  return get<Workout>('SELECT * FROM workouts WHERE id = ?', [id])!;
}

export function updateWorkout(id: number, data: UpdateWorkout): Workout | undefined {
  const existing = get<any>('SELECT id FROM workouts WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE workouts SET ${s.join(',')} WHERE id = ?`, v); }
  return get<Workout>('SELECT * FROM workouts WHERE id = ?', [id]);
}

export function deleteWorkout(id: number): boolean {
  run('DELETE FROM workouts WHERE id = ?', [id]); return true;
}

// ========================
// Exercises
// ========================

export function getExercises(workoutId: number): ExerciseWithSets[] {
  const exercises = all<Exercise>('SELECT * FROM exercises WHERE workout_id = ?', [workoutId]);
  return exercises.map(ex => ({
    ...ex,
    sets: all<ExerciseSet>('SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number', [ex.id]),
  }));
}

export function createExercise(workoutId: number, data: CreateExercise, sets?: CreateExerciseSet[]): ExerciseWithSets {
  const id = runGetId('INSERT INTO exercises (workout_id, exercise_name, muscle_group) VALUES (?,?,?)', [workoutId, data.exercise_name, data.muscle_group]);
  if (sets && sets.length) {
    for (let i = 0; i < sets.length; i++) {
      run('INSERT INTO exercise_sets (exercise_id, set_number, weight_kg, repetitions, is_valid) VALUES (?,?,?,?,?)',
        [id, sets[i].set_number, sets[i].weight_kg, sets[i].repetitions, sets[i].is_valid]);
    }
  }
  return { id, workout_id: workoutId, ...data, sets: all<ExerciseSet>('SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number', [id]) };
}

export function updateExercise(id: number, data: UpdateExercise): Exercise | undefined {
  const existing = get<any>('SELECT id FROM exercises WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE exercises SET ${s.join(',')} WHERE id = ?`, v); }
  return get<Exercise>('SELECT * FROM exercises WHERE id = ?', [id]);
}

export function deleteExercise(id: number): boolean {
  run('DELETE FROM exercises WHERE id = ?', [id]); return true;
}

// ========================
// Exercise Sets
// ========================

export function getSets(exerciseId: number): ExerciseSet[] {
  return all<ExerciseSet>('SELECT * FROM exercise_sets WHERE exercise_id = ? ORDER BY set_number', [exerciseId]);
}

export function createSet(exerciseId: number, data: CreateExerciseSet): ExerciseSet {
  const id = runGetId('INSERT INTO exercise_sets (exercise_id, set_number, weight_kg, repetitions, is_valid) VALUES (?,?,?,?,?)',
    [exerciseId, data.set_number, data.weight_kg, data.repetitions, data.is_valid]);
  return get<ExerciseSet>('SELECT * FROM exercise_sets WHERE id = ?', [id])!;
}

export function updateSet(id: number, data: UpdateExerciseSet): ExerciseSet | undefined {
  const existing = get<any>('SELECT id FROM exercise_sets WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE exercise_sets SET ${s.join(',')} WHERE id = ?`, v); }
  return get<ExerciseSet>('SELECT * FROM exercise_sets WHERE id = ?', [id]);
}

export function deleteSet(id: number): boolean {
  run('DELETE FROM exercise_sets WHERE id = ?', [id]); return true;
}

export function replaceSets(exerciseId: number, sets: CreateExerciseSet[]): void {
  run('DELETE FROM exercise_sets WHERE exercise_id = ?', [exerciseId]);
  for (const s of sets) {
    run('INSERT INTO exercise_sets (exercise_id, set_number, weight_kg, repetitions, is_valid) VALUES (?,?,?,?,?)',
      [exerciseId, s.set_number, s.weight_kg, s.repetitions, s.is_valid]);
  }
}

// ========================
// Meals
// ========================

export function getMeals(userId: number, date: string): Meal[] {
  return all<Meal>('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY created_at', [userId, date]);
}

export function createMeal(userId: number, data: CreateMeal): Meal {
  const id = runGetId('INSERT INTO meals (user_id, date, meal_label, food_description, calories, carbs, protein, fat, fiber, ai_raw_response) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [userId, data.date, data.meal_label, data.food_description, data.calories, data.carbs, data.protein, data.fat, data.fiber, data.ai_raw_response ?? null]);
  return get<Meal>('SELECT * FROM meals WHERE id = ?', [id])!;
}

export function deleteMeal(id: number): boolean {
  run('DELETE FROM meals WHERE id = ?', [id]); return true;
}

// ========================
// Fixed Foods
// ========================

export function getFixedFoods(userId: number): FixedFood[] {
  return all<FixedFood>('SELECT * FROM fixed_foods WHERE user_id = ? AND is_active = 1 ORDER BY name', [userId]);
}

export function createFixedFood(userId: number, data: CreateFixedFood): FixedFood {
  const id = runGetId('INSERT INTO fixed_foods (user_id, name, calories, carbs, protein, fat, fiber) VALUES (?,?,?,?,?,?,?)',
    [userId, data.name, data.calories, data.carbs, data.protein, data.fat, data.fiber]);
  return get<FixedFood>('SELECT * FROM fixed_foods WHERE id = ?', [id])!;
}

export function updateFixedFood(id: number, data: UpdateFixedFood): FixedFood | undefined {
  const existing = get<any>('SELECT id FROM fixed_foods WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE fixed_foods SET ${s.join(',')} WHERE id = ?`, v); }
  return get<FixedFood>('SELECT * FROM fixed_foods WHERE id = ?', [id]);
}

export function deleteFixedFood(id: number): boolean {
  run('DELETE FROM fixed_foods WHERE id = ?', [id]); return true;
}

// ========================
// Muscle Group Goals
// ========================

export function getMuscleGroupGoals(userId: number): MuscleGroupGoal[] {
  return all<MuscleGroupGoal>('SELECT * FROM muscle_group_goals WHERE user_id = ?', [userId]);
}

export function updateMuscleGroupGoal(userId: number, muscleGroup: string, targetSets: number): MuscleGroupGoal {
  const existing = get<any>('SELECT id FROM muscle_group_goals WHERE user_id = ? AND muscle_group = ?', [userId, muscleGroup]);
  if (existing) {
    run('UPDATE muscle_group_goals SET target_valid_sets = ? WHERE user_id = ? AND muscle_group = ?', [targetSets, userId, muscleGroup]);
  } else {
    run('INSERT INTO muscle_group_goals (user_id, muscle_group, target_valid_sets) VALUES (?,?,?)', [userId, muscleGroup, targetSets]);
  }
  return get<MuscleGroupGoal>('SELECT * FROM muscle_group_goals WHERE user_id = ? AND muscle_group = ?', [userId, muscleGroup])!;
}

// ========================
// Progress & Analytics
// ========================

export function getValidSetsProgress(userId: number, weekDate: string): ValidSetsProgress[] {
  return all<ValidSetsProgress>(
    `SELECT ex.muscle_group, SUM(es.is_valid) AS total_valid_sets
     FROM exercise_sets es
     JOIN exercises ex ON es.exercise_id = ex.id
     JOIN workouts w ON ex.workout_id = w.id
     WHERE w.user_id = ? AND w.week_date = ?
     GROUP BY ex.muscle_group`,
    [userId, weekDate]
  );
}

export function getDailyMacros(userId: number, date: string): DailyMacros {
  return get<DailyMacros>(
    `SELECT COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(carbs),0) AS carbs,
            COALESCE(SUM(protein),0) AS protein, COALESCE(SUM(fat),0) AS fat,
            COALESCE(SUM(fiber),0) AS fiber
     FROM meals WHERE user_id = ? AND date = ?`,
    [userId, date]
  ) || { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
}

export function getWeeklyTonage(userId: number, weekDate: string): WeeklyTonageResult {
  const exercises = all<WeeklyTonageResult['exercises'][0]>(
    `SELECT ex.exercise_name, ex.muscle_group,
            SUM(es.weight_kg * es.repetitions) AS tonnage
     FROM exercise_sets es
     JOIN exercises ex ON es.exercise_id = ex.id
     JOIN workouts w ON ex.workout_id = w.id
     WHERE w.user_id = ? AND w.week_date = ? AND es.is_valid = 1
     GROUP BY ex.id, ex.exercise_name, ex.muscle_group
     ORDER BY tonnage DESC`,
    [userId, weekDate]
  );
  const total = get<{ t: number }>(
    `SELECT COALESCE(SUM(es.weight_kg * es.repetitions), 0) AS t
     FROM exercise_sets es
     JOIN exercises ex ON es.exercise_id = ex.id
     JOIN workouts w ON ex.workout_id = w.id
     WHERE w.user_id = ? AND w.week_date = ? AND es.is_valid = 1`,
    [userId, weekDate]
  );
  return { exercises, total_tonnage: total?.t || 0 };
}

// ========================
// Clients (admin view)
// ========================

export function getAllClients(): UserProfile[] {
  return all<UserProfile>('SELECT * FROM user_profiles WHERE role = ? ORDER BY name', ['user']);
}

export function searchClients(query: string): UserProfile[] {
  const q = `%${query}%`;
  return all<UserProfile>(
    'SELECT * FROM user_profiles WHERE role = ? AND (name LIKE ? OR email LIKE ?) ORDER BY name',
    ['user', q, q]
  );
}

// ========================
// Fichas de Treino
// ========================

export function getFichasByCliente(clienteId: number): FichaTreino[] {
  return all<FichaTreino>('SELECT * FROM fichas_treino WHERE id_cliente = ? ORDER BY data_criacao DESC', [clienteId]);
}

export function getFichaAtiva(clienteId: number): FichaTreino | undefined {
  return get<FichaTreino>('SELECT * FROM fichas_treino WHERE id_cliente = ? AND ativa = 1 ORDER BY data_criacao DESC LIMIT 1', [clienteId]);
}

export function createFicha(data: CreateFichaTreino): FichaTreino {
  run('UPDATE fichas_treino SET ativa = 0 WHERE id_cliente = ?', [data.id_cliente]);
  const id = runGetId('INSERT INTO fichas_treino (id_cliente, nome_ficha) VALUES (?,?)', [data.id_cliente, data.nome_ficha]);
  return get<FichaTreino>('SELECT * FROM fichas_treino WHERE id = ?', [id])!;
}

export function updateFicha(id: number, data: Partial<{ nome_ficha: string; ativa: number }>): FichaTreino | undefined {
  const existing = get<any>('SELECT id FROM fichas_treino WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE fichas_treino SET ${s.join(', ')} WHERE id = ?`, v); }
  return get<FichaTreino>('SELECT * FROM fichas_treino WHERE id = ?', [id]);
}

export function deleteFicha(id: number): boolean {
  run('DELETE FROM fichas_treino WHERE id = ?', [id]); return true;
}

// ========================
// Prescricao de Exercicios
// ========================

export function getPrescricoesByFicha(fichaId: number): PrescricaoExercicio[] {
  return all<PrescricaoExercicio>(
    'SELECT * FROM prescricao_exercicios WHERE id_ficha = ? ORDER BY dia_semana, ordem',
    [fichaId]
  );
}

export function getPrescricoesByFichaAndDia(fichaId: number, diaSemana: number): PrescricaoExercicio[] {
  return all<PrescricaoExercicio>(
    'SELECT * FROM prescricao_exercicios WHERE id_ficha = ? AND dia_semana = ? ORDER BY ordem',
    [fichaId, diaSemana]
  );
}

export function createPrescricao(data: CreatePrescricaoExercicio & { id_ficha: number }): PrescricaoExercicio {
  const id = runGetId(
    'INSERT INTO prescricao_exercicios (id_ficha, id_exercicio, nome_exercicio, muscle_group, dia_semana, series, reps, descanso_segundos, carga_sugerida, ordem) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [data.id_ficha, data.id_exercicio ?? null, data.nome_exercicio, data.muscle_group, data.dia_semana, data.series, data.reps, data.descanso_segundos, data.carga_sugerida, data.ordem]
  );
  return get<PrescricaoExercicio>('SELECT * FROM prescricao_exercicios WHERE id = ?', [id])!;
}

export function updatePrescricao(id: number, data: UpdatePrescricaoExercicio): PrescricaoExercicio | undefined {
  const existing = get<any>('SELECT id FROM prescricao_exercicios WHERE id = ?', [id]);
  if (!existing) return undefined;
  const s: string[] = []; const v: any[] = [];
  for (const [k, val] of Object.entries(data)) { if (val !== undefined) { s.push(`${k} = ?`); v.push(val); } }
  if (s.length) { v.push(id); run(`UPDATE prescricao_exercicios SET ${s.join(', ')} WHERE id = ?`, v); }
  return get<PrescricaoExercicio>('SELECT * FROM prescricao_exercicios WHERE id = ?', [id]);
}

export function deletePrescricao(id: number): boolean {
  run('DELETE FROM prescricao_exercicios WHERE id = ?', [id]); return true;
}

// ========================
// Sessoes Realizadas
// ========================

export function createSessao(data: CreateSessaoRealizada): SessaoRealizada {
  const id = runGetId(
    'INSERT INTO sessoes_realizadas (id_cliente, id_ficha, dia_semana) VALUES (?,?,?)',
    [data.id_cliente, data.id_ficha ?? null, data.dia_semana ?? null]
  );
  return get<SessaoRealizada>('SELECT * FROM sessoes_realizadas WHERE id = ?', [id])!;
}

export function getSessaoAtiva(clienteId: number): SessaoRealizada | undefined {
  return get<SessaoRealizada>(
    'SELECT * FROM sessoes_realizadas WHERE id_cliente = ? AND concluida = 0 ORDER BY data_hora_inicio DESC LIMIT 1',
    [clienteId]
  );
}

export function finalizarSessao(id: number): SessaoRealizada | undefined {
  run("UPDATE sessoes_realizadas SET concluida = 1, data_hora_fim = datetime('now') WHERE id = ?", [id]);
  return get<SessaoRealizada>('SELECT * FROM sessoes_realizadas WHERE id = ?', [id]);
}

export function getSessoesByCliente(clienteId: number, limit = 10): SessaoRealizada[] {
  return all<SessaoRealizada>(
    'SELECT * FROM sessoes_realizadas WHERE id_cliente = ? ORDER BY data_hora_inicio DESC LIMIT ?',
    [clienteId, limit]
  );
}

// ========================
// Series Realizadas
// ========================

export function createSerieRealizada(data: CreateSerieRealizada): SerieRealizada {
  const id = runGetId(
    'INSERT INTO series_realizadas (id_sessao, id_prescricao, num_serie, carga_kg, reps_feitas, descanso_previsto_seg) VALUES (?,?,?,?,?,?)',
    [data.id_sessao, data.id_prescricao ?? null, data.num_serie, data.carga_kg, data.reps_feitas, data.descanso_previsto_seg]
  );
  return get<SerieRealizada>('SELECT * FROM series_realizadas WHERE id = ?', [id])!;
}

export function getSeriesBySessao(sessaoId: number): SerieRealizada[] {
  return all<SerieRealizada>(
    'SELECT * FROM series_realizadas WHERE id_sessao = ? ORDER BY registrado_em',
    [sessaoId]
  );
}

export function getUltimasSeriesByPrescricao(idPrescricao: number): SerieRealizada[] {
  return all<SerieRealizada>(
    `SELECT sr.* FROM series_realizadas sr
     JOIN sessoes_realizadas s ON sr.id_sessao = s.id
     WHERE sr.id_prescricao = ? AND s.concluida = 1
     ORDER BY s.data_hora_inicio DESC, sr.num_serie
     LIMIT 10`,
    [idPrescricao]
  );
}

export function getProgressoPrescricoesStats(clienteId: number, weekDate?: string): { total_series: number; total_sessoes: number; media_carga: number } {
  const weekFilter = weekDate ? ` AND s.data_hora_inicio >= '${weekDate}'` : '';
  const result = get<{ total_series: number; total_sessoes: number; media_carga: number }>(
    `SELECT
       COUNT(sr.id) AS total_series,
       COUNT(DISTINCT s.id) AS total_sessoes,
       COALESCE(AVG(sr.carga_kg), 0) AS media_carga
     FROM series_realizadas sr
     JOIN sessoes_realizadas s ON sr.id_sessao = s.id
     WHERE s.id_cliente = ? AND s.concluida = 1${weekFilter}`,
    [clienteId]
  );
  return result || { total_series: 0, total_sessoes: 0, media_carga: 0 };
}

export default db;
