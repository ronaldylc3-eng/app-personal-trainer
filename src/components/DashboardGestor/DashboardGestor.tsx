import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  Flame,
  AlertTriangle,
  ArrowUpRight,
  Crown,
  Trophy,
  CheckCircle2,
  Sparkles,
  Activity,
  FileText,
  Weight,
  UserPlus,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import StudentAvatar from '../ui/StudentAvatar';
import { useAuth } from '../../hooks/useAuth';
import { useAlunos } from '../../hooks/useAlunos';
import { supabase } from '../../lib/supabase';
import { usuarios } from '../../services/api';
import type { Usuario } from '../../types';

export interface AlunoRiscoItem {
  aluno: Usuario;
  motivo: string;
  tipo: 'inatividade' | 'ficha' | 'dieta' | 'avaliacao';
  gravidade: 'critica' | 'atencao';
  detalhe: string;
}

export type FilaTipo = 'inatividade' | 'ficha' | 'plano' | 'avaliacao';

export interface FilaAcaoItem {
  aluno: Usuario;
  tipo: FilaTipo;
  label: string;
  emoji: string;
  cor: 'red' | 'amber' | 'neutral' | 'sky' | 'orange';
  detalhe: string;
  prioridade: number;
  extra?: string;
}

export type FiltroFila = 'todos' | 'inatividade' | 'ficha' | 'plano' | 'avaliacao';

export interface AlunoRankingItem {
  aluno: Usuario;
  streakDias: number;
  tonelagemKg: number;
  treinosMes: number;
  badge: string;
}

export default function DashboardGestor() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { alunos, loading: loadingAlunos, refetch: refetchAlunos } = useAlunos();

  const [filtroFila, setFiltroFila] = useState<FiltroFila>('todos');
  const [abaGamificacao, setAbaGamificacao] = useState<'streak' | 'tonelagem'>('streak');

  // Renovação de planos
  const [renovandoId, setRenovandoId] = useState<string | null>(null);
  const [feedbackRenovacao, setFeedbackRenovacao] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  // Estados de dados calculados reais
  const [avaliacoesPendentesCount, setAvaliacoesPendentesCount] = useState<number>(0);
  const [alunosSemAvaliacao, setAlunosSemAvaliacao] = useState<string[]>([]);
  const [adesaoPct, setAdesaoPct] = useState<number | null>(null);
  const [alunosRisco, setAlunosRisco] = useState<AlunoRiscoItem[]>([]);
  const [alunosRanking, setAlunosRanking] = useState<AlunoRankingItem[]>([]);
  const [loadingMetricas, setLoadingMetricas] = useState<boolean>(true);

  // Data atual formatada em português
  const dataHojeFormatada = useMemo(() => {
    try {
      const hoje = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'America/Sao_Paulo',
      };
      const formatador = new Intl.DateTimeFormat('pt-BR', options);
      const parts = formatador.format(hoje);
      return parts.charAt(0).toUpperCase() + parts.slice(1);
    } catch {
      return 'Quarta-feira, 26 de Agosto';
    }
  }, []);

  // Contagens de alunos reais
  const totalAlunos = alunos?.length || 0;
  const totalAtivos = alunos?.filter(a => a.status === 'ativo').length || 0;

  // Carregar métricas reais do Supabase para os alunos cadastrados
  const carregarMetricasReais = useCallback(async () => {
    try {
      setLoadingMetricas(true);

      if (!alunos || alunos.length === 0) {
        setAvaliacoesPendentesCount(0);
        setAlunosSemAvaliacao([]);
        setAdesaoPct(null);
        setAlunosRisco([]);
        setAlunosRanking([]);
        setLoadingMetricas(false);
        return;
      }

      const alunoIds = alunos.map(a => a.id);

      // 1. Buscar fichas ativas
      const { data: fichas } = await supabase
        .from('fichas')
        .select('id, user_id, tipo, status, created_at')
        .in('user_id', alunoIds)
        .eq('status', 'ativa');

      // 1b. Alunos sem avaliação física registrada (qualquer status da ficha)
      const { data: fichasAvaliacao } = await supabase
        .from('fichas')
        .select('user_id')
        .in('user_id', alunoIds)
        .eq('tipo', 'avaliacao');

      const alunosComAvaliacao = new Set((fichasAvaliacao || []).map(f => f.user_id));
      setAlunosSemAvaliacao(alunos.filter(a => a.status !== 'inativo' && !alunosComAvaliacao.has(a.id)).map(a => a.id));
      setAvaliacoesPendentesCount(
        alunos.filter(a => a.status !== 'inativo' && !alunosComAvaliacao.has(a.id)).length
      );

      // 2. Buscar logs de treino recentes (últimos 30 dias)
      const agora = new Date();
      const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: logsTreino } = await supabase
        .from('logs_treino')
        .select('id, user_id, data_execucao, duracao_segundos')
        .in('user_id', alunoIds)
        .gte('data_execucao', trintaDiasAtras);

      // 3. Buscar logs de execução de exercícios para tonelagem
      const logTreinoIds = logsTreino?.map(l => l.id) || [];
      let logsExec: any[] = [];
      if (logTreinoIds.length > 0) {
        const { data: le } = await supabase
          .from('logs_execucao')
          .select('log_treino_id, carga, repeticoes_realizadas, serie_valida')
          .in('log_treino_id', logTreinoIds);
        logsExec = le || [];
      }

      // Tonelagem por log de treino
      const tonelagemPorLog = new Map<string, number>();
      for (const exec of logsExec) {
        if (!exec.log_treino_id) continue;
        const subtotal = (Number(exec.carga) || 0) * (Number(exec.repeticoes_realizadas) || 0);
        tonelagemPorLog.set(
          exec.log_treino_id,
          (tonelagemPorLog.get(exec.log_treino_id) || 0) + subtotal
        );
      }

      // Tonelagem e treinos no mês por aluno
      const treinosPorAluno = new Map<string, number>();
      const tonelagemPorAluno = new Map<string, number>();
      const ultimoTreinoPorAluno = new Map<string, string>();

      if (logsTreino) {
        for (const log of logsTreino) {
          const uid = log.user_id;
          treinosPorAluno.set(uid, (treinosPorAluno.get(uid) || 0) + 1);
          
          const ton = tonelagemPorLog.get(log.id) || 0;
          tonelagemPorAluno.set(uid, (tonelagemPorAluno.get(uid) || 0) + ton);

          const ultData = ultimoTreinoPorAluno.get(uid);
          if (!ultData || log.data_execucao > ultData) {
            ultimoTreinoPorAluno.set(uid, log.data_execucao);
          }
        }
      }

      // 4. Adesão % = treinos realizados na semana atual ÷ treinos planejados na semana atual
      try {
        const { data: planejamento } = await supabase
          .from('planejamento_semanal')
          .select('user_id, dia_semana, treino_id')
          .in('user_id', alunoIds);

        const metaPorAluno = new Map<string, number>();
        for (const p of (planejamento || [])) {
          if (!p.treino_id) continue;
          metaPorAluno.set(p.user_id, (metaPorAluno.get(p.user_id) || 0) + 1);
        }
        const metaSemana = [...metaPorAluno.values()].reduce((s, n) => s + n, 0);

        const agoraSP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const diaAtual = agoraSP.getDay();
        const diffSeg = (diaAtual === 0 ? -6 : 1) - diaAtual;
        const inicioSemana = new Date(agoraSP);
        inicioSemana.setDate(agoraSP.getDate() + diffSeg - 6);
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);
        const isoInicio = inicioSemana.toISOString().split('T')[0];
        const isoFim = fimSemana.toISOString().split('T')[0];

        const realizadosSemana = (logsTreino || []).filter(l =>
          l.data_execucao >= isoInicio && l.data_execucao <= isoFim
        ).length;

        if (metaSemana > 0) {
          setAdesaoPct(Math.min(Math.round((realizadosSemana / metaSemana) * 100), 100));
        } else {
          setAdesaoPct(null);
        }
      } catch {
        setAdesaoPct(null);
      }

      // 5. Construir Alunos em Risco (Apenas alunos reais)
      const listaRisco: AlunoRiscoItem[] = [];

      for (const aluno of alunos) {
        // Checar se o aluno tem ficha ativa de treino
        const temFichaTreino = fichas?.some(f => f.user_id === aluno.id && f.tipo === 'treino');
        const ultimoTreino = ultimoTreinoPorAluno.get(aluno.id);

        if (!temFichaTreino) {
          listaRisco.push({
            aluno,
            motivo: 'Sem Ficha de Treino Ativa',
            tipo: 'ficha',
            gravidade: 'critica',
            detalhe: 'Necessita de montagem ou ativação de ficha',
          });
        } else if (!ultimoTreino) {
          listaRisco.push({
            aluno,
            motivo: 'Nenhum treino registrado',
            tipo: 'inatividade',
            gravidade: 'atencao',
            detalhe: 'Aluno cadastrado mas ainda não iniciou',
          });
        } else {
          const dataUlt = new Date(ultimoTreino);
          const diffDias = Math.floor((agora.getTime() - dataUlt.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDias >= 4) {
            listaRisco.push({
              aluno,
              motivo: `Sem treinar há ${diffDias} dias`,
              tipo: 'inatividade',
              gravidade: diffDias >= 7 ? 'critica' : 'atencao',
              detalhe: `Último registro em ${new Date(ultimoTreino).toLocaleDateString('pt-BR')}`,
            });
          }
        }
      }

      setAlunosRisco(listaRisco);

      // 6. Construir Ranking (Gamificação apenas com alunos reais)
      const ranking: AlunoRankingItem[] = alunos.map(aluno => {
        const treinosMes = treinosPorAluno.get(aluno.id) || 0;
        const tonelagemKg = tonelagemPorAluno.get(aluno.id) || 0;
        const streakDias = treinosMes > 0 ? Math.min(treinosMes, 30) : 0;

        let badge = 'Iniciando Foco';
        if (streakDias >= 15) badge = 'Máquina Implacável';
        else if (streakDias >= 10) badge = 'Foco de Aço';
        else if (streakDias >= 5) badge = 'Consistência';

        return {
          aluno,
          streakDias,
          tonelagemKg,
          treinosMes,
          badge,
        };
      });

      setAlunosRanking(ranking);

    } catch (err) {
      console.error('[DashboardGestor] Erro ao carregar métricas reais:', err);
    } finally {
      setLoadingMetricas(false);
    }
  }, [alunos]);

  useEffect(() => {
    carregarMetricasReais();
  }, [carregarMetricasReais]);

  // Ranking ordenado
  const rankingOrdenado = useMemo(() => {
    const list = [...alunosRanking];
    if (abaGamificacao === 'streak') {
      return list.sort((a, b) => b.streakDias - a.streakDias || b.treinosMes - a.treinosMes);
    }
    return list.sort((a, b) => b.tonelagemKg - a.tonelagemKg || b.treinosMes - a.treinosMes);
  }, [alunosRanking, abaGamificacao]);

  // ======================================================
  // PLANOS E RENOVAÇÃO (vence em X dias, +30 dias)
  // ======================================================
  const dataSP = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return parts;
  }, []);

  const datasPlanos = useMemo(() => {
    const espelho = new Map<string, { vencimento: Date; dias: number; estado: 'em_dia' | 'atencao' | 'vencido' }>();
    const hoje = Date.parse(dataSP);
    for (const aluno of alunos) {
      if (!aluno.plano_vencimento) continue;
      const venc = Date.parse(aluno.plano_vencimento.slice(0, 10));
      if (Number.isNaN(venc)) continue;
      const dias = Math.round((venc - hoje) / 86400000);
      espelho.set(aluno.id, {
        vencimento: new Date(venc),
        dias,
        estado: dias < 0 ? 'vencido' : dias <= 7 ? 'atencao' : 'em_dia',
      });
    }
    return espelho;
  }, [alunos, dataSP]);

  // ======================================================
  // FILA DE AÇÃO UNIFICADA (ficha, inatividade, planos, avaliação)
  // ======================================================
  const filaAcao = useMemo((): FilaAcaoItem[] => {
    const map = new Map<string, FilaAcaoItem>();
    const semAvaliacaoSet = new Set(alunosSemAvaliacao);

    const put = (item: FilaAcaoItem) => {
      const existente = map.get(item.aluno.id);
      if (!existente || item.prioridade < existente.prioridade) {
        map.set(item.aluno.id, item);
      }
    };

    // Planos (maior prioridade: vencido)
    for (const aluno of alunos) {
      const info = datasPlanos.get(aluno.id);
      if (!info || info.estado === 'em_dia') continue;
      if (info.estado === 'vencido') {
        put({
          aluno,
          tipo: 'plano',
          label: `Plano vencido há ${Math.abs(info.dias)} ${Math.abs(info.dias) === 1 ? 'dia' : 'dias'}`,
          emoji: '🔴',
          cor: 'red',
          detalhe: `Vencimento: ${info.vencimento.toLocaleDateString('pt-BR')}`,
          prioridade: 10,
        });
      } else {
        put({
          aluno,
          tipo: 'plano',
          label: info.dias === 0 ? 'Plano vence HOJE' : `Plano vence em ${info.dias} ${info.dias === 1 ? 'dia' : 'dias'}`,
          emoji: '🟠',
          cor: 'orange',
          detalhe: `Vencimento: ${info.vencimento.toLocaleDateString('pt-BR')}`,
          prioridade: 30,
          extra: 'renovar',
        });
      }
    }

    // Ficha sem ativa (crítico) e inatividade
    for (const r of alunosRisco) {
      if (r.tipo === 'ficha') {
        put({
          aluno: r.aluno,
          tipo: 'ficha',
          label: 'Sem Ficha Ativa',
          emoji: '⛔',
          cor: 'red',
          detalhe: r.detalhe,
          prioridade: 20,
        });
      } else if (r.tipo === 'inatividade') {
        const dias = /há (\d+) dias/.exec(r.motivo);
        const n = dias ? parseInt(dias[1], 10) : 0;
        const critico = r.gravidade === 'critica';
        put({
          aluno: r.aluno,
          tipo: 'inatividade',
          label: `Inativo há ${n} ${n === 1 ? 'dia' : 'dias'}`,
          emoji: critico ? '🟠' : '🟡',
          cor: critico ? 'orange' : 'neutral',
          detalhe: r.detalhe || r.motivo,
          prioridade: critico ? 25 : 40,
        });
      }
    }

    // Avaliação pendente (não sobrescreve outros itens mais graves)
    for (const aluno of alunos) {
      if (aluno.status === 'inativo') continue;
      if (!semAvaliacaoSet.has(aluno.id)) continue;
      if (!map.has(aluno.id)) {
        put({
          aluno,
          tipo: 'avaliacao',
          label: 'Avaliação pendente',
          emoji: '🔵',
          cor: 'sky',
          detalhe: 'Avaliação física não registrada',
          prioridade: 50,
        });
      } else {
        // adiciona como destaque secundário
        const existente = map.get(aluno.id)!;
        if (!existente.extra) existente.extra = 'avaliacao';
      }
    }

    const lista = [...map.values()];
    lista.sort((a, b) => {
      const aVencido = a.tipo === 'plano' && datasPlanos.get(a.aluno.id)?.estado === 'vencido';
      const bVencido = b.tipo === 'plano' && datasPlanos.get(b.aluno.id)?.estado === 'vencido';
      if (aVencido !== bVencido) return aVencido ? -1 : 1;
      if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
      return (a.aluno.nome || '').localeCompare(b.aluno.nome || '');
    });
    return lista;
  }, [alunos, alunosRisco, alunosSemAvaliacao, datasPlanos]);

  const filaAcaoFiltrada = useMemo(() => {
    if (filtroFila === 'todos') return filaAcao;
    return filaAcao.filter(i => i.tipo === filtroFila);
  }, [filaAcao, filtroFila]);

  async function renovarPlano(aluno: Usuario) {
    if (!window.confirm(`Renovar o plano de ${aluno.nome} por mais 30 dias?`)) return;
    setRenovandoId(aluno.id);
    setFeedbackRenovacao(null);
    try {
      await usuarios.renovarPlano(aluno.id);
      await refetchAlunos();
      setFeedbackRenovacao({ tipo: 'ok', msg: `Plano de ${aluno.nome} renovado por mais 30 dias.` });
    } catch (e: any) {
      setFeedbackRenovacao({ tipo: 'erro', msg: e?.message || 'Falha ao renovar o plano. Tente novamente.' });
    } finally {
      setRenovandoId(null);
      setTimeout(() => setFeedbackRenovacao(null), 5000);
    }
  }

  return (
    <div id="dashboard-gestor-root" className="min-h-screen bg-zinc-950 text-bone p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ========================================== */}
        {/* 1. CABEÇALHO + BARRA DE STATUS */}
        {/* ========================================== */}
        <header id="dashboard-header" className="flex flex-col gap-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-accent-light to-plate flex items-center justify-center clip-bevel-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                <Activity size={20} strokeWidth={2.5} className="text-[#170B04]" />
              </div>
              <div>
                <span className="font-display text-[10px] tracking-[0.14em] uppercase text-accent-light block">
                  Painel de Controle
                </span>
                <h1 className="font-display uppercase text-2xl md:text-3xl tracking-wide text-bone leading-none">
                  Sala de Comando
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
              <button
                id="btn-cadastrar-aluno"
                onClick={() => navigate('/alunos')}
                className="btn-forge text-xs md:text-sm h-11 px-5 gap-2"
              >
                <UserPlus size={16} />
                <span>Cadastrar Aluno</span>
              </button>
              <button
                id="btn-relatorios"
                onClick={() => navigate('/relatorios')}
                className="btn-steel text-xs md:text-sm h-11 px-4"
              >
                <FileText size={15} />
                <span>Relatórios</span>
              </button>
            </div>
          </div>

          {/* Barra de Status minimalista (KPIs em texto limpo) */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-300">
            <span className="flex items-center gap-2">
              <Users size={15} className="text-orange-500" />
              <b className="text-zinc-100 font-bold">{totalAtivos}</b>
              Alunos Ativos
            </span>
            <span className="text-zinc-700 select-none">|</span>
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-orange-500" />
              <b className="text-zinc-100 font-bold">{filaAcao.length}</b>
              Pendências
            </span>
            <span className="text-zinc-700 select-none">|</span>
            <span className="flex items-center gap-2">
              <TrendingUp size={15} className="text-orange-500" />
              <b className="text-zinc-100 font-bold">{adesaoPct === null ? '—' : `${adesaoPct}%`}</b>
              Adesão
            </span>
            <span className="text-xs text-zinc-600 ml-auto hidden md:inline">{dataHojeFormatada} · {profile?.nome || 'Admin'}</span>
          </div>
        </header>

        {/* ========================================== */}
        {/* 2. GRID PRINCIPAL (FILA DE AÇÃO | HALL DA FAMA) */}
        {/* ========================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

          {/* ========================================== */}
          {/* COLUNA ESQUERDA (65%): FILA DE AÇÃO */}
          {/* ========================================== */}
          <section id="fila-acao" className="lg:col-span-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="font-display text-base md:text-lg tracking-wide text-bone uppercase">
                  Fila de Ação
                </span>
                {filaAcao.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-300">
                    {filaAcao.length}
                  </span>
                )}
              </div>

              {/* Filtros */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {([
                  ['todos', 'Todos'],
                  ['inatividade', 'Inativos'],
                  ['ficha', 'Fichas'],
                  ['plano', 'Planos'],
                  ['avaliacao', 'Avaliações'],
                ] as [FiltroFila, string][]).map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    onClick={() => setFiltroFila(valor)}
                    className={`tab-chip min-h-[30px] px-3 text-xs font-semibold ${
                      filtroFila === valor ? 'tab-chip-active bg-accent/20 border-accent text-accent-light' : 'text-zinc-400'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>

            {loadingAlunos || loadingMetricas ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400 bg-zinc-900/50 rounded-xl">
                <Loader2 size={22} className="animate-spin text-accent-light" />
                <span className="text-xs">Analisando a fila de trabalho...</span>
              </div>
            ) : totalAlunos === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-3 bg-zinc-900/50 rounded-xl">
                <div className="w-12 h-12 clip-bevel-sm bg-accent/10 border border-accent/25 flex items-center justify-center text-accent-light">
                  <UserPlus size={22} />
                </div>
                <h3 className="font-display uppercase text-base text-bone tracking-wide">
                  Nenhum Aluno Cadastrado
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm">
                  Cadastre seus primeiros alunos para começar a construir a sua fila de trabalho e monitorar resultados.
                </p>
                <button onClick={() => navigate('/alunos')} className="btn-forge h-10 px-4 text-xs mt-2">
                  <UserPlus size={15} />
                  <span>Cadastrar Primeiro Aluno</span>
                </button>
              </div>
            ) : filaAcaoFiltrada.length === 0 ? (
              <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-2 bg-zinc-900/50 rounded-xl">
                <CheckCircle2 size={30} className="text-ok" />
                <h3 className="font-display uppercase text-sm text-bone tracking-wide">
                  Tudo em Ordem!
                </h3>
                <p className="text-xs text-zinc-400 max-w-xs">
                  Nenhuma pendência neste filtro no momento.
                </p>
              </div>
            ) : (
              <div className="bg-zinc-900/50 rounded-xl divide-y divide-zinc-800/50 overflow-hidden">
                {filaAcaoFiltrada.map(item => {
                  const { aluno } = item;
                  const corTag = {
                    red: 'bg-red-500/10 text-red-300 border-red-500/30',
                    orange: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
                    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
                    neutral: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
                    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
                  }[item.cor];
                  return (
                    <div key={aluno.id} className="flex items-center gap-3 px-4 py-3 min-w-0">
                      <StudentAvatar size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-bone truncate">{aluno.nome}</span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 border rounded-md ${corTag}`}>
                            <span aria-hidden>{item.emoji}</span>
                            {item.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">
                          {item.detalhe}
                          {item.extra === 'avaliacao' && <span className="text-muted-steel"> · + Aval. pendente</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => item.tipo === 'plano' ? void renovarPlano(aluno) : navigate(`/alunos/${aluno.id}`)}
                        disabled={item.tipo === 'plano' && renovandoId === aluno.id}
                        className="btn-forge h-9 px-3 text-xs gap-1 shrink-0 disabled:opacity-50"
                      >
                        {item.tipo === 'plano' ? (
                          renovandoId === aluno.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />
                        ) : (
                          <ArrowUpRight size={13} />
                        )}
                        <span>{item.tipo === 'plano' ? (renovandoId === aluno.id ? 'Renovando' : 'Renovar') : 'Resolver'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================== */}
          {/* COLUNA DIREITA (35%): HALL DA FAMA */}
          {/* ========================================== */}
          <section id="hall-da-fama-section" className="lg:col-span-4 bg-zinc-900/50 rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-lg leading-none">🏆</span>
                <h2 className="font-display uppercase text-base tracking-wide text-bone">
                  Hall da Fama
                </h2>
              </div>

              <div className="flex bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setAbaGamificacao('streak')}
                  title="Treinos concluídos"
                  className={`px-2.5 py-1 text-[11px] font-bold flex items-center gap-1.5 transition-all rounded-md ${
                    abaGamificacao === 'streak' ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Flame size={13} className={abaGamificacao === 'streak' ? 'text-orange-400' : 'text-zinc-500'} />
                  Treinos
                </button>
                <button
                  onClick={() => setAbaGamificacao('tonelagem')}
                  title="Volume total levantado"
                  className={`px-2.5 py-1 text-[11px] font-bold flex items-center gap-1.5 transition-all rounded-md ${
                    abaGamificacao === 'tonelagem' ? 'bg-orange-500/20 text-orange-300' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Weight size={13} className={abaGamificacao === 'tonelagem' ? 'text-orange-400' : 'text-zinc-500'} />
                  Volume
                </button>
              </div>
            </div>

            {loadingAlunos || loadingMetricas ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                <Loader2 size={22} className="animate-spin text-accent-light" />
                <span className="text-xs">Calculando ranking...</span>
              </div>
            ) : totalAlunos === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2">
                <Trophy size={26} className="text-zinc-600" />
                <h3 className="font-display uppercase text-sm text-bone tracking-wide">Sem Dados</h3>
                <p className="text-xs text-zinc-500 max-w-xs">
                  Conforme os alunos treinarem, eles aparecem classificados aqui.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rankingOrdenado.slice(0, 5).map((item, index) => {
                  const { aluno } = item;
                  const temAtividade = item.treinosMes > 0 || item.tonelagemKg > 0;
                  const isTop1 = index === 0 && temAtividade;
                  const isTop2 = index === 1 && temAtividade;
                  const isTop3 = index === 2 && temAtividade;

                  return (
                    <div key={aluno.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isTop1 ? (
                          <span className="text-lg w-7 text-center shrink-0">🔥</span>
                        ) : isTop2 ? (
                          <span className="text-lg w-7 text-center shrink-0">🥈</span>
                        ) : isTop3 ? (
                          <span className="text-lg w-7 text-center shrink-0">🥉</span>
                        ) : (
                          <span className="w-7 text-center text-xs font-bold text-zinc-500 font-mono shrink-0">{index + 1}º</span>
                        )}
                        <StudentAvatar size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-bone truncate">{aluno.nome}</span>
                            {isTop1 && <Crown size={13} className="text-amber-400 shrink-0 fill-amber-400" />}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <span className="text-amber-400/90 font-semibold">{item.badge}</span>
                            <span className="text-zinc-700">·</span>
                            <span>{item.treinosMes} treinos/mês</span>
                          </div>
                        </div>
                      </div>

                      {abaGamificacao === 'streak' ? (
                        <div className="text-right shrink-0">
                          <span className="font-display text-base tracking-wider text-bone font-bold">
                            {item.treinosMes}
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-1">treinos</span>
                        </div>
                      ) : (
                        <div className="text-right shrink-0">
                          <span className="font-display text-base tracking-wider text-bone font-bold">
                            {(item.tonelagemKg / 1000).toFixed(1)}<span className="text-[10px] text-zinc-500 ml-1">ton</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-5 pt-4 border-t border-zinc-800/50 text-[11px] text-zinc-600 flex items-center gap-1.5">
              <Sparkles size={12} className="text-zinc-500" />
              Dados calculados a partir dos treinos dos seus alunos.
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}
