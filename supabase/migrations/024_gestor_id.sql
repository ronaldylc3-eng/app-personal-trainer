-- =============================================================
-- 024: Vinculo Gestor -> Aluno (gestor_id)
-- - Coluna usuarios.gestor_id apontando para o gestor responsavel.
-- - Preenche nos alunos existentes com o gestor atual.
-- - Trigger handle_new_user passa a gravar o vinculo em alunos
--   novos (gestor lido da app_config).
-- Preparacao leve para multi-gestor (sem reescrever o RLS agora).
-- Executar no SQL Editor do Supabase.
-- =============================================================

-- -------------------------------------------------------------
-- 1. COLUNA gestor_id
-- -------------------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_gestor
  ON public.usuarios (gestor_id);

-- -------------------------------------------------------------
-- 2. BACKFILL: vincula todos os alunos ao gestor atual
-- -------------------------------------------------------------
UPDATE public.usuarios
SET gestor_id = g.id
FROM (
  SELECT id FROM public.usuarios
  WHERE role = 'gestor' AND gestor_id IS NULL
  LIMIT 1
) g
WHERE public.usuarios.role = 'aluno'
  AND public.usuarios.gestor_id IS NULL;

-- -------------------------------------------------------------
-- 3. TRIGGER handle_new_user REESCRITO: grava gestor_id
-- -------------------------------------------------------------
DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
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

  INSERT INTO usuarios (
    auth_id,
    nome,
    email,
    telefone,
    cpf,
    pacote,
    genero,
    role,
    status,
    gestor_id
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
    END,
    CASE WHEN user_role = 'aluno' THEN gestor_user ELSE NULL END
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();