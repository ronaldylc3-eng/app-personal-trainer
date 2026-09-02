-- =============================================================
-- MIGRACAO 026: Fichas Puro Cardio
-- Adiciona a flag is_pure_cardio em fichas e atualiza a RPC
-- criar_ficha para aceitar o parametro (default false).
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Flag is_pure_cardio na tabela fichas
-- -------------------------------------------------------------
ALTER TABLE public.fichas
  ADD COLUMN IF NOT EXISTS is_pure_cardio boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fichas.is_pure_cardio IS
  'Ficha prescrita apenas com cardio (criacao expressa): montada com 1 treino + 1 exercicio cardio.';

-- -------------------------------------------------------------
-- 2. RPC criar_ficha com p_is_pure_cardio (default false mantem
--    as chamadas atuais funcionando sem alteracoes)
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_ficha(uuid, text, text);

CREATE OR REPLACE FUNCTION public.criar_ficha(
  p_user_id uuid,
  p_nome text,
  p_tipo text DEFAULT 'treino',
  p_is_pure_cardio boolean DEFAULT false
)
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

  IF p_tipo NOT IN ('treino', 'dieta', 'avaliacao', 'acompanhamento') THEN
    RAISE EXCEPTION 'Tipo invalido: use treino, dieta, avaliacao ou acompanhamento';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  -- Regra de "unica ativa": apenas treino e dieta
  IF p_tipo IN ('treino', 'dieta') THEN
    UPDATE public.fichas
       SET status = 'arquivada'
     WHERE user_id = p_user_id
       AND tipo = p_tipo
       AND status = 'ativa';
  END IF;

  INSERT INTO public.fichas (user_id, nome, tipo, is_pure_cardio)
  VALUES (p_user_id, trim(p_nome), p_tipo, COALESCE(p_is_pure_cardio, false))
  RETURNING * INTO nova;

  RETURN nova;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ficha(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ficha(uuid, text, text, boolean) TO authenticated;

COMMIT;

-- -------------------------------------------------------------
-- 3. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fichas' AND column_name = 'is_pure_cardio';

SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'criar_ficha';