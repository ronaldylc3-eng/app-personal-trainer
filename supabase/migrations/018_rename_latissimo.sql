-- =============================================================
-- 018: Renomeia o micro-grupo "Costa (Latíssimo do dorso)"
--      para "Latíssimo do Dorso" (padrão dos demais rótulos).
-- Executar no SQL Editor do Supabase.
-- =============================================================

UPDATE exercicios_treino
SET grupo_muscular = 'Latíssimo do Dorso'
WHERE grupo_muscular = 'Costa (Latíssimo do dorso)';
