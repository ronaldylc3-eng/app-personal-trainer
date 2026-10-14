-- =============================================================
-- MIGRACAO 031: Tipo de Treino para Corrida no Cardio Isolado
-- Adiciona prescricoes especificas de corrida em exercicios_treino
-- (itens de categoria 'cardio'):
--   tipo_treino_corrida  -> 'regenerativo' | 'intervalado' | 'longao'
--   meta_minutos         -> meta de minutos (Regenerativo)
--   qtd_tiros            -> quantidade de tiros (Intervalado)
--   distancia_tiro       -> distancia do tiro, texto (ex.: "400m", "1km")
--   meta_distancia_corrida -> quilometragem alvo (Longao)
-- Todos os campos sao OPCIONAIS (NULL por padrao), sem impacto em
-- treinos existentes.
-- Execute este script no SQL Editor do Supabase Dashboard
-- =============================================================

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS tipo_treino_corrida text;
ALTER TABLE public.exercicios_treino
  DROP CONSTRAINT IF EXISTS exercicios_treino_tipo_treino_corrida_check;
ALTER TABLE public.exercicios_treino
  ADD CONSTRAINT exercicios_treino_tipo_treino_corrida_check
  CHECK (tipo_treino_corrida IS NULL OR tipo_treino_corrida IN ('regenerativo', 'intervalado', 'longao'));

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS meta_minutos numeric(5,1)
    CHECK (meta_minutos IS NULL OR meta_minutos > 0);

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS qtd_tiros int
    CHECK (qtd_tiros IS NULL OR qtd_tiros > 0);

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS distancia_tiro text;

ALTER TABLE public.exercicios_treino
  ADD COLUMN IF NOT EXISTS meta_distancia_corrida numeric(6,2)
    CHECK (meta_distancia_corrida IS NULL OR meta_distancia_corrida > 0);

COMMENT ON COLUMN public.exercicios_treino.tipo_treino_corrida IS
  'Tipo de treino especifico de corrida para itens de cardio: regenerativo, intervalado ou longao. Nulo para demais modalidades.';
COMMENT ON COLUMN public.exercicios_treino.meta_minutos IS
  'Meta em minutos para treinos Regenerativos de corrida.';
COMMENT ON COLUMN public.exercicios_treino.qtd_tiros IS
  'Quantidade de tiros para treinos Intervalados de corrida.';
COMMENT ON COLUMN public.exercicios_treino.distancia_tiro IS
  'Distancia de cada tiro (texto livre: "400m", "1km") para treinos Intervalados.';
COMMENT ON COLUMN public.exercicios_treino.meta_distancia_corrida IS
  'Quilometragem alvo para treinos Longao de corrida.';

-- -------------------------------------------------------------
-- VERIFICACAO
-- -------------------------------------------------------------
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'exercicios_treino'
ORDER BY ordinal_position;
