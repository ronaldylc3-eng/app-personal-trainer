-- =============================================================
-- MIGRACAO 011: Execucao de Treino e Sobrecarga Progressiva
-- logs_treino = sessao concluida (cronometro, duracao)
-- logs_execucao.log_treino_id vincula as series a sessao
-- Fix RLS: aluno passa a poder LER o proprio historico
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. LOGS DE TREINO (sessao executada pelo aluno)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.logs_treino (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  treino_id        uuid NOT NULL REFERENCES public.treinos_ficha(id) ON DELETE CASCADE,
  data_execucao    timestamptz NOT NULL DEFAULT now(),
  duracao_segundos int NOT NULL DEFAULT 0 CHECK (duracao_segundos >= 0)
);

COMMENT ON TABLE public.logs_treino IS
  'Sessao de treino concluida: uma linha por Finalizar Treino, com a duracao do cronometro.';

CREATE INDEX IF NOT EXISTS idx_logs_treino_user ON public.logs_treino (user_id, data_execucao DESC);
CREATE INDEX IF NOT EXISTS idx_logs_treino_treino ON public.logs_treino (treino_id);

-- -------------------------------------------------------------
-- 2. VINCULO SERIE -> SESSAO
-- -------------------------------------------------------------
ALTER TABLE public.logs_execucao
  ADD COLUMN IF NOT EXISTS log_treino_id uuid REFERENCES public.logs_treino(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_logs_treino_id ON public.logs_execucao (log_treino_id);

-- -------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- -------------------------------------------------------------
ALTER TABLE public.logs_treino ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia logs de treino" ON public.logs_treino;
CREATE POLICY "Gestor gerencia logs de treino" ON public.logs_treino
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve proprios logs de treino" ON public.logs_treino;
CREATE POLICY "Aluno ve proprios logs de treino" ON public.logs_treino
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_treino.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Aluno registra proprios logs de treino" ON public.logs_treino;
CREATE POLICY "Aluno registra proprios logs de treino" ON public.logs_treino
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_treino.user_id
        AND u.auth_id = auth.uid()
    )
  );

-- FIX: logs_execucao nao tinha policy de leitura para o aluno
-- (sem ela, o aluno nao conseguia consultar o proprio historico)
DROP POLICY IF EXISTS "Aluno ve proprios logs de execucao" ON public.logs_execucao;
CREATE POLICY "Aluno ve proprios logs de execucao" ON public.logs_execucao
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_execucao.exercicio_id
        AND u.auth_id = auth.uid()
    )
  );
