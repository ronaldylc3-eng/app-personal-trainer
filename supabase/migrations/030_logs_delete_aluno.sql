-- =============================================================
-- MIGRACAO 030: DELETE de logs pelo proprio aluno (rollback)
-- Habilita o aluno a apagar SESSAO INCOMPLETA criada no meio de um
-- envio que falhou (save transacional no front: deleta os filhos
-- logs_execucao/logs_cardio e depois o logs_treino da mesma sessao).
-- O app so invoca esse DELETE no rollback da sessao atual — nao
-- expoe botao de apagar historico real na interface.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. LOGS_TREINO: aluno apaga proprios registros
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Aluno apaga proprios logs de treino" ON public.logs_treino;
CREATE POLICY "Aluno apaga proprios logs de treino" ON public.logs_treino
  FOR DELETE
  USING (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_treino.user_id
        AND u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 2. LOGS_EXECUCAO: aluno apaga series de treinos da propria ficha
-- (necessario para remover os filhos ANTES do logs_treino pai,
-- pois a FK log_treino_id usa ON DELETE SET NULL)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Aluno apaga logs de execucao da propria ficha" ON public.logs_execucao;
CREATE POLICY "Aluno apaga logs de execucao da propria ficha" ON public.logs_execucao
  FOR DELETE
  USING (
    public.is_gestor()
    OR EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_execucao.exercicio_id
        AND u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 3. LOGS_CARDIO: aluno apaga proprios registros de cardio
-- (inline na ficha OU avulso de Cardio Isolado Livre, cujo
-- exercicio_id e NULL e so possui user_id)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "Aluno apaga proprios logs de cardio" ON public.logs_cardio;
CREATE POLICY "Aluno apaga proprios logs de cardio" ON public.logs_cardio
  FOR DELETE
  USING (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_cardio.user_id
        AND u.auth_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.exercicios_treino e
      JOIN public.treinos_ficha t ON t.id = e.treino_id
      JOIN public.fichas f ON f.id = t.ficha_id
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE e.id = logs_cardio.exercicio_id
        AND u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- VERIFICACAO (rode apos a migracao):
--   SELECT policyname, tablename, cmd
--   FROM pg_policies
--   WHERE tablename IN ('logs_treino', 'logs_execucao', 'logs_cardio')
--   ORDER BY tablename, cmd;
-- -------------------------------------------------------------