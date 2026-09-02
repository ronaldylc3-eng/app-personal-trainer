-- =============================================================
-- MIGRACAO 028: Cardio Isolado como Treino Dinamico (execucao livre)
--
-- 1. Meta Semanal Global de Cardio
--    A meta semanal de cardio (em minutos) deixa de derivar apenas da
--    soma dos metaTempoMin alocados na ficha e passa a poder ser definida
--    explicitamente pelo Gestor, atrelada ao PLANEJAMENTO SEMANAL do aluno
--    (planejamento_semanal.meta_cardio_semanal).
--
-- 2. Registro flexivel de cardio fora da ficha ("Cardio Isolado Livre")
--    O aluno pode registrar cardio avulso em qualquer dia, sem depender de
--    uma ficha fixa. Para isso:
--      - logs_treino.treino_id vira opcional (sessao de cardio livre tem
--        treino_id NULL);
--      - logs_cardio.exercicio_id vira opcional e ganha user_id + nome_cardio
--        (para registros sem exercicio da ficha);
--      - RLS de logs_cardio passa a ser baseada em user_id (compativel com
--        registros de ficha e registros livres).
-- Execute este script no SQL Editor do Supabase Dashboard apos a 027.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. META SEMANAL DE CARDIO NO PLANEJAMENTO
-- -------------------------------------------------------------
ALTER TABLE public.planejamento_semanal
  ADD COLUMN IF NOT EXISTS meta_cardio_semanal int
    CHECK (meta_cardio_semanal IS NULL OR meta_cardio_semanal >= 0);

COMMENT ON COLUMN public.planejamento_semanal.meta_cardio_semanal IS
  'Meta semanal global de cardio em minutos (>=0). Nulo ou 0 = nao definida (usa fallback derivado da ficha).';

-- RPC: passa a persistir meta_cardio_semanal em todas as linhas do aluno
-- (a meta e lida da primeira linha de qualquer consulta).
DROP FUNCTION IF EXISTS public.salvar_planejamento(uuid, jsonb, int);

CREATE OR REPLACE FUNCTION public.salvar_planejamento(
  p_user_id     uuid,
  p_semana      jsonb,
  p_meta_cardio int DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  v_dia int;
  v_treino uuid;
  v_descanso boolean;
  v_ordem int;
BEGIN
  IF NOT public.is_gestor() AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_user_id AND u.auth_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Apenas o gestor ou o proprio aluno podem salvar o planejamento';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  IF p_semana IS NULL OR jsonb_typeof(p_semana) <> 'array' THEN
    RAISE EXCEPTION 'p_semana deve ser um array jsonb';
  END IF;

  IF p_meta_cardio IS NOT NULL AND p_meta_cardio < 0 THEN
    RAISE EXCEPTION 'meta_cardio_semanal nao pode ser negativa';
  END IF;

  DELETE FROM public.planejamento_semanal WHERE user_id = p_user_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_semana)
  LOOP
    v_dia := (item ->> 'dia')::int;
    v_treino := NULLIF(item ->> 'treino_id', '')::uuid;
    v_descanso := COALESCE((item ->> 'descanso')::boolean, false);
    v_ordem := COALESCE((item ->> 'ordem')::int, 0);

    IF v_dia IS NULL OR v_dia < 0 OR v_dia > 6 THEN
      RAISE EXCEPTION 'dia invalido no planejamento: %', v_dia;
    END IF;

    IF v_treino IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.treinos_ficha t WHERE t.id = v_treino
      ) THEN
        RAISE EXCEPTION 'Treino % nao encontrado', v_treino;
      END IF;
      INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem, meta_cardio_semanal)
      VALUES (p_user_id, v_dia, v_treino, false, v_ordem, p_meta_cardio);
    ELSIF v_descanso THEN
      INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem, meta_cardio_semanal)
      VALUES (p_user_id, v_dia, NULL, true, 0, p_meta_cardio);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_planejamento(uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_planejamento(uuid, jsonb, int) TO authenticated;

-- -------------------------------------------------------------
-- 2. LOGS_TREINO: treino_id vira opcional (cardio livre)
-- -------------------------------------------------------------
ALTER TABLE public.logs_treino
  DROP CONSTRAINT IF EXISTS logs_treino_treino_id_fkey;

ALTER TABLE public.logs_treino
  ALTER COLUMN treino_id DROP NOT NULL;

ALTER TABLE public.logs_treino
  ADD CONSTRAINT logs_treino_treino_id_fkey
    FOREIGN KEY (treino_id) REFERENCES public.treinos_ficha(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.logs_treino.treino_id IS
  'Treino da ficha executado. NULL para registros avulsos de Cardio Isolado Livre.';

-- -------------------------------------------------------------
-- 3. LOGS_CARDIO: exercicio_id opcional + user_id + nome_cardio
-- -------------------------------------------------------------
ALTER TABLE public.logs_cardio
  DROP CONSTRAINT IF EXISTS logs_cardio_exercicio_id_fkey;

ALTER TABLE public.logs_cardio
  ALTER COLUMN exercicio_id DROP NOT NULL;

ALTER TABLE public.logs_cardio
  ADD CONSTRAINT logs_cardio_exercicio_id_fkey
    FOREIGN KEY (exercicio_id) REFERENCES public.exercicios_treino(id) ON DELETE SET NULL;

ALTER TABLE public.logs_cardio
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE;

ALTER TABLE public.logs_cardio
  ADD COLUMN IF NOT EXISTS nome_cardio text;

COMMENT ON COLUMN public.logs_cardio.exercicio_id IS
  'Exercicio de cardio da ficha. NULL para registros avulsos de Cardio Isolado Livre.';
COMMENT ON COLUMN public.logs_cardio.user_id IS
  'Aluno dono do registro de cardio (essencial para registros livres, sem ficha).';
COMMENT ON COLUMN public.logs_cardio.nome_cardio IS
  'Modalidade/nome registrada manualmente pelo aluno em Cardio Isolado Livre.';

CREATE INDEX IF NOT EXISTS idx_logs_cardio_user
  ON public.logs_cardio (user_id, data_treino DESC);

-- -------------------------------------------------------------
-- 4. RLS DE LOGS_CARDIO (baseada em user_id)
--    Regras:
--      - Gestor: gerencia tudo (todas as linhas).
--      - Aluno: ve/insere/atualiza apenas os proprios registros.
--        Quando o registro referencia um exercicio da ficha (exercicio_id
--        nao nulo), exige-se que a ficha esteja ativa; registros livres
--        (exercicio_id nulo) sao sempre permitidos para o proprio aluno.
-- -------------------------------------------------------------
ALTER TABLE public.logs_cardio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia logs de cardio" ON public.logs_cardio;
CREATE POLICY "Gestor gerencia logs de cardio" ON public.logs_cardio
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve proprios logs de cardio" ON public.logs_cardio;
CREATE POLICY "Aluno ve proprios logs de cardio" ON public.logs_cardio
  FOR SELECT
  USING (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_cardio.user_id
        AND u.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Aluno insere logs de cardio na propria ficha ativa" ON public.logs_cardio;
CREATE POLICY "Aluno insere logs de cardio na propria ficha ativa" ON public.logs_cardio
  FOR INSERT
  WITH CHECK (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_cardio.user_id
        AND u.auth_id = auth.uid()
        AND (
          logs_cardio.exercicio_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.exercicios_treino e
            JOIN public.treinos_ficha t ON t.id = e.treino_id
            JOIN public.fichas f ON f.id = t.ficha_id
            WHERE e.id = logs_cardio.exercicio_id
              AND f.user_id = logs_cardio.user_id
              AND f.status = 'ativa'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Aluno atualiza logs de cardio na propria ficha ativa" ON public.logs_cardio;
CREATE POLICY "Aluno atualiza logs de cardio na propria ficha ativa" ON public.logs_cardio
  FOR UPDATE
  USING (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_cardio.user_id
        AND u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_gestor()
    OR EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = logs_cardio.user_id
        AND u.auth_id = auth.uid()
        AND (
          logs_cardio.exercicio_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.exercicios_treino e
            JOIN public.treinos_ficha t ON t.id = e.treino_id
            JOIN public.fichas f ON f.id = t.ficha_id
            WHERE e.id = logs_cardio.exercicio_id
              AND f.user_id = logs_cardio.user_id
              AND f.status = 'ativa'
          )
        )
    )
  );

COMMIT;

-- -------------------------------------------------------------
-- 5. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('planejamento_semanal', 'logs_cardio', 'logs_treino')
ORDER BY table_name, ordinal_position;
