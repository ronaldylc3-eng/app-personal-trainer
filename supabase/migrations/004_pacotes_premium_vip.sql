-- =============================================================
-- MIGRACAO 004: Pacotes Premium/VIP + RLS de treinos
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

-- 0. Recriar helper functions (podem ter sido dropadas por CASCADE)
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_id = auth.uid() AND role = 'gestor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_aluno_ativo()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE auth_id = auth.uid() AND role = 'aluno' AND status = 'ativo'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 1. Remover TODAS as check constraints da coluna pacote
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT conname FROM pg_constraint 
    WHERE conrelid = 'usuarios'::regclass 
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pacote%'
  LOOP
    EXECUTE format('ALTER TABLE usuarios DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2. Migrar dados
UPDATE usuarios SET pacote = 'Premium' WHERE pacote NOT IN ('Premium', 'VIP');

-- 3. Constraint nova
ALTER TABLE usuarios ADD CONSTRAINT usuarios_pacote_check CHECK (pacote IN ('Premium', 'VIP'));
ALTER TABLE usuarios ALTER COLUMN pacote SET DEFAULT 'Premium';

-- 4. Drop policies antigas
DROP POLICY IF EXISTS "Aluno atualiza proprias series realizadas" ON series_realizadas;

-- 5. Nova policy de UPDATE
CREATE POLICY "Aluno atualiza apenas cargas e reps" ON series_realizadas
  FOR UPDATE USING (
    public.is_aluno_ativo()
    AND id_sessao IN (
      SELECT s.id FROM sessoes_realizadas s
      JOIN usuarios u ON s.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_aluno_ativo()
    AND id_sessao IN (
      SELECT s.id FROM sessoes_realizadas s
      JOIN usuarios u ON s.id_cliente = u.id
      WHERE u.auth_id = auth.uid()
    )
  );

-- 6. Trigger para restricao de colunas
DROP FUNCTION IF EXISTS restrict_aluno_series_update() CASCADE;
CREATE OR REPLACE FUNCTION restrict_aluno_series_update()
RETURNS TRIGGER AS $$
BEGIN
  IF public.is_gestor() THEN
    RETURN NEW;
  END IF;

  IF public.is_aluno_ativo() THEN
    NEW.id_sessao := OLD.id_sessao;
    NEW.id_prescricao := OLD.id_prescricao;
    NEW.id_serie_prevista := OLD.id_serie_prevista;
    NEW.num_serie := OLD.num_serie;
    NEW.registrado_em := OLD.registrado_em;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_restrict_aluno_series ON series_realizadas;
CREATE TRIGGER trg_restrict_aluno_series
  BEFORE UPDATE ON series_realizadas
  FOR EACH ROW
  EXECUTE FUNCTION restrict_aluno_series_update();
