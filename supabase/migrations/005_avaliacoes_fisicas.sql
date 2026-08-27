-- =============================================================
-- 005: Tabela avaliacoes_fisicas + RLS
-- =============================================================

-- 1. TABELA
CREATE TABLE IF NOT EXISTS avaliacoes_fisicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_cliente UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  anamnese TEXT DEFAULT '',
  perimetros JSONB DEFAULT '{}'::jsonb,
  composicao JSONB DEFAULT '{}'::jsonb,
  flexibilidade_forca TEXT DEFAULT '',
  objetivo TEXT DEFAULT '',
  peso REAL DEFAULT 0,
  altura REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_cliente ON avaliacoes_fisicas(id_cliente);

-- 2. RLS
ALTER TABLE avaliacoes_fisicas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Gestor gerencia avaliacoes" ON avaliacoes_fisicas;
DROP POLICY IF EXISTS "Aluno ve propria avaliacao" ON avaliacoes_fisicas;

CREATE POLICY "Gestor gerencia avaliacoes" ON avaliacoes_fisicas
  FOR ALL USING (public.is_gestor());

CREATE POLICY "Aluno ve propria avaliacao" ON avaliacoes_fisicas
  FOR SELECT USING (
    public.is_aluno_ativo()
    AND id_cliente IN (SELECT id FROM usuarios WHERE auth_id = auth.uid())
  );
