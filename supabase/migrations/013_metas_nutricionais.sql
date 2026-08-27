-- =============================================================
-- MIGRACAO 013: Metas Nutricionais via Acompanhamento
-- As metas do grafico de dieta do aluno (kcal + macros + fibras)
-- passam a ser ditadas EXCLUSIVAMENTE pelo acompanhamento mais
-- recente registrado pelo gestor. Idempotente.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- -------------------------------------------------------------
-- 1. COLUNAS DE METAS (nullable: gestor pode registrar OS sem ajustar metas)
-- -------------------------------------------------------------
ALTER TABLE public.acompanhamentos_os ADD COLUMN IF NOT EXISTS meta_kcal     int;
ALTER TABLE public.acompanhamentos_os ADD COLUMN IF NOT EXISTS meta_proteina int;
ALTER TABLE public.acompanhamentos_os ADD COLUMN IF NOT EXISTS meta_carbo    int;
ALTER TABLE public.acompanhamentos_os ADD COLUMN IF NOT EXISTS meta_gordura  int;
ALTER TABLE public.acompanhamentos_os ADD COLUMN IF NOT EXISTS meta_fibra    int;

COMMENT ON COLUMN public.acompanhamentos_os.meta_kcal IS
  'Meta de calorias (kcal) definida pelo gestor neste acompanhamento.';
COMMENT ON COLUMN public.acompanhamentos_os.meta_proteina IS
  'Meta de proteina (g) definida pelo gestor neste acompanhamento.';
COMMENT ON COLUMN public.acompanhamentos_os.meta_carbo IS
  'Meta de carboidrato (g) definida pelo gestor neste acompanhamento.';
COMMENT ON COLUMN public.acompanhamentos_os.meta_gordura IS
  'Meta de gordura (g) definida pelo gestor neste acompanhamento.';
COMMENT ON COLUMN public.acompanhamentos_os.meta_fibra IS
  'Meta de fibras (g) definida pelo gestor neste acompanhamento.';

-- -------------------------------------------------------------
-- 2. RPC recriada com persistencia das metas
--    (o INSERT lista colunas explicitamente -> precisa incluir as novas)
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
    meta_kcal, meta_proteina, meta_carbo, meta_gordura, meta_fibra
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
    NULLIF(p_dados->>'meta_fibra', '')::int
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

-- Colunas criadas (esperado: as 5 metas):
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'acompanhamentos_os'
  AND column_name LIKE 'meta_%'
ORDER BY ordinal_position;

-- RPC atualizada (corpo deve conter meta_kcal):
SELECT proname FROM pg_proc
WHERE proname = 'criar_acompanhamento_os'
  AND prosrc LIKE '%meta_kcal%';
