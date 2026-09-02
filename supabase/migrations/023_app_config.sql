-- =============================================================
-- 023: Configuracao do app — e-mail do Gestor (Admin)
-- - Tabela singleton app_config com o e-mail que recebe role
--   'gestor' na criacao da conta (trigger handle_new_user).
-- - Sem email hardcoded na trigger: basta atualizar a tabela
--   para trocar o gestor:
--     UPDATE app_config SET gestor_email = 'novo@email.com' WHERE id = true;
-- Executar no SQL Editor do Supabase.
-- =============================================================

-- -------------------------------------------------------------
-- 1. TABELA SINGLETON app_config
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_config (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id), -- singleton
  gestor_email text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Valor inicial: gestor atual do sistema.
INSERT INTO public.app_config (gestor_email)
VALUES ('ronaldylc3@gmail.com')
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 2. ROW LEVEL SECURITY (so o gestor le/edita a configuracao;
--    a trigger e SECURITY DEFINER e independe de RLS)
-- -------------------------------------------------------------
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor le configuracao" ON public.app_config;
CREATE POLICY "Gestor le configuracao" ON public.app_config
  FOR SELECT
  USING (public.is_gestor());

DROP POLICY IF EXISTS "Gestor gerencia configuracao" ON public.app_config;
CREATE POLICY "Gestor gerencia configuracao" ON public.app_config
  FOR ALL
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

-- -------------------------------------------------------------
-- 3. TRIGGER handle_new_user REESCRITO: le o gestor da tabela
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role    TEXT;
  gestor_email TEXT;
BEGIN
  -- =========================================================
  -- CONDICAO DE SEGURANCA: E-mail do Gestor (Admin)
  -- Lido da tabela app_config (configuravel, sem hardcode).
  -- =========================================================
  SELECT gestor_email INTO gestor_email
  FROM public.app_config
  WHERE id = true;

  IF NEW.email = gestor_email THEN
    user_role := 'gestor';
  ELSE
    user_role := 'aluno';
  END IF;

  INSERT INTO usuarios (
    auth_id,
    nome,
    email,
    telefone,
    cpf,
    pacote,
    genero,
    role,
    status
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
    COALESCE(NEW.raw_user_meta_data->>'pacote', 'treino'),
    NULLIF(NEW.raw_user_meta_data->>'genero', ''),
    user_role,
    CASE
      WHEN NEW.email_confirmed_at IS NOT NULL THEN 'ativo'
      ELSE 'pendente'
    END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();