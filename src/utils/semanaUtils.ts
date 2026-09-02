/**
 * Utilitários para controle do ciclo semanal de treinos (Segunda-feira a Domingo)
 */

export interface IntervaloSemana {
  inicio: Date;
  fim: Date;
  inicioFormatado: string;
  fimFormatado: string;
  proximaSegunda: Date;
}

/**
 * Retorna o intervalo da semana atual (Segunda-feira 00:00:00 até Domingo 23:59:59.999)
 */
export function getIntervaloSemanaAtual(referencia: Date = new Date()): IntervaloSemana {
  const d = new Date(referencia);
  const diaSemana = d.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  // Se for Domingo (0), a segunda-feira foi há 6 dias
  // Se for Segunda (1), a segunda-feira é hoje (diferença 0)
  const diffParaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

  const inicio = new Date(d);
  inicio.setDate(d.getDate() - diffParaSegunda);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setDate(inicio.getDate() + 6);
  fim.setHours(23, 59, 59, 999);

  const proximaSegunda = new Date(inicio);
  proximaSegunda.setDate(inicio.getDate() + 7);
  proximaSegunda.setHours(0, 0, 0, 0);

  const formatarDataSimples = (data: Date) => {
    const dia = String(data.getDate()).padStart(2, '0');
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    return `${dia}/${mes}`;
  };

  return {
    inicio,
    fim,
    inicioFormatado: formatarDataSimples(inicio),
    fimFormatado: formatarDataSimples(fim),
    proximaSegunda,
  };
}

/**
 * Normaliza e analisa se uma data de execução caiu na semana atual
 */
export function isNaSemanaAtual(dataExecucaoStr: string, semana: IntervaloSemana = getIntervaloSemanaAtual()): boolean {
  if (!dataExecucaoStr) return false;
  let data: Date;

  if (dataExecucaoStr.includes('T') || dataExecucaoStr.includes(' ')) {
    data = new Date(dataExecucaoStr);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dataExecucaoStr)) {
    const [ano, mes, dia] = dataExecucaoStr.split('-').map(Number);
    data = new Date(ano, mes - 1, dia, 12, 0, 0);
  } else {
    data = new Date(dataExecucaoStr);
  }

  if (isNaN(data.getTime())) return false;
  return data.getTime() >= semana.inicio.getTime() && data.getTime() <= semana.fim.getTime();
}

/**
 * Retorna o nome do dia da semana formatado em português (ex: "Segunda-feira")
 */
export function getDiaSemanaExtenso(dataStr: string): string {
  if (!dataStr) return '';
  let data: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    data = new Date(ano, mes - 1, dia, 12, 0, 0);
  } else {
    data = new Date(dataStr);
  }
  if (isNaN(data.getTime())) return '';

  const dias = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  return dias[data.getDay()] || '';
}

/**
 * Formata data no padrão brasileiro: DD/MM/AAAA
 */
export function formatarDataBr(dataStr: string): string {
  if (!dataStr) return '';
  let data: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    const [ano, mes, dia] = dataStr.split('-').map(Number);
    data = new Date(ano, mes - 1, dia, 12, 0, 0);
  } else {
    data = new Date(dataStr);
  }
  if (isNaN(data.getTime())) return dataStr;

  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

/**
 * Formata duração em segundos para exibição detalhada (ex: "45 min 20s" ou "1h 15min")
 */
export function formatarDuracaoExtensa(segundos: number): string {
  if (!segundos || segundos <= 0) return '0 min';
  const totalMin = Math.floor(segundos / 60);
  const segRestantes = Math.floor(segundos % 60);

  if (totalMin >= 60) {
    const horas = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    return `${horas}h ${min > 0 ? `${min}min` : ''}`.trim();
  }

  if (totalMin === 0) {
    return `${segRestantes}s`;
  }

  return `${totalMin} min${segRestantes > 0 ? ` ${segRestantes}s` : ''}`;
}

// =============================================================
// Helpers no fuso America/Sao_Paulo (independentes do fuso do device)
// =============================================================

const FUSO_SP = 'America/Sao_Paulo';

/**
 * Data por extenso no fuso de Sao Paulo, formato ISO 'YYYY-MM-DD'
 */
export function dataSP(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_SP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Data de HOJE no fuso de Sao Paulo, formato ISO 'YYYY-MM-DD'
 */
export function hojeSP(): string {
  return dataSP(new Date());
}

/**
 * Dia da semana (0=Domingo .. 6=Sabado) atual no fuso de Sao Paulo
 */
export function diaSemanaSP(ref: Date = new Date()): number {
  const curto = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_SP, weekday: 'short' }).format(ref);
  const mapa: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const val = mapa[curto];
  return val !== undefined ? val : ref.getDay();
}

/**
 * Hora no formato 'HH:MM' no fuso de Sao Paulo
 */
export function formatarHorarioSP(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_SP,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Data ISO de um dia da semana (0=Domingo..6=Sabado) dentro da semana
 * corrente em Sao Paulo. Retorna 'YYYY-MM-DD' ou '' se invalido.
 */
export function dataDeDiaSemana(diaSemana: number): string {
  const d = new Date();
  const atual = diaSemanaSP(d);
  const diff = diaSemana - atual;
  const alvo = new Date(d);
  alvo.setUTCHours(12, 0, 0, 0);
  alvo.setUTCDate(alvo.getUTCDate() + diff);
  return dataSP(alvo);
}
