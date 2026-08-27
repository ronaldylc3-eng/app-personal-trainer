-- =============================================================
-- MIGRACAO 015: Coluna is_warmup em logs_execucao
-- O app envia is_warmup ao registrar series de aquecimento
-- (Workouts.tsx -> logsExecucao.upsertDia). Sem a coluna, o
-- PostgREST rejeita o upsert com HTTP 400 (PGRST204) e o treino
-- nao e salvo.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

ALTER TABLE public.logs_execucao
  ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN NOT NULL DEFAULT false;
