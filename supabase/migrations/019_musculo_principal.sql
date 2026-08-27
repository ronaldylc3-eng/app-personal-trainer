-- =============================================================
-- 019: Músculo Principal + Porção/Detalhe
-- - Nova coluna musculo_principal em exercicios_treino.
-- - grupo_muscular passa a significar a PORÇÃO específica
--   (ex.: 'Trapézio'), e musculo_principal o consolidado
--   (ex.: 'Costas') usado nos gráficos de séries válidas.
-- - Backfill deriva o principal do rótulo atual da porção.
-- Executar no SQL Editor do Supabase.
-- =============================================================

ALTER TABLE exercicios_treino ADD COLUMN IF NOT EXISTS musculo_principal TEXT;

UPDATE exercicios_treino SET musculo_principal = CASE
  WHEN grupo_muscular IN (
    'Latíssimo do Dorso', 'Costa (Latíssimo do dorso)',
    'Trapézio', 'Lombar', 'Romboides'
  ) THEN 'Costas'
  WHEN grupo_muscular IN ('Peito', 'Peitoral Maior', 'Peitoral Menor') THEN 'Peito'
  WHEN grupo_muscular IN (
    'Quadríceps', 'Posterior de Perna', 'Glúteos', 'Panturrilha', 'Isquiotibiais'
  ) THEN 'Pernas'
  WHEN grupo_muscular IN ('Bíceps', 'Tríceps', 'Antebraço') THEN 'Braços'
  WHEN grupo_muscular IN ('Ombro', 'Ombros', 'Deltoide', 'Deltoides') THEN 'Ombros'
  ELSE COALESCE(NULLIF(TRIM(grupo_muscular), ''), 'Outros')
END;
