-- =============================================================
-- MIGRACAO 016: Repeticoes por serie + Observacao do treino
-- 1. exercicios_treino.repeticoes_por_serie (jsonb): array de texto
--    livre com a meta de reps de CADA serie, ex.: ["12","10","8-10"].
--    Fallback: nulo => usa repeticoes_prescritas em todas as series.
-- 2. treinos_ficha.observacoes (text): recado do gestor para o aluno,
--    exibido somente-leitura na tela "Meus Treinos".
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS repeticoes_por_serie jsonb;

ALTER TABLE public.treinos_ficha
  ADD COLUMN IF NOT EXISTS observacoes text;

COMMENT ON COLUMN public.exercicios_treino.repeticoes_por_serie IS
  'Meta de repeticoes por serie (texto livre). Nulo = usar repeticoes_prescritas para todas as series.';

COMMENT ON COLUMN public.treinos_ficha.observacoes IS
  'Observacao do gestor para o aluno, exibida como leitura no treino.';
