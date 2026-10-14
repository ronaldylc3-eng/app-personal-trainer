import { useState, useMemo, useEffect, useRef, useCallback, type ReactElement } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Dumbbell, Plus, Trash2, Target, BarChart3,
  ChevronDown, Users, Check, X, Save, AlertCircle, Loader2,
  Play, RotateCcw, Flame, Pencil, MessageSquare, ChevronUp, Timer,
  CalendarCheck, CheckCircle2, Lock, Share2, Moon, Copy, Layers,
} from 'lucide-react';
import { BarraOlimpicaIcon, LogoBadge, RelatorioGraficoIcon } from '../icons/AppIcons';
import { useAuth } from '../../hooks/useAuth';
import { usuarios, fichas, treinosFicha, exerciciosTreino, logsExecucao, logsCardio, logsTreino, planejamento, periodizacoes, DURACAO_MAX_SEG, DURACAO_TETO_SEG, DURACAO_MINIMA_SEG } from '../../services/api';
import type { Usuario, FichaCompleta, LogExecucao, LogCardioInput, ExercicioCategoria, TipoTreinoCorrida, SessaoHistorico, SessaoComProgresso, PlanejamentoAlocacao, Periodizacao } from '../../types';
import { PRINCIPAIS, microsDe, getMacroGrupo, getMacroGrupoDinamico, resolverChaveGrafico, ordemGrupos } from '../../utils/muscleGroups';
import { haptics } from '../../utils/haptics';
import {
  getIntervaloSemanaAtual,
  isNaSemanaAtual,
  getDiaSemanaExtenso,
  formatarDataBr,
  formatarDuracaoExtensa,
  dataSP,
  diaSemanaSP,
  dataDeDiaSemana,
  formatarHorarioSP,
  intervaloAtualSemanaSP,
} from '../../utils/semanaUtils';
import RelatorioSemanal from './RelatorioSemanal';
import { WorkoutStoryModal, WorkoutStoryData } from './WorkoutStoryModal';
import { CardioIsoladoModal, CardioIsoladoResultado, CardioIsoladoAlvo } from './CardioIsoladoModal';

export interface ExercicioUI {
  key: string;
  dbId?: string;
  nome: string;
  categoria: ExercicioCategoria; // 'forca' = series/reps/carga · 'cardio' = tempo/distancia
  musculoPrincipal: string; // consolidado (ex.: 'Costas') — chave dos gráficos
  grupo: string; // porção específica (ex.: 'Trapézio'); '' = sem porção
  series: number;
  repsPorSerie: string[]; // meta de repetições por série (texto livre)
  aquecimentoPorSerie: boolean[]; // séries prescritas como aquecimento
  descanso: number;
  metaTempoMin: number | null; // meta de cardio (minutos)
  metaDistanciaKm: number | null; // meta opcional de cardio (km)
  tipoTreinoCorrida?: TipoTreinoCorrida | null;
  metaMinutos?: number | null;
  qtdTiros?: number | null;
  distanciaTiro?: string | null;
  metaDistanciaCorrida?: number | null;
}

export interface TreinoUI {
  key: string;
  dbId?: string;
  periodizacaoId: string;
  nome: string;
  observacoes: string;
  exercicios: ExercicioUI[];
  isCardioIsolado?: boolean;
}

interface StudentSerieEntry {
  carga: number;
  reps: number;
  valida: boolean | null; // true = série principal, false = aquecimento, null = pendente
  isWarmup: boolean;      // true se for aquecimento (série preparatória)
}

// Execucao de um item de cardio pelo aluno (upsert diario ao finalizar)
interface CardioEntry {
  duracaoMin: number;
  distanciaKm: number | null;
  concluido: boolean;
}

interface NovaFichaPayload {
  nome: string;
}

interface CardioTreinoPayload {
  nome: string;
  modalidade: string;
  metaMin: number;
  metaKm: string;
  tipoTreinoCorrida?: TipoTreinoCorrida | null;
  metaMinutos?: number | null;
  qtdTiros?: number | null;
  distanciaTiro?: string;
  metaDistanciaCorrida?: number | null;
}

const MODALIDADES_CARDIO = [
  { label: 'Esteira', value: 'esteira' },
  { label: 'Bike Ergométrica', value: 'bike' },
  { label: 'Boxe', value: 'boxe' },
  { label: 'Elíptico', value: 'eliptico' },
  { label: 'Pular Corda', value: 'pular_corda' },
  { label: 'Natação', value: 'natacao' },
  { label: 'Corrida Indoor (Esteira)', value: 'corrida_indoor' },
  { label: 'Corrida Outdoor', value: 'corrida_outdoor' },
  { label: 'Caminhada Outdoor', value: 'caminhada_outdoor' },
  { label: 'Remo', value: 'remo' },
  { label: 'Outro', value: 'outro' },
];

const MODALIDADES_CORRIDA = new Set<string>(['corrida_indoor', 'corrida_outdoor']);

const TIPOS_TREINO_CORRIDA: { label: string; value: TipoTreinoCorrida | '' }[] = [
  { label: 'Nenhum (Padrão)', value: '' },
  { label: 'Regenerativo', value: 'regenerativo' },
  { label: 'Intervalado', value: 'intervalado' },
  { label: 'Longão', value: 'longao' },
];

const LABEL_TIPO_TREINO_CORRIDA: Record<TipoTreinoCorrida, string> = {
  regenerativo: 'Regenerativo',
  intervalado: 'Intervalado',
  longao: 'Longão',
};

// Prescrição de cardio que alimenta os formulários do treinador (isolado e
// inline). "metaMin" destina-se a modalidades não-corrida (tempo em minutos);
// corrida usa "tipoTreinoCorrida" + "metaMinutos" (tempo estimado, opcional).
interface CardioPrescricao {
  modalidade: string;
  metaMin: number;
  metaKm: string;
  tipoTreinoCorrida: TipoTreinoCorrida | '';
  metaMinutos: string;
  qtdTiros: string;
  distanciaTiro: string;
  metaDistanciaCorrida: string;
}

function modalidadeInicialParaEx(ex?: ExercicioUI | null): string {
  if (!ex) return MODALIDADES_CARDIO[0].value;
  const v = MODALIDADES_CARDIO.find(m => m.value === ex.nome || m.label === ex.nome);
  if (v) return v.value;
  return ex.tipoTreinoCorrida ? 'corrida_outdoor' : 'esteira';
}

// Nome gerado automaticamente a partir da prescrição de cardio. Ex.: "Longão 18 km",
// "Tiros 10×400m", "Corrida Regenerativa 40 min", "Esteira 25 min".
function gerarNomeCardioIsolado(p: {
  modalidade: string;
  metaMin: number;
  metaKm: string;
  tipoTreinoCorrida: TipoTreinoCorrida | '';
  metaMinutos: number | null;
  qtdTiros: number | null;
  distanciaTiro: string;
  metaDistanciaCorrida: number | null;
}): string {
  const rotModalidade = MODALIDADES_CARDIO.find(m => m.value === p.modalidade)?.label ?? p.modalidade;
  if (MODALIDADES_CORRIDA.has(p.modalidade)) {
    if (p.tipoTreinoCorrida === 'longao') {
      return p.metaDistanciaCorrida && p.metaDistanciaCorrida > 0 ? `Longão ${p.metaDistanciaCorrida.toLocaleString('pt-BR')}` : 'Longão';
    }
    if (p.tipoTreinoCorrida === 'regenerativo') {
      return p.metaMinutos && p.metaMinutos > 0 ? `Corrida Regenerativa ${p.metaMinutos} min` : 'Corrida Regenerativa';
    }
    if (p.tipoTreinoCorrida === 'intervalado') {
      return p.qtdTiros && p.qtdTiros > 0 && p.distanciaTiro.trim() ? `Tiros ${p.qtdTiros}×${p.distanciaTiro.trim()}` : 'Corrida Intervalada';
    }
    return rotModalidade;
  }
  const nKm = parseFloat(p.metaKm.replace(',', '.'));
  if (nKm && nKm > 0) return `${rotModalidade} ${nKm.toLocaleString('pt-BR')}`;
  if (p.metaMin > 0) return `${rotModalidade} ${p.metaMin} min`;
  return rotModalidade;
}

// Evita nomes duplicados entre treinos existentes adicionando sufixo " (2)", " (3)"...
function nomeCardioUnico(nomeBase: string, existentes: string[]): string {
  const base = nomeBase.trim();
  const limpos = existentes.map(n => n.trim().toLowerCase());
  if (!base || !limpos.includes(base.toLowerCase())) return base;
  let i = 2;
  while (limpos.includes(`${base} (${i})`.toLowerCase())) i++;
  return `${base} (${i})`;
}

// Um cardio precisa de PELO MENOS uma meta: minutos, km, ou tipo de corrida.
function temMetaCardioDefinida(ex: ExercicioUI): boolean {
  if ((ex.metaTempoMin ?? 0) > 0) return true;
  if ((ex.metaDistanciaKm ?? 0) > 0) return true;
  if ((ex.metaDistanciaCorrida ?? 0) > 0) return true;
  return !!ex.tipoTreinoCorrida;
}

type Feedback = { tipo: 'ok' | 'erro'; msg: string } | null;

function erroMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado. Tente novamente.';
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatarDuracao(totalSegundos: number): string {
  const s = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// Ficha composta APENAS por cardio: nao se aplica a regra de descarte de
// treinos curtos (<5min), pois o aluno registra o tempo no input e finaliza.
function treinoEhSomenteCardio(treino: TreinoUI | null | undefined): boolean {
  return !!treino && treino.exercicios.length > 0 && treino.exercicios.every(ex => ex.categoria === 'cardio');
}

// Cardio Isolado = flag explícita no banco OU ficha 100% cardio (fallback
// para dados antigos). É o treino que a UI trata como um único exercício
// de ação direta (INICIAR abre o modal de cardio sem listagem de séries).
function ehCardioIsolado(treino: TreinoUI | null | undefined): boolean {
  return !!treino && (!!treino.isCardioIsolado || treinoEhSomenteCardio(treino));
}

// Rótulo curto dos dias da semana agendados para um treino futuro (bottom sheet).
const DIAS_ABREVIADOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function rotDiasAgendados(dias: number[]): string {
  const unicos = [...new Set(dias)].sort((a, b) => a - b);
  return unicos.map(d => DIAS_ABREVIADOS[d] ?? '').filter(Boolean).join(', ');
}

function normalizarRepsPorSerie(series: number, arr: (string | null | undefined)[] | null | undefined, fallback?: string | null): string[] {
  const qtd = Math.max(1, series);
  const base = fallback?.trim() || '';
  return Array.from({ length: qtd }, (_, i) => arr?.[i]?.toString().trim() || base);
}

function normalizarAquecimento(series: number, arr: (boolean | null | undefined)[] | null | undefined): boolean[] {
  return Array.from({ length: Math.max(1, series) }, (_, i) => arr?.[i] === true);
}

function contarAquecimentos(ex: ExercicioUI): number {
  return ex.aquecimentoPorSerie.slice(0, ex.series).filter(Boolean).length;
}

function metaReps(ex: ExercicioUI, serieIdx: number): string {
  return ex.repsPorSerie[serieIdx]?.trim() || '';
}

function resumoReps(ex: ExercicioUI): string {
  const vals = ex.repsPorSerie.slice(0, ex.series).map(r => r.trim()).filter(Boolean);
  if (vals.length === 0) return '—';
  const todosIguais = vals.length === ex.series && vals.every(v => v === vals[0]);
  return todosIguais ? `${ex.series}×${vals[0]}` : vals.join(' · ');
}

function toTreinoUI(t: FichaCompleta['treinos'][number]): TreinoUI {
  return {
    key: t.id,
    dbId: t.id,
    periodizacaoId: t.periodizacao_id,
    nome: t.letra_ou_nome,
    observacoes: t.observacoes || '',
    isCardioIsolado: !!(t as any).is_cardio_isolado,
    exercicios: t.exercicios.map(ex => ({
      key: ex.id,
      dbId: ex.id,
      nome: ex.nome_exercicio,
      categoria: ex.categoria === 'cardio' ? 'cardio' : 'forca',
      musculoPrincipal: ex.musculo_principal || '',
      grupo: ex.grupo_muscular || '',
      series: ex.series,
      repsPorSerie: normalizarRepsPorSerie(ex.series, ex.repeticoes_por_serie, ex.repeticoes_prescritas),
      aquecimentoPorSerie: normalizarAquecimento(ex.series, ex.series_aquecimento),
      descanso: ex.descanso,
      metaTempoMin: ex.meta_tempo_min ?? null,
      metaDistanciaKm: ex.meta_distancia_km ?? null,
      tipoTreinoCorrida: ex.tipo_treino_corrida ?? null,
      metaMinutos: ex.meta_minutos ?? null,
      qtdTiros: ex.qtd_tiros ?? null,
      distanciaTiro: ex.distancia_tiro ?? null,
      metaDistanciaCorrida: ex.meta_distancia_corrida ?? null,
    })),
  };
}

function assinarTreinos(list: TreinoUI[]): string {
  return JSON.stringify(list.map(t => ({
    nome: t.nome.trim(),
    obs: t.observacoes.trim(),
    isCardio: !!t.isCardioIsolado || treinoEhSomenteCardio(t),
    ex: t.exercicios.map(e => [e.nome.trim(), e.categoria, e.musculoPrincipal, e.grupo, e.series, e.repsPorSerie.map(r => r.trim()), e.aquecimentoPorSerie, e.descanso, e.metaTempoMin, e.metaDistanciaKm, e.tipoTreinoCorrida, e.metaMinutos, e.qtdTiros, e.distanciaTiro, e.metaDistanciaCorrida]),
  })));
}

function resumoMetaCardio(ex: ExercicioUI): string {
  if (ex.tipoTreinoCorrida) {
    const metas: string[] = [];
    if (ex.tipoTreinoCorrida === 'regenerativo' && ex.metaMinutos && ex.metaMinutos > 0) metas.push(`${ex.metaMinutos} min`);
    if (ex.tipoTreinoCorrida === 'intervalado' && ex.qtdTiros && ex.qtdTiros > 0 && ex.distanciaTiro) {
      metas.push(`${ex.qtdTiros}× ${ex.distanciaTiro}`);
      if (ex.metaMinutos && ex.metaMinutos > 0) metas.push(`~${ex.metaMinutos} min`);
    }
    if (ex.tipoTreinoCorrida === 'longao' && ex.metaDistanciaCorrida && ex.metaDistanciaCorrida > 0) {
      metas.push(`${ex.metaDistanciaCorrida.toLocaleString('pt-BR')} km`);
      if (ex.metaMinutos && ex.metaMinutos > 0) metas.push(`~${ex.metaMinutos} min`);
    }
    return `🏃 ${LABEL_TIPO_TREINO_CORRIDA[ex.tipoTreinoCorrida]}${metas.length ? ': ' + metas.join(' · ') : ''}`;
  }
  const partes: string[] = [];
  if (ex.metaTempoMin && ex.metaTempoMin > 0) partes.push(`${ex.metaTempoMin} min`);
  if (ex.metaDistanciaKm && ex.metaDistanciaKm > 0) partes.push(`${ex.metaDistanciaKm.toLocaleString('pt-BR')} km`);
  return partes.join(' · ') || '—';
}

// Resumo da META exibido direto no card da fila do Cardio Isolado.
// Ex.: "Meta: 18 km", "Tiros: 10×400m", "Meta: 25 min", "🏃 Longão: 12 km".
function resumoMetaCardioTreino(treino: TreinoUI | null | undefined): string {
  const ex = treino?.exercicios.find(e => e.categoria === 'cardio');
  if (!ex) return 'Meta: —';
  if (ex.tipoTreinoCorrida) {
    const metas: string[] = [];
    if (ex.tipoTreinoCorrida === 'regenerativo' && ex.metaMinutos && ex.metaMinutos > 0) metas.push(`${ex.metaMinutos} min`);
    if (ex.tipoTreinoCorrida === 'intervalado' && ex.qtdTiros && ex.qtdTiros > 0) {
      metas.push(`${ex.qtdTiros}×${ex.distanciaTiro || ''}`);
      if (ex.metaMinutos && ex.metaMinutos > 0) metas.push(`~${ex.metaMinutos} min`);
    }
    if (ex.tipoTreinoCorrida === 'longao' && ex.metaDistanciaCorrida && ex.metaDistanciaCorrida > 0) {
      metas.push(`${ex.metaDistanciaCorrida.toLocaleString('pt-BR')} km`);
      if (ex.metaMinutos && ex.metaMinutos > 0) metas.push(`~${ex.metaMinutos} min`);
    }
    if (metas.length > 0) return `Meta · ${metas.join(' · ')}`;
    return `🏃 ${LABEL_TIPO_TREINO_CORRIDA[ex.tipoTreinoCorrida]}`;
  }
  const partes: string[] = [];
  if (ex.metaTempoMin && ex.metaTempoMin > 0) partes.push(`${ex.metaTempoMin} min`);
  if (ex.metaDistanciaKm && ex.metaDistanciaKm > 0) partes.push(`${ex.metaDistanciaKm.toLocaleString('pt-BR')} km`);
  return partes.length > 0 ? `Meta: ${partes.join(' · ')}` : 'Meta: —';
}

// Meta de duracao (min) a usar como preenchimento padrao ao concluir um cardio.
// Para corrida, prioriza o tempo estimado ("metaMinutos") de qualquer tipo.
function duracaoAlvoCardio(ex: ExercicioUI): number | null {
  if (ex.tipoTreinoCorrida && ex.metaMinutos && ex.metaMinutos > 0) return ex.metaMinutos;
  return ex.metaTempoMin ?? null;
}

interface WorkoutsProps {
  alunoId?: string;
}

export default function Workouts({ alunoId }: WorkoutsProps = {}) {
  const { isAdmin } = useAuth();
  // Aba da sidebar foi consolidada em /alunos; rota antiga do gestor redireciona.
  // Dentro do prontuario (alunoId definido) o gestor mantem o editor completo.
  if (isAdmin && !alunoId) return <Navigate to="/alunos" replace />;
  return <WorkoutsView alunoId={alunoId} />;
}

function WorkoutsView({ alunoId: fixedAlunoId }: WorkoutsProps) {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const isStudent = !isAdmin;

  const [selectedAlunoId, setSelectedAlunoId] = useState<string>(fixedAlunoId || '');
  const [alunos, setAlunos] = useState<Usuario[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(true);

  const [ficha, setFicha] = useState<FichaCompleta | null>(null);
  const [treinos, setTreinos] = useState<TreinoUI[]>([]);
  const [periodizacoesList, setPeriodizacoesList] = useState<Periodizacao[]>([]);
  const [periodizacaoSelecionada, setPeriodizacaoSelecionada] = useState<string>('');
  const [loadingFicha, setLoadingFicha] = useState(false);

  const [showCriarFicha, setShowCriarFicha] = useState(false);
  const [showCardioTreino, setShowCardioTreino] = useState(false);
  const [novaFichaNome, setNovaFichaNome] = useState('');
  const [expandedTreino, setExpandedTreino] = useState<string | null>(null);
  const [addExTreinoKey, setAddExTreinoKey] = useState<string | null>(null);
  const [editExState, setEditExState] = useState<{ treinoKey: string; ex: ExercicioUI } | null>(null);
  const [deleteTreinoKey, setDeleteTreinoKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [selectedTreinoKey, setSelectedTreinoKey] = useState<string>('');
  const [abaAtivaAluno, setAbaAtivaAluno] = useState<'treinos' | 'relatorio'>('treinos');
  const [historicoLogs, setHistoricoLogs] = useState<SessaoComProgresso[]>([]);
  const [planoSemanal, setPlanoSemanal] = useState<PlanejamentoAlocacao[]>([]);
  const location = useLocation();
  // Deep-link do painel: /treinos com state { treinoId } pré-seleciona o treino
  const deeplinkTreinoId = (location.state as { treinoId?: string } | null)?.treinoId;
  const [studentEntries, setStudentEntries] = useState<Record<string, StudentSerieEntry[]>>(() => {
    if (typeof window === 'undefined') return {};
    const alunoId = fixedAlunoId || (!isAdmin ? profile?.id : '');
    if (!alunoId) return {};
    try {
      const salvo = localStorage.getItem(`treino_entries_${alunoId}`);
      return salvo ? JSON.parse(salvo) : {};
    } catch {
      return {};
    }
  });
  const [cardioEntries, setCardioEntries] = useState<Record<string, CardioEntry>>(() => {
    if (typeof window === 'undefined') return {};
    const alunoId = fixedAlunoId || (!isAdmin ? profile?.id : '');
    if (!alunoId) return {};
    try {
      const salvo = localStorage.getItem(`treino_cardio_${alunoId}`);
      return salvo ? JSON.parse(salvo) : {};
    } catch {
      return {};
    }
  });
  const [savingLog, setSavingLog] = useState(false);
  const [logFeedback, setLogFeedback] = useState<Feedback>(null);
  const [finalizarConfirmOpen, setFinalizarConfirmOpen] = useState(false);
  const [muitoCurtoOpen, setMuitoCurtoOpen] = useState(false);
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const [storyModalData, setStoryModalData] = useState<WorkoutStoryData | null>(null);
  const [alternarTreinoOpen, setAlternarTreinoOpen] = useState(false);
  const [cardioIsoladoOpen, setCardioIsoladoOpen] = useState(false);
  const [savingCardioIsolado, setSavingCardioIsolado] = useState(false);
  // Alvo do Cardio Isolado da ficha: quando definido, o modal é aberto em
  // modo "ação direta" (bypass da listagem) pré-preenchido com a prescrição.
  const [cardioIsoladoAlvo, setCardioIsoladoAlvo] = useState<CardioIsoladoAlvo | null>(null);

  // Fluxo guiado: qual exercicio esta aberto (-1 = nenhum)
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(-1);
  const advanceTimerRef = useRef<number | null>(null);
  const painelTreinoRef = useRef<HTMLDivElement>(null);
  const finalizarBtnRef = useRef<HTMLButtonElement>(null);
  // Guarda o id do logs_treino criado no meio do envio atual, para rollback
  // físico se QUALQUER upsert de séries/cardio falhar (save transacional).
  const logCriadoSessaoRef = useRef<string | null>(null);

  // Sessao de execucao POR TREINO (treinoId + timestamp de inicio;
  // sobrevive a refresh/troca de abas via localStorage)
  const [sessaoAtiva, setSessaoAtiva] = useState<{ treinoId: string; iniciadaEm: number } | null>(null);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setLoadingAlunos(true);
      usuarios.getClientes()
        .then(data => {
          setAlunos(data);
          setLoadingAlunos(false);
        })
        .catch(() => setLoadingAlunos(false));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isStudent && profile?.id) setSelectedAlunoId(profile.id);
  }, [isStudent, profile?.id]);

  // Sincroniza com o aluno da rota (Prontuario do Aluno)
  useEffect(() => {
    if (fixedAlunoId) setSelectedAlunoId(fixedAlunoId);
  }, [fixedAlunoId]);

  useEffect(() => {
    if (!selectedAlunoId) return;
    let cancel = false;
    (async () => {
      setLoadingFicha(true);
      try {
        const [f, plano] = await Promise.all([
          fichas.getAtiva(selectedAlunoId, 'treino'),
          planejamento.get(selectedAlunoId).catch(() => []),
        ]);
        if (cancel) return;
        setFicha(f);
        setPlanoSemanal(plano || []);
        const treinosUI = f ? f.treinos.map(toTreinoUI) : [];
        setTreinos(treinosUI);
        const periodizacoesDaFicha = f?.periodizacoes || [];
        setPeriodizacoesList(periodizacoesDaFicha.map(p => ({
          id: p.id,
          ficha_id: p.ficha_id,
          nome: p.nome,
          created_at: p.created_at,
        })));
        setPeriodizacaoSelecionada(prev => {
          if (prev && periodizacoesDaFicha.some(p => p.id === prev)) return prev;
          const padrao = periodizacoesDaFicha.find(p => p.nome.trim().toLowerCase() === 'padrão' || p.nome.trim().toLowerCase() === 'padrao');
          return padrao?.id ?? periodizacoesDaFicha[0]?.id ?? '';
        });
        // Aluno: a aba mostra SOMENTE o treino do dia (planejamento em SP).
        // Deep-link de dias que nao sao hoje (ex.: canto do calendario) e ignorado.
        const treinoInicial = (() => {
          if (isStudent) {
            const idsHoje = (plano || [])
              .filter(p => p.dia_semana === diaSemanaSP() && !p.is_descanso && p.treino_id)
              .sort((a, b) => a.ordem - b.ordem)
              .map(p => p.treino_id!);
            if (deeplinkTreinoId && idsHoje.includes(deeplinkTreinoId) && treinosUI.some(t => t.key === deeplinkTreinoId)) {
              return deeplinkTreinoId;
            }
            return idsHoje.find(id => treinosUI.some(t => t.key === id)) || '';
          }
          return (deeplinkTreinoId && treinosUI.some(t => t.key === deeplinkTreinoId) && deeplinkTreinoId) ||
            treinosUI[0]?.key ||
            '';
        })();
        setSelectedTreinoKey(treinoInicial);
        // Restaura dados salvos localmente se houver
        if (isStudent && selectedAlunoId) {
          try {
            const salvoE = localStorage.getItem(`treino_entries_${selectedAlunoId}`);
            if (salvoE) setStudentEntries(JSON.parse(salvoE));
            const salvoC = localStorage.getItem(`treino_cardio_${selectedAlunoId}`);
            if (salvoC) setCardioEntries(JSON.parse(salvoC));
          } catch {
            // fallback
          }
        }
        cancelAdvanceTimer();
        setShowCriarFicha(false);
        setExpandedTreino(null);
        setAddExTreinoKey(null);
      } catch (e) {
        if (!cancel) setFeedback({ tipo: 'erro', msg: erroMsg(e) });
      } finally {
        if (!cancel) setLoadingFicha(false);
      }
    })();
    return () => { cancel = true; };
  }, [selectedAlunoId, isStudent, deeplinkTreinoId]);

  const carregarLogsAluno = useCallback(async (alunoId: string) => {
    if (!alunoId) return;
    try {
      // Restringe ao banco a semana atual (Seg a Dom, fuso SP) para que o
      // bloqueio de "já concluído na semana" jamais dependa de recorte em
      // memória (que podia bugar ao virar a semana mantendo logs antigos).
      const semana = intervaloAtualSemanaSP();
      const dados = await logsExecucao.getProgresso(alunoId, {
        inicio: semana.inicioISO,
        fim: semana.fimISO,
      });
      setHistoricoLogs(dados);
    } catch (err) {
      console.error('Erro ao carregar histórico de treinos do aluno:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedAlunoId) {
      carregarLogsAluno(selectedAlunoId);
    }
  }, [selectedAlunoId, carregarLogsAluno]);

  // Logs da semana atual (Segunda a Domingo)
  const logsSemanaAtual = useMemo(() => {
    const semana = getIntervaloSemanaAtual();
    return historicoLogs.filter(log => isNaSemanaAtual(log.data_execucao, semana));
  }, [historicoLogs]);

  // Resumo de "dias treinados na semana" para o Story Card — replica a regra
  // do calendário "Minha Semana" da tela Início: um dia só conta como treinado
  // quando TODOS os treinos prescritos daquele dia tiverem sessão registrada.
  const resumoDiasSemana = useMemo(() => {
    const set = new Set<string>();
    for (const log of logsSemanaAtual) {
      if (!log.treino_id) continue;
      const d = dataSP(log.data_execucao);
      if (d) set.add(`${log.treino_id}|${d}`);
    }
    const metaDias = new Set<number>();
    let diasConcluidos = 0;
    for (let dia = 0; dia < 7; dia++) {
      const itens = planoSemanal.filter(p => p.dia_semana === dia);
      const treinoIdsDia = itens.filter(p => !p.is_descanso && p.treino_id).map(p => p.treino_id!);
      if (treinoIdsDia.length > 0) metaDias.add(dia);
      const data = dataDeDiaSemana(dia);
      if (treinoIdsDia.length > 0 && data !== '' && treinoIdsDia.every(id => set.has(`${id}|${data}`))) {
        diasConcluidos += 1;
      }
    }
    return { diasConcluidos, metaDias: metaDias.size };
  }, [logsSemanaAtual, planoSemanal]);

  // Reconta os dias concluídos considerando o treino recém-finalizado de hoje.
  // O histórico ainda não foi recarregado ao montar o Story Card, então a sessão
  // atual é injetada no conjunto antes da contagem (equivale ao "+1 se 1º treino
  // do dia", respeitando a regra de "todos os treinos prescritos do dia").
  function contarDiasComTreinoHoje(treinoIdHoje: string): { diasTreinados: number; metaDias: number } {
    const set = new Set<string>();
    for (const log of logsSemanaAtual) {
      if (!log.treino_id) continue;
      const d = dataSP(log.data_execucao);
      if (d) set.add(`${log.treino_id}|${d}`);
    }
    const dataHoje = dataDeDiaSemana(diaSemanaSP());
    if (treinoIdHoje && dataHoje) set.add(`${treinoIdHoje}|${dataHoje}`);
    const metaDias = new Set<number>();
    let diasConcluidos = 0;
    for (let dia = 0; dia < 7; dia++) {
      const itens = planoSemanal.filter(p => p.dia_semana === dia);
      const treinoIdsDia = itens.filter(p => !p.is_descanso && p.treino_id).map(p => p.treino_id!);
      if (treinoIdsDia.length > 0) metaDias.add(dia);
      const data = dataDeDiaSemana(dia);
      if (treinoIdsDia.length > 0 && data !== '' && treinoIdsDia.every(id => set.has(`${id}|${data}`))) {
        diasConcluidos += 1;
      }
    }
    return { diasTreinados: diasConcluidos, metaDias: metaDias.size };
  }

  // Mapeamento dos treinos concluídos nesta semana para bloqueio e status.
  // A chave é o treino_id (identidade estável); não indexamos por nome porque
  // treinos com nomes que normalizam iguais (case/acento) causariam colisão
  // e bloqueio indevido de treinos distintos.
  const treinosCompletosNaSemana = useMemo(() => {
    const map = new Map<string, SessaoComProgresso>();
    for (const log of logsSemanaAtual) {
      if (log.treino_id) {
        map.set(log.treino_id, log);
      }
    }
    return map;
  }, [logsSemanaAtual]);

  // =============================================================
  // ALUNO: treino(s) do DIA (planejamento semanal no fuso Sao Paulo)
  // =============================================================
  const diaHoje = diaSemanaSP();

  const planoDeHoje = useMemo(() => {
    const itens = planoSemanal.filter(p => p.dia_semana === diaHoje);
    const descanso = itens.length > 0 && itens.every(p => p.is_descanso);
    const ids = itens
      .filter(p => !p.is_descanso && p.treino_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(p => p.treino_id!);
    return {
      tipo: ids.length > 0 ? ('treino' as const) : (descanso ? ('descanso' as const) : ('vazio' as const)),
      ids,
    };
  }, [planoSemanal, diaHoje]);

  const treinosDeHoje = useMemo(() => {
    const vistos = new Set<string>();
    const out: TreinoUI[] = [];
    for (const id of planoDeHoje.ids) {
      const t = treinos.find(tr => tr.dbId === id);
      if (!t || vistos.has(t.key)) continue;
      vistos.add(t.key);
      out.push(t);
    }
    return out;
  }, [planoDeHoje, treinos]);

  // =============================================================
  // FILA DO DIA: separa os treinos de hoje entre pendentes e
  // concluídos (baseado nos logs_treino da data de hoje, fuso SP).
  // Quando o aluno finaliza um treino, carregarLogsAluno() re-popula
  // historicoLogs e estes arrays se recomputam sozinhos — é o coração
  // do fluxo reativo da tela principal.
  // =============================================================
  const temLogTreinoHoje = useCallback((treinoDbId?: string): boolean => {
    if (!treinoDbId) return false;
    const hoje = dataSP(new Date());
    return historicoLogs.some(log => log.treino_id === treinoDbId && dataSP(log.data_execucao) === hoje);
  }, [historicoLogs]);

  const treinosPendentesHoje = useMemo(
    () => treinosDeHoje.filter(t => !temLogTreinoHoje(t.dbId)),
    [treinosDeHoje, temLogTreinoHoje]
  );

  const treinosConcluidosHoje = useMemo(
    () => treinosDeHoje.filter(t => temLogTreinoHoje(t.dbId)),
    [treinosDeHoje, temLogTreinoHoje]
  );

  // Subtítulo motivacional "Boa! Mas o dia não acabou. Próximo treino:"
  // aparece quando o aluno já zerou parte da fila mas ainda resta treino.
  const mostrarMotivacao = treinosConcluidosHoje.length > 0 && treinosPendentesHoje.length > 0;

  // Grupos usados na Bottom Sheet "Alternar Treino":
  // agendados nos demais dias da semana + treinos livres (nunca alocados).
  const treinosAgendadosFuturos = useMemo(() => {
    const idsFuturos = new Set(
      planoSemanal
        .filter(p => p.dia_semana !== diaHoje && !p.is_descanso && p.treino_id)
        .map(p => p.treino_id!)
    );
    return treinos.filter(t => t.dbId && idsFuturos.has(t.dbId));
  }, [planoSemanal, treinos, diaHoje]);

  const treinosLivres = useMemo(() => {
    const alocados = new Set(planoSemanal.filter(p => p.treino_id).map(p => p.treino_id!));
    return treinos.filter(t => t.dbId && !alocados.has(t.dbId));
  }, [planoSemanal, treinos]);

  // Dias da semana agendados para cada treino futuro (chips na bottom sheet).
  const diasAgendadosPorTreino = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const p of planoSemanal) {
      if (!p.treino_id || p.is_descanso || p.dia_semana === diaHoje) continue;
      const arr = map.get(p.treino_id) || [];
      arr.push(p.dia_semana);
      map.set(p.treino_id, arr);
    }
    return map;
  }, [planoSemanal, diaHoje]);

  const selectedAluno = alunos.find(a => a.id === selectedAlunoId);

  // Consome o deep-link vindo do painel (Inicio -> /treinos)
  useEffect(() => {
    if (!deeplinkTreinoId) return;
    // Aluno: deep-link so vale se apontar para um treino de HOJE.
    if (isStudent && !treinosDeHoje.some(t => t.dbId === deeplinkTreinoId)) {
      setExpandedTreino(null);
      cancelAdvanceTimer();
      window.history.replaceState({}, '');
      return;
    }
    setSelectedTreinoKey(deeplinkTreinoId);
    setExpandedTreino(null);
    cancelAdvanceTimer();
    window.history.replaceState({}, '');
  }, [deeplinkTreinoId, isStudent, treinosDeHoje]);

  // =============================================================
  // ALUNO: cronometro e persistencia do treino
  // =============================================================

  const timerStorageKey = isStudent && selectedAlunoId ? `treino_ativo_${selectedAlunoId}` : null;
  const entriesStorageKey = isStudent && selectedAlunoId ? `treino_entries_${selectedAlunoId}` : null;
  const cardioStorageKey = isStudent && selectedAlunoId ? `treino_cardio_${selectedAlunoId}` : null;

  // Persiste series/reps/cargas digitadas pelo aluno no localStorage
  useEffect(() => {
    if (!entriesStorageKey) return;
    try {
      const hasValues = Object.values(studentEntries).some(arr =>
        Array.isArray(arr) && arr.some(e => (e && (e.carga > 0 || e.reps > 0 || e.valida !== null)))
      );
      if (hasValues) {
        localStorage.setItem(entriesStorageKey, JSON.stringify(studentEntries));
      } else if (Object.keys(studentEntries).length === 0) {
        localStorage.removeItem(entriesStorageKey);
      }
    } catch {
      // ignore
    }
  }, [entriesStorageKey, studentEntries]);

  // Persiste cardios digitados pelo aluno no localStorage
  useEffect(() => {
    if (!cardioStorageKey) return;
    try {
      const hasValues = Object.values(cardioEntries).some(c => c && (c.duracaoMin > 0 || c.concluido));
      if (hasValues) {
        localStorage.setItem(cardioStorageKey, JSON.stringify(cardioEntries));
      } else if (Object.keys(cardioEntries).length === 0) {
        localStorage.removeItem(cardioStorageKey);
      }
    } catch {
      // ignore
    }
  }, [cardioStorageKey, cardioEntries]);

  useEffect(() => {
    if (!timerStorageKey) {
      setSessaoAtiva(null);
      return;
    }
    try {
      const salvo = localStorage.getItem(timerStorageKey);
      if (!salvo) {
        setSessaoAtiva(null);
        return;
      }
      const parsed = JSON.parse(salvo) as { treinoId?: unknown; ts?: unknown };
      if (typeof parsed?.treinoId === 'string' && typeof parsed?.ts === 'number' && Number.isFinite(parsed.ts)) {
        setSessaoAtiva({ treinoId: parsed.treinoId, iniciadaEm: parsed.ts });
      } else {
        localStorage.removeItem(timerStorageKey);
        setSessaoAtiva(null);
      }
    } catch {
      localStorage.removeItem(timerStorageKey);
      setSessaoAtiva(null);
    }
  }, [timerStorageKey]);

  // Sessao orfa: o treino salvo nao existe mais na ficha ativa
  // (trocada/editada pelo gestor). Limpa para nao travar o aluno.
  useEffect(() => {
    if (!isStudent || !timerStorageKey || !ficha || !sessaoAtiva) return;
    if (treinos.some(t => t.dbId === sessaoAtiva.treinoId)) return;
    localStorage.removeItem(timerStorageKey);
    setSessaoAtiva(null);
  }, [isStudent, timerStorageKey, ficha, treinos, sessaoAtiva]);

  // Pre-marcacao prescrita: series marcadas como aquecimento pelo gestor
  // entram { valida: false, isWarmup: true } na execucao do aluno. Preenche
  // apenas slots ausentes (nunca sobrescreve valores digitados) e cobre
  // tanto o inicio manual quanto a restauracao de sessao apos refresh.
  useEffect(() => {
    if (!isStudent || !sessaoAtiva) return;
    const t = treinos.find(x => x.dbId === sessaoAtiva.treinoId);
    if (!t) return;
    setStudentEntries(prev => {
      let mudou = false;
      const next = { ...prev };
      for (const ex of t.exercicios) {
        if (!ex.dbId || ex.categoria === 'cardio') continue;
        const arr = prev[ex.dbId];
        if (arr && arr.length >= ex.series && arr.every(Boolean)) continue;
        next[ex.dbId] = Array.from({ length: ex.series }, (_, i) =>
          arr?.[i] ?? {
            carga: 0,
            reps: 0,
            valida: ex.aquecimentoPorSerie[i] ? false : null,
            isWarmup: !!ex.aquecimentoPorSerie[i],
          }
        );
        mudou = true;
      }
      return mudou ? next : prev;
    });
  }, [isStudent, sessaoAtiva, treinos]);

  // Sessao acima de 3h = orfa (esqueceu de finalizar): em vez de um tick de 1s
  // re-renderizando a página inteira, agenda um timeout exato para a expiracao.
  useEffect(() => {
    if (!sessaoAtiva) {
      setSessaoExpirada(false);
      return;
    }
    setSessaoExpirada(false);
    const aguardar = Math.max(0, sessaoAtiva.iniciadaEm + DURACAO_MAX_SEG * 1000 - Date.now());
    const id = setTimeout(() => setSessaoExpirada(true), aguardar);
    return () => clearTimeout(id);
  }, [sessaoAtiva]);

  // Mobile pausa timers com a aba em background; ao voltar, reavalia a expiracao
  // (o tempo real nunca se perde).
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      if (sessaoAtiva) {
        const agora = Date.now();
        setSessaoExpirada(agora - sessaoAtiva.iniciadaEm > DURACAO_MAX_SEG * 1000);
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [sessaoAtiva]);

  // =============================================================
  // GESTOR: criação e edição da ficha
  // =============================================================

  async function abrirCriarFicha() {
    try {
      const todas = await fichas.getByCliente(selectedAlunoId);
      const doTipo = todas.filter(f => f.tipo === 'treino');
      const alunoNome = selectedAluno?.nome || '';
      setNovaFichaNome(`Treino ${String(doTipo.length + 1).padStart(2, '0')} - ${alunoNome}`);
      setShowCriarFicha(true);
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: erroMsg(e) });
    }
  }

  async function handleCreateFicha(payload: NovaFichaPayload) {
    const nome = payload.nome.trim();
    if (!nome || !selectedAlunoId) return;
    setSaving(true);
    try {
      const nova = await fichas.create(selectedAlunoId, nome, 'treino');
      let padrao: Periodizacao | null = null;
      try {
        padrao = await periodizacoes.create(nova.id, 'Padrão');
      } catch {
        const existentes = await periodizacoes.getByFicha(nova.id);
        padrao = existentes[0] || null;
      }
      setFicha({ ...nova, treinos: [] });
      setTreinos([]);
      setPeriodizacoesList(padrao ? [{ ...padrao }] : []);
      setPeriodizacaoSelecionada(padrao?.id || '');
      setShowCriarFicha(false);
      setFeedback({ tipo: 'ok', msg: `Ficha "${nome}" criada. Monte os treinos e clique em Salvar Ficha.` });
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: erroMsg(e) });
    } finally {
      setSaving(false);
    }
  }

  // "Alternar Treino": um toque na Bottom Sheet apenas define qual treino fica
  // ATIVO na tela principal (seleção temporária da sessão, sem persistir no
  // planejamento_semanal). A fila do dia continua sendo governada pelos treinos
  // agendados para HOJE.
  function selecionarTreinoAtivo(treinoKey: string) {
    haptics.selection?.();
    setSelectedTreinoKey(treinoKey);
    setAlternarTreinoOpen(false);
    setLogFeedback(null);
    window.setTimeout(() => {
      painelTreinoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  function abrirAlternarTreino() {
    haptics.selection?.();
    setAlternarTreinoOpen(true);
  }

  function reconciliarDbIds(serverTreinos: FichaCompleta['treinos']) {
    const usados = new Set<string>();
    for (const t of treinos) {
      let match = t.dbId ? serverTreinos.find(s => s.id === t.dbId) : undefined;
      if (!match) {
        match = serverTreinos.find(s => !usados.has(s.id) && s.letra_ou_nome === t.nome.trim());
      }
      if (!match) continue;
      usados.add(match.id);
      t.dbId = match.id;
      t.exercicios.forEach((ex, i) => {
        const srv = match!.exercicios[i];
        if (srv && !ex.dbId) ex.dbId = srv.id;
      });
    }
  }

  async function executarSave(): Promise<boolean> {
    if (!ficha) return false;

    const nomesNormalizados = treinos.map(t => t.nome.trim());
    if (nomesNormalizados.some(n => !n)) {
      setFeedback({ tipo: 'erro', msg: 'Todo treino precisa de um nome antes de salvar.' });
      return false;
    }
    // Unicidade de nome agora e por periodizacao (o mesmo nome pode existir
    // em periodizacoes diferentes da mesma ficha).
    for (const pid of new Set(treinos.map(t => t.periodizacaoId))) {
      const nomesPid = treinos.filter(t => t.periodizacaoId === pid).map(t => t.nome.trim());
      const duplicado = nomesPid.find((n, i) => nomesPid.indexOf(n) !== i);
      if (duplicado) {
        setFeedback({ tipo: 'erro', msg: `Existem dois treinos com o nome "${duplicado}" na mesma periodização. Renomeie um deles antes de salvar.` });
        return false;
      }
    }

    for (const t of treinos) {
      for (const ex of t.exercicios) {
        if (ex.categoria === 'cardio' && !temMetaCardioDefinida(ex)) {
          setFeedback({ tipo: 'erro', msg: `O cardio "${ex.nome}" precisa de pelo menos uma meta (minutos, km ou tipo de corrida).` });
          return false;
        }
      }
    }

    setSaving(true);
    try {
      const treinosAntigos = new Map(ficha.treinos.map(t => [t.id, t]));

      for (const t of treinos) {
        const nomeTreino = t.nome.trim();
        const obsTreino = t.observacoes.trim();
        const isolado = t.isCardioIsolado === true || treinoEhSomenteCardio(t);
        let treinoId = t.dbId;
        if (treinoId) {
          const antigo = treinosAntigos.get(treinoId);
          if (antigo && (antigo.letra_ou_nome !== nomeTreino || (antigo.observacoes || '') !== obsTreino || isolado !== (antigo.is_cardio_isolado === true))) {
            await treinosFicha.update(treinoId, {
              letra_ou_nome: nomeTreino,
              observacoes: obsTreino,
              is_cardio_isolado: isolado,
            });
          }
          treinosAntigos.delete(treinoId);
        } else {
          const criado = await treinosFicha.create(ficha.id, nomeTreino, obsTreino, t.periodizacaoId || undefined, isolado);
          treinoId = criado.id;
          t.dbId = treinoId;
        }

        const antigoTreino = t.dbId ? ficha.treinos.find(x => x.id === t.dbId) : undefined;
        const antigosEx = new Map((antigoTreino?.exercicios || []).map(e => [e.id, e]));

        for (let i = 0; i < t.exercicios.length; i++) {
          const ex = t.exercicios[i];
          const isCardio = ex.categoria === 'cardio';
          const seriesEfetivas = isCardio ? 1 : Math.max(1, ex.series);
          const repsNormalizadas = normalizarRepsPorSerie(seriesEfetivas, ex.repsPorSerie);
          const temAlgumaRep = repsNormalizadas.some(r => r);
          const aquecimentoNormalizado = normalizarAquecimento(seriesEfetivas, ex.aquecimentoPorSerie);
          const temAlgumAquecimento = aquecimentoNormalizado.some(Boolean);
          const payload = {
            nome_exercicio: ex.nome.trim(),
            categoria: ex.categoria,
            musculo_principal: isCardio ? null : (ex.musculoPrincipal.trim() || null),
            grupo_muscular: isCardio ? null : (ex.grupo || null),
            series: seriesEfetivas,
            repeticoes_prescritas: isCardio ? null : (repsNormalizadas.find(r => r) || null),
            repeticoes_por_serie: !isCardio && temAlgumaRep ? repsNormalizadas : null,
            series_aquecimento: !isCardio && temAlgumAquecimento ? aquecimentoNormalizado : null,
            descanso: isCardio ? 0 : ex.descanso,
            ordem: i,
            meta_tempo_min: isCardio ? (ex.metaTempoMin ?? null) : null,
            meta_distancia_km: isCardio ? (ex.metaDistanciaKm ?? null) : null,
            tipo_treino_corrida: isCardio ? (ex.tipoTreinoCorrida ?? null) : null,
            meta_minutos: isCardio ? (ex.metaMinutos ?? null) : null,
            qtd_tiros: isCardio ? (ex.qtdTiros ?? null) : null,
            distancia_tiro: isCardio ? (ex.distanciaTiro ?? null) : null,
            meta_distancia_corrida: isCardio ? (ex.metaDistanciaCorrida ?? null) : null,
          };
          const existente = ex.dbId ? antigosEx.get(ex.dbId) : undefined;
          if (existente) {
            const repsExistentes = normalizarRepsPorSerie(
              Math.max(1, ex.series),
              existente.repeticoes_por_serie,
              existente.repeticoes_prescritas
            );
            const aquecimentoExistente = normalizarAquecimento(Math.max(1, ex.series), existente.series_aquecimento);
            const mudou =
              existente.nome_exercicio !== payload.nome_exercicio ||
              (existente.categoria ?? 'forca') !== payload.categoria ||
              (existente.musculo_principal || '') !== (payload.musculo_principal || '') ||
              (existente.grupo_muscular || '') !== (payload.grupo_muscular || '') ||
              existente.series !== payload.series ||
              JSON.stringify(repsExistentes) !== JSON.stringify(repsNormalizadas) ||
              JSON.stringify(aquecimentoExistente) !== JSON.stringify(aquecimentoNormalizado) ||
              existente.descanso !== payload.descanso ||
              existente.ordem !== payload.ordem ||
              (existente.meta_tempo_min ?? null) !== payload.meta_tempo_min ||
              Number(existente.meta_distancia_km ?? 0) !== Number(payload.meta_distancia_km ?? 0) ||
              (existente.tipo_treino_corrida ?? null) !== payload.tipo_treino_corrida ||
              (existente.meta_minutos ?? null) !== payload.meta_minutos ||
              (existente.qtd_tiros ?? null) !== payload.qtd_tiros ||
              (existente.distancia_tiro ?? null) !== payload.distancia_tiro ||
              Number(existente.meta_distancia_corrida ?? 0) !== Number(payload.meta_distancia_corrida ?? 0);
            if (mudou) await exerciciosTreino.update(existente.id, payload);
            antigosEx.delete(existente.id);
          } else {
            const criados = await exerciciosTreino.createMany(treinoId, [payload]);
            if (criados[0]) ex.dbId = criados[0].id;
          }
        }

        for (const removido of antigosEx.values()) {
          await exerciciosTreino.delete(removido.id);
        }
      }

      for (const removido of treinosAntigos.values()) {
        await treinosFicha.delete(removido.id);
      }

      const atualizada = await fichas.getAtiva(selectedAlunoId, 'treino');
      if (atualizada) {
        reconciliarDbIds(atualizada.treinos);
        setFicha(atualizada);
      }
      return true;
    } catch (e) {
      try {
        const parcial = await fichas.getAtiva(selectedAlunoId, 'treino');
        if (parcial) {
          reconciliarDbIds(parcial.treinos);
          setFicha(parcial);
        }
      } catch { /* best-effort silencioso */ }
      const raw = erroMsg(e);
      const msg = /duplicate key|treinos_ficha_ficha_id_letra_ou_nome/i.test(raw)
        ? 'Ja existe um treino com esse nome nesta ficha. Renomeie e salve novamente.'
        : raw;
      setFeedback({ tipo: 'erro', msg });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFicha() {
    setFeedback(null);
    const ok = await executarSave();
    if (ok) setFeedback({ tipo: 'ok', msg: 'Ficha salva com sucesso.' });
  }

  function handleAddTreino(nome: string): { ok: boolean; erro?: string } {
    const n = nome.trim();
    if (!n) return { ok: false, erro: 'O nome do treino não pode ser vazio.' };
    const duplicado = treinos.some(t =>
      t.periodizacaoId === periodizacaoSelecionada && t.nome.trim().toLowerCase() === n.toLowerCase()
    );
    if (duplicado) {
      const msg = `Já existe um treino com o nome "${n}" nesta periodização. Por favor, altere o nome.`;
      setFeedback({ tipo: 'erro', msg });
      return { ok: false, erro: msg };
    }
    const novo: TreinoUI = { key: `t-${Date.now()}`, periodizacaoId: periodizacaoSelecionada, nome: n, observacoes: '', exercicios: [] };
    setTreinos(prev => [...prev, novo]);
    setExpandedTreino(novo.key);
    return { ok: true };
  }

  function handleAddTreinoCardio(payload: CardioTreinoPayload): { ok: boolean; erro?: string } {
    const n = payload.nome.trim();
    if (!n) return { ok: false, erro: 'O nome do treino não pode ser vazio.' };
    const duplicado = treinos.some(t =>
      t.periodizacaoId === periodizacaoSelecionada && t.nome.trim().toLowerCase() === n.toLowerCase()
    );
    if (duplicado) {
      const msg = `Já existe um treino com o nome "${n}" nesta periodização. Por favor, altere o nome.`;
      setFeedback({ tipo: 'erro', msg });
      return { ok: false, erro: msg };
    }
    const chaveEx = `ex-${Date.now()}`;
    const novo: TreinoUI = {
      key: `t-${Date.now()}-cardio`,
      periodizacaoId: periodizacaoSelecionada,
      nome: n,
      observacoes: '',
      isCardioIsolado: true,
      exercicios: [{
        key: chaveEx,
        nome: payload.modalidade,
        categoria: 'cardio',
        musculoPrincipal: '',
        grupo: '',
        series: 1,
        repsPorSerie: [],
        aquecimentoPorSerie: [],
        descanso: 0,
        metaTempoMin: payload.metaMin || null,
        metaDistanciaKm: payload.metaKm ? Number(payload.metaKm) : null,
        tipoTreinoCorrida: payload.tipoTreinoCorrida ?? null,
        metaMinutos: payload.metaMinutos ?? null,
        qtdTiros: payload.qtdTiros ?? null,
        distanciaTiro: payload.distanciaTiro ?? null,
        metaDistanciaCorrida: payload.metaDistanciaCorrida ?? null,
      }],
    };
    setTreinos(prev => [...prev, novo]);
    setExpandedTreino(novo.key);
    setShowCardioTreino(false);
    setFeedback({ tipo: 'ok', msg: `Cardio Isolado "${n}" adicionado como um treino no dia (alimenta a meta semanal). Clique em Salvar Ficha para aplicar.` });
    return { ok: true };
  }

  function handleUpdateNomeTreino(treinoKey: string, novoNome: string): { ok: boolean; erro?: string } {
    const n = novoNome.trim();
    if (!n) return { ok: false, erro: 'O nome do treino não pode ser vazio.' };
    const alvo = treinos.find(t => t.key === treinoKey);
    const pid = alvo?.periodizacaoId ?? periodizacaoSelecionada;
    const duplicado = treinos.some(t =>
      t.key !== treinoKey && t.periodizacaoId === pid && t.nome.trim().toLowerCase() === n.toLowerCase()
    );
    if (duplicado) {
      const msg = `Já existe um treino com o nome "${n}" nesta periodização. Por favor, altere o nome.`;
      setFeedback({ tipo: 'erro', msg });
      return { ok: false, erro: msg };
    }
    setTreinos(prev => prev.map(t => t.key === treinoKey ? { ...t, nome: n } : t));
    return { ok: true };
  }

  function handleDeleteTreino(key: string) {
    setTreinos(prev => prev.filter(t => t.key !== key));
    setDeleteTreinoKey(null);
    if (expandedTreino === key) setExpandedTreino(null);
  }

  // Cria uma nova periodizacao na ficha (persistida na hora) e re-carrega.
  async function handleCriarPeriodizacao(nome: string): Promise<{ ok: boolean; erro?: string }> {
    const n = nome.trim();
    if (!n) return { ok: false, erro: 'O nome da periodização não pode ser vazio.' };
    if (!ficha) return { ok: false, erro: 'Nenhuma ficha ativa.' };
    setSaving(true);
    try {
      const nova = await periodizacoes.create(ficha.id, n);
      const atualizada = await fichas.getAtiva(selectedAlunoId, 'treino');
      if (atualizada) {
        reconciliarDbIds(atualizada.treinos);
        setFicha(atualizada);
        setPeriodizacoesList((atualizada.periodizacoes || []).map(p => ({ id: p.id, ficha_id: p.ficha_id, nome: p.nome, created_at: p.created_at })));
        setPeriodizacaoSelecionada(nova.id);
        setTreinos(atualizada.treinos.map(toTreinoUI));
      }
      setFeedback({ tipo: 'ok', msg: `Periodização "${n}" criada.` });
      return { ok: true };
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: erroMsg(e) });
      return { ok: false, erro: erroMsg(e) };
    } finally {
      setSaving(false);
    }
  }

  // Exclui uma periodizacao (casca em cascata remove treinos + exercicios).
  async function handleExcluirPeriodizacao(id: string): Promise<{ ok: boolean; erro?: string }> {
    if (!ficha) return { ok: false, erro: 'Nenhuma ficha ativa.' };
    const alvo = periodizacoesList.find(p => p.id === id);
    const qtdTreinos = ficha.periodizacoes?.find(p => p.id === id)?.treinos?.length || 0;
    setSaving(true);
    try {
      await periodizacoes.delete(id);
      const atualizada = await fichas.getAtiva(selectedAlunoId, 'treino');
      if (atualizada) {
        reconciliarDbIds(atualizada.treinos);
        setFicha(atualizada);
        const periodizacoesDaFicha = atualizada.periodizacoes || [];
        setPeriodizacoesList(periodizacoesDaFicha.map(p => ({ id: p.id, ficha_id: p.ficha_id, nome: p.nome, created_at: p.created_at })));
        setPeriodizacaoSelecionada(prev => {
          if (prev !== id && periodizacoesDaFicha.some(p => p.id === prev)) return prev;
          return periodizacoesDaFicha[0]?.id || '';
        });
        setTreinos(atualizada.treinos.map(toTreinoUI));
      }
      setFeedback({ tipo: 'ok', msg: `Periodização ${alvo?.nome ? `"${alvo.nome}"` : ''} removida (${qtdTreinos} treino(s) removidos).` });
      return { ok: true };
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: erroMsg(e) });
      return { ok: false, erro: erroMsg(e) };
    } finally {
      setSaving(false);
    }
  }

  // DEEP COPY do treino para outra periodizacao. Persiste imediatamente e
  // recarrega a ficha. So funciona para treinos ja persistidos (com dbId).
  async function handleDuplicarTreino(treinoKey: string, periodizacaoAlvoId: string): Promise<{ ok: boolean; erro?: string }> {
    const treino = treinos.find(t => t.key === treinoKey);
    if (!treino) return { ok: false, erro: 'Treino não encontrado.' };
    if (treino.periodizacaoId === periodizacaoAlvoId) return { ok: false, erro: 'Escolha uma periodização diferente.' };
    if (!treino.dbId) return { ok: false, erro: 'Este treino ainda não foi salvo. Clique em "Salvar Ficha" antes de duplicar.' };
    if (!ficha) return { ok: false, erro: 'Nenhuma ficha ativa.' };
    setSaving(true);
    try {
      const copiado = await treinosFicha.duplicar(treino.dbId, periodizacaoAlvoId);
      const atualizada = await fichas.getAtiva(selectedAlunoId, 'treino');
      if (atualizada) {
        reconciliarDbIds(atualizada.treinos);
        setFicha(atualizada);
        setPeriodizacoesList((atualizada.periodizacoes || []).map(p => ({ id: p.id, ficha_id: p.ficha_id, nome: p.nome, created_at: p.created_at })));
        setTreinos(atualizada.treinos.map(toTreinoUI));
      }
      setFeedback({ tipo: 'ok', msg: `Treino "${treino.nome}" duplicado (cópia: "${copiado.letra_ou_nome}").` });
      return { ok: true };
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: erroMsg(e) });
      return { ok: false, erro: erroMsg(e) };
    } finally {
      setSaving(false);
    }
  }

  function handleAddExercicio(treinoKey: string, ex: ExercicioUI) {
    setTreinos(prev => prev.map(t =>
      t.key === treinoKey ? { ...t, exercicios: [...t.exercicios, ex] } : t
    ));
    setAddExTreinoKey(null);
  }

  function handleToggleEditExercicio(treinoKey: string, ex: ExercicioUI) {
    setAddExTreinoKey(null);
    setEditExState(prev =>
      prev && prev.treinoKey === treinoKey && prev.ex.key === ex.key ? null : { treinoKey, ex }
    );
  }

  function handleEditExercicio(treinoKey: string, ex: ExercicioUI) {
    setTreinos(prev => prev.map(t =>
      t.key === treinoKey ? { ...t, exercicios: t.exercicios.map(e => e.key === ex.key ? ex : e) } : t
    ));
    setEditExState(null);
  }

  function handleMoverExercicio(treinoKey: string, idx: number, direcao: -1 | 1) {
    setTreinos(prev => prev.map(t => {
      if (t.key !== treinoKey) return t;
      const alvo = idx + direcao;
      if (alvo < 0 || alvo >= t.exercicios.length) return t;
      const exercicios = [...t.exercicios];
      [exercicios[idx], exercicios[alvo]] = [exercicios[alvo], exercicios[idx]];
      return { ...t, exercicios };
    }));
  }

  function handleUpdateObservacoes(treinoKey: string, obs: string) {
    setTreinos(prev => prev.map(t => t.key === treinoKey ? { ...t, observacoes: obs } : t));
  }

  function handleDeleteExercicio(treinoKey: string, exKey: string) {
    setTreinos(prev => prev.map(t =>
      t.key === treinoKey ? { ...t, exercicios: t.exercicios.filter(e => e.key !== exKey) } : t
    ));
  }

  // =============================================================
  // ALUNO: registro de execução em batch
  // =============================================================

  function handleStudentEntry(exercicioDbId: string, serieIdx: number, field: 'carga' | 'reps', value: number) {
    setStudentEntries(prev => {
      const arr = [...(prev[exercicioDbId] || [])];
      const cur = arr[serieIdx] || { carga: 0, reps: 0, valida: null, isWarmup: false };
      arr[serieIdx] = { ...cur, [field]: value };
      return { ...prev, [exercicioDbId]: arr };
    });
  }

  function cancelAdvanceTimer() {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }

  function handleStudentStatusChange(exercicioDbId: string, serieIdx: number, status: { valida: boolean | null; isWarmup: boolean }) {
    if (status.valida !== null) {
      haptics.success();
    } else {
      haptics.tap();
    }
    setStudentEntries(prev => {
      const arr = [...(prev[exercicioDbId] || [])];
      const cur = arr[serieIdx] || { carga: 0, reps: 0, valida: null, isWarmup: false };
      arr[serieIdx] = { ...cur, ...status };
      return { ...prev, [exercicioDbId]: arr };
    });

    // Auto-advance: avanca para o proximo exercicio quando TODAS as series
    // do exercicio ativo tem carga > 0, reps > 0 e status marcado (valida !== null)
    const currentEx = selectedTreino?.exercicios[activeExerciseIndex];
    if (currentEx?.dbId !== exercicioDbId) return;

    const currentEntries = studentEntries[exercicioDbId] || [];
    const updatedEntries = [...currentEntries];
    const cur = updatedEntries[serieIdx] || { carga: 0, reps: 0, valida: null, isWarmup: false };
    updatedEntries[serieIdx] = { ...cur, ...status };

    const allComplete = updatedEntries.length >= currentEx.series &&
      updatedEntries.slice(0, currentEx.series).every(e =>
        (e.carga ?? 0) > 0 && (e.reps ?? 0) > 0 && e.valida !== null && e.valida !== undefined
      );

    cancelAdvanceTimer();
    if (allComplete) {
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        setActiveExerciseIndex(prev => Math.min(prev + 1, (selectedTreino?.exercicios.length || 1) - 1));
      }, 400);
    }
  }

  function handleStudentCardioField(exercicioDbId: string, field: 'duracaoMin' | 'distanciaKm', value: number) {
    setCardioEntries(prev => {
      const cur = prev[exercicioDbId] || { duracaoMin: 0, distanciaKm: null, concluido: false };
      const next = { ...cur, concluido: false };
      if (field === 'duracaoMin') next.duracaoMin = Math.max(0, value);
      else next.distanciaKm = Number.isFinite(value) && value > 0 ? value : null;
      return { ...prev, [exercicioDbId]: next };
    });
  }

  function handleConcluirCardio(exercicioDbId: string, metaTempoMin: number | null) {
    setCardioEntries(prev => {
      const cur = prev[exercicioDbId] || { duracaoMin: 0, distanciaKm: null, concluido: false };
      return {
        ...prev,
        [exercicioDbId]: { ...cur, duracaoMin: cur.duracaoMin > 0 ? cur.duracaoMin : (metaTempoMin ?? 0), concluido: !cur.concluido },
      };
    });

    // Auto-advance: ao concluir o cardio ativo, avanca para o proximo item
    const currentEx = selectedTreino?.exercicios[activeExerciseIndex];
    if (currentEx?.dbId !== exercicioDbId) return;
    const entry = cardioEntries[exercicioDbId];
    const ficaraConcluido = !(entry?.concluido ?? false);
    if (ficaraConcluido) {
      cancelAdvanceTimer();
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        setActiveExerciseIndex(prev => Math.min(prev + 1, (selectedTreino?.exercicios.length || 1) - 1));
      }, 400);
    }
  }

  function handleIniciarTreino(treinoDbId: string) {
    if (!treinoDbId) return;
    if (sessaoAtiva && sessaoAtiva.treinoId !== treinoDbId) {
      const outro = treinos.find(t => t.dbId === sessaoAtiva.treinoId);
      setLogFeedback({
        tipo: 'erro',
        msg: `Finalize "${outro?.nome || 'o treino em andamento'}" antes de iniciar outro treino.`,
      });
      return;
    }

    const treino = treinos.find(t => t.dbId === treinoDbId);
    const jaConcluidoNaSemana = isStudent && !!(treino?.dbId && treinosCompletosNaSemana.has(treino.dbId));

    if (jaConcluidoNaSemana) {
      setLogFeedback({
        tipo: 'erro',
        msg: 'Este treino já foi finalizado nesta semana. O ciclo reseta toda segunda-feira.',
      });
      return;
    }

    const ts = Date.now();
    if (timerStorageKey) localStorage.setItem(timerStorageKey, JSON.stringify({ treinoId: treinoDbId, ts }));
    setSessaoAtiva({ treinoId: treinoDbId, iniciadaEm: ts });
    setLogFeedback(null);
    cancelAdvanceTimer();
    setActiveExerciseIndex(0);
    window.setTimeout(() => {
      painelTreinoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  async function handleFinalizarTreino(duracaoOverride?: number): Promise<boolean> {
    if (!sessaoAtiva) {
      setLogFeedback({ tipo: 'erro', msg: 'Inicie o cronômetro antes de finalizar o treino.' });
      return false;
    }
    const treino = treinos.find(t => t.dbId === sessaoAtiva.treinoId);
    if (!treino || !treino.dbId) {
      setLogFeedback({ tipo: 'erro', msg: 'O treino da sessão ativa não foi encontrado na ficha.' });
      return false;
    }
    const isTreinoSomenteCardio = treinoEhSomenteCardio(treino);

    // Guarda anti-dupla execução na FINALIZAÇÃO: os guards de início dependem
    // de logs já carregados (podem estar desatualizados). Aqui, na hora de
    // gravar, jamais salvamos uma SEGUNDA sessão do mesmo treino na semana —
    // mesmo que a fila tenha permitido iniciar por cache/race.
    if (isStudent && treinosCompletosNaSemana.has(treino.dbId)) {
      setLogFeedback({
        tipo: 'erro',
        msg: 'Este treino já foi finalizado nesta semana. O ciclo reseta toda segunda-feira.',
      });
      return false;
    }

    const duracao = duracaoOverride ?? Math.max(0, Math.floor((Date.now() - sessaoAtiva.iniciadaEm) / 1000));

    // Treinos muito curtos (<5 min) sao considerados clique acidental:
    // nada e salvo no sistema nem contabilizado na progressao.
    // Excecao: fitas compostas apenas por cardio, em que o aluno registra o
    // tempo realizado no input e finaliza assim que digita os minutos.
    if (!isTreinoSomenteCardio && duracao <= DURACAO_MINIMA_SEG) {
      setLogFeedback({ tipo: 'erro', msg: 'Treinos com menos de 05:00 não são salvos no sistema.' });
      return false;
    }

    // Failsafe anti-crash: sessao realmente curta (<1 min) E sem nenhum dado
    // preenchido jamais pode chegar a um INSERT no Supabase (seja força ou
    // um cardio puro cujo guard acima foi pulado).
    const temSeriesDigitadas = treino.exercicios.some(ex => {
      if (!ex.dbId || ex.categoria === 'cardio') return false;
      return (studentEntries[ex.dbId] || []).some(e => e && e.valida !== null && e.valida !== undefined);
    });
    const temCardioDigitado = treino.exercicios.some(ex => {
      if (!ex.dbId || ex.categoria !== 'cardio') return false;
      const c = cardioEntries[ex.dbId];
      return !!c && c.duracaoMin > 0;
    });
    if (duracao < 60 && !temSeriesDigitadas && !temCardioDigitado) {
      setLogFeedback({ tipo: 'erro', msg: 'Sessão muito curta e sem dados. Nada foi salvo.' });
      return false;
    }

    const rows: Omit<LogExecucao, 'id' | 'data_registro'>[] = [];
    for (const ex of treino.exercicios) {
      if (!ex.dbId || ex.categoria === 'cardio') continue;
      (studentEntries[ex.dbId] || []).forEach((entry, idx) => {
        if (!entry) return;
        // Só salva séries com status definitivo (valida !== null)
        // Ignora séries pendentes (valida === null/undefined)
        if (entry.valida === null || entry.valida === undefined) return;
        // Descarta slots nunca tocados (ex.: aquecimento pré-marcado pelo gestor
        // que entra zerado no estado). Carga e repetições zerados não são um
        // registro real e não podem valer como série salva.
        const carga = Number(entry.carga) || 0;
        const reps = Number(entry.reps) || 0;
        if (carga <= 0 && reps <= 0) return;
        rows.push({
          exercicio_id: ex.dbId!,
          num_serie: idx + 1,
          carga,
          repeticoes_realizadas: reps,
          serie_valida: entry.valida === true, // true = série principal, false = aquecimento
          is_warmup: entry.isWarmup === true,
          data_treino: hojeISO(),
        });
      });
    }

    // DIAGNÓSTICO TEMPORÁRIO: séries de Perna (masculino) que não salvam.
    // Loga no DEV (npm run dev) o que o finalizar enxerga do estado do aluno.
    if (import.meta.env.DEV) {
      console.log('[finalizar:diag]', {
        treinoId: treino.dbId,
        treinoNome: treino.nome,
        exerciciosDbId: treino.exercicios.filter(e => e.categoria !== 'cardio').map(e => e.dbId),
        chavesEntries: Object.keys(studentEntries),
        porExercicio: treino.exercicios.filter(e => e.categoria !== 'cardio').map(e => ({
          dbId: e.dbId,
          nome: e.nome,
          entries: (studentEntries[e.dbId!] || []).map(x => ({ carga: x.carga, reps: x.reps, valida: x.valida, isWarmup: x.isWarmup })),
        })),
        rows: rows.map(r => ({ ex: r.exercicio_id, serie: r.num_serie, carga: r.carga, reps: r.repeticoes_realizadas, valida: r.serie_valida })),
      });
    }

    // Itens de cardio com duracao registrada nesta sessao. Salva mesmo sem
    // ter clicado em "Concluir" (basta ter digitado a duracao realizada).
    const cardioRows: LogCardioInput[] = [];
    for (const ex of treino.exercicios) {
      if (!ex.dbId || ex.categoria !== 'cardio') continue;
      const entry = cardioEntries[ex.dbId];
      if (!entry || entry.duracaoMin <= 0) continue;
      cardioRows.push({
        exercicio_id: ex.dbId,
        duracao_min: Math.round(Math.min(entry.duracaoMin, 999.9) * 10) / 10,
        distancia_km: entry.distanciaKm && entry.distanciaKm > 0 ? Math.min(entry.distanciaKm, 999.99) : null,
        data_treino: hojeISO(),
      });
    }

    if (rows.length === 0 && cardioRows.length === 0) {
      const temForca = treino.exercicios.some(e => e.categoria !== 'cardio');
      setLogFeedback({
        tipo: 'erro',
        msg: temForca
          ? 'Marque ao menos uma série como Válida, com carga e repetições preenchidas, antes de finalizar.'
          : 'Preencha pelo menos uma série ou conclua o cardio antes de finalizar.',
      });
      return false;
    }

    // Em treino puro cardio, a duracao salva no banco e a soma dos minutos
    // registrados nos inputs (nao o cronometro, que o aluno encerra assim
    // que digita o tempo realizado).
    let duracaoCardioMin = 0;
    for (const ex of treino.exercicios) {
      if (!ex.dbId || ex.categoria !== 'cardio') continue;
      const entry = cardioEntries[ex.dbId];
      if (entry && entry.duracaoMin > 0) duracaoCardioMin += entry.duracaoMin;
    }
    const duracaoReal = isTreinoSomenteCardio && duracaoCardioMin > 0
      ? Math.round(duracaoCardioMin * 60)
      : duracao;

    // Calcula estatísticas para o Story Card
    let totalSeriesValidas = 0;
    let maiorCarga: { exercicioNome: string; cargaKg: number; reps?: number } | null = null;

    for (const ex of treino.exercicios) {
      if (!ex.dbId || ex.categoria === 'cardio') continue;
      const entries = studentEntries[ex.dbId] || [];
      for (const entry of entries) {
        const c = Number(entry.carga) || 0;
        const r = Number(entry.reps) || 0;
        // Só conta séries principais reais (carga/reps preenchidos) no Story
        if (entry && entry.valida === true && (c > 0 || r > 0)) {
          totalSeriesValidas += 1;
          if (!maiorCarga || c > maiorCarga.cargaKg) {
            maiorCarga = {
              exercicioNome: ex.nome || 'Exercício',
              cargaKg: c,
              reps: r,
            };
          }
        }
      }
    }

    const gruposSet = new Set<string>();
    for (const ex of treino.exercicios) {
      const g = ex.musculoPrincipal || ex.grupo;
      if (g && g.trim()) gruposSet.add(g.trim());
    }
    const subtitulo = Array.from(gruposSet).slice(0, 3).join(' & ');

    const dias = contarDiasComTreinoHoje(treino.dbId || '');
    const storyDataToSave: WorkoutStoryData = {
      treinoNome: treino.nome || 'Treino',
      subtitulo: subtitulo || undefined,
      duracaoSegundos: duracaoReal,
      diasTreinadosNaSemana: dias.diasTreinados,
      metaDiasSemana: dias.metaDias,
      totalSeriesValidas,
      maiorCarga,
      dataISO: hojeISO(),
      alunoNome: profile?.nome,
    };

    setSavingLog(true);
    setLogFeedback(null);
    try {
      const logTreino = await logsTreino.create(selectedAlunoId, treino.dbId!, duracaoReal);
      logCriadoSessaoRef.current = logTreino.id;
      await Promise.all([
        logsExecucao.upsertDia(rows.map(r => ({ ...r, log_treino_id: logTreino.id }))),
        logsCardio.upsertDia(cardioRows.map(r => ({ ...r, log_treino_id: logTreino.id }))),
      ]);
      logCriadoSessaoRef.current = null;
      if (timerStorageKey) localStorage.removeItem(timerStorageKey);
      if (entriesStorageKey) localStorage.removeItem(entriesStorageKey);
      if (cardioStorageKey) localStorage.removeItem(cardioStorageKey);
      setSessaoAtiva(null);
      cancelAdvanceTimer();
      setStudentEntries({});
      setCardioEntries({});

      // Recarrega o histórico de logs para atualizar os bloqueios e o Relatório Semanal
      if (selectedAlunoId) {
        await carregarLogsAluno(selectedAlunoId);
      }

      const partes = [rows.length > 0 ? `${rows.length} série(s)` : null, cardioRows.length > 0 ? `${cardioRows.length} cardio` : null].filter(Boolean).join(' · ');
      setLogFeedback({ tipo: 'ok', msg: `${treino.nome} registrado! Duração ${formatarDuracao(duracaoReal)}${partes ? ` · ${partes} salva(s)` : ''}.` });

      // Abre automaticamente o Story Card para compartilhamento
      setStoryModalData(storyDataToSave);
      setStoryModalOpen(true);
      return true;
    } catch (e) {
      // Save transacional: se a sessão foi criada mas alguma séria/cardio
      // falhou, desfaz fisicamente o log para não virar "treino concluído"
      // falso no banco/calendário. Rollback best-effort, nunca derruba a UI.
      const idParaLimpar = logCriadoSessaoRef.current;
      logCriadoSessaoRef.current = null;
      if (idParaLimpar) {
        try {
          await logsTreino.removerPorId(idParaLimpar);
        } catch (cleanupErr) {
          console.error('[finalizar:rollback] Falha ao remover sessão parcial', cleanupErr);
        }
      }
      setLogFeedback({ tipo: 'erro', msg: erroMsg(e) });
      return false;
    } finally {
      setSavingLog(false);
    }
  }

  function handleAbrirStoryDoTreino(treino?: TreinoUI | null, logSessao?: SessaoHistorico | null) {
    haptics.selection?.();

    // Encontra o treino alvo se não foi passado diretamente
    const targetTreino = treino || (logSessao?.treino_id ? treinos.find(t => t.dbId === logSessao.treino_id) : undefined) || (logSessao?.nome_treino ? treinos.find(t => t.nome.trim().toLowerCase() === logSessao.nome_treino.trim().toLowerCase()) : undefined);

    // Encontra o log desta sessão se não foi passado diretamente
    const log = logSessao || (targetTreino?.dbId ? logsSemanaAtual.find(l => l.treino_id === targetTreino.dbId) : undefined) || (targetTreino?.nome ? logsSemanaAtual.find(l => l.nome_treino?.trim().toLowerCase() === targetTreino.nome.trim().toLowerCase()) : undefined);

    const treinoNome = targetTreino?.nome || log?.nome_treino || 'Treino Realizado';
    const duracao = log?.duracao_segundos || 0;

    let totalSeriesValidas = 0;
    let maiorCarga: { exercicioNome: string; cargaKg: number; reps?: number } | null = null;

    // 1. Tenta extrair séries e maior carga do histórico salvo (log.series)
    if (log && (log as any).series && (log as any).series.length > 0) {
      for (const ex of (log as any).series) {
        for (const it of ex.itens || []) {
          if (it.valida === true || Number(it.carga) > 0 || Number(it.reps) > 0) {
            totalSeriesValidas += 1;
            const c = Number(it.carga) || 0;
            const r = Number(it.reps) || 0;
            if (!maiorCarga || c > maiorCarga.cargaKg) {
              maiorCarga = {
                exercicioNome: ex.nome_exercicio || 'Exercício',
                cargaKg: c,
                reps: r,
              };
            }
          }
        }
      }
    } else if (targetTreino) {
      // 2. Fallback: extrai dos inputs locais atuais se houver
      for (const ex of targetTreino.exercicios) {
        if (!ex.dbId || ex.categoria === 'cardio') continue;
        const entries = studentEntries[ex.dbId] || [];
        for (const entry of entries) {
          if (entry && (entry.valida === true || Number(entry.carga) > 0)) {
            totalSeriesValidas += 1;
            const c = Number(entry.carga) || 0;
            const r = Number(entry.reps) || 0;
            if (!maiorCarga || c > maiorCarga.cargaKg) {
              maiorCarga = {
                exercicioNome: ex.nome || 'Exercício',
                cargaKg: c,
                reps: r,
              };
            }
          }
        }
      }
    }

    // Subtítulo: grupos musculares trabalhados
    const gruposSet = new Set<string>();
    if (targetTreino) {
      for (const ex of targetTreino.exercicios) {
        const g = ex.musculoPrincipal || ex.grupo;
        if (g && g.trim()) gruposSet.add(g.trim());
      }
    } else if (log && (log as any).series) {
      for (const ex of (log as any).series) {
        const g = ex.musculo_principal || ex.grupo_muscular;
        if (g && g.trim()) gruposSet.add(g.trim());
      }
    }
    const subtitulo = gruposSet.size > 0 ? Array.from(gruposSet).slice(0, 3).join(' & ') : undefined;

    setStoryModalData({
      treinoNome,
      subtitulo,
      duracaoSegundos: duracao,
      diasTreinadosNaSemana: resumoDiasSemana.diasConcluidos,
      metaDiasSemana: resumoDiasSemana.metaDias,
      totalSeriesValidas,
      maiorCarga,
      dataISO: log?.data_execucao || hojeISO(),
      alunoNome: selectedAluno?.nome || profile?.nome || 'Aluno',
    });
    setStoryModalOpen(true);
  }

  // Atalho de Cardio Isolado Livre: após o modal salvar o registro,
  // recarrega os logs para atualizar o acumulado semanal e abre o Story
  // com a métrica de "minutos de hoje" + meta semanal (gamificação).
  async function handleRegistrarCardioIsolado(resultado: CardioIsoladoResultado): Promise<void> {
    setSavingCardioIsolado(true);
    setLogFeedback(null);
    try {
      if (selectedAlunoId) {
        await carregarLogsAluno(selectedAlunoId);
      }
      const acumulado = Math.round(validCardioMin || 0);
      const meta = metaCardioMin || 0;
      setStoryModalData({
        treinoNome: resultado.nomeCardio || 'Cardio Isolado',
        subtitulo: 'Cardio Isolado Livre',
        duracaoSegundos: Math.round(resultado.duracaoMin * 60),
        diasTreinadosNaSemana: resumoDiasSemana.diasConcluidos,
        metaDiasSemana: resumoDiasSemana.metaDias,
        totalSeriesValidas: 0,
        maiorCarga: null,
        dataISO: hojeISO(),
        alunoNome: selectedAluno?.nome || profile?.nome || 'Aluno',
        cardioMeta: {
          duracaoMinHoje: resultado.duracaoMin,
          acumuladoSemanaMin: acumulado,
          metaSemanalMin: meta,
        },
      });
      setCardioIsoladoOpen(false);
      setStoryModalOpen(true);
      setLogFeedback({
        tipo: 'ok',
        msg: `${resultado.nomeCardio} registrado! ${resultado.duracaoMin} min abatidos da sua meta semanal de cardio.`,
      });
    } finally {
      setSavingCardioIsolado(false);
    }
  }

  // Cardio Isolado (ficha) — AÇÃO DIRETA: no card da fila, o INICIAR não abre
  // a listagem de exercícios. Monta o alvo com a prescrição do exercício único
  // de cardio e abre o modal de conclusão imediatamente (bypass).
  function handleIniciarCardioIsolado(treino: TreinoUI): void {
    if (!treino?.dbId) return;
    if (sessaoAtiva && sessaoAtiva.treinoId !== treino.dbId) {
      const outro = treinos.find(t => t.dbId === sessaoAtiva.treinoId);
      setLogFeedback({ tipo: 'erro', msg: `Finalize "${outro?.nome || 'o treino em andamento'}" antes de iniciar outro treino.` });
      return;
    }
    const logadoHoje = historicoLogs.some(l =>
      l.treino_id === treino.dbId && dataSP(l.data_execucao) === dataSP(new Date())
    );
    if (treinosCompletosNaSemana.has(treino.dbId) && !logadoHoje) {
      setLogFeedback({ tipo: 'erro', msg: `"${treino.nome}" já foi feita nesta semana.` });
      return;
    }
    if (logadoHoje) {
      setLogFeedback({ tipo: 'erro', msg: `"${treino.nome}" já foi concluído hoje.` });
      return;
    }
    const ex = treino.exercicios.find(e => e.categoria === 'cardio');
    if (!ex?.dbId) {
      setLogFeedback({ tipo: 'erro', msg: 'Cardio Isolado sem exercício de cardio vinculado.' });
      return;
    }
    const metaMin = duracaoAlvoCardio(ex);
    const metaKmLongao = ex.tipoTreinoCorrida === 'longao' ? ex.metaDistanciaCorrida : null;
    setCardioIsoladoAlvo({
      treinoId: treino.dbId,
      exercicioId: ex.dbId,
      treinoNome: treino.nome,
      nomeCardio: MODALIDADES_CARDIO.find(m => m.value === ex.nome)?.label ?? ex.nome,
      metaMin,
      metaKm: metaKmLongao ?? ex.metaDistanciaKm ?? null,
      tipoTreinoCorrida: ex.tipoTreinoCorrida ?? null,
      qtdTiros: ex.qtdTiros ?? null,
      distanciaTiro: ex.distanciaTiro ?? null,
      metaDistanciaCorrida: ex.metaDistanciaCorrida ?? null,
      metaMinutosPrescrito: ex.metaMinutos ?? null,
    });
    setCardioIsoladoOpen(true);
    setLogFeedback(null);
  }

  // Pós-save do Cardio Isolado da FICHA: recarrega os logs (a sessão foi
  // gravada com treino_id válido → a fila marca "Concluído hoje" e o resumo
  // semanal reconhece o dia) e abre o Story com a métrica de cardio.
  async function handleRegistrarCardioIsoladoDoTreino(
    resultado: CardioIsoladoResultado,
    treino: TreinoUI | null
  ): Promise<void> {
    setSavingCardioIsolado(true);
    setLogFeedback(null);
    try {
      if (selectedAlunoId) {
        await carregarLogsAluno(selectedAlunoId);
      }
      const dias = treino?.dbId
        ? contarDiasComTreinoHoje(treino.dbId)
        : { diasTreinados: resumoDiasSemana.diasConcluidos, metaDias: resumoDiasSemana.metaDias };
      const acumulado = Math.round(validCardioMin || 0);
      const meta = metaCardioMin || 0;
      setStoryModalData({
        treinoNome: treino?.nome || resultado.nomeCardio || 'Cardio Isolado',
        subtitulo: resumoMetaCardioTreino(treino),
        duracaoSegundos: Math.round(resultado.duracaoMin * 60),
        diasTreinadosNaSemana: dias.diasTreinados,
        metaDiasSemana: dias.metaDias,
        totalSeriesValidas: 0,
        maiorCarga: null,
        dataISO: hojeISO(),
        alunoNome: selectedAluno?.nome || profile?.nome || 'Aluno',
        cardioMeta: {
          duracaoMinHoje: resultado.duracaoMin,
          acumuladoSemanaMin: acumulado,
          metaSemanalMin: meta,
        },
      });
      setCardioIsoladoOpen(false);
      setCardioIsoladoAlvo(null);
      setStoryModalOpen(true);
      setLogFeedback({
        tipo: 'ok',
        msg: `${treino?.nome || 'Cardio Isolado'} concluído! ${resultado.duracaoMin} min abatidos da sua meta semanal de cardio.`,
      });
    } finally {
      setSavingCardioIsolado(false);
    }
  }

  function handleDescartarSessao(navegar = true) {
    // Desfaz fisicamente um save parcial (sessão criada no meio do envio que
    // falhou) para o banco/calendário não marcarem o treino como "Concluído".
    const idParaLimpar = logCriadoSessaoRef.current;
    logCriadoSessaoRef.current = null;
    if (idParaLimpar) {
      void logsTreino.removerPorId(idParaLimpar).catch(err =>
        console.error('[descartar:rollback] Falha ao remover sessão parcial', err)
      );
    }
    if (timerStorageKey) localStorage.removeItem(timerStorageKey);
    if (entriesStorageKey) localStorage.removeItem(entriesStorageKey);
    if (cardioStorageKey) localStorage.removeItem(cardioStorageKey);
    setSessaoAtiva(null);
    cancelAdvanceTimer();
    setStudentEntries({});
    setCardioEntries({});
    setFinalizarConfirmOpen(false);
    setMuitoCurtoOpen(false);
    // Re-sincroniza o histórico (invalida cache progresso: via getProgresso
    // refetch) para a tela/relatório voltarem a mostrar o treino como Pendente.
    if (selectedAlunoId) void carregarLogsAluno(selectedAlunoId);
    if (navegar) navigate('/inicio');
  }

  // Descarte seguro do Cardio Isolado: fechar/ESC no modal ou "Cancelar" não
  // pode deixar o treino preso. Desfaz fisicamente uma sessão criada no meio
  // de um envio que falhou (save transacional em api.ts), limpa o alvo, o
  // estado de "sessão ativa" e re-sincroniza os logs — sem tocar nas séries
  // de um treino de força em andamento nem no planejamento semanal.
  function handleFecharCardioIsolado(): void {
    const idParaLimpar = logCriadoSessaoRef.current;
    logCriadoSessaoRef.current = null;
    if (idParaLimpar) {
      void logsTreino.removerPorId(idParaLimpar).catch(err =>
        console.error('[cardio:fechar:rollback] Falha ao remover sessão parcial', err)
      );
    }
    setCardioIsoladoOpen(false);
    setCardioIsoladoAlvo(null);
    if (timerStorageKey) localStorage.removeItem(timerStorageKey);
    setSessaoAtiva(null);
    cancelAdvanceTimer();
    if (selectedAlunoId) void carregarLogsAluno(selectedAlunoId);
  }

  function contarSeriesRegistradas(): number {
    let total = 0;
    for (const ex of selectedTreino?.exercicios || []) {
      if (!ex.dbId || ex.categoria === 'cardio') continue;
      total += (studentEntries[ex.dbId] || []).filter(e => e && e.valida !== null && e.valida !== undefined).length;
    }
    return total;
  }

  function contarCardiosRegistrados(): number {
    let total = 0;
    for (const ex of selectedTreino?.exercicios || []) {
      if (!ex.dbId || ex.categoria !== 'cardio') continue;
      const c = cardioEntries[ex.dbId];
      if (c && c.duracaoMin > 0) total += 1;
    }
    return total;
  }

  // Gate "sem nenhum dado preenchido": séries marcadas OU algum cardio com
  // duração digitada (mesmo sem clicar em "Concluir").
  function temDadosDigitados(): boolean {
    return contarSeriesRegistradas() > 0 || contarCardiosDigitados() > 0;
  }

  function contarCardiosDigitados(): number {
    let total = 0;
    for (const ex of selectedTreino?.exercicios || []) {
      if (!ex.dbId || ex.categoria !== 'cardio') continue;
      const c = cardioEntries[ex.dbId];
      if (c && c.duracaoMin > 0) total += 1;
    }
    return total;
  }

  function pedirFinalizacao() {
    if (!sessaoNesteTreino || sessaoExpirada) return;
    // Sessão muito curta (<1 min): nem abre o modal de finalizar — um
    // clique acidental não pode forçar um salvamento que vai quebrar.
    const duracaoAtual = Math.max(0, Math.floor((Date.now() - (sessaoAtiva?.iniciadaEm ?? Date.now())) / 1000));
    if (duracaoAtual < 60) {
      setMuitoCurtoOpen(true);
      return;
    }
    setFinalizarConfirmOpen(true);
  }

  // =============================================================
  // Analytics
  // =============================================================

  const allExercicios = useMemo(() => treinos.flatMap(t => t.exercicios), [treinos]);
  // Cardio nao entra em series validas/volume (graficos de forca)
  const exerciciosForca = useMemo(() => treinos.flatMap(t => t.exercicios).filter(e => e.categoria !== 'cardio'), [treinos]);

  // Chave de agrupamento: MÚSCULO PRINCIPAL DINÂMICO POR GÊNERO
  // (aluno usa o próprio perfil; gestor usa o sexo do aluno selecionado).
  const generoGraficos = isStudent ? profile?.genero : selectedAluno?.genero;
  // DEBUG genero
  console.log('[DIAG genero] isStudent=', isStudent, 'profile.genero=', profile?.genero, 'selectedAluno.genero=', selectedAluno?.genero, '=> generoGraficos=', generoGraficos);
  const chavePrincipal = (ex: ExercicioUI) =>
    resolverChaveGrafico(ex.musculoPrincipal, ex.grupo, generoGraficos);

  const metaByGroup = useMemo(() => {
    const map: Record<string, number> = {};

    // Se houver planejamento semanal com alocações de treinos, soma a meta de cada dia prescrito
    if (planoSemanal && planoSemanal.length > 0) {
      const treinosAlocados = planoSemanal.filter(p => !p.is_descanso && p.treino_id);
      if (treinosAlocados.length > 0) {
        treinosAlocados.forEach(p => {
          const tr = treinos.find(t => t.dbId === p.treino_id);
          if (!tr) return;
          tr.exercicios.filter(e => e.categoria !== 'cardio').forEach(ex => {
            const principais = Math.max(0, ex.series - contarAquecimentos(ex));
            const k = chavePrincipal(ex);
            map[k] = (map[k] || 0) + principais;
          });
        });
        return map;
      }
    }

    // Fallback se ainda não houver planejamento semanal definido
    exerciciosForca.forEach(ex => {
      // Series de aquecimento prescritas nao contam na meta
      const principais = Math.max(0, ex.series - contarAquecimentos(ex));
      const k = chavePrincipal(ex);
      map[k] = (map[k] || 0) + principais;
    });
    // DEBUG metaByGroup
    console.log('[DIAG metaByGroup] ', exerciciosForca.map(ex => `${ex.musculoPrincipal || '""'}/${ex.grupo || '""'}=>${chavePrincipal(ex)}`));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciciosForca, planoSemanal, treinos, generoGraficos]);

  // Meta de Minutos de Cardio na Semana.
  // "A Meta Explícita Vence, Derivada como Fallback":
  //   1) Se o planejamento do aluno tem meta_cardio_semanal > 0 (definida
  //      pelo Gestor no Planejamento Semanal), ela é a fonte da verdade.
  //   2) Caso contrário, deriva da soma dos metaTempoMin alocados na semana
  //      (retrocompatível com planejamentos antigos sem meta global).
  const metaCardioMin = useMemo(() => {
    const metaGlobal = planoSemanal && planoSemanal.length > 0
      ? (planoSemanal[0].meta_cardio_semanal ?? 0)
      : 0;
    if (metaGlobal > 0) return metaGlobal;

    let total = 0;
    if (planoSemanal && planoSemanal.length > 0) {
      const treinosAlocados = planoSemanal.filter(p => !p.is_descanso && p.treino_id);
      if (treinosAlocados.length > 0) {
        treinosAlocados.forEach(p => {
          const tr = treinos.find(t => t.dbId === p.treino_id);
          if (!tr) return;
          tr.exercicios.filter(e => e.categoria === 'cardio').forEach(ex => {
            total += ex.metaTempoMin || 0;
            if (ex.tipoTreinoCorrida) total += ex.metaMinutos || 0;
          });
        });
        return total;
      }
    }

    // Fallback: 1x cada treino de cardio da ficha
    treinos.forEach(t => {
      t.exercicios.filter(e => e.categoria === 'cardio').forEach(ex => {
        total += ex.metaTempoMin || 0;
        if (ex.tipoTreinoCorrida) total += ex.metaMinutos || 0;
      });
    });
    return total;
  }, [planoSemanal, treinos]);

  const selectedTreino = treinos.find(t => t.key === selectedTreinoKey) || null;

  // Treino ativo NÃO é um dos treinos de hoje (escolhido via "Alternar Treino":
  // agendado p/ outro dia ou treino livre). Near a UI um banner + "Voltar".
  const selectedTreinoForaDoDia = useMemo(() => {
    if (!selectedTreino?.dbId) return false;
    return !treinosDeHoje.some(t => t.dbId === selectedTreino.dbId);
  }, [selectedTreino, treinosDeHoje]);

  const treinoFeitoNaSemana = useMemo(() => {
    if (!selectedTreino) return null;
    return selectedTreino.dbId ? treinosCompletosNaSemana.get(selectedTreino.dbId) || null : null;
  }, [selectedTreino, treinosCompletosNaSemana]);

  // FLUXO REATIVO PÓS-TREINO: quando o treino ativo cai na lista de concluídos
  // de hoje (finalizou / recarregou logs) e ainda restam pendentes, avança
  // automaticamente a seleção para o PRÓXIMO treino do dia.
  useEffect(() => {
    if (!isStudent) return;
    if (treinosPendentesHoje.length === 0) return;
    const selecionado = treinos.find(t => t.key === selectedTreinoKey);
    if (!selecionado?.dbId) {
      setSelectedTreinoKey(treinosPendentesHoje[0].key);
      return;
    }
    // Seleção veio do "Alternar" (fora do dia): respeita a escolha do aluno.
    if (!treinosDeHoje.some(t => t.dbId === selecionado.dbId)) return;
    if (treinosConcluidosHoje.some(t => t.dbId === selecionado.dbId)) {
      setSelectedTreinoKey(treinosPendentesHoje[0].key);
    }
  }, [isStudent, treinosPendentesHoje, treinosConcluidosHoje, treinosDeHoje, selectedTreinoKey, treinos]);

  // Ultima finalizacao do treino selecionado em HOJE (fuso Sao Paulo).
  // Quando existe, o aluno ve o banner de celebracao no lugar do "Iniciar".
  const treinoConcluidoHoje = useMemo(() => {
    if (!selectedTreino?.dbId) return null;
    const hoje = dataSP(new Date());
    let ultimo: SessaoComProgresso | null = null;
    for (const log of historicoLogs) {
      if (log.treino_id === selectedTreino.dbId && dataSP(log.data_execucao) === hoje) {
        if (!ultimo || (log.data_execucao || '') > (ultimo.data_execucao || '')) {
          ultimo = log;
        }
      }
    }
    return ultimo;
  }, [selectedTreino, historicoLogs]);

  const tonelagemSessao = useMemo(() => {
    if (!treinoConcluidoHoje) return 0;
    let vol = 0;
    for (const ex of treinoConcluidoHoje.series || []) {
      for (const it of ex.itens || []) {
        if (it.valida === true) {
          vol += (Number(it.carga) || 0) * (Number(it.reps) || 0);
        }
      }
    }
    return vol;
  }, [treinoConcluidoHoje]);

  const validByGroup = useMemo(() => {
    const map: Record<string, number> = {};

    // 1) Séries válidas acumuladas de treinos já finalizados nesta semana
    for (const sessao of logsSemanaAtual) {
      for (const ex of sessao.series || []) {
        const k = resolverChaveGrafico(ex.musculo_principal, ex.grupo_muscular, generoGraficos);
        const validas = (ex.itens || []).filter(i => i.valida === true).length;
        if (validas > 0) {
          map[k] = (map[k] || 0) + validas;
        }
      }
    }
    // DEBUG validByGroup
    console.log('[DIAG validByGroup] genero=/<3=/> generoGraficos', generoGraficos, '| sessao', logsSemanaAtual.map(s => `${s.nome_treino}#${s.data_execucao}`));
    for (const sessao of logsSemanaAtual) {
      for (const ex of sessao.series || []) {
        const k = resolverChaveGrafico(ex.musculo_principal, ex.grupo_muscular, generoGraficos);
        console.log('[DIAG validByGroup] ex=', ex.nome_exercicio, 'principal=', ex.musculo_principal, 'grupo=', ex.grupo_muscular, '=> chave', k);
      }
    }

    // 2) Séries em andamento na sessão ativa (se o treino ainda não estiver finalizado nesta semana)
    if (sessaoAtiva && selectedTreino && !treinoFeitoNaSemana) {
      const activeTreino = treinos.find(t => t.dbId === sessaoAtiva.treinoId) || selectedTreino;
      activeTreino.exercicios.forEach(ex => {
        if (!ex.dbId || ex.categoria === 'cardio') return;
        const entries = studentEntries[ex.dbId] || [];
        const valid = entries.filter(e => e && e.valida === true).length;
        if (valid > 0) {
          const k = chavePrincipal(ex);
          map[k] = (map[k] || 0) + valid;
        }
      });
    }

    return map;
  }, [logsSemanaAtual, sessaoAtiva, selectedTreino, treinoFeitoNaSemana, treinos, studentEntries, generoGraficos]);

  // Minutos de Cardio Executados na Semana
  const validCardioMin = useMemo(() => {
    let total = 0;

    // 1) Cardio das sessões finalizadas na semana atual
    for (const sessao of logsSemanaAtual) {
      if (sessao.cardios && sessao.cardios.length > 0) {
        for (const c of sessao.cardios) {
          total += Number(c.duracao_min) || 0;
        }
      } else {
        // Fallback: se o treino é de cardio e durou X segundos
        const tr = treinos.find(t => t.dbId === sessao.treino_id);
        const ehTreinoCardio = tr?.exercicios.length ? tr.exercicios.every(e => e.categoria === 'cardio') : false;
        if (ehTreinoCardio && sessao.duracao_segundos > 0) {
          total += Math.round(sessao.duracao_segundos / 60);
        }
      }
    }

    // 2) Cardio da sessão ativa em andamento (se houver e ainda não finalizada)
    if (sessaoAtiva && selectedTreino && !treinoFeitoNaSemana) {
      const activeTreino = treinos.find(t => t.dbId === sessaoAtiva.treinoId) || selectedTreino;
      activeTreino.exercicios.forEach(ex => {
        if (!ex.dbId || ex.categoria !== 'cardio') return;
        const entry = cardioEntries[ex.dbId];
        if (entry && entry.duracaoMin > 0) {
          total += entry.duracaoMin;
        }
      });
    }

    return total;
  }, [logsSemanaAtual, sessaoAtiva, selectedTreino, treinoFeitoNaSemana, treinos, cardioEntries]);

  const totalMeta = Object.values(metaByGroup).reduce((s, v) => s + v, 0);
  const totalValid = Object.values(validByGroup).reduce((s, v) => s + v, 0);

  const volumeByGroup = useMemo(() => {
    const map: Record<string, number> = {};

    // 1) Volume acumulado de treinos já finalizados nesta semana
    for (const sessao of logsSemanaAtual) {
      for (const ex of sessao.series || []) {
        const k = resolverChaveGrafico(ex.musculo_principal, ex.grupo_muscular, generoGraficos);
        const vol = (ex.itens || []).reduce((sum, item) => {
          if (item.valida !== true) return sum;
          return sum + ((Number(item.carga) || 0) * (Number(item.reps) || 0));
        }, 0);
        if (vol > 0) {
          map[k] = (map[k] || 0) + vol;
        }
      }
    }

    // 2) Volume em andamento na sessão ativa
    if (sessaoAtiva && selectedTreino && !treinoFeitoNaSemana) {
      const activeTreino = treinos.find(t => t.dbId === sessaoAtiva.treinoId) || selectedTreino;
      activeTreino.exercicios.forEach(ex => {
        if (!ex.dbId || ex.categoria === 'cardio') return;
        const entries = studentEntries[ex.dbId] || [];
        const vol = entries.reduce((sum, entry) => {
          if (!entry || entry.valida !== true) return sum;
          return sum + ((Number(entry.carga) || 0) * (Number(entry.reps) || 0));
        }, 0);
        if (vol > 0) {
          const k = chavePrincipal(ex);
          map[k] = (map[k] || 0) + vol;
        }
      });
    }

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [logsSemanaAtual, sessaoAtiva, selectedTreino, treinoFeitoNaSemana, treinos, studentEntries, generoGraficos]);

  const sessaoNesteTreino = !!(sessaoAtiva && selectedTreino?.dbId && sessaoAtiva.treinoId === selectedTreino.dbId);
  const nomeTreinoAtivo = treinos.find(t => t.dbId === sessaoAtiva?.treinoId)?.nome || 'outro treino';

  // Posicionamento do accordion: roda apenas ao montar, trocar de treino ou
  // alternar a sessao deste treino (inicio/fim/refresh). Com sessao ativa,
  // abre o primeiro exercicio com series pendentes; sem sessao, colapsa tudo.
  useEffect(() => {
    if (!selectedTreino) return;
    if (!sessaoNesteTreino) {
      setActiveExerciseIndex(-1);
      return;
    }
    const firstPendingIdx = selectedTreino.exercicios.findIndex(ex => {
      if (!ex.dbId) return false;
      if (ex.categoria === 'cardio') {
        const c = cardioEntries[ex.dbId];
        return !c || !c.concluido || c.duracaoMin <= 0;
      }
      const entries = studentEntries[ex.dbId] || [];
      return entries.length < ex.series ||
        entries.slice(0, ex.series).some(e => !e || e.valida === null || e.valida === undefined);
    });
    setActiveExerciseIndex(firstPendingIdx >= 0 ? firstPendingIdx : Math.max(0, selectedTreino.exercicios.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTreinoKey, sessaoNesteTreino]);

  useEffect(() => () => cancelAdvanceTimer(), []);

  const isExercicioConcluido = useCallback((ex: ExercicioUI) => {
    if (!ex.dbId) return false;
    if (ex.categoria === 'cardio') {
      const c = cardioEntries[ex.dbId];
      return !!c && c.concluido && c.duracaoMin > 0;
    }
    const entries = studentEntries[ex.dbId] || [];
    return entries.length >= ex.series &&
      Array.from({ length: ex.series }).every((_, i) => {
        const e = entries[i];
        return !!e && (e.carga ?? 0) > 0 && (e.reps ?? 0) > 0 && e.valida !== null && e.valida !== undefined;
      });
  }, [studentEntries, cardioEntries]);

  const todosExerciciosConcluidos = useMemo(() => {
    if (!selectedTreino || selectedTreino.exercicios.length === 0) return false;
    return selectedTreino.exercicios.every(isExercicioConcluido);
  }, [selectedTreino, isExercicioConcluido]);

  const prevTudoProntoRef = useRef(false);
  useEffect(() => {
    if (todosExerciciosConcluidos && !prevTudoProntoRef.current) {
      finalizarBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    prevTudoProntoRef.current = todosExerciciosConcluidos;
  }, [todosExerciciosConcluidos]);

  const hasUnsavedChanges = useMemo(() => {
    if (!ficha) return false;
    return assinarTreinos(treinos) !== assinarTreinos(ficha.treinos.map(toTreinoUI));
  }, [treinos, ficha]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Treino em condições de começar: sem sessão ativa, não concluído hoje nem
  // na semana. Quando true, o CTA principal vira o botão gigante "INICIAR"
  // renderizado abaixo do card.
  const startavelIdle = !!(selectedTreino?.dbId && !sessaoAtiva && !treinoFeitoNaSemana && !treinoConcluidoHoje);

  // Card de detalhe do treino ATIVO — compartilhado entre a fila do dia, o
  // "Alternar Treino" (treino fora do dia) e dias de descanso/vazio.
  const painelDetalhe: ReactElement | null = selectedTreino ? (
    <>
      <div ref={painelTreinoRef} className="bg-panel border border-line border-l-[3px] border-l-accent px-5 py-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3.5 mb-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-bone truncate">{selectedTreino.nome}</h3>
              {treinoEhSomenteCardio(selectedTreino) && (
                <span className="inline-flex items-center gap-1 font-display text-[10px] uppercase tracking-[0.1em] text-orange-300 border border-orange-400/40 bg-orange-400/[0.08] px-2 py-0.5 clip-bevel-sm">
                  <Flame size={10} /> Cardio Isolado
                </span>
              )}
              {treinoFeitoNaSemana && !sessaoNesteTreino && !treinoConcluidoHoje && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok bg-ok/10 border border-ok/30 px-2 py-0.5 clip-bevel-sm">
                  <Check size={12} /> Feito nesta semana
                </span>
              )}
            </div>
            <span className="text-[12.5px] text-muted-steel">
              {selectedTreino.exercicios.length} exercício(s)
              {!sessaoAtiva && !treinoFeitoNaSemana && ' — inicie o treino para preencher as séries'}
            </span>
          </div>
          {sessaoAtiva && sessaoNesteTreino ? (
            <RelogioSessao iniciadaEm={sessaoAtiva.iniciadaEm}>
              {(elapsedSegundos) => (
                <SessaoControles
                  ativa
                  bloqueado={false}
                  nomeOutro=""
                  concluidoSemana
                  elapsedSegundos={elapsedSegundos}
                  saving={savingLog}
                  destacado={todosExerciciosConcluidos}
                  onIniciar={() => selectedTreino.dbId && handleIniciarTreino(selectedTreino.dbId)}
                  onFinalizar={pedirFinalizacao}
                />
              )}
            </RelogioSessao>
          ) : treinoConcluidoHoje ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ok bg-ok/10 border border-ok/40 px-2.5 py-1.5 clip-bevel-sm">
              <CheckCircle2 size={13} /> Concluído hoje · {formatarHorarioSP(treinoConcluidoHoje.data_execucao)}
            </span>
          ) : startavelIdle ? (
            // Pronto para começar: o CTA principal é o botão gigante "INICIAR"
            // renderizado abaixo do card — evita duplicar o botão no header.
            null
          ) : (
            <SessaoControles
              ativa={sessaoNesteTreino}
              bloqueado={!!sessaoAtiva && !sessaoNesteTreino}
              nomeOutro={nomeTreinoAtivo}
              concluidoSemana={!!treinoFeitoNaSemana && !sessaoNesteTreino}
              elapsedSegundos={0}
              saving={savingLog}
              destacado={todosExerciciosConcluidos}
              onIniciar={() => selectedTreino.dbId && handleIniciarTreino(selectedTreino.dbId)}
              onFinalizar={pedirFinalizacao}
            />
          )}
        </div>

        {treinoConcluidoHoje && !sessaoNesteTreino ? (
          <div className="mb-4 mt-3 bg-emerald-500/[0.08] border border-emerald-500/25 clip-bevel-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2.5 items-start">
              <CheckCircle2 size={16} className="text-ok shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <p className="font-bold text-ok mb-0.5">Treino de Hoje Concluído!</p>
                <p className="text-zinc-300">
                  Finalizado às <strong className="text-bone">{formatarHorarioSP(treinoConcluidoHoje.data_execucao)}</strong>
                  {treinoConcluidoHoje.duracao_segundos > 0 && <> · duração <strong className="text-bone">{formatarDuracaoExtensa(treinoConcluidoHoje.duracao_segundos)}</strong></>}
                  {tonelagemSessao > 0 && <> · tonelagem <strong className="text-bone">{tonelagemSessao.toLocaleString('pt-BR')} kg</strong></>}
                </p>
                <p className="text-zinc-400 mt-1 text-[11px]">
                  Este treino só volta a aparecer amanhã (ou no próximo dia agendado no seu planejamento).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleAbrirStoryDoTreino(selectedTreino, treinoConcluidoHoje)}
              className="btn-forge text-xs flex items-center justify-center gap-1.5 py-2 px-3 self-start sm:self-auto shrink-0 shadow-plate"
            >
              <Share2 size={13} />
              <span>Story 📸</span>
            </button>
          </div>
        ) : treinoFeitoNaSemana && !sessaoNesteTreino ? (
          <div className="mb-4 mt-3 bg-emerald-500/[0.08] border border-emerald-500/25 clip-bevel-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex gap-2.5 items-start">
              <CheckCircle2 size={16} className="text-ok shrink-0 mt-0.5" />
              <div className="min-w-0 text-xs">
                <p className="font-bold text-ok mb-0.5">Treino concluído na semana!</p>
                <p className="text-zinc-300">
                  Realizado em <strong className="text-bone">{formatarDataBr(treinoFeitoNaSemana.data_execucao)} ({getDiaSemanaExtenso(treinoFeitoNaSemana.data_execucao)})</strong> com duração de <strong className="text-bone">{formatarDuracaoExtensa(treinoFeitoNaSemana.duracao_segundos)}</strong>.
                </p>
                <p className="text-zinc-400 mt-1 text-[11px]">
                  Para respeitar o planejamento e descanso, este treino fica bloqueado até a próxima segunda-feira às 00:00.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleAbrirStoryDoTreino(selectedTreino, treinoFeitoNaSemana)}
              className="btn-forge text-xs flex items-center justify-center gap-1.5 py-2 px-3 self-start sm:self-auto shrink-0 shadow-plate"
            >
              <Share2 size={13} />
              <span>Story 📸</span>
            </button>
          </div>
        ) : null}

        {selectedTreino.observacoes.trim() && (
          <div className="mb-4 mt-2 bg-accent/[0.06] border border-accent/25 clip-bevel-sm px-4 py-3 flex gap-2.5">
            <MessageSquare size={14} className="text-accent-light shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.08em] font-bold text-accent-light mb-1">Observação do treinador</p>
              <p className="text-[13px] text-zinc-300 whitespace-pre-wrap break-words">{selectedTreino.observacoes}</p>
            </div>
          </div>
        )}

        {selectedTreino.exercicios.length === 0 ? (
          <p className="text-muted-steel text-sm text-center py-6">Nenhum exercício neste treino ainda.</p>
        ) : (
          selectedTreino.exercicios.map((ex, exIdx) =>
            ex.categoria === 'cardio' ? (
              <CardioExecucaoCard
                key={ex.key}
                indice={exIdx + 1}
                exercicio={ex}
                disabled={!sessaoNesteTreino || (!!treinoFeitoNaSemana && !sessaoNesteTreino)}
                entry={ex.dbId ? cardioEntries[ex.dbId] : undefined}
                onField={(field, value) => ex.dbId && handleStudentCardioField(ex.dbId, field, value)}
                onConcluir={() => ex.dbId && handleConcluirCardio(ex.dbId, duracaoAlvoCardio(ex))}
                isExpanded={activeExerciseIndex === exIdx}
                isCompleted={isExercicioConcluido(ex)}
                onToggleExpand={() => setActiveExerciseIndex(exIdx)}
              />
            ) : (
              <ExercicioExecucaoCard
                key={ex.key}
                indice={exIdx + 1}
                exercicio={ex}
                disabled={!sessaoNesteTreino || (!!treinoFeitoNaSemana && !sessaoNesteTreino)}
                entries={ex.dbId ? studentEntries[ex.dbId] : undefined}
                onEntry={(serieIdx, field, value) => ex.dbId && handleStudentEntry(ex.dbId, serieIdx, field, value)}
                onStatusChange={(serieIdx, valida) => ex.dbId && handleStudentStatusChange(ex.dbId, serieIdx, valida)}
                isExpanded={activeExerciseIndex === exIdx}
                isCompleted={isExercicioConcluido(ex)}
                onToggleExpand={() => setActiveExerciseIndex(exIdx)}
              />
            )
          )
        )}
      </div>

      {sessaoNesteTreino && (
        <div className="space-y-2.5">
          {todosExerciciosConcluidos && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold text-ok bg-ok/[0.08] border border-ok/40 clip-bevel-sm animate-slide-down">
              <Check size={16} className="shrink-0" />
              Todos os exercícios concluídos! Finalize o treino para salvar.
            </div>
          )}
          <button
            ref={finalizarBtnRef}
            onClick={pedirFinalizacao}
            disabled={savingLog}
            className={`btn-forge btn-full ${todosExerciciosConcluidos ? 'animate-glow-pulse' : ''}`}
          >
            <Check size={16} />
            Finalizar Treino
          </button>
        </div>
      )}

      {startavelIdle && (
        <button
          onClick={() => selectedTreino.dbId && handleIniciarTreino(selectedTreino.dbId)}
          className="btn-forge btn-full text-base"
        >
          <Play size={20} fill="currentColor" /> Iniciar Treino
        </button>
      )}

      {(totalMeta > 0 || metaCardioMin > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
          <AnalyticsSection
            metaByGroup={metaByGroup}
            validByGroup={validByGroup}
            totalMeta={totalMeta}
            totalValid={totalValid}
            metaCardioMin={metaCardioMin}
            validCardioMin={validCardioMin}
            genero={generoGraficos}
          />
          <VolumeSection volumeByGroup={volumeByGroup} />
        </div>
      )}
    </>
  ) : null;

  // Cardio Isolado — painel de AÇÃO DIRETA. Substitui o painelDetalhe: no
  // lugar da listagem de exercícios/séries, o aluno vê a prescrição do cardio
  // e o botão "Concluir Cardio Isolado" abre o modal de conclusão na hora.
  const exCardioIsolado = selectedTreino?.exercicios.find(e => e.categoria === 'cardio');
  const painelCardioIsolado: ReactElement | null = selectedTreino && ehCardioIsolado(selectedTreino) ? (
    <div ref={painelTreinoRef} className="bg-panel border border-line border-l-[3px] border-l-orange-400 px-5 py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3.5 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-bone truncate">{selectedTreino.nome}</h3>
            <span className="inline-flex items-center gap-1 font-display text-[10px] uppercase tracking-[0.1em] text-orange-300 border border-orange-400/40 bg-orange-400/[0.08] px-2 py-0.5 clip-bevel-sm">
              <Flame size={10} /> Cardio Isolado
            </span>
            {treinoConcluidoHoje && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok bg-ok/10 border border-ok/30 px-2 py-0.5 clip-bevel-sm">
                <Check size={12} /> Concluído hoje
              </span>
            )}
            {treinoFeitoNaSemana && !treinoConcluidoHoje && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok bg-ok/10 border border-ok/30 px-2 py-0.5 clip-bevel-sm">
                <Check size={12} /> Feito nesta semana
              </span>
            )}
          </div>
          <span className="text-[12.5px] text-muted-steel">
            {resumoMetaCardioTreino(selectedTreino)}
          </span>
        </div>
      </div>

      {selectedTreino.observacoes.trim() && (
        <div className="mb-4 mt-3 bg-accent/[0.06] border border-accent/25 clip-bevel-sm px-4 py-3 flex gap-2.5">
          <MessageSquare size={14} className="text-accent-light shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.08em] font-bold text-accent-light mb-1">Observação do treinador</p>
            <p className="text-[13px] text-zinc-300 whitespace-pre-wrap break-words">{selectedTreino.observacoes}</p>
          </div>
        </div>
      )}

      {exCardioIsolado && (
        <div className="mb-4 mt-2 bg-orange-400/[0.07] border border-orange-400/25 clip-bevel-sm px-4 py-4 flex items-start gap-3.5">
          <div className="w-11 h-11 shrink-0 rounded-lg bg-orange-400/15 flex items-center justify-center text-orange-300">
            <Flame size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-bone">
              {MODALIDADES_CARDIO.find(m => m.value === exCardioIsolado.nome)?.label ?? exCardioIsolado.nome}
            </p>
            <p className="text-[12px] text-zinc-300 mt-0.5 font-semibold">
              {resumoMetaCardioTreino(selectedTreino)}
            </p>
            <p className="text-[11px] text-muted-steel mt-1">
              Lançe o tempo realizado no modal e conclua direto — sem abrir lista de exercícios.
            </p>
          </div>
        </div>
      )}

      {treinoConcluidoHoje ? (
        <button
          type="button"
          onClick={() => handleAbrirStoryDoTreino(selectedTreino, treinoConcluidoHoje)}
          className="btn-forge btn-full text-base flex items-center justify-center gap-2 shadow-plate"
        >
          <Share2 size={18} /> Compartilhar Story 📸
        </button>
      ) : treinoFeitoNaSemana ? (
        <div className="mt-3 flex items-center gap-2.5 bg-emerald-500/[0.08] border border-emerald-500/25 clip-bevel-sm px-4 py-3">
          <CheckCircle2 size={16} className="text-ok shrink-0" />
          <p className="text-xs text-zinc-300">
            Treino concluído na semana — bloqueado até o próximo ciclo.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => handleIniciarCardioIsolado(selectedTreino)}
          className="btn-forge btn-full text-base flex items-center justify-center gap-2 shadow-plate"
        >
          <Play size={18} fill="currentColor" /> Concluir Cardio Isolado
        </button>
      )}
    </div>
  ) : null;

  // Painel exibido no lado do aluno: cardio isolado usa o fluxo direto.
  const painelTreinoExibicao = ehCardioIsolado(selectedTreino) ? painelCardioIsolado : painelDetalhe;

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-10">
      <div className={`${isStudent ? 'max-w-[920px] space-y-[18px]' : 'max-w-6xl space-y-6'} mx-auto`}>

        {/* Header */}
        <div className="flex items-center gap-3.5 mb-2">
          <LogoBadge>
            <BarraOlimpicaIcon size={19} strokeWidth={2} className="text-accent-light" />
          </LogoBadge>
          <div>
            <h1 className={`tracking-tight ${isStudent ? 'font-display font-normal uppercase text-[22px] md:text-[26px] text-bone leading-tight' : 'text-lg md:text-2xl font-bold text-zinc-100'}`}>
              {isStudent ? 'Meus Treinos' : 'Fichas de Treino'}
            </h1>
            <p className={`${isStudent ? 'text-[13px] md:text-[13.5px] text-muted-steel' : 'text-xs md:text-sm text-zinc-400'} hidden sm:block`}>
              {isStudent
                ? 'Preencha carga, repetições e finalize o treino do dia.'
                : selectedAluno
                  ? `Gerenciando ficha de: ${selectedAluno.nome}`
                  : 'Selecione um aluno para começar'}
            </p>
          </div>
        </div>

        {/* Feedback */}
        {(feedback || logFeedback) && (() => {
          const fb = feedback || logFeedback;
          const isOk = fb!.tipo === 'ok';
          return (
            <div className={`flex items-center gap-2 px-4 py-2.5 text-xs border clip-bevel-sm ${
              isOk
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-red-500/10 text-red-300 border-red-500/20'
            }`}>
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1">{fb!.msg}</span>
              <button onClick={() => { setFeedback(null); setLogFeedback(null); }} className="shrink-0 opacity-60 hover:opacity-100">
                <X size={14} />
              </button>
            </div>
          );
        })()}

        {/* Seletor de aluno (gestor, fluxo antigo) */}
        {!isStudent && !fixedAlunoId && (
          <div className="relative">
            <Users size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <select
              value={selectedAlunoId}
              onChange={e => setSelectedAlunoId(e.target.value)}
              disabled={loadingAlunos}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-150 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Selecione um aluno...</option>
              {alunos.map(a => (
                <option key={a.id} value={a.id}>{a.nome} ({a.email})</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>
        )}

        {!selectedAlunoId ? (
          !isStudent && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
              <Users size={28} className="mx-auto text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">Selecione um aluno acima para gerenciar a ficha de treino.</p>
            </div>
          )
        ) : loadingFicha ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-500">Carregando ficha...</p>
          </div>
        ) : isStudent ? (
          /* ================= ALUNO ================= */
          !ficha ? (
            <div className="bg-panel border border-line px-5 py-10 text-center">
              <Dumbbell size={28} className="mx-auto text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">Nenhuma ficha de treino ativa no momento.</p>
              <p className="text-xs text-zinc-600 mt-1">Fale com seu treinador para liberar sua ficha.</p>
            </div>
          ) : (
            <div className="space-y-[18px]">
              {/* Header da Ficha do Aluno */}
              <div className="bg-panel border border-line border-l-line px-5 py-[18px]">
                <div className="flex justify-between items-center gap-3 flex-wrap">
                  <div>
                    <h2 className="text-[16.5px] font-bold text-bone mb-1">{ficha.nome}</h2>
                    <span className="text-[12.5px] text-muted-steel">
                      {treinos.length} treino(s) · {allExercicios.length} exercício(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.1em] text-ok border border-ok/40 bg-ok/[0.08] px-3 py-1.5 clip-bevel-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-ok" /> Ativa
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-abas do Aluno: Ficha de Treinos vs Relatório Semanal */}
              <div className="flex border-b border-line gap-2">
                <button
                  type="button"
                  onClick={() => setAbaAtivaAluno('treinos')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${
                    abaAtivaAluno === 'treinos'
                      ? 'border-accent text-accent-light'
                      : 'border-transparent text-muted-steel hover:text-bone'
                  }`}
                >
                  <Dumbbell size={15} />
                  Treino de Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtivaAluno('relatorio')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 -mb-px ${
                    abaAtivaAluno === 'relatorio'
                      ? 'border-accent text-accent-light'
                      : 'border-transparent text-muted-steel hover:text-bone'
                  }`}
                >
                  <RelatorioGraficoIcon size={15} className="neon-icon" />
                  Relatório Semanal
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    logsSemanaAtual.length > 0
                      ? 'bg-ok/20 text-ok font-bold'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {logsSemanaAtual.length}/{treinos.length}
                  </span>
                </button>
              </div>

              {/* Atalho rápido: Registrar Cardio Isolado (independente do dia da semana) */}
              {!savingCardioIsolado && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection?.();
                    setCardioIsoladoAlvo(null);
                    setCardioIsoladoOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-900 border border-dashed border-orange-400/40 hover:border-orange-300/70 hover:bg-orange-400/[0.03] text-orange-300 text-sm font-semibold rounded-xl px-4 py-3 transition-all duration-150"
                >
                  <Flame size={15} />
                  Registrar Cardio Isolado
                </button>
              )}

              {abaAtivaAluno === 'relatorio' ? (
                <RelatorioSemanal
                  logsSemana={logsSemanaAtual}
                  treinosFicha={treinos}
                  nomeAluno={selectedAluno?.nome || profile?.nome}
                  onIrParaTreino={(treinoKey) => {
                    // Relatório → aba de hoje: só abre o treino clicado se ele
                    // estiver PENDENTE hoje; senão cai no primeiro treino da fila.
                    const ehPendente = treinosPendentesHoje.some(t => t.key === treinoKey);
                    setSelectedTreinoKey(ehPendente ? treinoKey : (treinosPendentesHoje[0]?.key || ''));
                    setAbaAtivaAluno('treinos');
                  }}
                  onCompartilharStory={(log) => {
                    handleAbrirStoryDoTreino(null, log);
                  }}
                />
              ) : planoDeHoje.tipo === 'descanso' || planoDeHoje.tipo === 'vazio' ? (
                /* Dia de descanso/vazio: se o aluno escolheu um treino no
                   "Alternar Treino", mostra o card; senão o empty state do dia. */
                selectedTreino ? (
                  <>
                    <div className="bg-amber-500/[0.07] border border-amber-500/25 clip-bevel-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-xs text-zinc-300 flex items-center gap-2">
                        <RotateCcw size={14} className="text-amber-300 shrink-0" />
                        Você está vendo <strong className="text-bone">"{selectedTreino.nome}"</strong> — um treino de outro dia ou treino livre.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedTreinoKey('')}
                        className="btn-steel-sm shrink-0 self-start sm:self-auto"
                      >
                        Voltar ao dia de hoje
                      </button>
                    </div>
{painelTreinoExibicao}
                   </>
                 ) : planoDeHoje.tipo === 'descanso' ? (
                  <DiaDeDescanso onTrocar={abrirAlternarTreino} />
                ) : (
                  <DiaSemTreino onTrocar={abrirAlternarTreino} />
                )
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-steel flex items-center gap-1.5">
                      <CalendarCheck size={13} className="text-accent-light" />
                      {getDiaSemanaExtenso(dataSP(new Date()))} · treino de hoje
                    </p>
                  </div>

{treinosPendentesHoje.length === 0 && treinosConcluidosHoje.length > 0 ? (
                    /* ===== STATE DE SUCESSO — fila do dia zerada ===== */
                    <div className="bg-panel border border-line clip-bevel px-5 py-10 flex flex-col items-center text-center gap-3">
                      <div className="w-20 h-20 rounded-full bg-ok/[0.1] border border-ok/30 flex items-center justify-center shadow-[0_0_30px_rgba(61,190,108,0.25)]">
                        <CheckCircle2 size={40} className="text-ok" />
                      </div>
                      <h3 className="font-display font-normal uppercase text-[20px] text-bone tracking-[0.02em]">
                        Treinos de hoje concluídos! Bom descanso.
                      </h3>
                      <p className="text-[13px] text-muted-steel max-w-sm">
                        Você zerou a fila do dia. Ótimo trabalho — recarregue as energias para a próxima sessão.
                      </p>
                      {treinosConcluidosHoje.length > 0 && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                          {treinosConcluidosHoje.map(tp => {
                            const log = historicoLogs.find(l =>
                              l.treino_id && tp.dbId && l.treino_id === tp.dbId && dataSP(l.data_execucao) === dataSP(new Date())
                            );
                            return (
                              <span key={tp.key} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ok bg-ok/[0.08] border border-ok/25 px-2.5 py-1.5 clip-bevel-sm">
                                <Check size={12} />
                                {tp.nome}
                                {log?.data_execucao && <span className="opacity-70">· {formatarHorarioSP(log.data_execucao)}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <button type="button" onClick={abrirAlternarTreino} className="btn-outline btn-full mt-1">
                        <RotateCcw size={16} /> Alternar Treino
                      </button>
                    </div>
                  ) : selectedTreinoForaDoDia && painelDetalhe ? (
                    /* ===== Treino de outro dia / livre escolhido no Alternar ===== */
                    <>
                      <div className="bg-amber-500/[0.07] border border-amber-500/25 clip-bevel-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-xs text-zinc-300 flex items-center gap-2">
                          <RotateCcw size={14} className="text-amber-300 shrink-0" />
                          Treino de outro dia / treino livre.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedTreinoKey(treinosPendentesHoje[0]?.key || '')}
                          className="btn-steel-sm shrink-0 self-start sm:self-auto"
                        >
                          Voltar aos treinos de hoje
                        </button>
                      </div>
                      {painelTreinoExibicao}
                    </>
                  ) : (
                    <>
                      {mostrarMotivacao && (
                        <div className="flex items-center gap-2.5 bg-ok/[0.06] border border-ok/20 clip-bevel-sm px-4 py-3 animate-slide-down">
                          <CheckCircle2 size={18} className="text-ok shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-bone">Boa! Mas o dia não acabou.</p>
                            <p className="text-[12px] text-zinc-300">Próximo treino:</p>
                          </div>
                        </div>
                      )}

                      {treinosDeHoje.length > 1 && (
                        <div className="space-y-2.5">
                          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-muted-steel">
                            {treinosDeHoje.length} treinos agendados para hoje — escolha por qual começar
                          </p>
                          {treinosDeHoje.map(tp => {
                            const concluidoHoje = !!tp.dbId && temLogTreinoHoje(tp.dbId);
                            const emAndamento = !!tp.dbId && sessaoAtiva?.treinoId === tp.dbId;
                            const feitoNaSemana = !!tp.dbId && !concluidoHoje && treinosCompletosNaSemana.has(tp.dbId);
                            const iniciarLiberado = !!tp.dbId && !concluidoHoje && !emAndamento && !feitoNaSemana;
                            const selecionado = selectedTreinoKey === tp.key;
                            const cardioIsolado = ehCardioIsolado(tp);
                            return (
                              <div
                                key={tp.key}
                                onClick={() => setSelectedTreinoKey(tp.key)}
                                className={`w-full rounded-xl border px-4 py-3.5 text-left cursor-pointer transition-all duration-150 ${
                                  selecionado
                                    ? 'border-accent/60 bg-accent/[0.06]'
                                    : cardioIsolado
                                      ? 'border-orange-400/25 bg-orange-400/[0.03] hover:border-orange-400/50'
                                      : 'border-zinc-800 bg-zinc-950 hover:border-accent/40'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="flex items-center gap-3 min-w-0">
                                    <span className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${cardioIsolado ? 'bg-orange-400/10 text-orange-300' : 'bg-zinc-800/70 text-accent-light'}`}>
                                      {cardioIsolado ? <Flame size={16} /> : <Dumbbell size={16} />}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block text-[13.5px] font-bold text-bone truncate">{tp.nome}</span>
                                      <span className="block text-[11.5px] text-muted-steel truncate">
                                        {cardioIsolado
                                          ? resumoMetaCardioTreino(tp)
                                          : `${tp.exercicios.length} exercício(s)${tp.exercicios.length > 0
                                            ? ` · ${Array.from(new Set(tp.exercicios.filter(ex => ex.categoria !== 'cardio').map(ex => chavePrincipal(ex)))).filter(Boolean).slice(0, 3).join(', ')}`
                                            : ''}`}
                                      </span>
                                    </span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={!iniciarLiberado}
                                    onClick={e => {
                                      e.stopPropagation();
                                      if (cardioIsolado) {
                                        if (tp.dbId) handleIniciarCardioIsolado(tp);
                                      } else if (tp.dbId) {
                                        handleIniciarTreino(tp.dbId);
                                      }
                                    }}
                                    className={`btn-forge-sm shrink-0 ${!iniciarLiberado ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    {emAndamento ? <Loader2 size={14} className="animate-spin" /> : concluidoHoje ? <Check size={14} /> : feitoNaSemana ? <CheckCircle2 size={14} /> : <Play size={14} fill="currentColor" />}
                                    {emAndamento ? 'Em andamento' : concluidoHoje ? 'Concluído hoje' : feitoNaSemana ? 'Concluído ✅' : cardioIsolado ? 'Iniciar' : 'Iniciar'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {painelTreinoExibicao}

                      <button type="button" onClick={abrirAlternarTreino} className="btn-outline btn-full">
                        <RotateCcw size={16} /> Alternar Treino
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          )
        ) : !ficha ? (
          /* ================= GESTOR: sem ficha ativa ================= */
          showCriarFicha ? (
            <CriarFichaForm
              nomeInicial={novaFichaNome}
              saving={saving}
              onConfirm={handleCreateFicha}
              onCancel={() => setShowCriarFicha(false)}
            />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-4">
              <ClipboardListPlaceholder />
              <button
                onClick={abrirCriarFicha}
                className="btn-forge"
              >
                <Plus size={16} /> Criar Nova Ficha
              </button>
            </div>
          )
        ) : (
          /* ================= GESTOR: editor da ficha ================= */
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="w-1 h-6 bg-accent rounded-full hidden sm:block" />
              <div className="flex-1">
                <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 flex-wrap">
                  {ficha.nome}
                </h2>
                <p className="text-xs text-zinc-500">
                  {treinos.length} treino(s) · {allExercicios.length} exercício(s)
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
                <NovaPeriodizacaoButton onCriar={handleCriarPeriodizacao} saving={saving} />
                <button
                  onClick={abrirCriarFicha}
                  disabled={saving}
                  className="btn-steel"
                >
                  <Plus size={14} /> Nova Ficha
                </button>
                <button
                  onClick={handleSaveFicha}
                  disabled={saving}
                  className="btn-forge"
                >
                  <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Ficha'}
                </button>
              </div>
            </div>

            {showCriarFicha && (
              <CriarFichaForm
                nomeInicial={novaFichaNome}
                saving={saving}
                onConfirm={handleCreateFicha}
                onCancel={() => setShowCriarFicha(false)}
              />
            )}

            {/* Seletor de periodizacao + agrupamento dos treinos */}
            <PlanificadorPeriodizacoesUI
              periodizacoes={periodizacoesList}
              treinos={treinos}
              periodizacaoSelecionada={periodizacaoSelecionada}
              onSelectPeriodizacao={setPeriodizacaoSelecionada}
              onExcluirPeriodizacao={handleExcluirPeriodizacao}
              expandedTreino={expandedTreino}
              onToggleTreino={(key) => setExpandedTreino(expandedTreino === key ? null : key)}
              onDeleteTreino={(key) => setDeleteTreinoKey(key)}
              onUpdateNomeTreino={handleUpdateNomeTreino}
              addExTreinoKey={addExTreinoKey}
              onToggleAdd={(key) => { setAddExTreinoKey(addExTreinoKey === key ? null : key); setEditExState(null); }}
              editExState={editExState}
              onToggleEditExercicio={(trKey, ex) => handleToggleEditExercicio(trKey, ex)}
              onEditExercicio={(trKey, ex) => handleEditExercicio(trKey, ex)}
              onMoverExercicio={(trKey, idx, dir) => handleMoverExercicio(trKey, idx, dir)}
              onUpdateObservacoes={(trKey, obs) => handleUpdateObservacoes(trKey, obs)}
              onAddExercicio={(trKey, ex) => handleAddExercicio(trKey, ex)}
              onDeleteExercicio={(trKey, exKey) => handleDeleteExercicio(trKey, exKey)}
              onDuplicarTreino={handleDuplicarTreino}
              onAddTreino={handleAddTreino}
            />

            {showCardioTreino ? (
              <CardioTreinoForm
                nomesExistentes={treinos.map(x => x.nome)}
                saving={saving}
                onConfirm={handleAddTreinoCardio}
                onCancel={() => setShowCardioTreino(false)}
              />
            ) : (
              <button
                onClick={() => { setShowCardioTreino(true); setAddExTreinoKey(null); setEditExState(null); }}
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 border border-dashed border-orange-400/40 hover:border-orange-300/70 hover:bg-orange-400/[0.03] text-orange-300 text-sm font-semibold rounded-xl px-4 py-3 transition-all duration-150"
              >
                <Flame size={15} /> Cardio Isolado
              </button>
            )}

            {(totalMeta > 0 || metaCardioMin > 0) && (
              <AnalyticsSection
                metaByGroup={metaByGroup}
                validByGroup={validByGroup}
                totalMeta={totalMeta}
                totalValid={totalValid}
                metaCardioMin={metaCardioMin}
                validCardioMin={validCardioMin}
                genero={generoGraficos}
              />
            )}
          </div>
        )}

        {/* Modal: sessão expirada (órfã) */}
        {isStudent && sessaoExpirada && (() => {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="bg-panel border border-line clip-bevel p-6 md:p-8 max-w-md w-full space-y-5 shadow-2xl">
                <div className="text-center space-y-2">
                  <h3 className="font-display font-normal uppercase text-[22px] text-bone tracking-[0.02em]">Sessão Expirada</h3>
                  <p className="text-[13px] text-muted-steel">Parece que você esqueceu de finalizar este treino.</p>
                </div>

                {logFeedback?.tipo === 'erro' && (
                  <div className="flex items-center gap-2 px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20 clip-bevel-sm">
                    <AlertCircle size={14} className="shrink-0" />
                    <span className="flex-1">{logFeedback.msg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <button
                    onClick={() => void handleFinalizarTreino(DURACAO_TETO_SEG)}
                    disabled={savingLog}
                    className="btn-forge btn-full"
                  >
                    {savingLog ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {savingLog ? 'Salvando...' : 'Finalizar e Salvar'}
                  </button>
                  <button
                    onClick={() => handleDescartarSessao()}
                    disabled={savingLog}
                    className="btn-danger btn-full"
                  >
                    <Trash2 size={16} /> Descartar Treino
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal: confirmacao antes de finalizar o treino */}
        {isStudent && finalizarConfirmOpen && sessaoAtiva && !sessaoExpirada && (() => {
          const duracaoAtual = Math.max(0, Math.floor((Date.now() - sessaoAtiva.iniciadaEm) / 1000));
          const treinoConfirm = treinos.find(t => t.dbId === sessaoAtiva.treinoId);
          const isSomenteCardio = treinoEhSomenteCardio(treinoConfirm);
          const curto = duracaoAtual <= DURACAO_MINIMA_SEG && !isSomenteCardio;
          const seriesMarcadas = contarSeriesRegistradas();
          const cardiosMarcados = contarCardiosRegistrados();
          const resumoItens = [
            `${seriesMarcadas} série(s)`,
            ...(cardiosMarcados > 0 ? [`${cardiosMarcados} cardio(s)`] : []),
          ].join(' · ');
          const treinoNome = treinoConfirm?.nome || 'Treino';

          async function confirmarSalvar() {
            // Nenhum dado preenchido (série marcada ou cardio digitado):
            // não tentamos um INSERT vazio que vai quebrar — oferta descarte.
            if (!temDadosDigitados()) {
              setFinalizarConfirmOpen(false);
              setMuitoCurtoOpen(true);
              return;
            }
            const ok = await handleFinalizarTreino();
            if (ok) setFinalizarConfirmOpen(false);
          }

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="bg-panel border border-line clip-bevel p-6 md:p-8 max-w-md w-full space-y-5 shadow-2xl">
                <div className="text-center space-y-2">
                  <h3 className="font-display font-normal uppercase text-[22px] text-bone tracking-[0.02em]">Finalizar Treino?</h3>
                  <p className="text-[13px] text-muted-steel">
                    {treinoNome} · {formatarDuracao(duracaoAtual)} · {resumoItens}
                  </p>
                </div>

                {curto && (
                  <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 clip-bevel-sm">
                    <AlertCircle size={14} className="shrink-0" />
                    <span className="flex-1">
                      Treinos com menos de 05:00 não são salvos no sistema. Ao descartar, nada será registrado.
                    </span>
                  </div>
                )}

                {logFeedback?.tipo === 'erro' && (
                  <div className="flex items-center gap-2 px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20 clip-bevel-sm">
                    <AlertCircle size={14} className="shrink-0" />
                    <span className="flex-1">{logFeedback.msg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {!curto && (
                    <button
                      onClick={() => void confirmarSalvar()}
                      disabled={savingLog}
                      className="btn-forge btn-full"
                    >
                      {savingLog ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {savingLog ? 'Salvando...' : 'Salvar Treino'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleDescartarSessao(false);
                      setLogFeedback({ tipo: 'ok', msg: curto
                        ? `Sessão encerrada. Treinos abaixo de 05:00 não são salvos no sistema.`
                        : `${treinoNome} descartado. Nenhuma série foi salva.` });
                    }}
                    disabled={savingLog}
                    className="btn-danger btn-full"
                  >
                    <Trash2 size={16} /> Descartar Treino
                  </button>
                  <button
                    onClick={() => setFinalizarConfirmOpen(false)}
                    disabled={savingLog}
                    className="btn-steel btn-full"
                  >
                    Continuar Treino
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal: treino muito curto ou sem dados — soft discard prompt */}
        {isStudent && muitoCurtoOpen && (() => {
          const treinoCurto = treinos.find(t => t.dbId === sessaoAtiva?.treinoId);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
              <div className="bg-panel border border-line clip-bevel p-6 md:p-8 max-w-md w-full space-y-5 shadow-2xl">
                <div className="text-center space-y-2">
                  <h3 className="font-display font-normal uppercase text-[22px] text-bone tracking-[0.02em]">Treino muito curto</h3>
                  <p className="text-[13px] text-muted-steel">
                    {treinoCurto?.nome || 'Este treino'} com menos de 1 minuto ou nenhum dado preenchido não pode ser salvo.
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      handleDescartarSessao(false);
                      setLogFeedback({ tipo: 'ok', msg: 'Sessão descartada. Nada foi registrado.' });
                    }}
                    disabled={savingLog}
                    className="btn-danger btn-full"
                  >
                    <Trash2 size={16} /> Sim, descartar
                  </button>
                  <button
                    onClick={() => setMuitoCurtoOpen(false)}
                    disabled={savingLog}
                    className="btn-steel btn-full"
                  >
                    Voltar ao treino
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal confirmação: remover treino */}
        {deleteTreinoKey !== null && (() => {
          const t = treinos.find(x => x.key === deleteTreinoKey);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTreinoKey(null)}>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 max-w-sm w-[95vw] md:w-full mx-2 md:mx-4 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <Trash2 size={18} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">Remover Treino</h3>
                    <p className="text-xs text-zinc-500">{t?.nome}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-400">
                  Remover este treino e todos os seus exercícios da ficha? O histórico de execução dos exercícios removidos também será apagado.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setDeleteTreinoKey(null)}
                    className="btn-steel"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleDeleteTreino(deleteTreinoKey)}
                    className="btn-danger"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Bottom Sheet: Alternar Treino (seleção temporária — não persiste no planejamento) */}
        {isStudent && alternarTreinoOpen && (() => {
          const listarTreino = (t: TreinoUI, subInfo?: string) => {
            const ehHoje = !!t.dbId && treinosDeHoje.some(x => x.dbId === t.dbId);
            const concluidoHoje = !!t.dbId && temLogTreinoHoje(t.dbId);
            const feitoNaSemana = !!t.dbId && treinosCompletosNaSemana.has(t.dbId);
            const emAndamento = !!t.dbId && sessaoAtiva?.treinoId === t.dbId;
            const ativo = selectedTreinoKey === t.key;
            const cardioIsolado = ehCardioIsolado(t);
            return (
              <button
                key={t.key}
                type="button"
                disabled={concluidoHoje || (feitoNaSemana && !ativo)}
                onClick={() => selecionarTreinoAtivo(t.key)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                  ativo
                    ? 'border-accent/60 bg-accent/[0.07] text-zinc-100'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-accent/50'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {cardioIsolado
                    ? <Flame size={15} className="text-orange-400 shrink-0" />
                    : <Dumbbell size={15} className="text-zinc-500 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{t.nome}</span>
                    <span className="block text-[11px] text-zinc-500 truncate">
                      {cardioIsolado ? resumoMetaCardioTreino(t) : `${t.exercicios.length} exercício(s)`}
                      {ehHoje && ' · hoje'}
                      {subInfo ? ` · ${subInfo}` : ''}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {ativo && <span className="text-[10px] uppercase font-bold text-accent-light flex items-center gap-1"><Check size={12} /> Ativo</span>}
                  {emAndamento && <span className="text-[10px] uppercase font-bold text-ok flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Em andamento</span>}
                  {concluidoHoje && !ativo && <span className="text-[10px] uppercase font-bold text-ok flex items-center gap-1"><Check size={12} /> Feito hoje</span>}
                  {feitoNaSemana && !ativo && !concluidoHoje && <Lock size={13} className="text-zinc-600" />}
                </span>
              </button>
            );
          };

          return (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setAlternarTreinoOpen(false)}>
              <div className="w-full max-w-lg bg-panel border border-line sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl animate-sheet-up" onClick={e => e.stopPropagation()}>
                <div className="px-5 pt-4 pb-3 border-b border-line shrink-0">
                  <h3 className="font-display font-normal uppercase text-[18px] text-bone tracking-[0.02em]">Alternar Treino</h3>
                  <p className="text-[12.5px] text-muted-steel mt-1">
                    Escolha o treino que ficará ativo na tela principal agora. A fila do dia continua conforme seu planejamento semanal.
                  </p>
                </div>

                <div className="overflow-y-auto px-5 py-4 space-y-5 grow">
                  {treinos.length === 0 ? (
                    <p className="text-sm text-zinc-400 text-center py-4">Nenhum treino disponível na ficha.</p>
                  ) : (
                    <>
                      {treinosDeHoje.length > 0 && (
                        <section className="space-y-2">
                          <h4 className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-steel">Hoje</h4>
                          {treinosDeHoje.map(t => listarTreino(t))}
                        </section>
                      )}
                      {treinosAgendadosFuturos.length > 0 && (
                        <section className="space-y-2">
                          <h4 className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-steel">Agendados para amanhã/depois</h4>
                          {treinosAgendadosFuturos.map(t => listarTreino(t, rotDiasAgendados(diasAgendadosPorTreino.get(t.dbId || '') || [])))}
                        </section>
                      )}
                      {treinosLivres.length > 0 && (
                        <section className="space-y-2">
                          <h4 className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-steel">Treinos Livres</h4>
                          {treinosLivres.map(t => listarTreino(t))}
                        </section>
                      )}
                    </>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-line shrink-0 flex justify-end">
                  <button type="button" onClick={() => setAlternarTreinoOpen(false)} className="btn-steel-sm">Fechar</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal Story Card 9:16 para Compartilhamento */}
        <WorkoutStoryModal
          isOpen={storyModalOpen}
          onClose={() => setStoryModalOpen(false)}
          data={storyModalData}
        />

        {/* Modal Registrar/Concluir Cardio Isolado: modo livre (fora da ficha)
            ou modo ação direta da ficha (treinoAlvo preenchido → bypass) */}
        {isStudent && selectedAlunoId && (
          <CardioIsoladoModal
            isOpen={cardioIsoladoOpen}
            onClose={handleFecharCardioIsolado}
            userId={selectedAlunoId}
            treinoAlvo={cardioIsoladoAlvo}
            onSaved={cardioIsoladoAlvo
              ? (resultado) => handleRegistrarCardioIsoladoDoTreino(
                  resultado,
                  treinos.find(t => t.dbId === cardioIsoladoAlvo.treinoId) || null
                )
              : handleRegistrarCardioIsolado}
          />
        )}
      </div>
    </div>
  );
}

// =============================================================
// PLACEHOLDER VAZIO (gestor sem ficha)
// =============================================================

function ClipboardListPlaceholder() {
  return (
    <div className="space-y-1">
      <Dumbbell size={28} className="mx-auto text-zinc-600 mb-3" />
      <p className="text-sm text-zinc-400">Este aluno não possui ficha ativa.</p>
      <p className="text-xs text-zinc-600">Crie uma nova ficha para começar a prescrever treinos.</p>
    </div>
  );
}

// =============================================================
// ALUNO: dia de descanso / dia sem treino (aba "Treino de Hoje")
// =============================================================

function DiaDeDescanso({ onTrocar }: { onTrocar: () => void }) {
  return (
    <div className="bg-panel border border-line px-5 py-10 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-ok/[0.08] border border-ok/25 flex items-center justify-center">
        <Moon size={24} className="text-ok" />
      </div>
      <div>
        <h3 className="text-base font-bold text-bone mb-1">Dia de Descanso</h3>
        <p className="text-[13px] text-muted-steel max-w-sm">
          O planejamento prevê que hoje você descanse. Aproveite para recuperar a energia e voltar amanhã!
        </p>
      </div>
      <button onClick={onTrocar} className="btn-ghost text-[11px] flex items-center justify-center gap-1.5 mt-1">
        <RotateCcw size={12} /> Trocar para um treino hoje
      </button>
    </div>
  );
}

function DiaSemTreino({ onTrocar }: { onTrocar: () => void }) {
  return (
    <div className="bg-panel border border-line px-5 py-10 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-full bg-zinc-800/60 border border-zinc-700 flex items-center justify-center">
        <Dumbbell size={24} className="text-zinc-500" />
      </div>
      <div>
        <h3 className="text-base font-bold text-bone mb-1">Nenhum treino para hoje</h3>
        <p className="text-[13px] text-muted-steel max-w-sm">
          Ainda não há treino alocado para hoje no planejamento. Escolha um treino da sua ficha para a sessão de hoje.
        </p>
      </div>
      <button onClick={onTrocar} className="btn-forge text-xs flex items-center justify-center gap-1.5 mt-1">
        <RotateCcw size={12} /> Escolher Treino de Hoje
      </button>
    </div>
  );
}

// =============================================================
// FORM CRIAR FICHA (nome pré-preenchido, editável)
// =============================================================

function CriarFichaForm({ nomeInicial, saving, onConfirm, onCancel }: {
  nomeInicial: string;
  saving: boolean;
  onConfirm: (payload: NovaFichaPayload) => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);

  const podeConfirmar = nome.trim() !== '' && !saving;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-[0.15em] flex items-center gap-2">
          <div className="w-1 h-4 bg-accent rounded-full" />
          Nova Ficha de Treino
        </h3>
        <button onClick={onCancel} className="btn-ghost">Cancelar</button>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold block mb-1.5">Nome da Ficha</label>
        <input
          type="text"
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Ficha 01 - Nome do Aluno"
          autoFocus
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-150"
        />
        <p className="text-[11px] text-zinc-600 mt-1.5">Ao salvar, a ficha ativa anterior deste aluno será arquivada automaticamente.</p>
      </div>

      <button
        onClick={() => onConfirm({ nome: nome.trim() })}
        disabled={!podeConfirmar}
        className="btn-forge"
      >
        {saving ? 'Criando...' : 'Criar Ficha'}
      </button>
    </div>
  );
}

// =============================================================
// INLINE: ADICIONAR TREINO DE CARDIO ISOLADO
// =============================================================

// Prescrição de cardio compartilhada entre o fluxo de Cardio Isolado (cria um
// treino) e o "Adicionar Exercício" dentro de qualquer treino (unificação).
// Modalidades não-corrida: duração/distância alvo. Corrida: tipo de treino +
// tempo estimado (opcional) + campos específicos (tiros / km do longão).
function CardioPrescricaoForm({
  value,
  onChange,
}: {
  value: CardioPrescricao;
  onChange: (patch: Partial<CardioPrescricao>) => void;
}) {
  const ehCorrida = MODALIDADES_CORRIDA.has(value.modalidade);
  const inputCls = "w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all duration-150";

  function trocarModalidade(nova: string) {
    const patch: Partial<CardioPrescricao> = { modalidade: nova };
    if (MODALIDADES_CORRIDA.has(nova) && !MODALIDADES_CORRIDA.has(value.modalidade)) {
      patch.metaMin = 0;
      patch.metaKm = '';
    }
    patch.tipoTreinoCorrida = '';
    patch.metaMinutos = '';
    patch.qtdTiros = '';
    patch.distanciaTiro = '';
    patch.metaDistanciaCorrida = '';
    onChange(patch);
  }

  function escolherTipo(tipo: TipoTreinoCorrida | '') {
    onChange({ tipoTreinoCorrida: tipo, metaMinutos: '', qtdTiros: '', distanciaTiro: '', metaDistanciaCorrida: '' });
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold block mb-1.5">Modalidade</label>
        <select
          value={value.modalidade}
          onChange={e => trocarModalidade(e.target.value)}
          className={inputCls}
        >
          {MODALIDADES_CARDIO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {!ehCorrida && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Duração alvo (min) *</label>
            <input
              type="number"
              min={1}
              max={600}
              className={inputCls}
              value={value.metaMin}
              onChange={e => onChange({ metaMin: Number(e.target.value) })}
              placeholder="25"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Distância alvo (km, opcional)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              className={inputCls}
              value={value.metaKm}
              onChange={e => onChange({ metaKm: e.target.value })}
              placeholder="5"
            />
          </div>
        </div>
      )}

      {ehCorrida && (
        <div className="bg-orange-400/[0.05] border border-orange-400/20 rounded-lg p-2.5 space-y-2">
          <p className="text-[10px] text-orange-300 uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
            🏃 Tipo de Treino (corrida)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Tipo de Treino *</label>
              <select
                value={value.tipoTreinoCorrida}
                onChange={e => escolherTipo(e.target.value as TipoTreinoCorrida | '')}
                className={inputCls}
              >
                {TIPOS_TREINO_CORRIDA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Tempo estimado (min, opcional)</label>
              <input
                type="number"
                min={1}
                max={600}
                className={inputCls}
                value={value.metaMinutos}
                onChange={e => onChange({ metaMinutos: e.target.value })}
                placeholder="Ex: 60"
              />
              <p className="text-[10px] text-zinc-600 mt-0.5">Usado na meta semanal de cardio e no pré-preenchimento do aluno.</p>
            </div>
          </div>

          {value.tipoTreinoCorrida === 'regenerativo' && (
            <p className="text-[11px] text-zinc-600">Ex: corrida regenerativa de 40 minutos.</p>
          )}

          {value.tipoTreinoCorrida === 'intervalado' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Quantidade de Tiros</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls}
                  value={value.qtdTiros}
                  onChange={e => onChange({ qtdTiros: e.target.value })}
                  placeholder="Ex: 10"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 block mb-1">Distância do Tiro</label>
                <input
                  type="text"
                  className={inputCls}
                  value={value.distanciaTiro}
                  onChange={e => onChange({ distanciaTiro: e.target.value })}
                  placeholder="Ex: 400m ou 1km"
                />
              </div>
            </div>
          )}

          {value.tipoTreinoCorrida === 'longao' && (
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Quilometragem Alvo</label>
              <input
                type="number"
                min={1}
                step="0.1"
                className={inputCls}
                value={value.metaDistanciaCorrida}
                onChange={e => onChange({ metaDistanciaCorrida: e.target.value })}
                placeholder="Ex: 18"
              />
              <p className="text-[11px] text-zinc-600 mt-1">Ex: longão de 18 km.</p>
            </div>
          )}

          {value.tipoTreinoCorrida === '' && (
            <p className="text-[11px] text-zinc-600">Selecione um tipo: Regenerativo, Intervalado ou Longão.</p>
          )}
        </div>
      )}
    </div>
  );
}

function CardioTreinoForm({ nomesExistentes, saving, onConfirm, onCancel }: {
  nomesExistentes: string[];
  saving: boolean;
  onConfirm: (payload: CardioTreinoPayload) => void;
  onCancel: () => void;
}) {
  const [nome, setNome] = useState('');
  const [nomePersonalizado, setNomePersonalizado] = useState(false);
  const [prescricao, setPrescricao] = useState<CardioPrescricao>({
    modalidade: MODALIDADES_CARDIO[0].value,
    metaMin: 25,
    metaKm: '',
    tipoTreinoCorrida: '',
    metaMinutos: '',
    qtdTiros: '',
    distanciaTiro: '',
    metaDistanciaCorrida: '',
  });

  const ehCorrida = MODALIDADES_CORRIDA.has(prescricao.modalidade);
  const nomeAuto = gerarNomeCardioIsolado({
    modalidade: prescricao.modalidade,
    metaMin: prescricao.metaMin,
    metaKm: prescricao.metaKm,
    tipoTreinoCorrida: prescricao.tipoTreinoCorrida,
    metaMinutos: Number(prescricao.metaMinutos) || null,
    qtdTiros: Number(prescricao.qtdTiros) || null,
    distanciaTiro: prescricao.distanciaTiro,
    metaDistanciaCorrida: Number(prescricao.metaDistanciaCorrida) || null,
  });
  const nomeFinal = nomePersonalizado
    ? nome.trim()
    : nomeCardioUnico(nomeAuto, nomesExistentes);
  const nomeDuplicado = nomePersonalizado
    ? nome.trim() !== '' && nomesExistentes.some(n => n.trim().toLowerCase() === nome.trim().toLowerCase())
    : false;
  const podeConfirmar = !saving
    && (ehCorrida ? prescricao.tipoTreinoCorrida !== '' : prescricao.metaMin > 0)
    && (nomePersonalizado ? (nome.trim() !== '' && !nomeDuplicado) : nomeFinal !== '');
  const modalidadeLabel = MODALIDADES_CARDIO.find(m => m.value === prescricao.modalidade)?.label ?? prescricao.modalidade;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-[0.15em] flex items-center gap-2">
          <Flame size={13} className="text-orange-400" />
          Adicionar Cardio Isolado
        </h3>
        <button onClick={onCancel} className="btn-ghost">Cancelar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-semibold block mb-1.5">Nome (opcional)</label>
          <input
            type="text"
            value={nomePersonalizado ? nome : nomeAuto}
            onChange={e => { setNome(e.target.value); setNomePersonalizado(e.target.value !== ''); }}
            placeholder={nomeAuto || 'Nome do treino'}
            autoFocus
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-150"
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            Por padrão é gerado automaticamente da prescrição{!nomePersonalizado ? `: "${nomeFinal}"` : ''}. Digite para personalizar.
          </p>
          {nomeDuplicado && (
            <p className="text-[11px] text-red-400 mt-1.5">Já existe um treino com esse nome nesta ficha.</p>
          )}
        </div>
        <div>
          <CardioPrescricaoForm
            value={prescricao}
            onChange={patch => setPrescricao(prev => ({ ...prev, ...patch }))}
          />
        </div>
      </div>

      <p className="text-[11px] text-zinc-600">
        Cadastra o cardio como <strong className="text-zinc-400">um único exercício</strong> que vale como um treino no dia:
        o aluno preenche tempo/distância e finaliza direto. Alimenta a meta semanal de cardio. Depois é só distribuí-lo no calendário semanal.
      </p>

      {ehCorrida && prescricao.tipoTreinoCorrida === '' && (
        <p className="text-[11px] text-red-400">Selecione um Tipo de Treino para a modalidade {modalidadeLabel}.</p>
      )}

      <button
        onClick={() => onConfirm({
          nome: nomeFinal,
          modalidade: prescricao.modalidade.trim(),
          metaMin: ehCorrida ? 0 : prescricao.metaMin,
          metaKm: ehCorrida ? '' : prescricao.metaKm,
          tipoTreinoCorrida: ehCorrida && prescricao.tipoTreinoCorrida ? prescricao.tipoTreinoCorrida : null,
          metaMinutos: ehCorrida ? (Number(prescricao.metaMinutos) || null) : null,
          qtdTiros: ehCorrida && prescricao.tipoTreinoCorrida === 'intervalado' ? (Number(prescricao.qtdTiros) || null) : null,
          distanciaTiro: ehCorrida && prescricao.tipoTreinoCorrida === 'intervalado' ? (prescricao.distanciaTiro.trim() || undefined) : undefined,
          metaDistanciaCorrida: ehCorrida && prescricao.tipoTreinoCorrida === 'longao' ? (Number(prescricao.metaDistanciaCorrida) || null) : null,
        })}
        disabled={!podeConfirmar}
        className="btn-forge"
      >
        {saving ? 'Criando...' : 'Adicionar Cardio Isolado'}
      </button>
    </div>
  );
}

// =============================================================
// INLINE: ADICIONAR TREINO
// =============================================================

function AddTreinoInline({
  nomesExistentes = [],
  onAdd,
}: {
  nomesExistentes?: string[];
  onAdd: (nome: string) => { ok: boolean; erro?: string } | void;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  function handleAdd() {
    const n = nome.trim();
    if (!n) {
      setErro('Digite o nome do treino.');
      return;
    }
    const duplicado = nomesExistentes.some(
      existente => existente.trim().toLowerCase() === n.toLowerCase()
    );
    if (duplicado) {
      setErro(`Já existe um treino com o nome "${n}". Por favor, altere o nome pois já existe aquele.`);
      return;
    }

    const res = onAdd(n);
    if (res && !res.ok) {
      setErro(res.erro || `Já existe um treino com o nome "${n}".`);
      return;
    }

    setNome('');
    setErro(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setErro(null); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-dashed border-zinc-700 hover:border-accent/50 text-zinc-500 hover:text-accent rounded-2xl text-xs font-medium transition-all duration-150"
      >
        <Plus size={14} /> Adicionar Treino (ex: Treino A, Membros Inferiores)
      </button>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={nome}
          onChange={e => {
            setNome(e.target.value);
            if (erro) setErro(null);
          }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Nome do treino (ex: Treino A)"
          autoFocus
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all duration-150"
        />
        <button onClick={handleAdd} disabled={!nome.trim()} className="btn-forge !h-[44px] px-4 text-[13px] flex items-center gap-1">
          <Check size={12} /> Adicionar
        </button>
        <button onClick={() => { setOpen(false); setErro(null); }} className="btn-steel !h-[44px] px-4 text-[13px]">
          Cancelar
        </button>
      </div>
      {erro && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs font-medium">
          <AlertCircle size={14} className="shrink-0 text-red-400" />
          <span>{erro}</span>
        </div>
      )}
    </div>
  );
}

// =============================================================
// BOTAO: NOVA PERIODIZACAO (gestor)
// =============================================================

function NovaPeriodizacaoButton({ onCriar, saving }: {
  onCriar: (nome: string) => Promise<{ ok: boolean; erro?: string }>;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  async function handleConfirm() {
    const n = nome.trim();
    if (!n) { setErro('Digite o nome da periodização.'); return; }
    setCriando(true);
    const res = await onCriar(n);
    setCriando(false);
    if (!res.ok) { setErro(res.erro || 'Erro ao criar periodização.'); return; }
    setNome('');
    setErro(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setErro(null); }}
        disabled={saving}
        className="btn-steel"
      >
        <Layers size={14} /> Nova Periodização
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
      <input
        type="text"
        value={nome}
        onChange={e => { setNome(e.target.value); if (erro) setErro(null); }}
        onKeyDown={e => { if (e.key === 'Enter') void handleConfirm(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Ex: High Volume"
        autoFocus
        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent min-w-[130px]"
      />
      <button onClick={() => void handleConfirm()} disabled={!nome.trim() || criando} className="btn-forge !h-[34px] px-3 text-[12px] flex items-center gap-1">
        <Check size={12} /> {criando ? '...' : 'Criar'}
      </button>
      <button onClick={() => setOpen(false)} className="btn-steel !h-[34px] px-2 text-[12px]">Cancelar</button>
      {erro && <span className="text-[11px] text-red-400 max-w-[160px]">{erro}</span>}
    </div>
  );
}

// =============================================================
// PLANIFICADOR DE PERIODIZACOES (gestor)
// Agrupa os treinos por periodizacao (abas + lista da selecionada).
// =============================================================

function PlanificadorPeriodizacoesUI({
  periodizacoes,
  treinos,
  periodizacaoSelecionada,
  onSelectPeriodizacao,
  onExcluirPeriodizacao,
  expandedTreino,
  onToggleTreino,
  onDeleteTreino,
  onUpdateNomeTreino,
  addExTreinoKey,
  onToggleAdd,
  editExState,
  onToggleEditExercicio,
  onEditExercicio,
  onMoverExercicio,
  onUpdateObservacoes,
  onAddExercicio,
  onDeleteExercicio,
  onDuplicarTreino,
  onAddTreino,
}: {
  periodizacoes: Periodizacao[];
  treinos: TreinoUI[];
  periodizacaoSelecionada: string;
  onSelectPeriodizacao: (id: string) => void;
  onExcluirPeriodizacao: (id: string) => Promise<{ ok: boolean; erro?: string }>;
  expandedTreino: string | null;
  onToggleTreino: (key: string) => void;
  onDeleteTreino: (key: string) => void;
  onUpdateNomeTreino: (key: string, nome: string) => { ok: boolean; erro?: string };
  addExTreinoKey: string | null;
  onToggleAdd: (key: string) => void;
  editExState: { treinoKey: string; ex: ExercicioUI } | null;
  onToggleEditExercicio: (treinoKey: string, ex: ExercicioUI) => void;
  onEditExercicio: (treinoKey: string, ex: ExercicioUI) => void;
  onMoverExercicio: (treinoKey: string, idx: number, direcao: -1 | 1) => void;
  onUpdateObservacoes: (treinoKey: string, obs: string) => void;
  onAddExercicio: (treinoKey: string, ex: ExercicioUI) => void;
  onDeleteExercicio: (treinoKey: string, exKey: string) => void;
  onDuplicarTreino: (treinoKey: string, periodizacaoAlvoId: string) => Promise<{ ok: boolean; erro?: string }>;
  onAddTreino: (nome: string) => { ok: boolean; erro?: string } | void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<Periodizacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const periodizacaoAtiva = periodizacoes.find(p => p.id === periodizacaoSelecionada) || periodizacoes[0] || null;

  const treinosDaSelecionada = useMemo(
    () => treinos.filter(t => t.periodizacaoId === periodizacaoAtiva?.id),
    [treinos, periodizacaoAtiva]
  );

  async function confirmarExclusao() {
    if (!confirmDelete) return;
    setExcluindo(true);
    const res = await onExcluirPeriodizacao(confirmDelete.id);
    setExcluindo(false);
    if (res.ok) setConfirmDelete(null);
  }

  if (periodizacoes.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-2">
        <p className="text-sm text-zinc-400">Nenhuma periodização cadastrada nesta ficha.</p>
        <p className="text-xs text-zinc-600">Use o botão "Nova Periodização" acima para criar variações de volume, ex.: High Volume, Low Volume.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Abas / chips de periodizacoes */}
      <div className="flex flex-wrap items-center gap-2">
        {periodizacoes.map(p => {
          const ativo = p.id === periodizacaoAtiva?.id;
          const qtd = treinos.filter(t => t.periodizacaoId === p.id).length;
          return (
            <div
              key={p.id}
              className={`group flex items-center gap-1.5 clip-bevel-sm border px-3 py-1.5 transition-colors cursor-pointer ${
                ativo
                  ? 'border-accent bg-accent/15 text-accent-light'
                  : 'border-line bg-panel-2 text-zinc-300 hover:border-accent/40'
              }`}
              onClick={() => onSelectPeriodizacao(p.id)}
              title={ativo ? 'Periodização ativa' : `Ver "${p.nome}"`}
            >
              <Layers size={12} className="shrink-0" />
              <span className="text-xs font-bold">{p.nome}</span>
              <span className="text-[10px] text-muted-steel">{qtd}</span>
              {periodizacoes.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}
                  className="ml-1 p-0.5 text-muted-steel hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Excluir periodização e seus treinos"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Lista de treinos da periodizacao selecionada */}
      <div className="space-y-3">
        {treinosDaSelecionada.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <p className="text-sm text-zinc-400">
              {periodizacaoAtiva ? `"${periodizacaoAtiva.nome}"` : 'Esta periodização'} ainda não tem treinos.
            </p>
            <p className="text-xs text-zinc-600 mt-1">Adicione um treino abaixo ou use "Duplicar para..." em outro treino.</p>
          </div>
        ) : (
          treinosDaSelecionada.map(t => {
            const nomesExistentesPid = treinosDaSelecionada.map(x => x.nome);
            return (
              <TreinoEditorCard
                key={t.key}
                treino={t}
                nomesExistentes={nomesExistentesPid}
                expanded={expandedTreino === t.key}
                onToggle={() => onToggleTreino(t.key)}
                onDelete={() => onDeleteTreino(t.key)}
                onUpdateNome={(novoNome) => onUpdateNomeTreino(t.key, novoNome)}
                addOpen={addExTreinoKey === t.key}
                onToggleAdd={() => onToggleAdd(t.key)}
                editEx={editExState && editExState.treinoKey === t.key ? editExState.ex : null}
                onToggleEdit={(ex) => onToggleEditExercicio(t.key, ex)}
                onEditExercicio={(ex) => onEditExercicio(t.key, ex)}
                onMoverExercicio={(idx, dir) => onMoverExercicio(t.key, idx, dir)}
                onUpdateObservacoes={(obs) => onUpdateObservacoes(t.key, obs)}
                onAddExercicio={(ex) => onAddExercicio(t.key, ex)}
                onDeleteExercicio={(exKey) => onDeleteExercicio(t.key, exKey)}
                periodizacoesAlvo={periodizacoes.filter(p => p.id !== t.periodizacaoId)}
                onDuplicar={(pid) => onDuplicarTreino(t.key, pid)}
              />
            );
          })
        )}

        <AddTreinoInline nomesExistentes={treinosDaSelecionada.map(x => x.nome)} onAdd={onAddTreino} />
      </div>

      {/* Modal de confirmacao de exclusao de periodizacao */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Trash2 size={16} className="text-red-400" /> Excluir periodização "{confirmDelete.nome}"?
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Todos os treinos desta periodização (e seus exercícios) serão removidos permanentemente.
              Os treinos já alocados no planejamento semanal do aluno serão desfeitos.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-steel">Cancelar</button>
              <button onClick={() => void confirmarExclusao()} disabled={excluindo} className="btn-danger flex items-center gap-1">
                {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// CARD EDITOR DE TREINO (gestor)
// =============================================================

function TreinoEditorCard({
  treino,
  expanded,
  nomesExistentes,
  onToggle,
  onDelete,
  onUpdateNome,
  addOpen,
  onToggleAdd,
  editEx,
  onToggleEdit,
  onEditExercicio,
  onMoverExercicio,
  onUpdateObservacoes,
  onAddExercicio,
  onDeleteExercicio,
  periodizacoesAlvo = [],
  onDuplicar,
}: {
  treino: TreinoUI;
  expanded: boolean;
  nomesExistentes: string[];
  onToggle: () => void;
  onDelete: () => void;
  onUpdateNome: (novoNome: string) => { ok: boolean; erro?: string };
  addOpen: boolean;
  onToggleAdd: () => void;
  editEx: ExercicioUI | null;
  onToggleEdit: (ex: ExercicioUI) => void;
  onEditExercicio: (ex: ExercicioUI) => void;
  onMoverExercicio: (idx: number, direcao: -1 | 1) => void;
  onUpdateObservacoes: (obs: string) => void;
  onAddExercicio: (ex: ExercicioUI) => void;
  onDeleteExercicio: (exKey: string) => void;
  periodizacoesAlvo?: Periodizacao[];
  onDuplicar?: (periodizacaoAlvoId: string) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [editingNome, setEditingNome] = useState(false);
  const [nomeTemp, setNomeTemp] = useState(treino.nome);
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [duplicarOpen, setDuplicarOpen] = useState(false);
  const [duplicandoPid, setDuplicandoPid] = useState<string | null>(null);
  const totalSeries = treino.exercicios.reduce((sum, ex) => sum + ex.series, 0);

  function handleStartEditNome(e: React.MouseEvent) {
    e.stopPropagation();
    setNomeTemp(treino.nome);
    setErroNome(null);
    setEditingNome(true);
  }

  function handleSalvarNome(e?: React.MouseEvent | React.FormEvent) {
    if (e) e.stopPropagation();
    const n = nomeTemp.trim();
    if (!n) {
      setErroNome('O nome do treino não pode ser vazio.');
      return;
    }
    const duplicado = nomesExistentes.some(
      nome => nome.trim().toLowerCase() === n.toLowerCase() && nome.trim().toLowerCase() !== treino.nome.trim().toLowerCase()
    );
    if (duplicado) {
      setErroNome(`Já existe um treino com o nome "${n}". Por favor, altere o nome pois já existe aquele.`);
      return;
    }

    const res = onUpdateNome(n);
    if (!res.ok) {
      setErroNome(res.erro || 'Erro ao renomear treino.');
      return;
    }
    setErroNome(null);
    setEditingNome(false);
  }

  function handleCancelarEditNome(e: React.MouseEvent) {
    e.stopPropagation();
    setNomeTemp(treino.nome);
    setErroNome(null);
    setEditingNome(false);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 md:px-6 py-4 cursor-pointer hover:bg-zinc-800/30 transition-colors duration-150"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
          <div className="w-1 h-6 bg-accent rounded-full shrink-0" />
          <div className="min-w-0 flex-1">
            {editingNome ? (
              <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 max-w-md">
                  <input
                    type="text"
                    value={nomeTemp}
                    onChange={e => {
                      setNomeTemp(e.target.value);
                      if (erroNome) setErroNome(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSalvarNome(e);
                      if (e.key === 'Escape') handleCancelarEditNome(e as unknown as React.MouseEvent);
                    }}
                    autoFocus
                    placeholder="Nome do treino"
                    className="bg-zinc-950 border border-accent/60 rounded-lg px-2.5 py-1 text-sm font-bold text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleSalvarNome}
                    className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent-light border border-accent/40 transition-colors"
                    title="Salvar novo nome"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelarEditNome}
                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                    title="Cancelar"
                  >
                    <X size={14} />
                  </button>
                </div>
                {erroNome && (
                  <p className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" /> {erroNome}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100 truncate">{treino.nome}</h3>
                {treinoEhSomenteCardio(treino) && (
                  <span className="inline-flex items-center gap-1 font-display text-[9px] uppercase tracking-[0.1em] text-orange-300 border border-orange-400/40 bg-orange-400/[0.08] px-1.5 py-0.5 clip-bevel-sm shrink-0">
                    <Flame size={9} /> Cardio Isolado
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleStartEditNome}
                  className="text-zinc-500 hover:text-accent-light p-1 rounded-md hover:bg-zinc-800 transition-colors shrink-0"
                  title="Editar nome do treino"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
            <p className="text-xs text-zinc-500 mt-0.5">
              {treino.exercicios.length} exercício(s) · {totalSeries} série(s)
              {treino.observacoes.trim() && <span className="ml-2 text-accent/80">· com observação</span>}
              {!treino.dbId && <span className="ml-2 text-yellow-500/80 text-[10px] uppercase tracking-wider font-semibold">novo</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <button
              onClick={() => setDuplicarOpen(o => !o)}
              disabled={periodizacoesAlvo.length === 0}
              className={`text-zinc-500 hover:text-accent-light p-1.5 rounded-lg hover:bg-accent/10 transition-all duration-150 ${periodizacoesAlvo.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={periodizacoesAlvo.length === 0 ? 'Não há outra periodização para duplicar' : 'Duplicar para outra periodização'}
            >
              <Copy size={14} />
            </button>
            {duplicarOpen && (
              <div className="absolute right-0 top-9 z-30 min-w-[180px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50 p-1.5 space-y-0.5">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 px-2 pt-1 pb-1.5">Duplicar para...</p>
                {periodizacoesAlvo.map(p => (
                  <button
                    key={p.id}
                    disabled={duplicandoPid !== null}
                    onClick={async () => {
                      setDuplicandoPid(p.id);
                      const res = await onDuplicar?.(p.id);
                      setDuplicandoPid(null);
                      if (res?.ok) setDuplicarOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Layers size={12} className="text-accent shrink-0" />
                    {duplicandoPid === p.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    <span className="truncate">{p.nome}</span>
                  </button>
                ))}
                <button onClick={() => setDuplicarOpen(false)} className="w-full text-left px-2 py-1 text-xs text-muted-steel hover:text-zinc-200 rounded-lg transition-colors">
                  Cancelar
                </button>
              </div>
            )}
          </div>
          <button onClick={onDelete} className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-all duration-150" title="Remover treino">
            <Trash2 size={14} />
          </button>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 md:px-6 pb-5 pt-1 border-t border-zinc-800/50 space-y-2">
          <div className="pt-3">
            <label className="text-[10px] text-zinc-500 block mb-1 flex items-center gap-1">
              <MessageSquare size={11} /> Observação para o aluno (fixada como leitura no treino)
            </label>
            <textarea
              rows={2}
              value={treino.observacoes}
              onChange={e => onUpdateObservacoes(e.target.value)}
              placeholder="Ex.: foque na execução lenta na descida; aumente a carga na última série..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/10 transition-all duration-150 resize-y"
            />
          </div>

          {treino.exercicios.length === 0 ? (
            <p className="text-zinc-600 text-xs text-center py-4">Nenhum exercício. Adicione o primeiro abaixo.</p>
          ) : (
            treino.exercicios.map((ex, idx) => (
              <div key={ex.key}>
                <div className={`flex items-center justify-between bg-zinc-950 rounded-xl px-4 py-2.5 border transition-colors ${editEx?.key === ex.key ? 'border-accent/60' : 'border-zinc-800/50'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] text-zinc-600 font-mono w-4 shrink-0">{idx + 1}</span>
                    <span className="text-xs font-medium text-zinc-100 truncate">{ex.nome}</span>
                    {ex.categoria === 'cardio' ? (
                      <>
                        <span className="text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                          <Timer size={9} /> Cardio
                        </span>
                        <span className="text-[10px] text-zinc-500 shrink-0 hidden sm:inline">{resumoMetaCardio(ex)}</span>
                      </>
                    ) : (
                      <>
                        {ex.grupo && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full shrink-0">{ex.grupo}</span>}
                        <span className="text-[10px] text-zinc-500 shrink-0 hidden sm:inline">
                          {resumoReps(ex)} · {ex.descanso}s
                          {contarAquecimentos(ex) > 0 && (
                            <span className="text-amber-400/90"> · {contarAquecimentos(ex)} aq</span>
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="shrink-0 ml-2 flex items-center">
                    <button
                      onClick={() => onMoverExercicio(idx, -1)}
                      disabled={idx === 0}
                      title="Mover para cima (executar antes)"
                      className="text-zinc-600 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      onClick={() => onMoverExercicio(idx, 1)}
                      disabled={idx === treino.exercicios.length - 1}
                      title="Mover para baixo (executar depois)"
                      className="text-zinc-600 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      onClick={() => onToggleEdit(ex)}
                      title="Editar exercício"
                      className={`p-1 rounded hover:bg-accent/10 transition-colors ${editEx?.key === ex.key ? 'text-accent' : 'text-zinc-600 hover:text-accent'}`}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => onDeleteExercicio(ex.key)}
                      className="text-zinc-600 hover:text-accent p-1 rounded hover:bg-accent/10 transition-colors shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {editEx?.key === ex.key && (
                  <div className="mt-2">
                    <ExercicioInlineForm
                      initial={editEx}
                      confirmLabel="Salvar Alterações"
                      onConfirm={onEditExercicio}
                      onCancel={() => onToggleEdit(ex)}
                    />
                  </div>
                )}
              </div>
            ))
          )}

          <div className="pt-2">
            {addOpen ? (
              <ExercicioInlineForm onConfirm={onAddExercicio} onCancel={onToggleAdd} />
            ) : (
              <button onClick={onToggleAdd} className="btn-ghost">
                <Plus size={14} /> Adicionar Exercício
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// INLINE: FORM DE EXERCÍCIO (gestor — adicionar ou editar)
// =============================================================

function ExercicioInlineForm({ initial, confirmLabel, onConfirm, onCancel }: {
  initial?: ExercicioUI;
  confirmLabel?: string;
  onConfirm: (ex: ExercicioUI) => void;
  onCancel: () => void;
}) {
  const [categoria, setCategoria] = useState<ExercicioCategoria>(initial?.categoria ?? 'forca');
  const [nome, setNome] = useState(initial?.nome || '');
  const [principal, setPrincipal] = useState(() =>
    initial?.musculoPrincipal || (initial?.grupo ? getMacroGrupo(initial.grupo) : 'Peito')
  );
  const [grupo, setGrupo] = useState(initial?.grupo || '');
  const [numSeries, setNumSeries] = useState(initial?.series || 3);
  const [repsArr, setRepsArr] = useState<string[]>(() =>
    normalizarRepsPorSerie(initial?.series || 3, initial?.repsPorSerie, initial ? null : '8-12')
  );
  const [aqArr, setAqArr] = useState<boolean[]>(() =>
    normalizarAquecimento(initial?.series || 3, initial?.aquecimentoPorSerie)
  );
  const [descanso, setDescanso] = useState(initial?.descanso || 90);
  const [prescricao, setPrescricao] = useState<CardioPrescricao>(() => {
    const ehCardioInicial = initial?.categoria === 'cardio';
    return {
      modalidade: ehCardioInicial ? modalidadeInicialParaEx(initial) : MODALIDADES_CARDIO[0].value,
      metaMin: ehCardioInicial && initial!.metaTempoMin && initial!.metaTempoMin > 0 ? initial!.metaTempoMin : 25,
      metaKm: ehCardioInicial && initial!.metaDistanciaKm && initial!.metaDistanciaKm > 0 ? String(initial!.metaDistanciaKm) : '',
      tipoTreinoCorrida: ehCardioInicial ? (initial!.tipoTreinoCorrida ?? '') : '',
      metaMinutos: ehCardioInicial && initial!.metaMinutos && initial!.metaMinutos > 0 ? String(initial!.metaMinutos) : '',
      qtdTiros: ehCardioInicial && initial!.qtdTiros && initial!.qtdTiros > 0 ? String(initial!.qtdTiros) : '',
      distanciaTiro: ehCardioInicial ? (initial!.distanciaTiro || '') : '',
      metaDistanciaCorrida: ehCardioInicial && initial!.metaDistanciaCorrida && initial!.metaDistanciaCorrida > 0 ? String(initial!.metaDistanciaCorrida) : '',
    };
  });
  const [erro, setErro] = useState<string | null>(null);

  const isCardio = categoria === 'cardio';
  const ehCardioCorrida = isCardio && MODALIDADES_CORRIDA.has(prescricao.modalidade);
  const porcoes = microsDe(principal);
  // Porção legada que não pertence ao principal escolhido continua listada
  const porcaoExtra = grupo && !porcoes.includes(grupo) ? [grupo] : [];

  function trocarPrincipal(p: string) {
    setPrincipal(p);
    setGrupo(prev => (microsDe(p).includes(prev) ? prev : ''));
  }

  const inputCls = "bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/10 transition-all duration-150 w-full";

  function ajustarSeries(n: number) {
    const qtd = Math.max(1, Math.min(30, n || 1));
    setNumSeries(qtd);
    setRepsArr(prev => Array.from({ length: qtd }, (_, i) => prev[i] ?? ''));
    setAqArr(prev => Array.from({ length: qtd }, (_, i) => prev[i] ?? false));
  }

  function handleConfirm() {
    setErro(null);
    if (!nome.trim()) return;
    if (isCardio) {
      if (ehCardioCorrida && prescricao.tipoTreinoCorrida === '') {
        setErro('Selecione um tipo de treino de corrida (Regenerativo, Intervalado ou Longão).');
        return;
      }
      if (!ehCardioCorrida && (!prescricao.metaMin || prescricao.metaMin <= 0)) {
        setErro('Informe a duração alvo em minutos. Use a modalidade de corrida (Com tipo de treino) para metas por km/tiros.');
        return;
      }
    }
    // Pelo menos uma série precisa ser principal (válida): um exercício com
    // todas as séries como aquecimento nunca contabiliza trabalho real.
    if (!isCardio && aqArr.slice(0, numSeries).every(Boolean)) {
      setErro('Ao menos uma série precisa ser principal (desmarque "Aq" de uma das séries).');
      return;
    }
    const nKm = prescricao.metaKm.trim() ? Number(prescricao.metaKm.replace(',', '.')) || null : null;
    const kmLongao = Number(prescricao.metaDistanciaCorrida) || null;
    onConfirm({
      key: initial?.key || `new-${Date.now()}`,
      dbId: initial?.dbId,
      nome: nome.trim(),
      categoria,
      musculoPrincipal: isCardio ? '' : principal,
      grupo: isCardio ? '' : grupo,
      series: isCardio ? 1 : numSeries,
      repsPorSerie: isCardio ? [''] : Array.from({ length: numSeries }, (_, i) => (repsArr[i] || '').trim()),
      aquecimentoPorSerie: isCardio ? [false] : Array.from({ length: numSeries }, (_, i) => aqArr[i] === true),
      descanso: isCardio ? 0 : Math.max(0, descanso),
      metaTempoMin: isCardio ? (ehCardioCorrida ? null : (prescricao.metaMin > 0 ? prescricao.metaMin : null)) : null,
      metaDistanciaKm: isCardio && !ehCardioCorrida && nKm && nKm > 0 ? nKm : null,
      tipoTreinoCorrida: ehCardioCorrida && prescricao.tipoTreinoCorrida ? prescricao.tipoTreinoCorrida : null,
      metaMinutos: ehCardioCorrida ? (Number(prescricao.metaMinutos) || null) : null,
      qtdTiros: ehCardioCorrida && prescricao.tipoTreinoCorrida === 'intervalado' ? (Number(prescricao.qtdTiros) || null) : null,
      distanciaTiro: ehCardioCorrida && prescricao.tipoTreinoCorrida === 'intervalado' ? (prescricao.distanciaTiro.trim() || undefined) : undefined,
      metaDistanciaCorrida: ehCardioCorrida && prescricao.tipoTreinoCorrida === 'longao' && kmLongao && kmLongao > 0 ? kmLongao : null,
    });
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
      {/* Tipo do item: força (séries/carga) ou cardio (tempo/distância) */}
      <div className="flex items-center gap-1.5">
        {(['forca', 'cardio'] as ExercicioCategoria[]).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoria(c)}
            aria-pressed={categoria === c}
            className={`inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg border transition-colors ${
              categoria === c
                ? c === 'cardio'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                  : 'bg-accent/10 text-accent-light border-accent/40'
                : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
            }`}
          >
            {c === 'forca' ? <Dumbbell size={12} /> : <Timer size={12} />}
            {c === 'forca' ? 'Força' : 'Cardio'}
          </button>
        ))}
        {isCardio && (
          <span className="text-[10px] text-sky-400/80 ml-1 hidden sm:inline">
            entra na mesma lista do treino, após os exercícios de força
          </span>
        )}
      </div>

      <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} placeholder={isCardio ? 'Nome da atividade (ex.: Boxe, Corrida)' : 'Nome do exercício'} autoFocus={!initial} />

      {isCardio ? (
        <CardioPrescricaoForm
          value={prescricao}
          onChange={patch => setPrescricao(prev => ({ ...prev, ...patch }))}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Músculo Principal</label>
              <select className={inputCls} value={principal} onChange={e => trocarPrincipal(e.target.value)}>
                {PRINCIPAIS.map(p => <option key={p} value={p}>{p}</option>)}
                {!PRINCIPAIS.includes(principal) && <option value={principal}>{principal}</option>}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Porção / Detalhe (opcional)</label>
              <select className={inputCls} value={grupo} onChange={e => setGrupo(e.target.value)} disabled={porcoes.length === 0 && porcaoExtra.length === 0}>
                <option value="">—</option>
                {[...porcoes, ...porcaoExtra].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Séries</label>
              <input type="number" className={inputCls} value={numSeries} onChange={e => ajustarSeries(Number(e.target.value))} min={1} max={30} />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Repetições por série (texto livre) · "Aq" = aquecimento</label>
              <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                {Array.from({ length: numSeries }).map((_, i) => (
                  <div key={i} className="flex items-center gap-1 bg-zinc-900/60 border border-zinc-800/70 rounded-lg pl-1 pr-1.5 py-[3px]">
                    <input
                      type="text"
                      className="bg-transparent border-none rounded px-1 py-1 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none w-[46px] text-center"
                      value={repsArr[i] || ''}
                      onChange={e => setRepsArr(prev => { const c = [...prev]; c[i] = e.target.value; return c; })}
                      placeholder={`S${i + 1}`}
                    />
                    <label
                      title="Marcar como série de aquecimento"
                      className={`flex items-center gap-0.5 cursor-pointer select-none ${aqArr[i] ? 'text-amber-400' : 'text-zinc-500'}`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wide">Aq</span>
                      <input
                        type="checkbox"
                        checked={aqArr[i] === true}
                        onChange={e => setAqArr(prev => { const c = [...prev]; c[i] = e.target.checked; return c; })}
                        className="accent-amber-400 h-3 w-3 cursor-pointer"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Descanso (s)</label>
              <input type="number" className={inputCls} value={descanso} onChange={e => setDescanso(Number(e.target.value) || 0)} min={0} step={15} />
            </div>
          </div>
        </>
      )}
      {erro && (
        <p className="text-[11px] font-semibold text-red-400 bg-red-500/10 border border-red-500/25 px-2.5 py-1.5 clip-bevel-sm">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={handleConfirm} disabled={!nome.trim() || (isCardio && ((ehCardioCorrida && prescricao.tipoTreinoCorrida === '') || (!ehCardioCorrida && (!prescricao.metaMin || prescricao.metaMin <= 0))))} className="btn-forge !h-[40px] px-4 text-[12px] flex items-center gap-1">
          <Check size={12} /> {confirmLabel || 'Adicionar'}
        </button>
        <button onClick={onCancel} className="btn-steel !h-[40px] px-4 text-[12px]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// =============================================================
// CONTROLES DE SESSAO DO TREINO (aluno, dentro do card do treino)
// =============================================================

// Relogio com tick local de 1s: re-renderiza apenas o conteudo que exibe o
// tempo, evitando re-renderizar a pagina inteira a cada segundo.
function RelogioSessao({ iniciadaEm, children }: { iniciadaEm: number; children: (elapsedSegundos: number) => ReactElement }) {
  const [agora, setAgora] = useState<number>(() => Date.now());

  useEffect(() => {
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iniciadaEm]);

  // Mobile pausa timers com a aba em background; ao voltar, sincroniza na hora
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') setAgora(Date.now());
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const elapsed = Math.max(0, Math.floor((agora - iniciadaEm) / 1000));
  return children(Math.min(DURACAO_MAX_SEG, elapsed));
}

function SessaoControles({ ativa, bloqueado, nomeOutro, concluidoSemana, elapsedSegundos, saving, destacado, onIniciar, onFinalizar }: {
  ativa: boolean;
  bloqueado: boolean;
  nomeOutro: string;
  concluidoSemana?: boolean;
  elapsedSegundos: number;
  saving: boolean;
  destacado?: boolean;
  onIniciar: () => void;
  onFinalizar: () => void;
}) {
  if (ativa) {
    return (
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ok" />
        </span>
        <span className="font-mono text-base md:text-lg font-bold text-bone tabular-nums tracking-tight">
          {formatarDuracao(elapsedSegundos)}
        </span>
        <button
          onClick={onFinalizar}
          disabled={saving}
          className={`btn-forge-sm ${destacado ? 'animate-glow-pulse' : ''}`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvando...' : 'Finalizar Treino'}
        </button>
      </div>
    );
  }

  if (concluidoSemana) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 clip-bevel-sm text-[11.5px] font-bold bg-ok/10 text-ok border border-ok/30 shrink-0">
        <CheckCircle2 size={13} /> Concluído nesta semana
      </span>
    );
  }

  if (bloqueado) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 clip-bevel-sm text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
        <AlertCircle size={12} /> Em andamento: {nomeOutro}
      </span>
    );
  }

  return (
    <button
      onClick={onIniciar}
      className="btn-forge-sm shrink-0"
    >
      <Play size={15} fill="currentColor" /> Iniciar Treino
    </button>
  );
}

// =============================================================
// CARD DE EXECUÇÃO DO EXERCÍCIO (aluno) - Accordion com Auto-Advance
// =============================================================

interface ExercicioExecucaoCardProps {
  indice: number;
  exercicio: ExercicioUI;
  entries?: StudentSerieEntry[];
  onEntry: (serieIdx: number, field: 'carga' | 'reps', value: number) => void;
  onStatusChange: (serieIdx: number, status: { valida: boolean | null; isWarmup: boolean }) => void;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggleExpand: () => void;
  disabled?: boolean;
}

function ExercicioExecucaoCard({
  indice,
  exercicio,
  entries,
  onEntry,
  onStatusChange,
  isExpanded,
  isCompleted,
  onToggleExpand,
  disabled = false,
}: ExercicioExecucaoCardProps) {
  const miniInputCls = (wide = false) =>
    `h-[38px] ${wide ? 'w-20' : 'w-16'} bg-panel-2 border border-line text-center text-[13.5px] text-bone font-medium outline-none transition-colors duration-150 focus:border-accent placeholder:text-[#4A4A50] disabled:opacity-40 disabled:cursor-not-allowed`;

  const renderStatusButtons = (idx: number) => {
    const entry = entries?.[idx];
    const currentValida = entry?.valida ?? null;
    const isWarmup = entry?.isWarmup ?? false;
    const isValida = currentValida === true && !isWarmup;      // Série principal
    const isAquecimento = currentValida === false && isWarmup; // Aquecimento
    const isPending = currentValida === null;                  // Pendente

    // Validação: só permite marcar status se carga > 0 E reps > 0
    const hasValidInputs = (entry?.carga ?? 0) > 0 && (entry?.reps ?? 0) > 0;

    return (
      <div className="flex items-center gap-1.5">
        {/* Botão VÁLIDA (série principal) */}
        <button
          type="button"
          onClick={() => hasValidInputs && onStatusChange(idx, { valida: true, isWarmup: false })}
          disabled={disabled || !hasValidInputs}
          aria-pressed={isValida}
          title={hasValidInputs ? 'Marcar como série principal (válida)' : 'Preencha carga e repetições antes de marcar'}
          className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
            isValida
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-panel-2 text-muted-steel border border-line hover:border-accent/30'
          } disabled:opacity-40 disabled:cursor-not-allowed ${!hasValidInputs && !isValida ? 'opacity-60' : ''}`}
        >
          <Check size={12} /> Válida
        </button>

        {/* Botão AQUECIMENTO (série preparatória) */}
        <button
          type="button"
          onClick={() => hasValidInputs && onStatusChange(idx, { valida: false, isWarmup: true })}
          disabled={disabled || isValida || !hasValidInputs}
          aria-pressed={isAquecimento}
          title={hasValidInputs ? 'Marcar como aquecimento (série preparatória)' : 'Preencha carga e repetições antes de marcar'}
          className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-colors ${
            isAquecimento
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-panel-2 text-muted-steel border border-line hover:border-amber/30'
          } disabled:opacity-40 disabled:cursor-not-allowed ${!hasValidInputs && !isAquecimento ? 'opacity-60' : ''}`}
        >
          <Flame size={12} /> Aquecimento
        </button>

        {/* Botão RESET - aparece quando já tem status definido */}
        {(isValida || isAquecimento) && (
          <button
            type="button"
            onClick={() => onStatusChange(idx, { valida: null, isWarmup: false })}
            disabled={disabled}
            title="Desmarcar status"
            className="inline-flex items-center px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RotateCcw size={10} />
          </button>
        )}
      </div>
    );
  };

  const renderSerieRow = (idx: number) => {
    const entry = entries?.[idx];
    const carga = entry?.carga ?? 0;
    const reps = entry?.reps ?? 0;
    const valida = entry?.valida ?? null;
    const vol = valida === true ? carga * reps : 0;
    const prescritoAquecimento = !!exercicio.aquecimentoPorSerie[idx] && valida === null;

    return (
      <tr key={idx} className="border-b border-line last:border-b-0">
        <td className="py-3 px-2.5 align-middle">
          <span className="w-6 h-6 flex-none bg-panel-2 border border-line flex items-center justify-center text-[12px] font-extrabold text-muted-steel clip-bevel-sm">
            {idx + 1}
          </span>
          {prescritoAquecimento && (
            <span className="mt-1 inline-block text-[8.5px] font-extrabold uppercase tracking-wider text-amber-400">aq</span>
          )}
        </td>
        <td className="py-3 px-2.5 align-middle text-[13.5px] text-zinc-300">{exercicio.descanso}s</td>
        <td className="py-3 px-2.5 align-middle">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={reps || ''}
              onChange={e => onEntry(idx, 'reps', Number(e.target.value) || 0)}
              placeholder={metaReps(exercicio, idx) || '0'}
              disabled={disabled}
              className={miniInputCls()}
            />
            {metaReps(exercicio, idx) && (
              <span className="text-[10px] font-semibold text-muted-steel/80 whitespace-nowrap">alvo {metaReps(exercicio, idx)}</span>
            )}
          </div>
        </td>
        <td className="py-3 px-2.5 align-middle">
          <input
            type="number"
            value={carga || ''}
            onChange={e => onEntry(idx, 'carga', Number(e.target.value) || 0)}
            placeholder="0"
            disabled={disabled}
            className={miniInputCls(true)}
          />
        </td>
        <td className="py-3 px-2.5 align-middle">
          {renderStatusButtons(idx)}
        </td>
        <td className="py-3 px-2.5 align-middle text-right">
          <span className={`text-xs font-semibold stat-number ${vol > 0 ? 'text-accent-light' : 'text-[#4A4A50]'}`}>
            {vol > 0 ? `${vol.toLocaleString()} kg` : '—'}
          </span>
        </td>
      </tr>
    );
  };

  const renderMobileSerieCard = (idx: number) => {
    const entry = entries?.[idx];
    const carga = entry?.carga ?? 0;
    const reps = entry?.reps ?? 0;
    const valida = entry?.valida ?? null;
    const isWarmup = entry?.isWarmup ?? false;
    const vol = valida === true && !isWarmup ? carga * reps : 0;
    const isValida = valida === true && !isWarmup;
    const isAquecimento = valida === false && isWarmup;
    const prescritoAquecimento = !!exercicio.aquecimentoPorSerie[idx] && valida === null;

    return (
      <div key={idx} className="bg-panel-2 border border-line p-3 clip-bevel-sm">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-[22px] h-[22px] flex-none bg-panel border border-line flex items-center justify-center text-[11px] font-extrabold text-muted-steel clip-bevel-sm">
              {idx + 1}
            </span>
            <span className={`text-[12.5px] font-semibold ${
              isValida ? 'text-emerald-400' : isAquecimento || prescritoAquecimento ? 'text-amber-400' : 'text-muted-steel'
            }`}>
              Série {idx + 1}{prescritoAquecimento ? ' · aquec.' : isValida ? '· válida' : isAquecimento ? '· aquecimento' : ''}
            </span>
          </div>
          <span className={`text-xs font-semibold stat-number ${vol > 0 ? 'text-accent-light' : 'text-[#4A4A50]'}`}>
            {vol > 0 ? `${vol.toLocaleString()} kg` : '—'}
          </span>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.06em] uppercase text-[#6C6C74] font-bold">Reps{metaReps(exercicio, idx) ? ` · alvo ${metaReps(exercicio, idx)}` : ''}</span>
            <input
              type="number"
              value={reps || ''}
              onChange={e => onEntry(idx, 'reps', Number(e.target.value) || 0)}
              placeholder={metaReps(exercicio, idx) || '0'}
              disabled={disabled}
              className={`${miniInputCls()} w-[88px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] tracking-[0.06em] uppercase text-[#6C6C74] font-bold">Carga (kg)</span>
            <input
              type="number"
              value={carga || ''}
              onChange={e => onEntry(idx, 'carga', Number(e.target.value) || 0)}
              placeholder="0"
              disabled={disabled}
              className={`${miniInputCls(true)} w-[96px]`}
            />
          </label>
          {renderStatusButtons(idx)}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-[22px] first-of-type:mt-4">
      {/* Header do Accordion - sempre visível, clicável para expandir/colapsar */}
      <div
        className={`flex items-center gap-2.5 flex-wrap mb-0.5 cursor-pointer transition-colors ${
          isCompleted ? 'bg-panel-2/50 rounded-lg p-1 -ml-1 -mr-1' : ''
        }`}
        onClick={onToggleExpand}
      >
        <span className="w-[22px] h-[22px] flex-none bg-panel-2 border border-line flex items-center justify-center text-[12px] font-extrabold text-muted-steel clip-bevel-sm">
          {indice}
        </span>
        <span className="text-sm font-bold text-bone truncate">{exercicio.nome}</span>
        {exercicio.grupo && (
          <span className="text-[11px] font-extrabold uppercase tracking-[0.05em] text-accent-light bg-accent/10 border border-accent/30 px-2.5 py-[3px] clip-bevel-sm shrink-0">
            {exercicio.grupo}
          </span>
        )}
        <span className="text-[12.5px] font-semibold text-muted-steel">
          {resumoReps(exercicio)} · {exercicio.descanso}s
        </span>
        {isCompleted && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
            <Check size={10} /> Concluído
          </span>
        )}
        <ChevronDown size={16} className={`ml-auto text-muted-steel transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Conteúdo colapsável */}
      {isExpanded && (
        <div className="mt-3.5 space-y-3 animate-slide-down">
          {/* Tabela (desktop ≥ md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 w-10 border-b border-line">#</th>
                  <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 border-b border-line">Descanso</th>
                  <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 border-b border-line">Reps</th>
                  <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 border-b border-line">Carga (kg)</th>
                  <th className="text-left text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 border-b border-line">Status</th>
                  <th className="text-right text-[10.5px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2.5 pb-2.5 border-b border-line">Vol.</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: exercicio.series }).map((_, idx) => renderSerieRow(idx))}
              </tbody>
            </table>
          </div>

          {/* Cards empilhados (mobile < md) */}
          <div className="md:hidden space-y-2.5">
            {Array.from({ length: exercicio.series }).map((_, idx) => renderMobileSerieCard(idx))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// CARD DE EXECUÇÃO DO CARDIO (aluno) - tempo/distância na mesma sessão
// =============================================================

interface CardioExecucaoCardProps {
  indice: number;
  exercicio: ExercicioUI;
  entry?: CardioEntry;
  onField: (field: 'duracaoMin' | 'distanciaKm', value: number) => void;
  onConcluir: () => void;
  isExpanded: boolean;
  isCompleted: boolean;
  onToggleExpand: () => void;
  disabled?: boolean;
}

function CardioExecucaoCard({
  indice,
  exercicio,
  entry,
  onField,
  onConcluir,
  isExpanded,
  isCompleted,
  onToggleExpand,
  disabled = false,
}: CardioExecucaoCardProps) {
  const duracao = entry?.duracaoMin ?? 0;
  const distancia = entry?.distanciaKm ?? null;

  const ehCorrida = !!exercicio.tipoTreinoCorrida;
  const duracaoAlvo = duracaoAlvoCardio(exercicio);
  const distanciaAlvo = exercicio.tipoTreinoCorrida === 'longao' && exercicio.metaDistanciaCorrida && exercicio.metaDistanciaCorrida > 0
    ? exercicio.metaDistanciaCorrida
    : null;

  const labelDuracao = !ehCorrida
    ? `Duração realizada (min)${duracaoAlvo ? ` · alvo ${duracaoAlvo}` : ''}`
    : exercicio.tipoTreinoCorrida === 'regenerativo'
      ? `Duração realizada (min)${duracaoAlvo ? ` · alvo ${duracaoAlvo}` : ''}`
      : 'Duração realizada (min) · opcional';

  const labelDistancia = !ehCorrida
    ? `Distância (km)${exercicio.metaDistanciaKm ? ` · alvo ${exercicio.metaDistanciaKm.toLocaleString('pt-BR')}` : ' · opcional'}`
    : exercicio.tipoTreinoCorrida === 'longao'
      ? `Distância (km)${distanciaAlvo ? ` · alvo ${distanciaAlvo.toLocaleString('pt-BR')}` : ''}`
      : 'Distância (km) · opcional';

  return (
    <div className="mt-[22px] first-of-type:mt-4">
      {/* Header do Accordion - mesmo padrão dos exercícios de força */}
      <div
        className={`flex items-center gap-2.5 flex-wrap mb-0.5 cursor-pointer transition-colors ${
          isCompleted ? 'bg-panel-2/50 rounded-lg p-1 -ml-1 -mr-1' : ''
        }`}
        onClick={onToggleExpand}
      >
        <span className="w-[22px] h-[22px] flex-none bg-panel-2 border border-line flex items-center justify-center text-[12px] font-extrabold text-muted-steel clip-bevel-sm">
          {indice}
        </span>
        <span className="text-sm font-bold text-bone truncate">{exercicio.nome}</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.05em] text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2 py-[3px] clip-bevel-sm shrink-0">
          <Timer size={10} /> Cardio
        </span>
        {exercicio.tipoTreinoCorrida && (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.05em] text-orange-300 bg-orange-500/10 border border-orange-500/30 px-2 py-[3px] clip-bevel-sm shrink-0">
            🏃 {LABEL_TIPO_TREINO_CORRIDA[exercicio.tipoTreinoCorrida]}
          </span>
        )}
        <span className="text-[12.5px] font-semibold text-muted-steel">{resumoMetaCardio(exercicio)}</span>
        {/* Check rapido: 1 toque conclui (usa a meta como duracao padrao) */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onConcluir(); }}
          disabled={disabled}
          title={entry?.concluido ? 'Desmarcar conclusão do cardio' : 'Concluir cardio (usa a meta como duração)'}
          aria-pressed={!!entry?.concluido}
          className={`w-[26px] h-[26px] flex-none inline-flex items-center justify-center rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            entry?.concluido
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-panel-2 border-line text-[#6C6C74] hover:border-accent/60 hover:text-accent-light'
          }`}
        >
          <Check size={13} strokeWidth={3.2} />
        </button>
        {isCompleted && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
            <Check size={10} /> Concluído
          </span>
        )}
        <ChevronDown size={16} className={`ml-auto text-muted-steel transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Conteúdo colapsável */}
      {isExpanded && (
        <div className="mt-3.5 animate-slide-down">
          <div className="bg-panel-2 border border-line p-4 clip-bevel-sm space-y-3.5 max-w-md">
            <p className="text-[11px] uppercase tracking-[0.08em] font-bold text-sky-300 flex items-center gap-1.5">
              <Timer size={12} /> Meta{resumoMetaCardio(exercicio) !== '—' ? `: ${resumoMetaCardio(exercicio)}` : ''}
            </p>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] tracking-[0.06em] uppercase text-[#6C6C74] font-bold">{labelDuracao}</span>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={duracao || ''}
                  onChange={e => onField('duracaoMin', Number(e.target.value) || 0)}
                  placeholder={duracaoAlvo ? String(duracaoAlvo) : '0'}
                  disabled={disabled}
                  className="h-[38px] w-[96px] bg-panel border border-line text-center text-[13.5px] text-bone font-medium outline-none transition-colors duration-150 focus:border-accent placeholder:text-[#4A4A50] disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] tracking-[0.06em] uppercase text-[#6C6C74] font-bold">{labelDistancia}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  max={999}
                  value={distancia ?? ''}
                  onChange={e => onField('distanciaKm', Number(e.target.value))}
                  placeholder={distanciaAlvo ? String(distanciaAlvo) : '—'}
                  disabled={disabled}
                  className="h-[38px] w-[96px] bg-panel border border-line text-center text-[13.5px] text-bone font-medium outline-none transition-colors duration-150 focus:border-accent placeholder:text-[#4A4A50] disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </label>
              <button
                type="button"
                onClick={onConcluir}
                disabled={disabled}
                title={entry?.concluido ? 'Desmarcar conclusão do cardio' : 'Marcar cardio como concluído'}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold clip-bevel-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  entry?.concluido
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-panel border border-line text-bone hover:border-accent/50'
                }`}
              >
                {entry?.concluido ? (
                  <>
                    <RotateCcw size={13} /> Desmarcar
                  </>
                ) : (
                  <>
                    <Check size={13} /> Concluir Cardio
                  </>
                )}
              </button>
            </div>
            {!entry?.concluido && !disabled && (
              <p className="text-[11px] text-[#6C6C74]">
                {ehCorrida
                  ? 'Registre os minutos/km realizados e confirme. O objetivo deste treino está na meta acima.'
                  : 'Toque no check do cabeçalho para concluir com a meta, ou digite a duração/distância realizada e confirme.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================
// ANALYTICS: SÉRIES VÁLIDAS POR GRUPO (SEMANAL ACUMULADO)
// =============================================================

function AnalyticsSection({
  metaByGroup,
  validByGroup,
  totalMeta,
  totalValid,
  metaCardioMin = 0,
  validCardioMin = 0,
  genero,
}: {
  metaByGroup: Record<string, number>;
  validByGroup: Record<string, number>;
  totalMeta: number;
  totalValid: number;
  metaCardioMin?: number;
  validCardioMin?: number;
  genero?: string | null;
}) {
  // Ordem canônica dos principais para o gênero + grupos fora da lista (legado)
  const ordem = ordemGrupos(genero);
  const chaves = [
    ...ordem.filter(mg => metaByGroup[mg] || validByGroup[mg]),
    ...Object.keys({ ...metaByGroup, ...validByGroup }).filter(k => !ordem.includes(k) && (metaByGroup[k] || validByGroup[k])),
  ];

  const temCardio = metaCardioMin > 0 || validCardioMin > 0;
  const cardioPct = metaCardioMin > 0 ? Math.min(100, (validCardioMin / metaCardioMin) * 100) : (validCardioMin > 0 ? 100 : 0);
  const cardioCompleto = metaCardioMin > 0 && validCardioMin >= metaCardioMin;

  return (
    <div className="bg-panel border border-line p-5">
      <div className="flex items-center justify-between gap-2.5 mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-[26px] h-[26px] flex-none bg-panel-2 border border-line flex items-center justify-center clip-bevel-sm">
            <Target size={13} className="text-accent-light" />
          </div>
          <span className="font-display text-[12px] uppercase tracking-[0.1em] text-muted-steel">Séries Válidas da Semana</span>
        </div>
      </div>
      <p className="text-[12px] text-muted-steel mb-4">Progresso acumulado dos treinos realizados nesta semana</p>

      <div className="space-y-3">
        {chaves.map(mg => {
          const meta = metaByGroup[mg] || 0;
          const valid = validByGroup[mg] || 0;
          const pct = meta > 0 ? Math.min(100, (valid / meta) * 100) : (valid > 0 ? 100 : 0);
          const completa = meta > 0 && valid >= meta;

          return (
            <div key={mg}>
              <div className="flex items-center justify-between text-[13.5px] font-bold mb-2">
                <span className="text-zinc-200 truncate">{mg}</span>
                <span className={`ml-2 shrink-0 stat-number ${completa ? 'text-ok' : 'text-accent-light'}`}>
                  {meta > 0 ? `${valid}/${meta}` : `${valid}`}
                </span>
              </div>
              <div className="h-1.5 bg-panel-2 border border-line overflow-hidden mb-[18px]">
                <div
                  className={`h-full transition-all duration-500 ${completa ? 'bg-ok' : 'bg-gradient-to-r from-accent to-accent-light'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}

        {/* Barra de Cardio da Semana (em Minutos) */}
        {temCardio && (
          <div className="pt-1 border-t border-line/40">
            <div className="flex items-center justify-between text-[13.5px] font-bold mb-2">
              <span className="text-orange-400 flex items-center gap-1.5 truncate">
                <Flame size={13} className="text-orange-400 shrink-0" />
                Cardio (Minutos)
              </span>
              <span className={`ml-2 shrink-0 stat-number ${cardioCompleto ? 'text-ok' : 'text-orange-400'}`}>
                {metaCardioMin > 0 ? `${validCardioMin}/${metaCardioMin} min` : `${validCardioMin} min`}
              </span>
            </div>
            <div className="h-1.5 bg-panel-2 border border-line overflow-hidden mb-[18px]">
              <div
                className={`h-full transition-all duration-500 ${cardioCompleto ? 'bg-ok' : 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-400'}`}
                style={{ width: `${cardioPct}%` }}
              />
            </div>
          </div>
        )}

        {totalMeta === 0 && totalValid === 0 && !temCardio && (
          <p className="text-[#6C6C74] text-[13px] text-center py-5">Complete seus treinos da semana para preencher as séries válidas.</p>
        )}
      </div>

      <div className="space-y-1.5 pt-2 border-t border-line/60">
        <div className="flex items-center justify-between text-[13.5px] text-muted-steel">
          <span>Total de Séries</span>
          <b className="font-display font-normal text-accent-light text-[15px] tracking-[0.02em] stat-number">{totalValid}/{totalMeta} séries</b>
        </div>
        {temCardio && (
          <div className="flex items-center justify-between text-[13.5px] text-muted-steel">
            <span>Cardio Semanal</span>
            <b className="font-display font-normal text-orange-400 text-[15px] tracking-[0.02em] stat-number">
              {validCardioMin}{metaCardioMin > 0 ? `/${metaCardioMin}` : ''} min
            </b>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================
// VOLUME DA SESSÃO / SEMANA
// =============================================================

function VolumeSection({ volumeByGroup }: { volumeByGroup: [string, number][] }) {
  const totalVolume = volumeByGroup.reduce((s, [, v]) => s + v, 0);
  const maxVol = Math.max(...volumeByGroup.map(([, v]) => v), 1);
  const hasAnyData = volumeByGroup.length > 0;

  return (
    <div className="bg-panel border border-line p-5">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-[26px] h-[26px] flex-none bg-panel-2 border border-line flex items-center justify-center clip-bevel-sm">
          <BarChart3 size={13} className="text-accent-light" />
        </div>
        <span className="font-display text-[12px] uppercase tracking-[0.1em] text-muted-steel">Volume Semanal</span>
      </div>
      <p className="text-[12px] text-muted-steel mb-4">Σ (Carga × Reps) das séries válidas acumuladas na semana</p>

      <div className="space-y-3">
        {!hasAnyData ? (
          <div className="py-6">
            <p className="text-[#6C6C74] text-[13px] text-center">Complete treinos na semana para calcular o volume</p>
          </div>
        ) : (
          volumeByGroup.map(([group, vol]) => {
            const pct = (vol / maxVol) * 100;
            return (
              <div key={group}>
                <div className="flex items-center justify-between text-[13.5px] font-bold mb-2">
                  <span className="text-zinc-200 truncate">{group}</span>
                  <span className="text-accent-light ml-2 shrink-0 stat-number">
                    {vol.toLocaleString()} kg
                  </span>
                </div>
                <div className="h-1.5 bg-panel-2 border border-line overflow-hidden mb-[18px]">
                  <div className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {hasAnyData && (
        <div className="flex items-center justify-between text-[13.5px] text-muted-steel pt-1 border-t border-line/60">
          <span>Volume Total da Semana</span>
          <b className="font-display font-normal text-accent-light text-[15px] tracking-[0.02em] stat-number">{totalVolume.toLocaleString()} kg</b>
        </div>
      )}
    </div>
  );
}
