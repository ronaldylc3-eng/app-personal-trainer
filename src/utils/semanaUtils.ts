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
