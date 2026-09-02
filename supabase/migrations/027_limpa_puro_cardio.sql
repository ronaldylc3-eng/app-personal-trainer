-- =============================================================
-- MIGRACAO 027: Limpeza do fluxo "Puro Cardio como ficha"
-- O Puro Cardio deixou de ser uma ficha: agora e um treino pronto
-- dentro da ficha hibrida ativa. Remove o schema criado pela 026.
-- =============================================================
-- Execute este script no SQL Editor do Supabase Dashboard apos a 026.
-- (Opicional: so roda se a 026 ja foi aplicada.)
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. Remove a flag is_pure_cardio (ficou sem uso)
-- -------------------------------------------------------------
ALTER TABLE public.fichas
  DROP COLUMN IF EXISTS is_pure_cardio;

-- -------------------------------------------------------------
-- 2. Restaura a RPC criar_ficha para 3 argumentos
--    (a 026 apagou a versao 3-args e criou a 4-args)
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_ficha(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.criar_ficha(
  p_user_id uuid,
  p_nome text,
  p_tipo text DEFAULT 'treino'
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

  INSERT INTO public.fichas (user_id, nome, tipo)
  VALUES (p_user_id, trim(p_nome), p_tipo)
  RETURNING * INTO nova;

  RETURN nova;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ficha(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ficha(uuid, text, text) TO authenticated;

COMMIT;

-- -------------------------------------------------------------
-- 3. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fichas' AND column_name = 'is_pure_cardio';

SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc WHERE proname = 'criar_ficha';