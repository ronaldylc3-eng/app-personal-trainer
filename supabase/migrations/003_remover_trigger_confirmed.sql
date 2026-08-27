-- =============================================================
-- MIGRACAO: Remover trigger de auto-ativacao por email_confirmed
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- O trigger anterior auto-ativava o usuario quando o Supabase
-- confirmava o email (inviteUserByEmail faz isso automaticamente).
-- Isso fazia o aluno pular a tela de definicao de senha.
-- Agora a ativacao e feita no Frontend apos o aluno definir a senha.

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
DROP FUNCTION IF EXISTS handle_user_confirmed() CASCADE;
