PRAGMA foreign_keys = ON;

-- ========================
-- User Profiles
-- ========================

CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT '',
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    weight REAL,
    height REAL,
    age INTEGER,
    gender TEXT,
    protein_goal REAL DEFAULT 0,
    carb_goal REAL DEFAULT 0,
    fat_goal REAL DEFAULT 0,
    caloric_goal REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ========================
-- Activities (weekly calendar)
-- ========================

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
    activity_type TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    workout_id INTEGER REFERENCES workouts(id) ON DELETE SET NULL
);

-- ========================
-- Workouts
-- ========================

CREATE TABLE IF NOT EXISTS workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
    workout_type TEXT NOT NULL CHECK(workout_type IN ('fixed', 'additional')),
    week_date TEXT NOT NULL
);

-- ========================
-- Exercises
-- ========================

CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_name TEXT NOT NULL,
    muscle_group TEXT NOT NULL
);

-- ========================
-- Sets (1:N com Exercises)
-- ========================

CREATE TABLE IF NOT EXISTS exercise_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    weight_kg REAL DEFAULT 0,
    repetitions INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1
);

-- ========================
-- Meals
-- ========================

CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    meal_label TEXT NOT NULL,
    food_description TEXT NOT NULL,
    calories REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    fiber REAL DEFAULT 0,
    ai_raw_response TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ========================
-- Fixed Foods (reusable)
-- ========================

CREATE TABLE IF NOT EXISTS fixed_foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    calories REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    protein REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    fiber REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    UNIQUE(user_id, name)
);

-- ========================
-- Muscle Group Goals
-- ========================

CREATE TABLE IF NOT EXISTS muscle_group_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    muscle_group TEXT NOT NULL,
    target_valid_sets INTEGER DEFAULT 16,
    UNIQUE(user_id, muscle_group)
);

-- ========================
-- Fichas de Treino (prescricao do gestor)
-- ========================

CREATE TABLE IF NOT EXISTS fichas_treino (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    nome_ficha TEXT NOT NULL,
    data_criacao TEXT DEFAULT (datetime('now')),
    ativa INTEGER DEFAULT 1
);

-- ========================
-- Prescricao de Exercicios (o que o gestor monta)
-- ========================

CREATE TABLE IF NOT EXISTS prescricao_exercicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_ficha INTEGER NOT NULL REFERENCES fichas_treino(id) ON DELETE CASCADE,
    id_exercicio INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
    nome_exercicio TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    dia_semana INTEGER NOT NULL CHECK(dia_semana >= 0 AND dia_semana <= 6),
    series INTEGER NOT NULL DEFAULT 3,
    reps TEXT NOT NULL DEFAULT '10',
    descanso_segundos INTEGER DEFAULT 90,
    carga_sugerida REAL DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ========================
-- Sessoes Realizadas (cliente inicia treino)
-- ========================

CREATE TABLE IF NOT EXISTS sessoes_realizadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    id_ficha INTEGER REFERENCES fichas_treino(id) ON DELETE SET NULL,
    data_hora_inicio TEXT DEFAULT (datetime('now')),
    data_hora_fim TEXT,
    dia_semana INTEGER CHECK(dia_semana >= 0 AND dia_semana <= 6),
    concluida INTEGER DEFAULT 0
);

-- ========================
-- Series Realizadas (o que o aluno executa)
-- ========================

CREATE TABLE IF NOT EXISTS series_realizadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_sessao INTEGER NOT NULL REFERENCES sessoes_realizadas(id) ON DELETE CASCADE,
    id_prescricao INTEGER REFERENCES prescricao_exercicios(id) ON DELETE SET NULL,
    num_serie INTEGER NOT NULL,
    carga_kg REAL DEFAULT 0,
    reps_feitas INTEGER DEFAULT 0,
    descanso_previsto_seg INTEGER DEFAULT 90,
    registrado_em TEXT DEFAULT (datetime('now'))
);

-- ========================
-- Indexes
-- ========================

CREATE INDEX IF NOT EXISTS idx_activities_user_day ON activities(user_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_workouts_user_week ON workouts(user_id, week_date);
CREATE INDEX IF NOT EXISTS idx_exercises_workout ON exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_sets_exercise ON exercise_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_fixed_foods_user ON fixed_foods(user_id);
CREATE INDEX IF NOT EXISTS idx_muscle_group_goals_user ON muscle_group_goals(user_id, muscle_group);
CREATE INDEX IF NOT EXISTS idx_fichas_cliente ON fichas_treino(id_cliente);
CREATE INDEX IF NOT EXISTS idx_prescricao_ficha ON prescricao_exercicios(id_ficha);
CREATE INDEX IF NOT EXISTS idx_prescricao_dia ON prescricao_exercicios(id_ficha, dia_semana);
CREATE INDEX IF NOT EXISTS idx_sessoes_cliente ON sessoes_realizadas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_sessoes_ficha ON sessoes_realizadas(id_ficha);
CREATE INDEX IF NOT EXISTS idx_series_sessao ON series_realizadas(id_sessao);
CREATE INDEX IF NOT EXISTS idx_series_prescricao ON series_realizadas(id_prescricao);

-- ========================
-- Default Data
-- ========================

INSERT OR IGNORE INTO user_profiles (id, name, first_name, last_name, email, role) VALUES (1, 'Rony', 'Rony', '', 'ronaldylc3@gmail.com', 'admin');

INSERT OR IGNORE INTO activities (user_id, day_of_week, activity_type, duration_minutes, is_default) VALUES
(1, 0, 'Lower (foco pesado em pernas)', 60, 1),
(1, 1, 'Upper + Boxe', 60, 1),
(1, 2, 'Corrida (Tiros/Intervalos)', 45, 1),
(1, 2, 'Boxe', 60, 1),
(1, 3, 'Upper (foco bracos)', 60, 1),
(1, 4, 'Corrida regenerativa', 40, 1),
(1, 5, 'Dia OFF (Descanso)', 0, 1),
(1, 6, 'Longao (Corrida)', 75, 1);

INSERT OR IGNORE INTO muscle_group_goals (user_id, muscle_group, target_valid_sets) VALUES
(1, 'Peito', 16),
(1, 'Ombro', 16),
(1, 'Biceps', 16),
(1, 'Triceps', 16),
(1, 'Costa (Latissimo do dorso)', 16),
(1, 'Costas (Trapezio ascendente)', 16),
(1, 'Abdomen', 16),
(1, 'Quadriceps', 16),
(1, 'Posterior de Perna', 16),
(1, 'Panturrilha', 16);
