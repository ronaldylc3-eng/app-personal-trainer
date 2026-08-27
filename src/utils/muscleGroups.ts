// =============================================================
// FONTE ÚNICA DE VERDADE: grupos musculares (macro e micro)
// - MACRO_GRUPOS: hierarquia usada no select do gestor (optgroups).
// - getMacroGrupo(): consolida um músculo específico no seu
//   macro-grupo (ex.: "Trapézio" -> "Costas") nas estatísticas.
// - Músculo não mapeado => retorna o próprio nome; vazio => "Outros".
// =============================================================

export interface MacroGrupoDef {
  nome: string;
  micros: string[];
}

export const MACRO_GRUPOS: MacroGrupoDef[] = [
  {
    nome: 'Peito',
    micros: ['Clavicular', 'Esternocostal', 'Abdominal'],
  },
  {
    nome: 'Costas',
    micros: ['Latíssimo do Dorso', 'Trapézio', 'Lombar', 'Romboides'],
  },
  {
    nome: 'Ombros',
    micros: ['Porção Anterior', 'Lateral', 'Posterior'],
  },
  {
    nome: 'Bíceps',
    micros: ['Cabeça Longa', 'Cabeça Curta'],
  },
  {
    nome: 'Tríceps',
    micros: ['Cabeça Longa', 'Cabeça Lateral', 'Cabeça Medial'],
  },
  {
    nome: 'Pernas',
    micros: ['Quadríceps', 'Posterior de Perna', 'Glúteos', 'Panturrilha'],
  },
  {
    nome: 'Antebraço',
    micros: ['Flexores de Punho', 'Extensores de Punho'],
  },
];

export const MICROS_AVULSOS: string[] = ['Abdômen'];

export const OUTROS = 'Outros';

export const ORDEM_MACROS: string[] = [
  ...MACRO_GRUPOS.map(g => g.nome),
  ...MICROS_AVULSOS,
  OUTROS,
];

// Lista plana de micro-grupos para selects e filtros.
export const TODOS_MICROS: string[] = [
  ...MACRO_GRUPOS.flatMap(g => g.micros),
  ...MICROS_AVULSOS,
];

// Músculos Principais (consolidados) — opções do select de cadastro
// e rótulos/chave de agrupamento dos gráficos de séries válidas.
export const PRINCIPAIS: string[] = [
  ...MACRO_GRUPOS.map(g => g.nome),
  ...MICROS_AVULSOS,
];

// Micros (porções) de um principal; [] quando não tem (ex.: Abdômen).
export function microsDe(principal: string): string[] {
  return MACRO_GRUPOS.find(g => g.nome === principal)?.micros || [];
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

// Variações/aliases aceitos no matching além dos nomes canônicos.
const ALIASES: Record<string, string[]> = {
  Peito: ['Peitoral', 'Peitorais', 'Peitoral Maior', 'Peitoral Menor'],
  Costas: ['Latíssimo do Dorso', 'Latíssimo do dorso', 'Costa (Latíssimo do dorso)', 'Latíssimo', 'Dorsal', 'Dorsais', 'Costa', 'Costas'],
  Ombros: ['Ombro', 'Ombros', 'Deltoide', 'Deltoides'],
  'Bíceps': ['Biceps', 'Bíceps', 'Braquial', 'Bíceps Braquial'],
  'Tríceps': ['Triceps', 'Tríceps', 'Tríceps Braquial'],
  Pernas: [
    'Pernas', 'Posterior de coxa', 'Isquiotibiais', 'Glúteo', 'Glúteos',
    'Panturrilhas', 'Panturrilha', 'Adutores', 'Abdutores', 'Bíceps femoral',
  ],
  Antebraço: ['Antebraço', 'Antebraco'],
};

interface Chave {
  chave: string;
  macro: string;
}

const indiceExato = new Map<string, string>();
const chavesBrutas: Chave[] = [];

// Mapeia termos únicos e aliases para seus respectivos macros
for (const g of MACRO_GRUPOS) {
  const termos = [g.nome, ...(ALIASES[g.nome] || [])];
  for (const t of termos) {
    const n = normalizar(t);
    if (!n) continue;
    if (!indiceExato.has(n)) indiceExato.set(n, g.nome);
    chavesBrutas.push({ chave: n, macro: g.nome });
  }
}

// Mapeia micros específicos de grupos que não colidem
for (const g of MACRO_GRUPOS) {
  for (const m of g.micros) {
    const n = normalizar(m);
    if (!n) continue;
    // Se a porção for compartilhada (ex: 'cabeça longa'), não define no índice global genérico
    const outrosComMesmoMicro = MACRO_GRUPOS.filter(outro => outro.nome !== g.nome && outro.micros.some(om => normalizar(om) === n));
    if (outrosComMesmoMicro.length === 0) {
      if (!indiceExato.has(n)) indiceExato.set(n, g.nome);
      chavesBrutas.push({ chave: n, macro: g.nome });
    }
  }
}

// Da chave mais longa p/ mais curta: "posterior de perna" vence "pernas",
// "bíceps femoral" vence "bíceps" na contenção.
const chavesOrdenadas = chavesBrutas.sort((a, b) => b.chave.length - a.chave.length);

export function getMacroGrupo(musculo?: string | null): string {
  if (!musculo || !musculo.trim()) return OUTROS;
  const n = normalizar(musculo);
  // Compatibilidade com treinos antigos salvos como 'Braço' ou 'Braços'
  if (n === 'braco' || n === 'bracos') return 'Bíceps';
  const exato = indiceExato.get(n);
  if (exato) return exato;
  for (const { chave, macro } of chavesOrdenadas) {
    if (n.includes(chave) || chave.includes(n)) return macro;
  }
  // Não mapeado: o próprio músculo vira o grupo exibido.
  return musculo.trim();
}

// =============================================================
// AGRUPAMENTO DINÂMICO POR GÊNERO
// - feminino: divide Pernas em porções (Quadríceps / Posterior de Perna / Glúteos / Panturrilha).
// - masculino: Pernas unificada; Bíceps e Tríceps são independentes.
// =============================================================

export type Genero = 'masculino' | 'feminino';

const REGRAS_GENERO: Record<Genero, { unifica: string; divide: string }> = {
  masculino: { unifica: 'Pernas', divide: '' },
  feminino: { unifica: '', divide: 'Pernas' },
};

export function normalizarGenero(genero?: string | null): Genero {
  return genero === 'feminino' ? 'feminino' : 'masculino';
}

// Porção canônica pelo nome normalizado
const microCanonicoPorNorma = new Map<string, string>();
for (const g of MACRO_GRUPOS) {
  for (const m of g.micros) {
    microCanonicoPorNorma.set(normalizar(m), m);
  }
}

/**
 * Resolve a chave de agrupamento correta para os gráficos de Séries Válidas e Volume.
 * Garante que Bíceps e Tríceps nunca se misturem e respeita a divisão feminina de Pernas.
 */
export function resolverChaveGrafico(
  musculoPrincipal?: string | null,
  grupoPorcao?: string | null,
  genero?: string | null
): string {
  const isFeminino = normalizarGenero(genero) === 'feminino';

  // 1. Identifica o macro principal
  const macro = getMacroGrupo(musculoPrincipal || grupoPorcao);

  // 2. Se for feminino e o grupo for Pernas, divide nas porções canônicas de pernas
  if (isFeminino && macro === 'Pernas') {
    const porcaoCandidata = grupoPorcao || musculoPrincipal;
    if (porcaoCandidata) {
      const canonica = microCanonicoPorNorma.get(normalizar(porcaoCandidata));
      if (canonica && microsDe('Pernas').includes(canonica)) {
        return canonica;
      }
    }
    return 'Pernas';
  }

  // 3. Para todos os outros grupos (Bíceps, Tríceps, Peito, Costas, Ombros, Antebraço, Abdômen, etc.)
  // Sempre retorna o grupo macro correspondente
  return macro;
}

export function getMacroGrupoDinamico(musculo?: string | null, genero?: string | null): string {
  return resolverChaveGrafico(musculo, null, genero);
}

// Ordem canônica dos grupos para o gênero, com a dimensão "divide"
// expandida nas suas porções (ex.: masculino -> ...Pernas,Bíceps,Tríceps,Antebraço,Ombros...).
export function ordemGrupos(genero?: string | null): string[] {
  const regra = REGRAS_GENERO[normalizarGenero(genero)];
  const lista: string[] = [];
  for (const nome of ORDEM_MACROS) {
    if (nome === regra.divide) {
      const macro = MACRO_GRUPOS.find(x => x.nome === nome);
      if (macro) lista.push(...macro.micros);
      else lista.push(nome);
    } else {
      lista.push(nome);
    }
  }
  return lista;
}
