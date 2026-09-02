import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, CalendarCheck, CalendarDays, Check, Clock,
  Flame, Loader2, Lock, Moon, TrendingUp, X,
} from 'lucide-react';
import StudentAvatar from '../ui/StudentAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useSequencia } from '../../hooks/useSequencia';
import { fichas, dieta, logsExecucao, planejamento, METAS_PADRAO } from '../../services/api';
import { DIA_MS } from '../../utils/consistencia';
import { DAYS_OF_WEEK, DAYS_SHORT } from '../../types';
import { dataDeDiaSemana, dataSP as dataSPFuso } from '../../utils/semanaUtils';
import { BarraOlimpicaIcon, TalherFolhaIcon, CalendarioCanetaIcon } from '../icons/AppIcons';
import type {
  FichaCompleta, MetasNutricionais, PlanejamentoItem,
  SessaoComProgresso, ExercicioSessao, Meal,
} from '../../types';
import ModalPlanejamentoAluno from './ModalPlanejamentoAluno';

const HERO_IMG = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=80';
const BANNER_IMG = 'https://images.unsplash.com/photo-1672344048213-76b6e77304bd?fm=jpg&q=80&w=1600&auto=format&fit=crop';

function getGreeting(): string {
  const h = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date()));
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function somarMacros(meals: Meal[]) {
  return meals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories || 0),
      protein: acc.protein + (m.protein || 0),
      carbs: acc.carbs + (m.carbs || 0),
      fat: acc.fat + (m.fat || 0),
      fiber: acc.fiber + (m.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

function formatarData(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Dia da semana (0=Dom..6=Sab) no fuso America/Sao_Paulo
export function diaSemanaSP(): number {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' })
    .formatToParts(new Date())
    .find(p => p.type === 'weekday')?.value;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w ?? 'Sun');
}

function extrairMaiorSalto(progresso: SessaoComProgresso[]): ExercicioSessao | null {
  const limite = Date.now() - 30 * DIA_MS;
  let maior: ExercicioSessao | null = null;
  for (const s of progresso) {
    if (new Date(s.data_execucao).getTime() < limite) continue;
    for (const ex of s.exercicios) {
      if (ex.delta_carga > 0 && (!maior || ex.delta_carga > maior.delta_carga)) maior = ex;
    }
  }
  return maior;
}

export default function Inicio() {
  const { profile, isVIP } = useAuth();
  const userId = profile?.id;
  const sequencia = useSequencia(userId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fichaTreino, setFichaTreino] = useState<FichaCompleta | null>(null);
  const [fichaDieta, setFichaDieta] = useState<FichaCompleta | null>(null);
  const [consumoHoje, setConsumoHoje] = useState<Meal[]>([]);
  const [metas, setMetas] = useState<MetasNutricionais>(null);
  const [maiorSalto, setMaiorSalto] = useState<ExercicioSessao | null>(null);
  const [progressoSessoes, setProgressoSessoes] = useState<SessaoComProgresso[]>([]);
  const [planoSemana, setPlanoSemana] = useState<PlanejamentoItem[]>([]);
  const [modalUpgrade, setModalUpgrade] = useState(false);
  const [modalPlanejamento, setModalPlanejamento] = useState(false);
  const [feedbackPlanejamento, setFeedbackPlanejamento] = useState('');

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    setLoading(true);
    setError('');

    const tarefas: Promise<void>[] = [
      fichas.getAtiva(userId, 'treino').then(f => { if (!cancel) setFichaTreino(f); }),
      logsExecucao.getProgresso(userId).then(p => {
        if (!cancel) {
          setMaiorSalto(extrairMaiorSalto(p));
          setProgressoSessoes(p);
        }
      }),
      planejamento.get(userId).then(rows => { if (!cancel) setPlanoSemana(rows); }),
    ];
    if (isVIP) {
      tarefas.push(
        fichas.getAtiva(userId, 'dieta').then(f => { if (!cancel) setFichaDieta(f); }),
        dieta.getConsumoHoje(userId).then(c => { if (!cancel) setConsumoHoje(c); }),
        fichas.getUltimasMetasNutricionais(userId).then(m => { if (!cancel) setMetas(m); }),
      );
    }

    Promise.all(tarefas)
      .catch(e => { if (!cancel) setError(e instanceof Error ? e.message : 'Falha ao carregar seu painel.'); })
      .finally(() => { if (!cancel) setLoading(false); });

    return () => { cancel = true; };
  }, [userId, isVIP]);

  const consumo = useMemo(() => somarMacros(consumoHoje), [consumoHoje]);
  const goals = metas ?? METAS_PADRAO;
  const ultimoTreino = sequencia.sessoes[0] ?? null;

  // Planejamento de hoje: treino(s) alocado(s), descanso ou sem planejamento
  const planoHoje = useMemo<{ tipo: 'treino' | 'descanso' | 'vazio'; ids: string[] }>(() => {
    if (planoSemana.length === 0) return { tipo: 'vazio', ids: [] };
    const dia = diaSemanaSP();
    const itensDia = planoSemana.filter(p => p.dia_semana === dia);
    const ids = itensDia
      .filter(p => !p.is_descanso && p.treino_id)
      .sort((a, b) => a.ordem - b.ordem)
      .map(p => p.treino_id!);
    if (ids.length > 0) return { tipo: 'treino', ids };
    return itensDia.some(p => p.is_descanso) ? { tipo: 'descanso', ids: [] } : { tipo: 'vazio', ids: [] };
  }, [planoSemana]);

  const treinosDeHoje = useMemo(() => {
    if (planoHoje.tipo !== 'treino') return [];
    const lista = fichaTreino?.treinos ?? [];
    return planoHoje.ids
      .map(id => lista.find(t => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t);
  }, [planoHoje, fichaTreino]);

  // Treino(s) concluído(s) na data daquele dia da semana (fuso SP)
  const concluidoPorData = useMemo(() => {
    const set = new Set<string>();
    for (const s of progressoSessoes) {
      if (!s.treino_id) continue;
      const d = dataSPFuso(s.data_execucao);
      if (d) set.add(`${s.treino_id}|${d}`);
    }
    return set;
  }, [progressoSessoes]);

  // Grade semanal do card Minha Semana (personalizável pelo aluno)
  const semanaVisual = useMemo(() => {
    if (!fichaTreino) return null;
    const lista = fichaTreino.treinos ?? [];
    return DAYS_OF_WEEK.map((_, d) => {
      const itens = planoSemana.filter(p => p.dia_semana === d);
      const treinosDia = itens
        .filter(p => !p.is_descanso && p.treino_id)
        .sort((a, b) => a.ordem - b.ordem)
        .map(p => lista.find(t => t.id === p.treino_id))
        .filter((t): t is NonNullable<typeof t> => !!t);
      const data = dataDeDiaSemana(d);
      const concluido = treinosDia.length > 0 && data !== '' && treinosDia.every(t => concluidoPorData.has(`${t.id}|${data}`));
      return {
        treinos: treinosDia,
        descanso: treinosDia.length === 0 && itens.some(p => p.is_descanso),
        concluido,
      };
    });
  }, [planoSemana, fichaTreino, concluidoPorData]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="text-accent-light animate-spin" />
      </div>
    );
  }

  const primeiroNome = profile.nome.split(' ')[0];

  const kcalGoal = goals.meta_kcal;
  const kcalExcedeu = kcalGoal > 0 && consumo.calories > kcalGoal;
  const kcalPct = kcalGoal > 0 ? Math.min(100, (consumo.calories / kcalGoal) * 100) : 0;

  const carregando = loading || sequencia.loading;

  const dataSP = (() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();
  const planoExpirado = !!profile?.plano_vencimento && profile.plano_vencimento.slice(0, 10) < dataSP;

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">

        {/* Hero Banner */}
        <section className="relative overflow-hidden clip-bevel border border-line bg-panel">
          <img
            src={HERO_IMG}
            alt=""
            className="absolute inset-0 w-full h-full object-cover grayscale opacity-40 pointer-events-none select-none"
          />
          <div className="absolute inset-0 bg-black/70" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 p-6 md:p-8">
            {/* Lado esquerdo */}
            <div>
              <p className="flex items-center gap-2 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] text-accent-light">
                <span className="inline-block w-[3px] h-3.5 bg-accent-light" aria-hidden />
                Bem-vindo
              </p>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-[42px] leading-[1.1] font-display tracking-wide break-words flex items-center gap-4">
                <StudentAvatar size="lg" />
                <div>
                  <span className="block text-bone">{getGreeting()},</span>
                  <span className="block text-accent-light">{primeiroNome}!</span>
                </div>
              </h1>
              <p className="mt-2 text-xs md:text-sm text-muted-steel">
                Seu foco hoje constrói seus resultados de amanhã.
              </p>
            </div>

            {/* Widget de Sequência */}
            <div className="shrink-0 self-start lg:self-auto bg-[#101012]/80 backdrop-blur-sm clip-bevel-sm p-4 border border-line min-w-[230px] shadow-lg shadow-black/40">
              <div className="flex items-center gap-2">
                <Flame
                  size={20}
                  strokeWidth={2.2}
                  className={!sequencia.loading && sequencia.streak > 0 ? 'text-accent drop-shadow-[0_0_6px_rgba(255,90,31,0.5)]' : 'text-[#4A4A50]'}
                />
                <p className="text-xl md:text-2xl font-bold text-bone leading-none stat-number">
                  {sequencia.loading ? '·' : sequencia.streak} dia{sequencia.streak === 1 ? '' : 's'}
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-400 mt-1 ml-[28px]">Sequência</p>

              <div className="flex gap-1.5 mt-3.5">
                {sequencia.semana.map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                    <div className={`w-5 h-5 clip-bevel-sm flex items-center justify-center transition-colors ${
                      s.feito ? 'bg-accent' : 'border border-[#37373E]'
                    }`}>
                      {s.feito && <Check size={11} strokeWidth={3.5} className="text-[#170B04]" />}
                    </div>
                    <span className="text-[9px] font-medium text-muted-steel">{s.letra}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-zinc-400 mt-2.5">
                {sequencia.loading ? '·' : sequencia.naSemana} treino(s) nesta semana
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}

        {planoExpirado && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 clip-bevel-sm bg-red-500/10 text-red-300 border border-red-500/25">
            <div className="flex items-center gap-2 text-xs">
              <AlertCircle size={15} className="text-red-400 shrink-0" />
              <span>
                Seu plano mensal venceu. Fale com seu treinador para renovar e continuar acompanhando seus treinos.
              </span>
            </div>
          </div>
        )}

        {carregando ? (
          <div className="bg-panel border border-line p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando seu painel...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

            {/* Minha Semana — planejamento semanal (personalizável pelo aluno) */}
            {semanaVisual && (() => {
              const hoje = diaSemanaSP();
              const temAlgumAgendamento = planoSemana.length > 0;

              return (
                <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                        <CalendarDays size={14} className="text-accent-light" /> Minha Semana
                      </p>
                      <p className="text-[11px] text-muted-steel">
                        {temAlgumAgendamento
                          ? 'Seu cronograma de treinos · você pode alterar os dias quando quiser'
                          : 'Organize em quais dias da semana você deseja treinar'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setModalPlanejamento(true)}
                      className="btn-plate-sm text-xs px-3 py-1.5 gap-1.5 shrink-0"
                    >
                      <CalendarioCanetaIcon size={13} />
                      <span>{temAlgumAgendamento ? 'Editar Calendário' : 'Definir Dias de Treino'}</span>
                    </button>
                  </div>

                  {feedbackPlanejamento && (
                    <div className="mb-4 p-3 bg-ok/10 border border-ok/30 clip-bevel-sm flex items-center justify-between gap-2 text-xs text-ok animate-fade-in">
                      <div className="flex items-center gap-2">
                        <Check size={14} />
                        <span>{feedbackPlanejamento}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFeedbackPlanejamento('')}
                        className="text-ok/70 hover:text-ok p-0.5"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {!temAlgumAgendamento && (
                    <div className="mb-4 p-3.5 bg-accent/[0.04] border border-accent/25 clip-bevel-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <p className="text-xs text-zinc-300">
                        Você ainda não distribuiu seus treinos nos dias da semana. Clique no botão ao lado para montar seu cronograma!
                      </p>
                      <button
                        type="button"
                        onClick={() => setModalPlanejamento(true)}
                        className="text-xs font-bold text-accent-light hover:underline self-start sm:self-auto shrink-0"
                      >
                        Montar cronograma →
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {semanaVisual.map((dia, i) => {
                      const temTreino = dia.treinos.length > 0;
                      const cellTone = dia.concluido
                        ? 'border-emerald-500/50 bg-emerald-500/[0.05]'
                        : hoje === i
                          ? 'border-accent/60 bg-accent/[0.05]'
                          : dia.descanso
                            ? 'border-sky-500/20 bg-sky-500/[0.03]'
                            : 'border-line bg-panel-2/40';
                      const cellCls = `clip-bevel-sm border p-2 min-h-[84px] flex flex-col transition-colors ${cellTone}`;

                      const conteudo = (
                        <>
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${dia.concluido ? 'text-emerald-300' : hoje === i ? 'text-accent-light' : 'text-muted-steel'}`}>
                              {DAYS_SHORT[i]}
                            </span>
                            {dia.concluido ? (
                              <span className="inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.5 clip-bevel-sm">
                                <Check size={9} /> feito
                              </span>
                            ) : hoje === i ? (
                              <span className="text-[8px] font-extrabold uppercase tracking-[0.12em] text-[#170B04] bg-gradient-to-b from-accent-light to-accent px-1.5 py-0.5 clip-bevel-sm">
                                hoje
                              </span>
                            ) : dia.descanso ? (
                              <Moon size={10} className="text-sky-400/80" />
                            ) : null}
                          </div>
                          {temTreino ? (
                            <div className="space-y-1 min-w-0">
                              {dia.treinos.map((t, j) => (
                                <span key={t.id} className={`block text-[10.5px] font-bold truncate leading-tight ${dia.concluido ? 'text-emerald-300/90' : j === 0 ? 'text-bone' : 'text-zinc-400'}`}>
                                  {t.letra_ou_nome}
                                </span>
                              ))}
                            </div>
                          ) : dia.descanso ? (
                            <p className="text-[10px] font-semibold text-sky-300/90">Descanso</p>
                          ) : (
                            <p className="text-[10px] text-[#4A4A50]">—</p>
                          )}
                        </>
                      );

                      return temTreino ? (
                        <Link
                          key={i}
                          to="/treinos"
                          state={{ treinoId: dia.treinos[0].id }}
                          title={`Abrir ${dia.treinos.map(t => t.letra_ou_nome).join(' + ')}`}
                          className={`${cellCls} cursor-pointer hover:border-accent/50`}
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        <div
                          key={i}
                          onClick={() => setModalPlanejamento(true)}
                          className={`${cellCls} cursor-pointer hover:border-zinc-500/50`}
                          title="Clique para editar este dia"
                        >
                          {conteudo}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Card Treino */}
            <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                  <BarraOlimpicaIcon size={15} className="text-accent-light" /> Treino
                </p>
                {!(planoHoje.tipo === 'treino' && treinosDeHoje.length > 0) && (
                  <Link to="/treinos" className="btn-ghost">
                    Ver Treinos <ArrowRight size={12} />
                  </Link>
                )}
              </div>

              {planoHoje.tipo === 'treino' && treinosDeHoje.length > 0 ? (
                <>
                  <span className="self-start inline-flex items-center gap-1.5 px-2 py-1 clip-bevel-sm bg-accent/10 border border-accent/30 text-accent-light text-[9px] font-extrabold uppercase tracking-[0.15em] mb-3">
                    <CalendarCheck size={11} /> Treino de hoje
                  </span>
                  <div className="space-y-2">
                    {treinosDeHoje.map((t, i) => (
                      <div key={t.id} className={`flex items-center gap-2.5 bg-[#101012] border clip-bevel-sm px-3 py-2.5 ${i === 0 ? 'border-accent/40' : 'border-line'}`}>
                        <span className="w-6 h-6 shrink-0 clip-bevel-sm bg-gradient-to-br from-accent-light to-plate flex items-center justify-center text-[10px] font-bold text-[#170B04]">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-bone truncate leading-tight">Treino {t.letra_ou_nome}</p>
                          <p className="text-[10.5px] text-muted-steel">{t.exercicios?.length ?? 0} exercício(s)</p>
                        </div>
                        {i === 0 && <ArrowRight size={14} className="text-accent-light shrink-0" />}
                      </div>
                    ))}
                    {treinosDeHoje.length > 1 && (
                      <p className="text-[10.5px] text-muted-steel">Faça os dois na ordem listada.</p>
                    )}
                  </div>
                </>
              ) : planoHoje.tipo === 'descanso' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-6 bg-[#101012]/60 border border-dashed border-sky-500/25 clip-bevel-sm">
                  <Moon size={22} className="text-sky-400" />
                  <p className="font-display uppercase tracking-wide text-[15px] text-bone">Dia de Descanso</p>
                  <p className="text-xs text-muted-steel max-w-[250px] leading-relaxed">
                    Seu planejamento sugere recuperação hoje. Dormir bem também é treino.
                  </p>
                </div>
              ) : (
                <>
                  {fichaTreino ? (
                    <>
                      <p className="text-base md:text-lg font-bold text-bone truncate">
                        Ficha {fichaTreino.treinos?.[0]?.letra_ou_nome ?? 'A'} - {fichaTreino.nome}
                      </p>
                      <p className="text-[11px] text-muted-steel mt-0.5">
                        Ficha ativa{fichaTreino.treinos?.length ? ` · ${fichaTreino.treinos.length} treino(s)` : ''}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-steel">Nenhuma ficha de treino ativa no momento.</p>
                  )}
                </>
              )}

              <div className="mt-4 mb-5 bg-[#101012] border border-line clip-bevel-sm px-3 py-3 flex items-center gap-2.5 min-h-[44px]">
                <Clock size={14} className="text-accent-light shrink-0" />
                {ultimoTreino ? (
                  <p className="text-[11px] md:text-xs text-zinc-400 truncate">
                    Último treino: <span className="text-bone font-semibold">{ultimoTreino.nome_treino}</span>
                    {' · '}{formatarData(ultimoTreino.data_execucao)}
                    {ultimoTreino.duracao_segundos > 0 && ` · ${Math.round(ultimoTreino.duracao_segundos / 60)} min`}
                  </p>
                ) : (
                  <p className="text-[11px] md:text-xs text-muted-steel">Nenhum treino registrado ainda. Hora do primeiro!</p>
                )}
              </div>

              {planoHoje.tipo === 'treino' && treinosDeHoje.length > 0 ? (
                <Link
                  to="/treinos"
                  state={{ treinoId: treinosDeHoje[0].id }}
                  className="btn-forge btn-full mt-auto"
                >
                  Iniciar Treino de Hoje <ArrowRight size={15} />
                </Link>
              ) : planoHoje.tipo === 'descanso' ? (
                <Link to="/treinos" className="btn-steel btn-full mt-auto">
                  Ver Treinos <ArrowRight size={15} />
                </Link>
              ) : (
                <Link
                  to="/treinos"
                  className="btn-forge btn-full mt-auto"
                >
                  Ir para Treinos <ArrowRight size={15} />
                </Link>
              )}
            </div>

            {/* Card Dieta · Hoje */}
            {isVIP ? (
              <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4 md:mb-5">
                  <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                    <TalherFolhaIcon size={15} className="text-accent-light" /> Dieta · Hoje
                  </p>
                  <Link to="/dieta" className="btn-ghost">
                    Ver Dieta <ArrowRight size={12} />
                  </Link>
                </div>

                <p className="text-3xl md:text-4xl font-bold text-bone stat-number" style={{ color: kcalExcedeu ? '#ef4444' : undefined }}>
                  {Math.round(consumo.calories).toLocaleString('pt-BR')}
                  <span className="text-sm font-medium text-muted-steel"> / {kcalGoal.toLocaleString('pt-BR')} kcal</span>
                </p>
                <div className="h-2 bg-[#101012] border border-line overflow-hidden mt-2.5">
                  <div
                    className={`h-full transition-all duration-500 ${kcalExcedeu ? 'bg-red-500' : 'bg-gradient-to-r from-accent to-accent-light'}`}
                    style={{ width: `${kcalPct}%` }}
                  />
                </div>
                <p className={`text-[11px] mt-1.5 ${kcalExcedeu ? 'text-red-400 font-semibold' : 'text-muted-steel'}`}>
                  {kcalExcedeu
                    ? `+${Math.round(consumo.calories - kcalGoal)} kcal acima da meta`
                    : `Restam ${Math.max(0, Math.round(kcalGoal - consumo.calories))} kcal`}
                </p>

                <div className="grid grid-cols-2 gap-3 my-4">
                  <MiniMacro label="Proteína" valor={consumo.protein} meta={goals.meta_proteina} unit="g" />
                  <MiniMacro label="Carboidrato" valor={consumo.carbs} meta={goals.meta_carbo} unit="g" />
                </div>

                {fichaDieta && (
                  <p className="text-[11px] text-muted-steel truncate mb-4">
                    Plano: <span className="text-zinc-300 font-medium">{fichaDieta.nome}</span>
                  </p>
                )}

                <Link
                  to="/dieta"
                  className="btn-steel btn-full mt-auto"
                >
                  Registrar Refeição <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="relative overflow-hidden bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col opacity-70 select-none">
                <div className="flex items-center justify-between mb-4 md:mb-5">
                  <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-muted-steel flex items-center gap-2">
                    <TalherFolhaIcon size={14} /> Dieta · Hoje
                  </p>
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] font-bold text-muted-steel border border-line clip-bevel-sm px-2 py-0.5">
                    <Lock size={9} /> VIP
                  </span>
                </div>

                <p className="text-3xl md:text-4xl font-bold text-[#4A4A50] stat-number blur-[1.5px]" aria-hidden>
                  287<span className="text-sm font-medium text-[#37373E]"> / 5.000 kcal</span>
                </p>
                <div className="h-2 bg-[#101012] border border-line overflow-hidden mt-2.5">
                  <div className="h-full w-[6%] bg-[#37373E]" />
                </div>
                <p className="text-[11px] text-[#6C6C74] mt-1.5" aria-hidden>Restam 4.713 kcal</p>

                <div className="grid grid-cols-2 gap-3 my-4">
                  <div className="h-[68px] bg-[#101012] border border-line" aria-hidden />
                  <div className="h-[68px] bg-[#101012] border border-line" aria-hidden />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 py-4">
                  <div className="w-11 h-11 clip-bevel-sm bg-panel-2 border border-line flex items-center justify-center">
                    <Lock size={18} className="text-muted-steel" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-300">Acompanhamento nutricional exclusivo do plano VIP</p>
                  <p className="text-xs text-muted-steel max-w-[260px] leading-relaxed">
                    Registre refeições e acompanhe calorias, proteína e carboidratos todos os dias.
                  </p>
                </div>

                <button
                  onClick={() => setModalUpgrade(true)}
                  className="btn-steel btn-full mt-auto"
                >
                  Desbloquear Dieta (VIP) <Lock size={14} />
                </button>
              </div>
            )}

            {/* Banner de Progressão — ref: design-reference/fitnessapp-banner-progressao (2).html */}
            <div className="relative overflow-hidden bg-panel border border-line min-h-[120px] flex items-center lg:col-span-2">
              {/* Foto P&B full-bleed */}
              <img
                src={BANNER_IMG}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover object-[center_45%] grayscale contrast-[1.15] brightness-105 pointer-events-none select-none"
              />
              {/* Scrim desktop: protege a faixa do texto, solta a foto a direita */}
              <div
                className="hidden sm:block absolute inset-0"
                style={{ background: 'linear-gradient(90deg, rgba(10,10,11,.95) 0%, rgba(10,10,11,.85) 26%, rgba(10,10,11,.40) 52%, rgba(10,10,11,.05) 78%, rgba(10,10,11,.25) 100%)' }}
                aria-hidden
              />
              {/* Scrim mobile: vertical (texto embaixo) */}
              <div
                className="sm:hidden absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(10,10,11,.55) 0%, rgba(10,10,11,.97) 65%)' }}
                aria-hidden
              />
              {/* Listra diagonal laranja (banda direita / faixa superior no mobile) */}
              <div
                className="absolute right-0 top-0 bottom-0 w-[22%] max-sm:w-full max-sm:h-[40%] max-sm:bottom-auto pointer-events-none"
                style={{ background: 'repeating-linear-gradient(115deg, rgba(255,90,31,.22) 0 4px, transparent 4px 22px)', mixBlendMode: 'screen' }}
                aria-hidden
              />

              <div className="relative z-10 w-full flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4 sm:gap-5 p-5 sm:p-[26px]">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 flex-none clip-bevel-sm bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_16px_-6px_rgba(255,90,31,0.5)] flex items-center justify-center">
                    <TrendingUp size={22} strokeWidth={2.6} className="text-[#170B04]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display uppercase tracking-[0.02em] text-[18px] text-white leading-tight">Sua evolução importa</h3>
                    {maiorSalto ? (
                      <p className="text-[13.5px] text-[#D8D7DC] leading-snug mt-1 truncate">
                        Maior salto (30 dias):{' '}
                        <span className="text-white font-semibold">{maiorSalto.nome_exercicio}</span>{' '}
                        <span className="text-accent-light font-bold stat-number">+{maiorSalto.delta_carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg</span>
                      </p>
                    ) : (
                      <p className="text-[13.5px] text-[#D8D7DC] leading-snug mt-1">
                        Finalize treinos para acompanhar seus saltos de carga.
                      </p>
                    )}
                  </div>
                </div>

                <Link
                  to="/progresso"
                  className="btn-plate-sm !h-[44px] flex-none w-full sm:w-auto px-5 gap-2 text-[13px]"
                >
                  Ver Progressão <ArrowRight size={14} strokeWidth={3} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {modalUpgrade && <ModalUpgrade onClose={() => setModalUpgrade(false)} />}

      {modalPlanejamento && userId && (
        <ModalPlanejamentoAluno
          isOpen={modalPlanejamento}
          onClose={() => setModalPlanejamento(false)}
          userId={userId}
          fichaTreino={fichaTreino}
          planoSemanaAtual={planoSemana}
          onSucesso={(novoPlano) => {
            setPlanoSemana(novoPlano);
            setFeedbackPlanejamento('Calendário semanal atualizado com sucesso!');
            setTimeout(() => {
              setFeedbackPlanejamento('');
            }, 4000);
          }}
        />
      )}
    </div>
  );
}

function MiniMacro({ label, valor, meta, unit }: { label: string; valor: number; meta: number; unit: string }) {
  const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
  return (
    <div className="bg-[#101012] border border-line p-3">
      <p className="text-[10px] text-muted-steel font-medium mb-1.5">{label}</p>
      <p className="text-sm font-bold text-bone stat-number">
        {Math.round(valor)}<span className="text-[10px] font-normal text-muted-steel"> / {meta} {unit}</span>
      </p>
      <div className="h-1.5 bg-black/60 overflow-hidden mt-2 border border-line/60">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ModalUpgrade({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Upgrade para VIP">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-panel border border-line clip-bevel p-6 text-center shadow-xl shadow-black/50 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-muted-steel hover:text-bone transition-colors"
          aria-label="Fechar"
        >
          <X size={16} />
        </button>

        <div className="w-12 h-12 clip-bevel-sm bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center mx-auto mb-4">
          <Lock size={22} className="text-[#170B04]" />
        </div>

        <h3 className="font-display uppercase text-[17px] text-bone">Desbloqueie a dieta completa</h3>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
          O pacote <span className="text-accent-light font-semibold">VIP</span> inclui registro de refeições e
          acompanhamento diário de calorias, proteína e carboidratos junto ao seu nutricionista.
        </p>
        <p className="mt-3 text-[11px] text-muted-steel">
          Fale com seu gestor para fazer o upgrade do seu plano.
        </p>

        <button
          onClick={onClose}
          className="btn-forge btn-full mt-5"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
