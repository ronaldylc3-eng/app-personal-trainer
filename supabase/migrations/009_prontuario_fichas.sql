-- =============================================================
-- MIGRACAO 009: Prontuario do Aluno - unificacao de fichas
-- fichas_treino -> fichas (+ coluna tipo) e trava 1 ativa/tipo
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Renomeia a tabela principal
--    (FKs, indices e policies acompanham o rename automaticamente)
-- -------------------------------------------------------------
ALTER TABLE public.fichas_treino RENAME TO fichas;

COMMENT ON TABLE public.fichas IS
  'Prontuario do aluno: fichas unificadas (tipo = treino | dieta). Apenas UMA ficha ativa por tipo por usuario.';

-- -------------------------------------------------------------
-- 2. Coluna tipo + backfill dos registros existentes ('treino')
-- -------------------------------------------------------------
ALTER TABLE public.fichas ADD COLUMN IF NOT EXISTS tipo text;

UPDATE public.fichas SET tipo = 'treino' WHERE tipo IS NULL;

ALTER TABLE public.fichas
  ALTER COLUMN tipo SET DEFAULT 'treino',
  ALTER COLUMN tipo SET NOT NULL;

ALTER TABLE public.fichas DROP CONSTRAINT IF EXISTS fichas_tipo_check;

ALTER TABLE public.fichas
  ADD CONSTRAINT fichas_tipo_check CHECK (tipo IN ('treino', 'dieta'));

-- -------------------------------------------------------------
-- 3. Trava de seguranca: 1 ativa de treino + 1 ativa de dieta
-- -------------------------------------------------------------
DROP INDEX IF EXISTS public.ficha_ativa_unica_por_usuario;

CREATE UNIQUE INDEX ficha_ativa_unica_por_tipo
  ON public.fichas (user_id, tipo)
  WHERE status = 'ativa';

COMMIT;

-- -------------------------------------------------------------
-- 4. Recria a RPC (corpo plpgsql resolve nomes em tempo de
--    execucao -> quebraria apos o rename sem esta recriacao).
--    Assinatura nova com p_tipo; default 'treino' mantem o React
--    atual funcionando sem alteracoes.
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_ficha(uuid, text);

CREATE OR REPLACE FUNCTION public.criar_ficha(p_user_id uuid, p_nome text, p_tipo text DEFAULT 'treino')
RETURNS public.fichas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova public.fichas;
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem criar fichas';
  END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome da ficha e obrigatorio';
  END IF;

  IF p_tipo NOT IN ('treino', 'dieta') THEN
    RAISE EXCEPTION 'Tipo invalido: use "treino" ou "dieta"';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  -- Arquiva apenas a ficha ativa do MESMO tipo
  UPDATE public.fichas
     SET status = 'arquivada'
   WHERE user_id = p_user_id
     AND tipo = p_tipo
     AND status = 'ativa';

  INSERT INTO public.fichas (user_id, nome, tipo)
  VALUES (p_user_id, trim(p_nome), p_tipo)
  RETURNING * INTO nova;

  RETURN nova;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ficha(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ficha(uuid, text, text) TO authenticated;

-- -------------------------------------------------------------
-- 5. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------

-- FKs devem listar treinos_ficha apontando para 'fichas':
SELECT conrelid::regclass AS tabela_origem, conname
FROM pg_constraint
WHERE contype = 'f' AND confrelid = 'public.fichas'::regclass;

-- Indices da tabela (deve aparecer ficha_ativa_unica_por_tipo):
SELECT indexname FROM pg_indexes WHERE tablename = 'fichas';
