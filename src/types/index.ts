export const DAYS_OF_WEEK = [
  { index: 0, name: 'Domingo' },
  { index: 1, name: 'Segunda-feira' },
  { index: 2, name: 'Terça-feira' },
  { index: 3, name: 'Quarta-feira' },
  { index: 4, name: 'Quinta-feira' },
  { index: 5, name: 'Sexta-feira' },
  { index: 6, name: 'Sábado' },
] as const;

export const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'] as const;

// ========================
// Supabase Auth integration
// ========================

export type Genero = 'masculino' | 'feminino';

export interface Usuario {
  id: string;
  auth_id: string;
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  status: 'pendente' | 'ativo' | 'inativo';
  role: 'gestor' | 'aluno';
  pacote: 'Premium' | 'VIP';
  recusado_em: string | null;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  genero: Genero | null;
  protein_meta: number;
  carb_meta: number;
  gordura_meta: number;
  caloria_meta: number;
  created_at: string;
  updated_at: string;
  gestor_id?: string | null;
  plano_inicio?: string | null;
  plano_vencimento?: string | null;
}

// ========================
// Fichas de Treino (versionamento)
// Usuario (1) -> (N) Fichas (1) -> (N) Treinos (1) -> (N) Exercicios
// ========================

export type FichaStatus = 'ativa' | 'arquivada';

export type FichaTipo = 'treino' | 'dieta' | 'avaliacao' | 'acompanhamento';

export interface FichaTreino {
  id: string;
  user_id: string;
  nome: string;
  tipo: FichaTipo;
  status: FichaStatus;
  data_criacao: string;
}

// ========================
// Ordens de Servico (eventos clinicos do prontuario)
// ========================

export interface ComposicaoCorporalOS {
  percentual_gordura: number;
  massa_magra: number;
  massa_gordura: number;
}

export interface AvaliacaoOsInput {
  nome?: string;
  anamnese?: string;
  perimetros?: Record<string, number>;
  composicao?: ComposicaoCorporalOS;
  flexibilidade_forca?: string;
  objetivo?: string;
  peso?: number;
  altura?: number;
}

export interface AvaliacaoOs {
  id: string;
  ficha_id: string;
  anamnese: string;
  perimetros: Record<string, number>;
  composicao: ComposicaoCorporalOS;
  flexibilidade_forca: string;
  objetivo: string;
  peso: number;
  altura: number;
  created_at: string;
}

export interface AcompanhamentoOsInput {
  nome?: string;
  relato?: string;
  feedback?: string;
  fotos?: string[];
  peso?: number | null;
  meta_kcal?: number | null;
  meta_proteina?: number | null;
  meta_carbo?: number | null;
  meta_gordura?: number | null;
  meta_fibra?: number | null;
}

export interface AcompanhamentoOs {
  id: string;
  ficha_id: string;
  relato: string;
  feedback: string;
  fotos: string[];
  peso: number | null;
  meta_kcal: number | null;
  meta_proteina: number | null;
  meta_carbo: number | null;
  meta_gordura: number | null;
  meta_fibra: number | null;
  created_at: string;
}

// Metas nutricionais do acompanhamento mais recente (grafico de dieta)
export type MetasNutricionais = {
  meta_kcal: number;
  meta_proteina: number;
  meta_carbo: number;
  meta_gordura: number;
  meta_fibra: number;
} | null;

// Evento unificado da timeline clinica
export interface EventoClinico {
  ficha_id: string;
  nome: string;
  data: string;
  tipo: 'avaliacao' | 'acompanhamento';
  avaliacao: AvaliacaoOs | null;
  acompanhamento: AcompanhamentoOs | null;
}

export interface TreinoFicha {
  id: string;
  ficha_id: string;
  letra_ou_nome: string;
  observacoes?: string | null;
  periodizacao_id: string;
  created_at: string;
}

// Categoria do item dentro da ficha: força = séries/reps/carga;
// cardio = meta de tempo/distância (mesma lista, mesmo accordion).
export type ExercicioCategoria = 'forca' | 'cardio';

export interface ExercicioTreino {
  id: string;
  treino_id: string;
  nome_exercicio: string;
  grupo_muscular: string | null; // porção específica (ex.: 'Trapézio')
  musculo_principal?: string | null; // consolidado p/ estatísticas (ex.: 'Costas')
  series: number;
  repeticoes_prescritas: string | null;
  repeticoes_por_serie?: string[] | null;
  series_aquecimento?: boolean[] | null;
  descanso: number;
  ordem: number;
  categoria: ExercicioCategoria;
  meta_tempo_min?: number | null;
  meta_distancia_km?: number | null;
}

// Execução de cardio registrada pelo aluno (upsert diário).
// Em Cardio Isolado Livre (fora da ficha), exercicio_id fica nulo e o
// registro é identificado pelo user_id + nome_cardio.
export interface LogCardioInput {
  exercicio_id: string | null;
  user_id?: string | null;
  nome_cardio?: string | null;
  duracao_min: number;
  distancia_km: number | null;
  data_treino: string;
  log_treino_id?: string | null;
}

// ========================
// Periodização Semanal
// ========================

// Configuração global da semana do aluno (meta semanal + alocações)
export interface PlanejamentoSemanaConfig {
  // Meta semanal global de cardio em minutos (>=0). Nulo/0 = não definida.
  meta_cardio_semanal?: number | null;
}

// Item enviado ao salvar a semana (RPC salvar_planejamento)
export interface PlanejamentoItem {
  dia_semana: number; // 0=Domingo .. 6=Sábado
  treino_id: string | null; // null = dia sem treino
  is_descanso: boolean; // true = marcado como Off/Descanso
  ordem: number;
}

// Linha lida do banco (com nome do treino resolvido).
// meta_cardio_semanal é repetida nas linhas; usa-se o valor da primeira.
export interface PlanejamentoAlocacao extends PlanejamentoItem {
  treino_nome?: string | null;
  meta_cardio_semanal?: number | null;
}

export interface LogExecucao {
  id: string;
  exercicio_id: string;
  carga: number;
  repeticoes_realizadas: number;
  serie_valida: boolean;
  is_warmup: boolean;
  num_serie: number;
  data_registro: string;
  data_treino: string;
  log_treino_id?: string | null;
}

// ========================
// Execucao de Treino / Sobrecarga Progressiva
// ========================

export interface LogTreino {
  id: string;
  user_id: string;
  treino_id: string | null; // null = Cardio Isolado Livre (fora da ficha)
  data_execucao: string;
  duracao_segundos: number;
}

export interface SessaoHistorico {
  id: string;
  treino_id: string | null;
  nome_treino: string;
  data_execucao: string;
  duracao_segundos: number;
}

export interface ExercicioSessao {
  exercicio_id: string;
  nome_exercicio: string;
  grupo_muscular: string | null;
  musculo_principal?: string | null;
  carga_atual: number | null;
  carga_anterior: number | null;
  delta_carga: number;
  primeira_execucao: boolean;
}

export interface SerieItem {
  num_serie: number;
  reps: number;
  carga: number;
  valida: boolean; // true = série principal, false = aquecimento
}

export interface ExercicioSeriesSessao {
  nome_exercicio: string;
  grupo_muscular: string | null;
  musculo_principal?: string | null;
  itens: SerieItem[];
}

export interface CardioSessaoItem {
  exercicio_id: string | null;
  nome_cardio?: string | null;
  duracao_min: number;
  distancia_km?: number | null;
}

export interface SessaoComProgresso extends SessaoHistorico {
  exercicios: ExercicioSessao[];
  series?: ExercicioSeriesSessao[];
  cardios?: CardioSessaoItem[];
}

// ========================
// Compound types
// ========================

export interface TreinoComExercicios extends TreinoFicha {
  exercicios: ExercicioTreino[];
}

// ========================
// Periodizações (Blocos de Treinamento)
// Grupo de treinos dentro de uma mesma ficha (ex.: "High Volume", "Low Volume").
// ========================

export interface Periodizacao {
  id: string;
  ficha_id: string;
  nome: string;
  created_at: string;
}

export interface PeriodizacaoComTreinos extends Periodizacao {
  treinos: TreinoComExercicios[];
}

// ========================
// Prescricao de Dieta (cardapio estruturado)
// ========================

export interface RefeicaoDietaInput {
  nome_refeicao: string;
  descricao_alimentos: string;
  horario?: string | null;
  ordem?: number;
}

export interface RefeicaoDieta extends RefeicaoDietaInput {
  id: string;
  ficha_id: string;
  created_at: string;
}

export interface FichaCompleta extends FichaTreino {
  treinos: TreinoComExercicios[];
  refeicoes?: RefeicaoDieta[];
  periodizacoes?: PeriodizacaoComTreinos[];
}

// ========================
// Muscle Group Goals
// ========================

export interface MuscleGroupGoal {
  id: string;
  user_id: string;
  muscle_group: string;
  target_valid_sets: number;
}

// ========================
// Meals
// ========================

export interface Meal {
  id: string;
  user_id: string;
  date: string;
  meal_label: string;
  food_description: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  ai_raw_response: string | null;
  created_at: string;
}

// ========================
// Fixed Foods
// ========================

export interface FixedFood {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  is_active: boolean;
}

// ========================
// Activities
// ========================

export interface Activity {
  id: string;
  user_id: string;
  day_of_week: number;
  activity_type: string;
  duration_minutes: number;
  is_default: boolean;
}

// ========================
// Avaliação Física (Supabase)
// ========================

export interface AvaliacaoFisicaRecord {
  id: string;
  id_cliente: string;
  anamnese: string;
  perimetros: Record<string, number>;
  composicao: { percentual_gordura: number; massa_magra: number; massa_gordura: number };
  flexibilidade_forca: string;
  objetivo: string;
  peso: number;
  altura: number;
  created_at: string;
  updated_at: string;
}
