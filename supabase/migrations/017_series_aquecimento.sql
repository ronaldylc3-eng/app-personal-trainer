-- =============================================================
-- MIGRACAO 017: Series de aquecimento na prescricao
-- exercicios_treino.series_aquecimento (jsonb): array de booleans
-- alinhado ao indice das series, ex.: [false, true, false] = serie 2
-- prescrita como aquecimento. Nulo/ausente = todas as series principais.
-- O aluno recebe essas series pre-marcadas como "aquecimento"
-- (podendo alterar), e elas nao contam nas metas por grupo.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS series_aquecimento jsonb;

COMMENT ON COLUMN public.exercicios_treino.series_aquecimento IS
  'Series prescritas como aquecimento (array de booleans por indice). Nulo = nenhuma.';
