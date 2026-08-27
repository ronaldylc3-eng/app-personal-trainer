-- =============================================================
-- 020: Gênero do aluno (agrupamento muscular dinâmico)
-- - Coluna genero em usuarios ('masculino' | 'feminino').
-- - Recria o trigger handle_new_user copiando genero dos
--   metadados do convite (edge function invite-aluno).
-- Executar no SQL Editor do Supabase.
-- =============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS genero TEXT
  CHECK (genero IS NULL OR genero IN ('masculino', 'feminino'));

DROP FUNCTION IF EXISTS handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- =========================================================
  -- CONDICAO DE SEGURANCA: E-mail do Gestor (Admin)
  -- =========================================================
  IF NEW.email = 'ronaldylc3@gmail.com' THEN
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
