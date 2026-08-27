-- =============================================================
-- MIGRACAO 014: Tracking de Consumo Real (reset meia-noite SP)
-- meals.date: TEXT -> DATE com default do dia local (America/Sao_Paulo).
-- Habilita getConsumoHoje (dia exato) e relatorio de 30 dias (range real).
-- Idempotente. Execute no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tipo da coluna date: TEXT -> DATE
--    Dados existentes ja estao em 'YYYY-MM-DD' -> cast seguro.
--    Re-executar (date->date) e no-op permitido pelo USING.
-- -------------------------------------------------------------
ALTER TABLE public.meals ALTER COLUMN date TYPE date USING date::date;

-- -------------------------------------------------------------
-- 2. Default: dia corrente no fuso America/Sao_Paulo
--    (mesmo padrao de logs_execucao.data_treino / logs_treino)
-- -------------------------------------------------------------
ALTER TABLE public.meals ALTER COLUMN date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date);

-- -------------------------------------------------------------
-- 3. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------

-- Tipo esperado: date | Nullable: NO | Default: ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'meals' AND column_name = 'date';

-- Registros existentes continuando legiveis como data:
SELECT id, date FROM public.meals ORDER BY date DESC LIMIT 5;
