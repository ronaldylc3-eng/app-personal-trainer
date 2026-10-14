-- =============================================================
-- MIGRACAO 032: Flag de Cardio Isolado em treinos_ficha
-- O Cardio Isolado continua sendo um "Treino" (calendario/planejamento
-- semanais intactos), mas para o aluno a UI o trata como UM UNICO
-- EXERCICIO de acao direta (bypass da listagem de exercicios).
-- =============================================================

BEGIN;

-- 1. FLAG NO REGISTRO PRINCIPAL
ALTER TABLE public.treinos_ficha
  ADD COLUMN IF NOT EXISTS is_cardio_isolado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.treinos_ficha.is_cardio_isolado IS
  'Marcador de Cardio Isolado: treino tratado como um unico exercicio de acao direta na fila do aluno (INICIAR abre o modal de cardio imediatamente).';

-- 2. BACKFILL: treinos existentes compostos 100% por cardio passam a ser
-- reconhecidos como Cardio Isolado (cobre os dados ja cadastrados antes
-- desta flag existir). Treinos sem exercicios nao sao marcados.
UPDATE public.treinos_ficha t
   SET is_cardio_isolado = true
 WHERE t.is_cardio_isolado = false
   AND EXISTS (
     SELECT 1 FROM public.exercicios_treino e
      WHERE e.treino_id = t.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.exercicios_treino e
      WHERE e.treino_id = t.id
        AND e.categoria <> 'cardio'
   );

COMMIT;