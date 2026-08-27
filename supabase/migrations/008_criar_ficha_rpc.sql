-- =============================================================
-- MIGRACAO 008: RPC atomica para criacao de ficha de treino
-- Arquiva a ficha ativa anterior e insere a nova numa unica
-- transacao (elimina race/409 do indice parcial unico)
-- =============================================================

CREATE OR REPLACE FUNCTION public.criar_ficha(p_user_id uuid, p_nome text)
RETURNS public.fichas_treino
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nova public.fichas_treino;
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem criar fichas de treino';
  END IF;

  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome da ficha e obrigatorio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  UPDATE public.fichas_treino
     SET status = 'arquivada'
   WHERE user_id = p_user_id
     AND status = 'ativa';

  INSERT INTO public.fichas_treino (user_id, nome)
  VALUES (p_user_id, trim(p_nome))
  RETURNING * INTO nova;

  RETURN nova;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_ficha(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_ficha(uuid, text) TO authenticated;
