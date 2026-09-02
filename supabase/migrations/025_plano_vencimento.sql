-- =============================================================
-- 025: Plano / Vencimento (renovacao mensal)
-- - Colunas usuarios.plano_inicio e usuarios.plano_vencimento (date).
-- - Backfill para alunos existentes: inicio = created_at (fuso SP),
--   vencimento = inicio + 30 dias.
-- - Trigger handle_new_user grava o plano de alunos novos.
-- - RPC renovar_plano(p_user_id): estende +30 dias a partir de
--   hoje (ou mantendo vigencia corrente se ainda valida).
-- Executar no SQL Editor do Supabase.
-- =============================================================

-- -------------------------------------------------------------
-- 1. COLUNAS DO PLANO MENSAL
-- -------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS plano_inicio    date;
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS plano_vencimento date;

-- -------------------------------------------------------------
-- 2. BACKFILL dos alunos existentes (mensal, baseado no cadastro)
-- -------------------------------------------------------------
UPDATE public.usuarios
SET plano_inicio    = (created_at AT TIME ZONE 'America/Sao_Paulo')::date,
    plano_vencimento = ((created_at AT TIME ZONE 'America/Sao_Paulo')::date + 30)
WHERE role = 'aluno'
  AND (plano_inicio IS NULL OR plano_vencimento IS NULL);

-- -------------------------------------------------------------
-- 3. TRIGGER handle_new_user REESCRITO: grava gestor_id + plano
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
SET search_path = public
AS $$
DECLARE
  user_role    TEXT;
  gestor_email TEXT;
  gestor_user  uuid;
BEGIN
  -- =========================================================
  -- CONDICAO DE SEGURANCA: E-mail do Gestor (Admin)
  -- Lido da tabela app_config (configuravel, sem hardcode).
  -- =========================================================
  SELECT c.gestor_email, g.id
    INTO gestor_email, gestor_user
  FROM public.app_config c
  CROSS JOIN LATERAL (
    SELECT u.id FROM public.usuarios u
    WHERE u.email = c.gestor_email
    LIMIT 1
  ) g
  WHERE c.id = true;

  IF NEW.email = gestor_email THEN
    user_role := 'gestor';
  ELSE
    user_role := 'aluno';
  END IF;

  INSERT INTO public.usuarios (
    auth_id,
    nome,
    email,
    telefone,
    cpf,
    pacote,
    genero,
    role,
    status,
    gestor_id,
    plano_inicio,
    plano_vencimento
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'nome',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'telefone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'pacote', ''), 'Premium'),
    NULLIF(NEW.raw_user_meta_data->>'genero', ''),
    user_role,
    CASE
      WHEN NEW.email_confirmed_at IS NOT NULL THEN 'ativo'
      ELSE 'pendente'
    END,
    CASE WHEN user_role = 'aluno' THEN gestor_user ELSE NULL END,
    CASE WHEN user_role = 'aluno' THEN (now() AT TIME ZONE 'America/Sao_Paulo')::date ELSE NULL END,
    CASE WHEN user_role = 'aluno' THEN ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 30) ELSE NULL END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------------
-- 4. RPC renovar_plano: estende a vigencia do plano do aluno
--    Regra de negocios: se o plano ainda e valido, soma 30 dias
--    ao vencimento atual; se ja venceu, conta 30 dias a partir
--    de hoje. O inicio nunca retrocede.
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.renovar_plano(uuid);
CREATE OR REPLACE FUNCTION public.renovar_plano(p_user_id uuid)
RETURNS public.usuarios
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_aluno public.usuarios;
BEGIN
  IF NOT public.is_gestor() THEN
    RAISE EXCEPTION 'Apenas gestores podem renovar planos';
  END IF;

  UPDATE public.usuarios
  SET plano_inicio    = LEAST(COALESCE(plano_inicio, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
                              (now() AT TIME ZONE 'America/Sao_Paulo')::date),
      plano_vencimento = GREATEST(COALESCE(plano_vencimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date),
                                  (now() AT TIME ZONE 'America/Sao_Paulo')::date) + 30,
      updated_at      = now()
  WHERE id = p_user_id AND role = 'aluno'
  RETURNING * INTO v_aluno;

  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'Aluno nao encontrado';
  END IF;

  RETURN v_aluno;
END;
$$;

REVOKE ALL ON FUNCTION public.renovar_plano(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_plano(uuid) TO authenticated;