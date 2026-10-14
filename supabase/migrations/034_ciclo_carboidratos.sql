-- =============================================================
-- MIGRACAO 034: Ciclo de Carboidratos / Metas por Dia
-- Permite ao gestor definir metas diferentes por dia da semana
-- (ex.: High/Low Carb) mantendo a Meta Base como fallback.
-- Idempotente.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. COLUNAS DO CICLO (nullable / default false)
--    metas_por_dia (jsonb): {"0":{kcal,carb,prot,gord},...,"6":{...}}
--    0 = Domingo .. 6 = Sabado
-- -------------------------------------------------------------
ALTER TABLE public.acompanhamentos_os
  ADD COLUMN IF NOT EXISTS metas_por_dia jsonb;
ALTER TABLE public.acompanhamentos_os
  ADD COLUMN IF NOT EXISTS is_ciclo_ativado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.acompanhamentos_os.metas_por_dia IS
  'Ciclo de carboidratos: metas por dia da semana. Chaves "0".."6" (0=Dom..6=Sab), valores {kcal,carb,prot,gord}.';
COMMENT ON COLUMN public.acompanhamentos_os.is_ciclo_ativado IS
  'Quando true, o app usa metas_por_dia para o dia corrente (fallback para meta_* base quando o dia nao tem valor).';

-- -------------------------------------------------------------
-- 2. RPC recriada com persistencia do ciclo
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_acompanhamento_os(p_user_id uuid, p_dados jsonb)
RETURNS public.acompanhamentos_os
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ficha public.fichas;
  v_os    public.acompanhamentos_os;
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem registrar acompanhamentos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  INSERT INTO public.fichas (user_id, nome, tipo, status)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_dados->>'nome'), ''), 'Acompanhamento - ' || to_char(now(), 'DD/MM/YYYY')),
    'acompanhamento',
    'ativa'
  )
  RETURNING * INTO v_ficha;

  INSERT INTO public.acompanhamentos_os (
    ficha_id, relato, feedback, fotos, peso,
    meta_kcal, meta_proteina, meta_carbo, meta_gordura, meta_fibra,
    metas_por_dia, is_ciclo_ativado
  )
  VALUES (
    v_ficha.id,
    COALESCE(p_dados->>'relato', ''),
    COALESCE(p_dados->>'feedback', ''),
    COALESCE(p_dados->'fotos', '[]'::jsonb),
    NULLIF(p_dados->>'peso', '')::real,
    NULLIF(p_dados->>'meta_kcal', '')::int,
    NULLIF(p_dados->>'meta_proteina', '')::int,
    NULLIF(p_dados->>'meta_carbo', '')::int,
    NULLIF(p_dados->>'meta_gordura', '')::int,
    NULLIF(p_dados->>'meta_fibra', '')::int,
    p_dados->'metas_por_dia',
    COALESCE((p_dados->>'is_ciclo_ativado')::boolean, false)
  )
  RETURNING * INTO v_os;

  RETURN v_os;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_acompanhamento_os(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_acompanhamento_os(uuid, jsonb) TO authenticated;

-- -------------------------------------------------------------
-- 3. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------

-- Colunas criadas (esperado: metas_por_dia + is_ciclo_ativado):
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'acompanhamentos_os'
  AND column_name IN ('metas_por_dia', 'is_ciclo_ativado');

-- RPC atualizada (corpo deve conter metas_por_dia):
SELECT proname FROM pg_proc
WHERE proname = 'criar_acompanhamento_os'
  AND prosrc LIKE '%metas_por_dia%';