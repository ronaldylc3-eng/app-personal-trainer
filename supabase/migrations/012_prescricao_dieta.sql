  -- =============================================================
  -- MIGRACAO 012: Prescricao de Dieta (cardapio estruturado)
  -- Fluxo: fichas (tipo='dieta') -> (N) refeicoes_dieta
  -- Gestor prescreve; aluno apenas le. Idempotente.
  -- Execute este script no SQL Editor do Supabase Dashboard
  -- =============================================================

  -- -------------------------------------------------------------
  -- 1. TABELA
  -- -------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS public.refeicoes_dieta (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ficha_id            uuid NOT NULL REFERENCES public.fichas(id) ON DELETE CASCADE,
    nome_refeicao       text NOT NULL,
    descricao_alimentos text NOT NULL DEFAULT '',
    horario             text,
    ordem               int  NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
  );

  COMMENT ON TABLE public.refeicoes_dieta IS
    'Cardapio prescrito pelo gestor em uma ficha de dieta. Aluno tem acesso somente leitura.';

  CREATE INDEX IF NOT EXISTS idx_refeicoes_dieta_ficha
    ON public.refeicoes_dieta (ficha_id, ordem);

  -- -------------------------------------------------------------
  -- 2. ROW LEVEL SECURITY
  -- -------------------------------------------------------------
  ALTER TABLE public.refeicoes_dieta ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Gestor gerencia refeicoes da dieta" ON public.refeicoes_dieta;
  CREATE POLICY "Gestor gerencia refeicoes da dieta" ON public.refeicoes_dieta
    FOR ALL
    USING (public.is_gestor())
    WITH CHECK (public.is_gestor());

  DROP POLICY IF EXISTS "Aluno ve refeicoes da propria ficha" ON public.refeicoes_dieta;
  CREATE POLICY "Aluno ve refeicoes da propria ficha" ON public.refeicoes_dieta
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.fichas f
        JOIN public.usuarios u ON u.id = f.user_id
        WHERE f.id = refeicoes_dieta.ficha_id
          AND u.auth_id = auth.uid()
      )
    );

  -- -------------------------------------------------------------
  -- 3. VERIFICACAO (rode apos a migracao)
  -- -------------------------------------------------------------

  -- Policies criadas (esperado: 2):
  SELECT policyname, cmd FROM pg_policies WHERE tablename = 'refeicoes_dieta';

  -- FK apontando para fichas (esperado: refeicoes_dieta_ficha_id_fkey):
  SELECT conrelid::regclass AS tabela_origem, conname
  FROM pg_constraint
  WHERE contype = 'f' AND confrelid = 'public.fichas'::regclass;
