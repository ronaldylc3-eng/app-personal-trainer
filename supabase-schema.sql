-- =============================================================
-- FITNESS APP - SUPABASE SCHEMA (v2) - CORRIGIDO
-- =============================================================
-- ATENCAO: este arquivo esta desatualizado como referencia unica.
-- As tabelas usadas pelo app (fichas, treinos_ficha,
-- exercicios_treino, logs_treino, logs_execucao etc.) sao criadas
-- pelas migracoes em supabase/migrations/ (001..015). Execute-as
-- no SQL Editor do Supabase Dashboard em ordem numerica.
-- =============================================================

-- =============================================================
-- 0. EXTENSOES
-- =============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- 1. USUARIOS (perfis vinculados ao Supabase Auth)
-- =============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT DEFAULT '',
  cpf TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo')),
  role TEXT NOT NULL DEFAULT 'aluno' CHECK (role IN ('gestor', 'aluno')),
  pacote TEXT DEFAULT 'treino' CHECK (pacote IN ('treino', 'completo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 2. EXERCICIOS (catalogo de exercicios disponiveis)
-- =============================================================

CREATE TABLE IF NOT EXISTS exercicios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  video_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 3. FICHAS DE TREINO (prescricao do gestor)
-- =============================================================

CREATE TABLE IF NOT EXISTS fichas_treino (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome_ficha TEXT NOT NULL,
  data_criacao TIMESTAMPTZ DEFAULT now(),
  ativa BOOLEAN DEFAULT true
);

-- =============================================================
-- 4. PRESCRICAO DE EXERCICIOS (um exercicio dentro da ficha)
-- =============================================================

CREATE TABLE IF NOT EXISTS prescricao_exercicios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_ficha UUID NOT NULL REFERENCES fichas_treino(id) ON DELETE CASCADE,
  id_exercicio UUID NOT NULL REFERENCES exercicios(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 5. PRESCRICAO DE SERIES (carga proposta e reps alvo por serie)
-- =============================================================

CREATE TABLE IF NOT EXISTS prescricao_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_prescricao UUID NOT NULL REFERENCES prescricao_exercicios(id) ON DELETE CASCADE,
  num_serie INTEGER NOT NULL,
  reps_alvo INTEGER NOT NULL DEFAULT 10,
  carga_proposta_kg REAL NOT NULL DEFAULT 0,
  descanso_segundos INTEGER NOT NULL DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(id_prescricao, num_serie)
);

-- =============================================================
-- 6. SESSOES REALIZADAS (cliente inicia um treino)
-- =============================================================

CREATE TABLE IF NOT EXISTS sessoes_realizadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id_ficha UUID REFERENCES fichas_treino(id) ON DELETE SET NULL,
  dia_semana INTEGER CHECK (dia_semana >= 0 AND dia_semana <= 6),
  data_hora_inicio TIMESTAMPTZ DEFAULT now(),
  data_hora_fim TIMESTAMPTZ,
  concluida BOOLEAN DEFAULT false
);

-- =============================================================
-- 7. SERIES REALIZADAS (execucao real do aluno no app)
-- =============================================================

CREATE TABLE IF NOT EXISTS series_realizadas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_sessao UUID NOT NULL REFERENCES sessoes_realizadas(id) ON DELETE CASCADE,
  id_prescricao UUID REFERENCES prescricao_exercicios(id) ON DELETE SET NULL,
  id_serie_prevista UUID REFERENCES prescricao_series(id) ON DELETE SET NULL,
  num_serie INTEGER NOT NULL,
  carga_real_kg REAL DEFAULT 0,
  reps_reais INTEGER DEFAULT 0,
  registrado_em TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 8. MUSCLE GROUP GOALS (metas de series validas por grupo)
-- =============================================================

CREATE TABLE IF NOT EXISTS muscle_group_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  muscle_group TEXT NOT NULL,
  target_valid_sets INTEGER DEFAULT 16,
  UNIQUE(user_id, muscle_group)
);

-- =============================================================
-- 9. ATIVIDADES SEMANAIS (calendario de rotina)
-- =============================================================

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  activity_type TEXT NOT NULL,
  duration_minutes INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false
);

-- =============================================================
-- 10. REFEICOES (analise IA de alimentos)
-- =============================================================

CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal_label TEXT NOT NULL,
  food_description TEXT NOT NULL,
  calories REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  protein REAL DEFAULT 0,
  fat REAL DEFAULT 0,
  fiber REAL DEFAULT 0,
  ai_raw_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- 11. ALIMENTOS FIXOS (reutilizaveis)
-- =============================================================

CREATE TABLE IF NOT EXISTS fixed_foods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  calories REAL DEFAULT 0,
  carbs REAL DEFAULT 0,
  protein REAL DEFAULT 0,
  fat REAL DEFAULT 0,
  fiber REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, name)
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_id ON usuarios(auth_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);
CREATE INDEX IF NOT EXISTS idx_usuarios_role ON usuarios(role);
CREATE INDEX IF NOT EXISTS idx_fichas_cliente ON fichas_treino(id_cliente);
CREATE INDEX IF NOT EXISTS idx_fichas_ativa ON fichas_treino(id_cliente, ativa);
CREATE INDEX IF NOT EXISTS idx_prescricao_ficha ON prescricao_exercicios(id_ficha);
CREATE INDEX IF NOT EXISTS idx_prescricao_dia ON prescricao_exercicios(id_ficha, dia_semana);
CREATE INDEX IF NOT EXISTS idx_prescricao_exercicio ON prescricao_exercicios(id_exercicio);
CREATE INDEX IF NOT EXISTS idx_prescricao_series_presc ON prescricao_series(id_prescricao);
CREATE INDEX IF NOT EXISTS idx_sessoes_cliente ON sessoes_realizadas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_sessoes_ficha ON sessoes_realizadas(id_ficha);
CREATE INDEX IF NOT EXISTS idx_series_sessao ON series_realizadas(id_sessao);
CREATE INDEX IF NOT EXISTS idx_series_prescricao ON series_realizadas(id_prescricao);
CREATE INDEX IF NOT EXISTS idx_series_prevista ON series_realizadas(id_serie_prevista);
CREATE INDEX IF NOT EXISTS idx_exercicios_muscle ON exercicios(muscle_group);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);
CREATE INDEX IF NOT EXISTS idx_activities_user_day ON activities(user_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_muscle_goals_user ON muscle_group_goals(user_id, muscle_group);

-- =============================================================
-- RLS (Row Level Security) - HABILITAR EM PRODUCAO
-- =============================================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_treino ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescricao_exercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescricao_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_realizadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_realizadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscle_group_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_foods ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- POLITICAS RLS COM TRAVAS DE SEGURANÇA (DROP IF EXISTS)
-- =============================================================

-- -------------------------------------------------------
-- USUARIOS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor ve todos usuarios" ON usuarios;
CREATE POLICY "Gestor ve todos usuarios" ON usuarios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprio perfil" ON usuarios;
CREATE POLICY "Aluno ve proprio perfil" ON usuarios
  FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Aluno atualiza proprio perfil" ON usuarios;
CREATE POLICY "Aluno atualiza proprio perfil" ON usuarios
  FOR UPDATE USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- -------------------------------------------------------
-- EXERCICIOS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia exercicios" ON exercicios;
CREATE POLICY "Gestor gerencia exercicios" ON exercicios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Todos leem exercicios" ON exercicios;
CREATE POLICY "Todos leem exercicios" ON exercicios
  FOR SELECT USING (true);

-- -------------------------------------------------------
-- FICHAS DE TREINO
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor ve todas fichas" ON fichas_treino;
CREATE POLICY "Gestor ve todas fichas" ON fichas_treino
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprias fichas" ON fichas_treino;
CREATE POLICY "Aluno ve proprias fichas" ON fichas_treino
  FOR SELECT USING (
    id_cliente IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- -------------------------------------------------------
-- PRESCRICAO DE EXERCICIOS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia prescricoes" ON prescricao_exercicios;
CREATE POLICY "Gestor gerencia prescricoes" ON prescricao_exercicios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve prescricoes proprias fichas" ON prescricao_exercicios;
CREATE POLICY "Aluno ve prescricoes proprias fichas" ON prescricao_exercicios
  FOR SELECT USING (
    id_ficha IN (
      SELECT ft.id FROM fichas_treino ft
      JOIN usuarios u ON ft.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- PRESCRICAO DE SERIES
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia series prescritas" ON prescricao_series;
CREATE POLICY "Gestor gerencia series prescritas" ON prescricao_series
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve series proprias prescricoes" ON prescricao_series;
CREATE POLICY "Aluno ve series proprias prescricoes" ON prescricao_series
  FOR SELECT USING (
    id_prescricao IN (
      SELECT pe.id FROM prescricao_exercicios pe
      JOIN fichas_treino ft ON pe.id_ficha = ft.id
      JOIN usuarios u ON ft.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- SESSOES REALIZADAS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor ve todas sessoes" ON sessoes_realizadas;
CREATE POLICY "Gestor ve todas sessoes" ON sessoes_realizadas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprias sessoes" ON sessoes_realizadas;
CREATE POLICY "Aluno ve proprias sessoes" ON sessoes_realizadas
  FOR SELECT USING (
    id_cliente IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Aluno cria proprias sessoes" ON sessoes_realizadas;
CREATE POLICY "Aluno cria proprias sessoes" ON sessoes_realizadas
  FOR INSERT WITH CHECK (
    id_cliente IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Aluno atualiza proprias sessoes" ON sessoes_realizadas;
CREATE POLICY "Aluno atualiza proprias sessoes" ON sessoes_realizadas
  FOR UPDATE USING (
    id_cliente IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- -------------------------------------------------------
-- SERIES REALIZADAS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor ve todas series realizadas" ON series_realizadas;
CREATE POLICY "Gestor ve todas series realizadas" ON series_realizadas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprias series realizadas" ON series_realizadas;
CREATE POLICY "Aluno ve proprias series realizadas" ON series_realizadas
  FOR SELECT USING (
    id_sessao IN (
      SELECT s.id FROM sessoes_realizadas s
      JOIN usuarios u ON s.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Aluno registra proprias series realizadas" ON series_realizadas;
CREATE POLICY "Aluno registra proprias series realizadas" ON series_realizadas
  FOR INSERT WITH CHECK (
    id_sessao IN (
      SELECT s.id FROM sessoes_realizadas s
      JOIN usuarios u ON s.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------
-- MUSCLE GROUP GOALS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia muscle goals" ON muscle_group_goals;
CREATE POLICY "Gestor gerencia muscle goals" ON muscle_group_goals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprios muscle goals" ON muscle_group_goals;
CREATE POLICY "Aluno ve proprios muscle goals" ON muscle_group_goals
  FOR SELECT USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- -------------------------------------------------------
-- ACTIVITIES
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia activities" ON activities;
CREATE POLICY "Gestor gerencia activities" ON activities
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprias activities" ON activities;
CREATE POLICY "Aluno ve proprias activities" ON activities
  FOR SELECT USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Aluno gerencia proprias activities" ON activities;
CREATE POLICY "Aluno gerencia proprias activities" ON activities
  FOR ALL USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- -------------------------------------------------------
-- MEALS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia meals" ON meals;
CREATE POLICY "Gestor gerencia meals" ON meals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprias meals" ON meals;
CREATE POLICY "Aluno ve proprias meals" ON meals
  FOR SELECT USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Aluno gerencia proprias meals" ON meals;
CREATE POLICY "Aluno gerencia proprias meals" ON meals
  FOR ALL USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- -------------------------------------------------------
-- FIXED FOODS
-- -------------------------------------------------------
DROP POLICY IF EXISTS "Gestor gerencia fixed_foods" ON fixed_foods;
CREATE POLICY "Gestor gerencia fixed_foods" ON fixed_foods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM usuarios WHERE auth_id = auth.uid() AND role = 'gestor')
  );

DROP POLICY IF EXISTS "Aluno ve proprios fixed_foods" ON fixed_foods;
CREATE POLICY "Aluno ve proprios fixed_foods" ON fixed_foods
  FOR SELECT USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Aluno gerencia proprios fixed_foods" ON fixed_foods;
CREATE POLICY "Aluno gerencia proprios fixed_foods" ON fixed_foods
  FOR ALL USING (
    user_id IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );

-- =============================================================
-- TRIGGERS
-- =============================================================

DROP FUNCTION IF EXISTS update_updated_at CASCADE;
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_usuarios_updated_at ON usuarios;
CREATE TRIGGER trigger_usuarios_updated_at
  BEFORE UPDATE ON usuarios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- TRIGGER 2: AUTO-ROLE POR E-MAIL (SEGURANCA DO GESTOR)
-- =============================================================

DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- =========================================================
  -- CONDICAO DE SEGURANCA: E-mail do Gestor (Admin)
  -- =========================================================
  IF NEW.email = 'ronaldylc3@gmail.com' THEN
    user_role := 'gestor';
  ELSE
    user_role := 'aluno';
  END IF;

  INSERT INTO usuarios (
    auth_id,
    nome,
    email,
    telefone,
    cpf,
    pacote,
    role,
    status
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
    COALESCE(NEW.raw_user_meta_data->>'pacote', 'treino'),
    user_role,
    CASE
      WHEN NEW.email_confirmed_at IS NOT NULL THEN 'ativo'
      ELSE 'pendente'
    END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- TRIGGER 3: ATUALIZAR STATUS PARA 'ATIVO'
-- =============================================================

DROP FUNCTION IF EXISTS handle_user_activated CASCADE;
CREATE OR REPLACE FUNCTION handle_user_activated()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.password_encrypted IS NULL AND NEW.password_encrypted IS NOT NULL THEN
    UPDATE usuarios
    SET status = 'ativo'
    WHERE auth_id = NEW.id AND status = 'pendente';
  END IF;

  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE usuarios
    SET status = 'ativo'
    WHERE auth_id = NEW.id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_activated ON auth.users;
CREATE TRIGGER on_auth_user_activated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_activated();/