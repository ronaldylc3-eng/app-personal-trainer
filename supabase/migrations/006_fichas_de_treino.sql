-- =============================================================
-- MIGRACAO 006: Arquitetura de Fichas de Treino (versionamento)
-- Fluxo: Usuario (1) -> (N) Fichas (1) -> (N) Treinos (1) -> (N) Exercicios
-- Execucao do aluno registrada em logs_execucao (batch/upsert diario)
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 0. Remover modelagem legada de treinos
-- -------------------------------------------------------------
DROP TABLE IF EXISTS public.series_realizadas CASCADE;
DROP TABLE IF EXISTS public.sessoes_realizadas CASCADE;
DROP TABLE IF EXISTS public.prescricao_series CASCADE;
DROP TABLE IF EXISTS public.prescricao_exercicios CASCADE;
DROP TABLE IF EXISTS public.fichas_treino CASCADE;

-- -------------------------------------------------------------
-- 1. FICHAS DE TREINO
-- -------------------------------------------------------------
CREATE TABLE public.fichas_treino (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  status       text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'arquivada')),
  data_criacao timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fichas_treino IS
  'Fichas de treino por aluno. Apenas uma ficha ativa por usuario (versionamento: criar nova arquiva a anterior).';

-- Apenas UMA ficha pode estar ativa por usuario
CREATE UNIQUE INDEX ficha_ativa_unica_por_usuario
  ON public.fichas_treino (user_id)
  WHERE status = 'ativa';

CREATE INDEX idx_fichas_user ON public.fichas_treino (user_id);

-- -------------------------------------------------------------
-- 2. TREINOS DA FICHA (A, B, C...)
-- -------------------------------------------------------------
CREATE TABLE public.treinos_ficha (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id      uuid NOT NULL REFERENCES public.fichas_treino(id) ON DELETE CASCADE,
  letra_ou_nome text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ficha_id, letra_ou_nome)
);

CREATE INDEX idx_treinos_ficha ON public.treinos_ficha (ficha_id);

-- -------------------------------------------------------------
-- 3. EXERCICIOS DO TREINO
-- -------------------------------------------------------------
CREATE TABLE public.exercicios_treino (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treino_id             uuid NOT NULL REFERENCES public.treinos_ficha(id) ON DELETE CASCADE,
  nome_exercicio        text NOT NULL,
  grupo_muscular        text,
  series                int  NOT NULL DEFAULT 3 CHECK (series > 0),
  repeticoes_prescritas text,
  descanso              int  NOT NULL DEFAULT 90 CHECK (descanso >= 0),
  ordem                 int  NOT NULL DEFAULT 0
);

CREATE INDEX idx_exercicios_treino ON public.exercicios_treino (treino_id);

-- -------------------------------------------------------------
-- 4. LOGS DE EXECUCAO (historico/graficos do aluno)
-- -------------------------------------------------------------
CREATE TABLE public.logs_execucao (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio_id          uuid NOT NULL REFERENCES public.exercicios_treino(id) ON DELETE CASCADE,
  carga                 numeric(6,2) NOT NULL DEFAULT 0,
  repeticoes_realizadas int NOT NULL DEFAULT 0,
  serie_valida          boolean NOT NULL DEFAULT false,
  num_serie             int NOT NULL DEFAULT 1,
  data_registro         timestamptz NOT NULL DEFAULT now(),
  data_treino           date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date
);

-- Idempotencia do "Finalizar Treino de Hoje": refinalizar no mesmo dia
-- substitui os valores das series ja registradas (upsert). O vinculo
-- log_treino_id entra na chave para que sessões distintas do mesmo dia
-- (ex.: aluno finaliza 2x o mesmo treino) não sobrescrevam as series
-- uma da outra, mantendo o historico consistente.
DROP INDEX IF EXISTS logs_upsert_diario;
CREATE UNIQUE INDEX logs_upsert_diario
  ON public.logs_execucao (exercicio_id, num_serie, data_treino, log_treino_id);

CREATE INDEX idx_logs_exercicio_data
  ON public.logs_execucao (exercicio_id, data_treino DESC);

-- -------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- -------------------------------------------------------------
ALTER TABLE public.fichas_treino     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinos_ficha     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercicios_treino ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_execucao     ENABLE ROW LEVEL SECURITY;

-- ===== FICHAS_TREINO =====

CREATE POLICY "Gestor gerencia fichas de treino" ON public.fichas_treino
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "Aluno ve proprias fichas" ON public.fichas_treino
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = fichas_treino.user_id
        AND u.auth_id = auth.uid()
    )
  );

-- ===== TREINOS_FICHA =====

CREATE POLICY "Gestor gerencia treinos da ficha" ON public.treinos_ficha
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "Aluno ve treinos da propria ficha" ON public.treinos_ficha
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.fichas_treino f
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE f.id = treinos_ficha.ficha_id
        AND u.auth_id = auth.uid()
    )
  );

-- ===== EXERCICIOS_TREINO =====

CREATE POLICY "Gestor gerencia exercicios do treino" ON public.exercicios_treino
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "Aluno ve exercicios da propria ficha" ON public.exercicios_treino
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.treinos_ficha t
      JOIN public.fichas_treino f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE t.id = exercicios_treino.treino_id
        AND u.auth_id = auth.uid()
    )
  );

-- ===== LOGS_EXECUCAO =====

CREATE POLICY "Gestor gerencia logs de execucao" ON public.logs_execucao
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

CREATE POLICY "Aluno insere logs na propria ficha ativa" ON public.logs_execucao
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas_treino f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_execucao.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  );

CREATE POLICY "Aluno atualiza logs na propria ficha ativa" ON public.logs_execucao
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas_treino f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_execucao.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas_treino f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_execucao.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  );
