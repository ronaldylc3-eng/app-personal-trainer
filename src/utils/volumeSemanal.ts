// =============================================================
// Volume muscular semanal (séries de trabalho por MÚSCULO PRINCIPAL)
// Lógica compartilhada entre a Progressão do Aluno e do Gestor.
// =============================================================

import type { SessaoComProgresso } from '../types';
import { resolverChaveGrafico, ordemGrupos, OUTROS } from './muscleGroups';

export interface VolumePrincipal {
  principal: string;
  total: number;
}

export interface VolumeSemanal {
  ini: Date;
  fim: Date;
  lista: VolumePrincipal[];
  totalGeral: number;
}

function dataLocalDe(valor: string): Date {
  if (valor.includes('T')) {
    const d = new Date(valor);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(valor);
}

function inicioDaSemana(base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

export function rangeSemana(offset: number): { ini: Date; fim: Date } {
  const ini = inicioDaSemana(new Date());
  ini.setDate(ini.getDate() - offset * 7);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 6);
  return { ini, fim };
}

export function rotuloSemana(ini: Date, fim: Date): string {
  const fmtMes = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const mesmoMes = ini.getMonth() === fim.getMonth();
  return `${ini.getDate()}${mesmoMes ? '' : ` ${fmtMes(ini)}`} – ${fim.getDate()} ${fmtMes(fim)}`;
}

// Chave de agrupamento DINÂMICA por gênero: usa a porção (grupo_muscular)
// quando existe; senão o musculo_principal salvo; senão "Outros".
// Regras: masculino divide Braços / unifica Pernas; feminino o inverso.
function grupoDe(
  ex: { musculo_principal?: string | null; grupo_muscular?: string | null },
  genero?: string | null
): string {
  return resolverChaveGrafico(ex.musculo_principal, ex.grupo_muscular, genero);
}

export function agregarVolumeSemanal(
  sessoes: SessaoComProgresso[],
  semanaOffset: number,
  genero?: string | null
): VolumeSemanal {
  const { ini, fim } = rangeSemana(semanaOffset);
  const porPrincipal = new Map<string, number>();
  let totalGeral = 0;

  for (const s of sessoes) {
    const d = dataLocalDe(s.data_execucao);
    if (d < ini || d > fim) continue;
    for (const ex of s.series || []) {
      // Séries de trabalho = válidas (fora do aquecimento)
      const validas = ex.itens.filter(i => i.valida).length;
      if (!validas) continue;
      const principal = grupoDe(ex, genero);
      porPrincipal.set(principal, (porPrincipal.get(principal) || 0) + validas);
      totalGeral += validas;
    }
  }

  const ordem = ordemGrupos(genero);
  const ordemIdx = (g: string) => {
    const i = ordem.indexOf(g);
    return i >= 0 ? i : ordem.length; // grupos fora da ordem ficam por último
  };

  const lista: VolumePrincipal[] = [...porPrincipal.entries()]
    .map(([principal, total]) => ({ principal, total }))
    .sort((a, b) => ordemIdx(a.principal) - ordemIdx(b.principal));

  return { ini, fim, lista, totalGeral };
}

export { OUTROS };
