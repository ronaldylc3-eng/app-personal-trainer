-- =============================================================
-- MIGRACAO 007: Recuperacao de senha (validacao segura de e-mail)
-- RPC SECURITY DEFINER para checar existencia do e-mail na tabela
-- usuarios sem expor a tabela a usuarios anonimos (contorna RLS).
-- Execute este script no SQL Editor do Supabase Dashboard ou via CLI.
-- =============================================================

CREATE OR REPLACE FUNCTION public.check_email_exists(email_input text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE lower(email) = lower(trim(email_input))
  );
$$;

COMMENT ON FUNCTION public.check_email_exists(text) IS
  'Valida se um e-mail existe em usuarios. Usada no fluxo "Esqueceu a senha?" antes de disparar resetPasswordForEmail.';

REVOKE ALL ON FUNCTION public.check_email_exists(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated;
