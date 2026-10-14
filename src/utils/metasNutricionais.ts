import type { MetasNutricionais, MetasPorDia } from '../types';

/**
 * Resolve as metas efetivas do dia corrente.
 * - Se o ciclo estiver ATIVADO e houver configuracao especifica para `diaSemana`
 *   (0=Dom..6=Sab), os valores de kcal/carb/prot/gord do dia sobrescrevem a Meta Base.
 * - Caso contrario, retorna a Meta Base (fibras sempre vem da base).
 */
export function resolverMetasDoDia(
  metas: MetasNutricionais,
  basePadrao: NonNullable<MetasNutricionais>,
  diaSemana: number,
): { efetivas: NonNullable<MetasNutricionais>; diaTemMetaEspecifica: boolean } {
  const base = metas ?? basePadrao;
  const chave = String(diaSemana) as keyof MetasPorDia;
  const dia = base.is_ciclo_ativado ? base.metas_por_dia?.[chave] : null;
  const diaTemMetaEspecifica = !!(
    dia &&
    (dia.kcal != null || dia.carb != null || dia.prot != null || dia.gord != null)
  );

  return {
    efetivas: {
      meta_kcal: dia?.kcal ?? (base.meta_kcal || basePadrao.meta_kcal),
      meta_proteina: dia?.prot ?? (base.meta_proteina || basePadrao.meta_proteina),
      meta_carbo: dia?.carb ?? (base.meta_carbo || basePadrao.meta_carbo),
      meta_gordura: dia?.gord ?? (base.meta_gordura || basePadrao.meta_gordura),
      meta_fibra: base.meta_fibra || basePadrao.meta_fibra,
    },
    diaTemMetaEspecifica,
  };
}