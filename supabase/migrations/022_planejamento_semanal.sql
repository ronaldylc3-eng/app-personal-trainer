  -- =============================================================
  -- MIGRACAO 022: Periodizacao Semanal (Planejamento)
  -- Aloca os treinos da ficha ativa nos dias da semana (0=Domingo
  -- a 6=Sabado). Um dia pode receber VARIOS treinos e o mesmo
  -- treino pode ser usado em dias diferentes. Dias marcados como
  -- descanso ficam sem treino (treino_id NULL + is_descanso).
  -- Execute este script no SQL Editor do Supabase Dashboard
  -- =============================================================

  BEGIN;

  -- -------------------------------------------------------------
  -- 1. TABELA DE ALOCACAO SEMANAL POR ALUNO
  -- -------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.planejamento_semanal (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    dia_semana  int  NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    treino_id   uuid REFERENCES public.treinos_ficha(id) ON DELETE CASCADE,
    is_descanso boolean NOT NULL DEFAULT false,
    ordem       int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT plano_ou_descanso CHECK (
      (treino_id IS NOT NULL AND is_descanso = false)
      OR (treino_id IS NULL AND is_descanso = true)
    )
  );

  COMMENT ON TABLE public.planejamento_semanal IS
    'Periodizacao semanal: quais treinos da ficha ativa caem em cada dia. Linha com treino_id nulo = descanso (Off).';

  CREATE INDEX IF NOT EXISTS idx_planejamento_user_dia
    ON public.planejamento_semanal (user_id, dia_semana, ordem);
  CREATE INDEX IF NOT EXISTS idx_planejamento_treino
    ON public.planejamento_semanal (treino_id);

  -- -------------------------------------------------------------
  -- 2. ROW LEVEL SECURITY
  -- -------------------------------------------------------------
  ALTER TABLE public.planejamento_semanal ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Gestor gerencia planejamento" ON public.planejamento_semanal;
  CREATE POLICY "Gestor gerencia planejamento" ON public.planejamento_semanal
    FOR ALL
    USING (public.is_gestor())
    WITH CHECK (public.is_gestor());

  DROP POLICY IF EXISTS "Aluno ve proprio planejamento" ON public.planejamento_semanal;
  CREATE POLICY "Aluno ve proprio planejamento" ON public.planejamento_semanal
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = planejamento_semanal.user_id
          AND u.auth_id = auth.uid()
      )
    );

  -- -------------------------------------------------------------
  -- 3. RPC: SALVAR A SEMANA INTEIRA (atomica)
  --    p_semana = jsonb array:
  --      [{"dia": 0, "treino_id": null, "descanso": true, "ordem": 0},
  --       {"dia": 2, "treino_id": "<uuid>", "descanso": false, "ordem": 0}, ...]
  -- -------------------------------------------------------------
  DROP FUNCTION IF EXISTS public.salvar_planejamento(uuid, jsonb);

  CREATE OR REPLACE FUNCTION public.salvar_planejamento(
    p_user_id uuid,
    p_semana  jsonb
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
        INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem)
        VALUES (p_user_id, v_dia, v_treino, false, v_ordem);
      ELSIF v_descanso THEN
        INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem)
        VALUES (p_user_id, v_dia, NULL, true, 0);
      END IF;
    END LOOP;
  END;
  $$;

  REVOKE ALL ON FUNCTION public.salvar_planejamento(uuid, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.salvar_planejamento(uuid, jsonb) TO authenticated;

  COMMIT;

  -- -------------------------------------------------------------
  -- 4. VERIFICACAO (rode apos a migracao)
  -- -------------------------------------------------------------
  SELECT indexname FROM pg_indexes WHERE tablename = 'planejamento_semanal';
  SELECT proname FROM pg_proc WHERE proname = 'salvar_planejamento';
