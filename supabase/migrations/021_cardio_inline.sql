-- =============================================================
-- MIGRACAO 021: Cardio Inline na Ficha de Treino
-- exercicios_treino passa a aceitar a mistura de categorias na
-- MESMA lista de exercicios de um treino:
--   categoria = 'forca'  -> fluxo atual (series x reps x carga)
--   categoria = 'cardio' -> meta de tempo/distancia (ex.: Boxe, 60 min)
-- logs_cardio registra a execucao do cardio pelo aluno
-- (upsert diario no mesmo padrao de logs_execucao).
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. CATEGORIA + METAS DE CARDIO EM EXERCICIOS_TREINO
-- -------------------------------------------------------------
ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'forca';

ALTER TABLE public.exercicios_treino
  DROP CONSTRAINT IF EXISTS exercicios_treino_categoria_check;
ALTER TABLE public.exercicios_treino
  ADD CONSTRAINT exercicios_treino_categoria_check CHECK (categoria IN ('forca', 'cardio'));

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS meta_tempo_min int CHECK (meta_tempo_min IS NULL OR meta_tempo_min > 0),
  ADD COLUMN IF NOT EXISTS meta_distancia_km numeric(6,2)
    CHECK (meta_distancia_km IS NULL OR meta_distancia_km > 0);

COMMENT ON COLUMN public.exercicios_treino.categoria IS
  'Tipo do item dentro da ficha: forca (series/reps/carga) ou cardio (tempo/distancia).';
COMMENT ON COLUMN public.exercicios_treino.meta_tempo_min IS
  'Meta de duracao em minutos para itens de cardio. Nulo para itens de forca.';
COMMENT ON COLUMN public.exercicios_treino.meta_distancia_km IS
  'Meta opcional de distancia em km para itens de cardio (ex.: corrida).';

-- -------------------------------------------------------------
-- 2. LOGS DE CARDIO (execucao real do aluno)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logs_cardio (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio_id  uuid NOT NULL REFERENCES public.exercicios_treino(id) ON DELETE CASCADE,
  log_treino_id uuid REFERENCES public.logs_treino(id) ON DELETE SET NULL,
  duracao_min   numeric(5,1) NOT NULL DEFAULT 0 CHECK (duracao_min >= 0),
  distancia_km  numeric(6,2) CHECK (distancia_km IS NULL OR distancia_km >= 0),
  data_registro timestamptz NOT NULL DEFAULT now(),
  data_treino   date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date
);

COMMENT ON TABLE public.logs_cardio IS
  'Execucao de cardio registrada pelo aluno: uma linha por exercicio/dia (upsert diario).';

CREATE INDEX IF NOT EXISTS idx_logs_cardio_exercicio_data
  ON public.logs_cardio (exercicio_id, data_treino DESC);
CREATE INDEX IF NOT EXISTS idx_logs_cardio_log_treino ON public.logs_cardio (log_treino_id);

-- Idempotencia do "Finalizar Treino": refinalizar no mesmo dia
-- substitui os valores ja registrados. log_treino_id entra na chave
-- para manter a consistencia entre sessoes distintas do mesmo dia.
DROP INDEX IF EXISTS logs_cardio_upsert_diario;
CREATE UNIQUE INDEX IF NOT EXISTS logs_cardio_upsert_diario
  ON public.logs_cardio (exercicio_id, data_treino, log_treino_id);

-- -------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (espelha logs_execucao / logs_treino)
-- -------------------------------------------------------------
ALTER TABLE public.logs_cardio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia logs de cardio" ON public.logs_cardio;
CREATE POLICY "Gestor gerencia logs de cardio" ON public.logs_cardio
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve proprios logs de cardio" ON public.logs_cardio;
CREATE POLICY "Aluno ve proprios logs de cardio" ON public.logs_cardio
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_cardio.exercicio_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Aluno insere logs de cardio na propria ficha ativa" ON public.logs_cardio;
CREATE POLICY "Aluno insere logs de cardio na propria ficha ativa" ON public.logs_cardio
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_cardio.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  );

DROP POLICY IF EXISTS "Aluno atualiza logs de cardio na propria ficha ativa" ON public.logs_cardio;
CREATE POLICY "Aluno atualiza logs de cardio na propria ficha ativa" ON public.logs_cardio
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_cardio.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_cardio.exercicio_id
        AND u.auth_id = auth.uid()
        AND f.status = 'ativa'
    )
  );

-- -------------------------------------------------------------
-- 4. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exercicios_treino'
ORDER BY ordinal_position;
