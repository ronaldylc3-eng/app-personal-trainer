export const MUSCLE_GROUPS = [
  'Peito',
  'Ombro',
  'Bíceps',
  'Tríceps',
  'Costa (Latíssimo do dorso)',
  'Costas (Trapézio ascendente)',
  'Abdômen',
  'Quadríceps',
  'Posterior de Perna',
  'Panturrilha',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const DAYS_OF_WEEK = [
  { index: 0, name: 'Domingo' },
  { index: 1, name: 'Segunda-feira' },
  { index: 2, name: 'Terça-feira' },
  { index: 3, name: 'Quarta-feira' },
  { index: 4, name: 'Quinta-feira' },
  { index: 5, name: 'Sexta-feira' },
  { index: 6, name: 'Sábado' },
] as const;

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  role: UserRole;
  weight: number | null;
  height: number | null;
  age: number | null;
  gender: string | null;
  protein_goal: number;
  carb_goal: number;
  fat_goal: number;
  caloric_goal: number;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: number;
  user_id: number;
  day_of_week: number;
  activity_type: string;
  duration_minutes: number;
  is_default: number;
  workout_id: number | null;
}

export interface Workout {
  id: number;
  user_id: number;
  name: string;
  day_of_week: number;
  workout_type: 'fixed' | 'additional';
  week_date: string;
}

export interface Exercise {
  id: number;
  workout_id: number;
  exercise_name: string;
  muscle_group: string;
}

export interface ExerciseSet {
  id: number;
  exercise_id: number;
  set_number: number;
  weight_kg: number;
  repetitions: number;
  is_valid: number;
}

export interface ExerciseWithSets extends Exercise {
  sets: ExerciseSet[];
}

export interface Meal {
  id: number;
  user_id: number;
  date: string;
  meal_label: string;
  food_description: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  ai_raw_response: string | null;
  created_at: string;
}

export interface FixedFood {
  id: number;
  user_id: number;
  name: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  is_active: number;
}

export interface MuscleGroupGoal {
  id: number;
  user_id: number;
  muscle_group: string;
  target_valid_sets: number;
}

export interface AIFoodResponse {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
}

export type CreateUserProfile = Partial<Pick<UserProfile, 'name' | 'first_name' | 'last_name' | 'email' | 'role' | 'weight' | 'height' | 'age' | 'gender' | 'protein_goal' | 'carb_goal' | 'fat_goal' | 'caloric_goal'>>;
export type UpdateActivity = Partial<Pick<Activity, 'day_of_week' | 'activity_type' | 'duration_minutes'>>;
export type CreateWorkout = Pick<Workout, 'name' | 'day_of_week' | 'workout_type' | 'week_date'>;
export type UpdateWorkout = Partial<CreateWorkout>;
export type CreateExercise = Pick<Exercise, 'exercise_name' | 'muscle_group'>;
export type UpdateExercise = Partial<CreateExercise>;
export type CreateExerciseSet = Pick<ExerciseSet, 'set_number' | 'weight_kg' | 'repetitions' | 'is_valid'>;
export type UpdateExerciseSet = Partial<Pick<ExerciseSet, 'weight_kg' | 'repetitions' | 'is_valid'>>;
export type CreateMeal = Pick<Meal, 'date' | 'meal_label' | 'food_description' | 'calories' | 'carbs' | 'protein' | 'fat' | 'fiber'> & { ai_raw_response?: string | null };
export type CreateFixedFood = Pick<FixedFood, 'name' | 'calories' | 'carbs' | 'protein' | 'fat' | 'fiber'>;
export type UpdateFixedFood = Partial<CreateFixedFood>;

export interface ValidSetsProgress {
  muscle_group: string;
  total_valid_sets: number;
}

export interface DailyMacros {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
}

export interface WeeklyTonageByExercise {
  exercise_name: string;
  muscle_group: string;
  tonnage: number;
}

export interface WeeklyTonageResult {
  exercises: WeeklyTonageByExercise[];
  total_tonnage: number;
}

// ========================
// Fichas de Treino (prescricao do gestor)
// ========================

export interface FichaTreino {
  id: number;
  id_cliente: number;
  nome_ficha: string;
  data_criacao: string;
  ativa: number;
}

export interface PrescricaoExercicio {
  id: number;
  id_ficha: number;
  id_exercicio: number | null;
  nome_exercicio: string;
  muscle_group: string;
  dia_semana: number;
  series: number;
  reps: string;
  descanso_segundos: number;
  carga_sugerida: number;
  ordem: number;
  created_at: string;
}

export interface SessaoRealizada {
  id: number;
  id_cliente: number;
  id_ficha: number | null;
  data_hora_inicio: string;
  data_hora_fim: string | null;
  dia_semana: number | null;
  concluida: number;
}

export interface SerieRealizada {
  id: number;
  id_sessao: number;
  id_prescricao: number | null;
  num_serie: number;
  carga_kg: number;
  reps_feitas: number;
  descanso_previsto_seg: number;
  registrado_em: string;
}

export type CreateFichaTreino = Pick<FichaTreino, 'id_cliente' | 'nome_ficha'>;
export type CreatePrescricaoExercicio = Pick<PrescricaoExercicio, 'nome_exercicio' | 'muscle_group' | 'dia_semana' | 'series' | 'reps' | 'descanso_segundos' | 'carga_sugerida' | 'ordem'> & { id_exercicio?: number | null };
export type UpdatePrescricaoExercicio = Partial<Omit<CreatePrescricaoExercicio, 'dia_semana'>>;
export type CreateSessaoRealizada = Pick<SessaoRealizada, 'id_cliente' | 'id_ficha' | 'dia_semana'>;
export type CreateSerieRealizada = Pick<SerieRealizada, 'id_sessao' | 'id_prescricao' | 'num_serie' | 'carga_kg' | 'reps_feitas' | 'descanso_previsto_seg'>;

export interface PrescricaoComExercicios extends FichaTreino {
  exercicios: PrescricaoExercicio[];
}

export interface SessaoComSeries extends SessaoRealizada {
  series: SerieRealizada[];
  exercicios_concluidos: number;
  total_exercicios: number;
}
