import type { SessaoHistorico } from '../types';

export const DIA_MS = 86400000;

export const fmtSP = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function hojeStr(): string {
  return fmtSP.format(new Date());
}

export interface Consistencia {
  streak: number;
  semana: { letra: string; feito: boolean }[];
  naSemana: number;
}

export function calcularConsistencia(sessoes: SessaoHistorico[]): Consistencia {
  const datas = new Set(sessoes.map(s => fmtSP.format(new Date(s.data_execucao))));

  let streak = 0;
  let cursor = Date.now();
  if (!datas.has(fmtSP.format(new Date(cursor)))) cursor -= DIA_MS;
  while (datas.has(fmtSP.format(new Date(cursor)))) {
    streak++;
    cursor -= DIA_MS;
  }

  const [y, m, d] = hojeStr().split('-').map(Number);
  const meioDia = new Date(y, m - 1, d, 12);
  const domingo = meioDia.getTime() - meioDia.getDay() * DIA_MS;
  const letras = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const semana = Array.from({ length: 7 }, (_, i) => {
    const dt = fmtSP.format(new Date(domingo + i * DIA_MS));
    return { letra: letras[i], feito: datas.has(dt) };
  });

  return { streak, semana, naSemana: semana.filter(x => x.feito).length };
}
