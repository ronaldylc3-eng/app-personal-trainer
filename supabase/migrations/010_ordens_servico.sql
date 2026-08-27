-- =============================================================
-- MIGRACAO 010: Ordens de Servico (OS) - Eventos Clinicos
-- fichas.tipo expandido (avaliacao | acompanhamento)
-- Indice unico restrito a treino/dieta
-- Tabelas filhas avaliacoes_os / acompanhamentos_os (FK -> ficha_id)
-- RPCs atomicas + backfill das avaliacoes legadas
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. CHECK de tipo expandido
-- -------------------------------------------------------------
ALTER TABLE public.fichas DROP CONSTRAINT IF EXISTS fichas_tipo_check;

ALTER TABLE public.fichas
  ADD CONSTRAINT fichas_tipo_check
  CHECK (tipo IN ('treino', 'dieta', 'avaliacao', 'acompanhamento'));

COMMENT ON TABLE public.fichas IS
  'Prontuario do aluno: fichas unificadas (tipo = treino | dieta | avaliacao | acompanhamento). Regra de unica ativa aplica-se apenas a treino e dieta; eventos clinicos sao ilimitados.';

-- -------------------------------------------------------------
-- 2. Indice unico: apenas treino/dieta tem "unica ativa"
--    (avaliacao/acompanhamento permitem multiplas insercoes)
-- -------------------------------------------------------------
DROP INDEX IF EXISTS public.ficha_ativa_unica_por_tipo;

CREATE UNIQUE INDEX ficha_ativa_unica_por_tipo
  ON public.fichas (user_id, tipo)
  WHERE status = 'ativa' AND tipo IN ('treino', 'dieta');

-- -------------------------------------------------------------
-- 3. Tabelas filhas (FK -> ficha_id ON DELETE CASCADE, sem user_id)
-- -------------------------------------------------------------

-- 3a. AVALIACAO FISICA (OS)
CREATE TABLE IF NOT EXISTS public.avaliacoes_os (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id            uuid NOT NULL REFERENCES public.fichas(id) ON DELETE CASCADE,
  anamnese            text DEFAULT '',
  perimetros          jsonb DEFAULT '{}'::jsonb,
  composicao          jsonb DEFAULT '{}'::jsonb,
  flexibilidade_forca text DEFAULT '',
  objetivo            text DEFAULT '',
  peso                real DEFAULT 0,
  altura              real DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_os_ficha
  ON public.avaliacoes_os (ficha_id);

COMMENT ON TABLE public.avaliacoes_os IS
  'Detalhe das OS do tipo avaliacao. Historico preservado: cada avaliacao e uma nova ficha.';

-- 3b. ACOMPANHAMENTO (OS)
CREATE TABLE IF NOT EXISTS public.acompanhamentos_os (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id   uuid NOT NULL REFERENCES public.fichas(id) ON DELETE CASCADE,
  relato     text DEFAULT '',
  feedback   text DEFAULT '',
  fotos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  peso       real,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acompanhamentos_os_ficha
  ON public.acompanhamentos_os (ficha_id);

COMMENT ON TABLE public.acompanhamentos_os IS
  'Detalhe das OS do tipo acompanhamento. fotos = array jsonb de URLs.';

-- -------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- -------------------------------------------------------------
ALTER TABLE public.avaliacoes_os ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acompanhamentos_os ENABLE ROW LEVEL SECURITY;

-- ===== AVALIACOES_OS =====

DROP POLICY IF EXISTS "Gestor gerencia avaliacoes os" ON public.avaliacoes_os;
CREATE POLICY "Gestor gerencia avaliacoes os" ON public.avaliacoes_os
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve proprias avaliacoes os" ON public.avaliacoes_os;
CREATE POLICY "Aluno ve proprias avaliacoes os" ON public.avaliacoes_os
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.fichas f
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE f.id = avaliacoes_os.ficha_id
        AND u.auth_id = auth.uid()
    )
  );

-- ===== ACOMPANHAMENTOS_OS =====

DROP POLICY IF EXISTS "Gestor gerencia acompanhamentos os" ON public.acompanhamentos_os;
CREATE POLICY "Gestor gerencia acompanhamentos os" ON public.acompanhamentos_os
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve proprios acompanhamentos os" ON public.acompanhamentos_os;
CREATE POLICY "Aluno ve proprios acompanhamentos os" ON public.acompanhamentos_os
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.fichas f
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE f.id = acompanhamentos_os.ficha_id
        AND u.auth_id = auth.uid()
    )
  );

COMMIT;

-- =============================================================
-- 5. RPC criar_ficha atualizada:
--    - aceita os 4 tipos
--    - arquiva anterior SOMENTE para treino/dieta
--    - eventos clinicos nascem com status 'ativa' (ilimitados)
-- =============================================================

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

-- =============================================================
-- 6. RPC atomica: cria ficha (OS) + detalhe da avaliacao
-- =============================================================

CREATE OR REPLACE FUNCTION public.criar_avaliacao_os(p_user_id uuid, p_dados jsonb)
RETURNS public.avaliacoes_os
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ficha public.fichas;
  v_os    public.avaliacoes_os;
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem registrar avaliacoes';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  INSERT INTO public.fichas (user_id, nome, tipo, status)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_dados->>'nome'), ''), 'Avaliação Física - ' || to_char(now(), 'DD/MM/YYYY')),
    'avaliacao',
    'ativa'
  )
  RETURNING * INTO v_ficha;

  INSERT INTO public.avaliacoes_os (
    ficha_id, anamnese, perimetros, composicao,
    flexibilidade_forca, objetivo, peso, altura
  ) VALUES (
    v_ficha.id,
    COALESCE(p_dados->>'anamnese', ''),
    COALESCE(p_dados->'perimetros', '{}'::jsonb),
    COALESCE(p_dados->'composicao', '{}'::jsonb),
    COALESCE(p_dados->>'flexibilidade_forca', ''),
    COALESCE(p_dados->>'objetivo', ''),
    COALESCE((p_dados->>'peso')::real, 0),
    COALESCE((p_dados->>'altura')::real, 0)
  )
  RETURNING * INTO v_os;

  RETURN v_os;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_avaliacao_os(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_avaliacao_os(uuid, jsonb) TO authenticated;

-- =============================================================
-- 7. RPC atomica: cria ficha (OS) + detalhe do acompanhamento
-- =============================================================

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

  INSERT INTO public.acompanhamentos_os (ficha_id, relato, feedback, fotos, peso)
  VALUES (
    v_ficha.id,
    COALESCE(p_dados->>'relato', ''),
    COALESCE(p_dados->>'feedback', ''),
    COALESCE(p_dados->'fotos', '[]'::jsonb),
    NULLIF(p_dados->>'peso', '')::real
  )
  RETURNING * INTO v_os;

  RETURN v_os;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_acompanhamento_os(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_acompanhamento_os(uuid, jsonb) TO authenticated;

-- =============================================================
-- 8. BACKFILL: avaliacoes_fisicas (legado) -> primeira OS historica
--    Cria 1 ficha 'avaliacao' + 1 avaliacoes_os por registro antigo
--    Preservando a data original de criacao
-- =============================================================

WITH novas AS (
  INSERT INTO public.fichas (user_id, nome, tipo, status, data_criacao)
  SELECT
    a.id_cliente,
    'Avaliação Física (importada)',
    'avaliacao',
    'ativa',
    COALESCE(a.created_at, now())
  FROM public.avaliacoes_fisicas a
  RETURNING id, user_id
)
INSERT INTO public.avaliacoes_os (
  ficha_id, anamnese, perimetros, composicao,
  flexibilidade_forca, objetivo, peso, altura, created_at
)
SELECT
  n.id,
  COALESCE(a.anamnese, ''),
  COALESCE(a.perimetros, '{}'::jsonb),
  COALESCE(a.composicao, '{}'::jsonb),
  COALESCE(a.flexibilidade_forca, ''),
  COALESCE(a.objetivo, ''),
  COALESCE(a.peso, 0),
  COALESCE(a.altura, 0),
  COALESCE(a.created_at, now())
FROM public.avaliacoes_fisicas a
JOIN novas n ON n.user_id = a.id_cliente;

-- -------------------------------------------------------------
-- 9. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------

-- Tipos aceitos pela constraint:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.fichas'::regclass AND contype = 'c';

-- Indice parcial (WHERE deve incluir tipo IN ('treino','dieta')):
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'fichas';

-- Tabelas filhas criadas:
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('avaliacoes_os', 'acompanhamentos_os');
