-- =============================================================
-- MIGRACAO 033: Trava de movimentacao de treinos JÁ CONCLUÍDOS
-- na semana corrente (Segunda a Domingo, fuso America/Sao_Paulo).
--
-- O salvar_planejamento agora valida o NOVO layout contra o vigente:
-- todo treino que já possui sessão finalizada nesta semana (treino_id
-- presente em logs_treino dentro da janela Seg-Dom SP) fica travado —
-- ele não pode ser removido do calendário nem movido para outro dia.
-- Dia/ordem iguais passam; mexer no treino concluído derruba o save
-- inteiro com mensagem amigável (frontend espelha isso no DnD).
--
-- Ordem de aplicação: rodou 022 e 029/028 antes (salvar_planejamento
-- com 3º argumento p_meta_cardio). Execute este script no SQL Editor.
-- =============================================================

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
  item          jsonb;
  v_dia         int;
  v_treino      uuid;
  v_descanso    boolean;
  v_ordem       int;
  -- Janela da semana corrente em America/Sao_Paulo (SP-local, sem tz)
  semana_inicio timestamp;
  semana_fim    timestamp;
  -- Treinos concluídos nesta semana: id -> dias atuais (ordem do payload salvo)
  v_concluidos  jsonb := '{}'::jsonb;
  -- Treinos no NOVO layout: id -> lista de dias (ordem de iteracao do payload)
  v_novos       jsonb := '{}'::jsonb;
  v_old_days    int[];
  v_new_days    int[];
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

  -- -----------------------------------------------------------
  -- 1. Janela da semana corrente (Segunda 00:00:00 -> Domingo
  --    23:59:59.999999), expressa em hora local de Sao Paulo.
  -- -----------------------------------------------------------
  semana_inicio := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'));
  semana_fim    := semana_inicio + interval '7 days' - interval '1 microsecond';

  -- -----------------------------------------------------------
  -- 2. Snapshot dos dias ocupados nesta semana por treinos
  --    concluidos (sessao em logs_treino na janela SP).
  -- -----------------------------------------------------------
  SELECT COALESCE(jsonb_object_agg(sub.treino_id::text, to_jsonb(sub.dias)), '{}'::jsonb)::jsonb
  INTO v_concluidos
  FROM (
    SELECT ps.treino_id,
           array_agg(ps.dia_semana ORDER BY ps.ordem) AS dias
    FROM public.planejamento_semanal ps
    WHERE ps.user_id = p_user_id
      AND ps.treino_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.logs_treino lt
        WHERE lt.treino_id = ps.treino_id
          AND lt.user_id = p_user_id
          AND (lt.data_execucao AT TIME ZONE 'America/Sao_Paulo')
              BETWEEN semana_inicio AND semana_fim
      )
    GROUP BY ps.treino_id
  ) sub;

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
      -- Acumula o dia no novo layout (ordem de iteracao = dia/ordem do payload)
      v_novos := jsonb_set(
        v_novos,
        ARRAY[v_treino::text],
        COALESCE(
          v_novos -> v_treino::text,
          '[]'::jsonb
        ) || jsonb_build_array(v_dia)
      );
      INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem, meta_cardio_semanal)
      VALUES (p_user_id, v_dia, v_treino, false, v_ordem, p_meta_cardio);
    ELSIF v_descanso THEN
      INSERT INTO public.planejamento_semanal (user_id, dia_semana, treino_id, is_descanso, ordem, meta_cardio_semanal)
      VALUES (p_user_id, v_dia, NULL, true, 0, p_meta_cardio);
    END IF;
  END LOOP;

  -- -----------------------------------------------------------
  -- 3. VALIDACAO: treino concluido na semana nao pode sumir nem
  --    mudar de dia. Lista de dias do novo layout precisa ser
  --    IDENTICA a lista vigente (mesma ordem) — remover/mover/
  --    trocar a ordem entre dias derruba o save.
  -- -----------------------------------------------------------
  FOR v_treino IN SELECT key::uuid FROM jsonb_object_keys(v_concluidos)
  LOOP
    IF NOT v_novos ? v_treino::text THEN
      RAISE EXCEPTION 'Treino ja concluido nesta semana nao pode ser removido do planejamento. O ciclo reseta toda segunda-feira.';
    END IF;

    v_old_days := ARRAY(
      SELECT t::int
      FROM jsonb_array_elements_text(v_concluidos -> v_treino::text) AS t
    );
    v_new_days := ARRAY(
      SELECT t::int
      FROM jsonb_array_elements_text(v_novos -> v_treino::text) AS t
    );

    IF v_new_days IS DISTINCT FROM v_old_days THEN
      RAISE EXCEPTION 'Treino ja foi concluido nesta semana e nao pode mudar de dia nem de posicao. O ciclo reseta toda segunda-feira.';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_planejamento(uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_planejamento(uuid, jsonb, int) TO authenticated;

COMMENT ON FUNCTION public.salvar_planejamento(uuid, jsonb, int) IS
  'Salva a periodizacao semanal atômica. Treinos com sessao finalizada na semana corrente (Seg-Dom, America/Sao_Paulo) ficam travados: nao podem ser removidos nem movidos de dia.';

-- -------------------------------------------------------------
-- VERIFICACAO (rode apos a migracao):
--   SELECT pg_get_functiondef(oid)
--   FROM pg_proc WHERE proname = 'salvar_planejamento';
-- -------------------------------------------------------------