-- =============================================================
-- MIGRACAO 029: Periodizacoes (Blocos de Treinamento dentro da ficha)
--
-- Introduz o conceito de "Periodizacao" (ex.: "High Volume", "Low Volume")
-- dentro de UMA mesma ficha de treino, voltado para a otimizacao de tempo
-- do Gestor. Cada ficha passa a ter 1..N periodizacoes; cada treino da ficha
-- pertence a exatamente uma periodizacao. O mesmo nome de treino pode
-- existir em periodizacoes diferentes da mesma ficha (unica abaixada para
-- (periodizacao_id, letra_ou_nome)).
--
-- Backfill: cria uma periodizacao "Padrao" para cada ficha existente e
-- vincula todos os treinos atuais a ela, preservando o banco sem quebra.
-- Execute este script no SQL Editor do Supabase Dashboard apos a 028.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. TABELA PERIODIZACOES
-- -------------------------------------------------------------
CREATE TABLE public.periodizacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id   uuid NOT NULL REFERENCES public.fichas(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.periodizacoes IS
  'Blocos de treinamento dentro de uma ficha. Cada treino da ficha pertence a uma periodizacao (ex.: "Padrao", "High Volume").';

CREATE INDEX idx_periodizacoes_ficha ON public.periodizacoes (ficha_id);

-- -------------------------------------------------------------
-- 2. COLUNA periodizacao_id EM treinos_ficha (nullable para backfill)
-- -------------------------------------------------------------
ALTER TABLE public.treinos_ficha
  ADD COLUMN IF NOT EXISTS periodizacao_id uuid
  REFERENCES public.periodizacoes(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.treinos_ficha.periodizacao_id IS
  'Periodizacao (bloco de treinamento) a qual o treino pertence. Apos o backfill da 029 passa a ser obrigatoria.';

CREATE INDEX IF NOT EXISTS idx_treinos_periodizacao
  ON public.treinos_ficha (periodizacao_id);

-- -------------------------------------------------------------
-- 3. BACKFILL: cria "Padrao" por ficha e vincula treinos existentes
-- -------------------------------------------------------------
DO $$
DECLARE
  f record;
  p uuid;
  v_nome text;
  v_count int;
BEGIN
  FOR f IN SELECT id FROM public.fichas LOOP
    -- Cria a periodizacao "Padrao" (garantindo unicidade caso rode 2x)
    v_nome := 'Padrao';
    SELECT p2.id INTO p
      FROM public.periodizacoes p2
     WHERE p2.ficha_id = f.id AND p2.nome = v_nome
     LIMIT 1;
    IF p IS NULL THEN
      INSERT INTO public.periodizacoes (ficha_id, nome)
      VALUES (f.id, v_nome)
      RETURNING id INTO p;
    END IF;

    -- Liga todos os treinos ainda sem periodizacao desta ficha
    UPDATE public.treinos_ficha
       SET periodizacao_id = p
     WHERE ficha_id = f.id AND periodizacao_id IS NULL;
  END LOOP;
END $$;

-- -------------------------------------------------------------
-- 4. TRAVA: periodizacao_id vira obrigatoria
-- -------------------------------------------------------------
ALTER TABLE public.treinos_ficha
  ALTER COLUMN periodizacao_id SET NOT NULL;

-- -------------------------------------------------------------
-- 5. RELAXA A RESTRICAO UNICA DE NOME
--    Antes: UNIQUE (ficha_id, letra_ou_nome) -> nao permitia o mesmo
--    nome de treino em periodizacoes diferentes da MESMA ficha.
--    Agora: UNIQUE (periodizacao_id, letra_ou_nome)
-- -------------------------------------------------------------
ALTER TABLE public.treinos_ficha
  DROP CONSTRAINT IF EXISTS treinos_ficha_ficha_id_letra_ou_nome_key;

ALTER TABLE public.treinos_ficha
  ADD CONSTRAINT treinos_ficha_periodizacao_letra_ou_nome_unique
    UNIQUE (periodizacao_id, letra_ou_nome);

-- -------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
--    Gestor: gerencia tudo. Aluno: le apenas periodizacoes da propria ficha.
-- -------------------------------------------------------------
ALTER TABLE public.periodizacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia periodizacoes" ON public.periodizacoes;
CREATE POLICY "Gestor gerencia periodizacoes" ON public.periodizacoes
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "Aluno ve periodizacoes da propria ficha" ON public.periodizacoes;
CREATE POLICY "Aluno ve periodizacoes da propria ficha" ON public.periodizacoes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.fichas f
      JOIN public.usuarios u ON u.id = f.user_id
      WHERE f.id = periodizacoes.ficha_id
        AND u.auth_id = auth.uid()
    )
  );

-- -------------------------------------------------------------
-- 7. RECRIA RPC salvar_planejamento PARA REFLETIR periodizacao_id
--    O corpo ja resolve nomes em runtime, mas recriamos para manter a
--    validacao do treino condizente (treino pertence a ficha do aluno).
--    Ve que a RPC ja valida apenas a existencia do treino; recriada para
--    nao depender da ultima definicao e garantir que a coluna nova nao
--    quebra a alocacao.
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.salvar_planejamento(uuid, jsonb, int);
DROP FUNCTION IF EXISTS public.salvar_planejamento(uuid, jsonb);

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
  item        jsonb;
  v_dia       int;
  v_treino    uuid;
  v_descanso  boolean;
  v_ordem     int;
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
        SELECT 1 FROM public.treinos_ficha t
        WHERE t.id = v_treino AND t.periodizacao_id IS NOT NULL
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
-- 8. VERIFICACAO (rode apos a migracao)
-- -------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('periodizacoes', 'treinos_ficha')
ORDER BY table_name, ordinal_position;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.treinos_ficha'::regclass AND contype = 'u';

COMMIT;