import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Dumbbell,
  ClipboardCheck,
  TrendingUp,
  Flame,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  MessageCircle,
  Crown,
  Trophy,
  ChevronRight,
  CheckCircle2,
  Calendar,
  Sparkles,
  Search,
  Filter,
  Plus,
  Shield,
  Activity,
  UserCheck,
  FileText,
  Weight,
  ExternalLink,
  Target,
  Zap,
  Phone,
  UserPlus,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAlunos } from '../../hooks/useAlunos';
import { supabase } from '../../lib/supabase';
import type { Usuario } from '../../types';

export interface AlunoRiscoItem {
  aluno: Usuario;
  motivo: string;
  tipo: 'inatividade' | 'ficha' | 'dieta' | 'avaliacao';
  gravidade: 'critica' | 'atencao';
  detalhe: string;
}

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
  const { alunos, loading: loadingAlunos } = useAlunos();

  const [filtroRisco, setFiltroRisco] = useState<'todos' | 'inatividade' | 'ficha' | 'dieta'>('todos');
  const [abaGamificacao, setAbaGamificacao] = useState<'streak' | 'tonelagem'>('streak');

  // Estados de dados calculados reais
  const [fichasAtivasCount, setFichasAtivasCount] = useState<number>(0);
  const [avaliacoesPendentesCount, setAvaliacoesPendentesCount] = useState<number>(0);
  const [dadosSemana, setDadosSemana] = useState<{ dia: string; count: number }[]>([]);
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
  const totalVip = alunos?.filter(a => a.pacote === 'VIP').length || 0;
  const totalPremium = alunos?.filter(a => a.pacote === 'Premium' || !a.pacote).length || 0;
  const totalAtivos = alunos?.filter(a => a.status === 'ativo').length || 0;
  const totalPendentes = alunos?.filter(a => a.status === 'pendente').length || 0;

  // Carregar métricas reais do Supabase para os alunos cadastrados
  const carregarMetricasReais = useCallback(async () => {
    try {
      setLoadingMetricas(true);

      if (!alunos || alunos.length === 0) {
        setFichasAtivasCount(0);
        setAvaliacoesPendentesCount(0);
        setAlunosRisco([]);
        setAlunosRanking([]);
        setDadosSemana([
          { dia: 'Seg', count: 0 },
          { dia: 'Ter', count: 0 },
          { dia: 'Qua', count: 0 },
          { dia: 'Qui', count: 0 },
          { dia: 'Sex', count: 0 },
          { dia: 'Sáb', count: 0 },
          { dia: 'Dom', count: 0 },
        ]);
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

      setFichasAtivasCount(fichas?.filter(f => f.tipo === 'treino').length || 0);

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

      // 4. Calcular Sparkline dos últimos 7 dias
      const diasSemanaNomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const ultimos7Dias: { dia: string; count: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
        const iso = d.toISOString().split('T')[0];
        const nomeDia = diasSemanaNomes[d.getDay()];
        const count = logsTreino?.filter(l => l.data_execucao === iso).length || 0;
        ultimos7Dias.push({ dia: nomeDia, count });
      }
      setDadosSemana(ultimos7Dias);

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

  // Alunos em risco filtrados
  const alunosRiscoFiltrados = useMemo(() => {
    if (filtroRisco === 'todos') return alunosRisco;
    return alunosRisco.filter(a => a.tipo === filtroRisco);
  }, [alunosRisco, filtroRisco]);

  // Ranking ordenado
  const rankingOrdenado = useMemo(() => {
    const list = [...alunosRanking];
    if (abaGamificacao === 'streak') {
      return list.sort((a, b) => b.streakDias - a.streakDias || b.treinosMes - a.treinosMes);
    }
    return list.sort((a, b) => b.tonelagemKg - a.tonelagemKg || b.treinosMes - a.treinosMes);
  }, [alunosRanking, abaGamificacao]);

  // WhatsApp handlers com alunos reais
  function abrirWhatsAppIncentivo(item: AlunoRiscoItem) {
    const { aluno } = item;
    if (!aluno.telefone) {
      alert(`O aluno ${aluno.nome} não possui telefone cadastrado.`);
      return;
    }
    const primeiroNome = aluno.nome.split(' ')[0];
    let msg = `Olá ${primeiroNome}! Tudo bem? Vi aqui no nosso app que você não treinou nos últimos dias. Está precisando de algum ajuste ou ajuda? Vamos pra cima! 💪🔥`;
    
    if (item.tipo === 'ficha') {
      msg = `Fala ${primeiroNome}! Notei que sua ficha de treino precisa ser atualizada. Estou organizando seu plano para você manter o foco! 🏋️‍♂️`;
    }

    const url = `https://api.whatsapp.com/send?phone=55${aluno.telefone.replace(/\D/g, '')}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function abrirWhatsAppParabens(item: AlunoRankingItem) {
    const { aluno } = item;
    if (!aluno.telefone) {
      alert(`O aluno ${aluno.nome} não possui telefone cadastrado.`);
      return;
    }
    const primeiroNome = aluno.nome.split(' ')[0];
    const msg = `Fala ${primeiroNome}! Passando para parabenizar pela disciplina nos treinos este mês! Continue com essa dedicação monstra! 🏆👊`;
    const url = `https://api.whatsapp.com/send?phone=55${aluno.telefone.replace(/\D/g, '')}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const maxSparkCount = Math.max(...dadosSemana.map(d => d.count), 1);

  return (
    <div id="dashboard-gestor-root" className="min-h-screen bg-[#0A0A0B] text-bone p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-7xl mx-auto space-y-7">
        
        {/* ========================================== */}
        {/* 1. CABEÇALHO INDUSTRIAL DA SALA DE COMANDO */}
        {/* ========================================== */}
        <header id="dashboard-header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-line pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-gradient-to-br from-accent-light to-plate flex items-center justify-center clip-bevel-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                <Activity size={22} strokeWidth={2.5} className="text-[#170B04]" />
              </div>
              <div>
                <span className="font-display text-[11px] tracking-[0.14em] uppercase text-accent-light block">
                  Painel de Controle do Treinador
                </span>
                <h1 className="font-display uppercase text-2xl md:text-3xl tracking-wide text-bone leading-none">
                  SALA DE COMANDO
                </h1>
              </div>
            </div>
            <p className="text-xs md:text-sm text-muted-steel flex items-center gap-2 pt-1">
              <Calendar size={13} className="text-muted-steel" />
              <span>{dataHojeFormatada}</span>
              <span className="text-[#4A4A50]">•</span>
              <span>Treinador: <b className="text-bone">{profile?.nome || 'Admin'}</b></span>
            </p>
          </div>

          {/* Ações rápidas com botões industriais oficiais */}
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
        </header>

        {/* ========================================== */}
        {/* 2. GRID DE KPIS (DADOS REAIS DOS ALUNOS) */}
        {/* ========================================== */}
        <section id="kpi-grid" aria-label="Indicadores de Performance" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* CARD 1: Alunos Cadastrados */}
          <div
            id="kpi-card-alunos-ativos"
            onClick={() => navigate('/alunos')}
            className="group cursor-pointer bg-panel border border-line clip-bevel-sm p-4 md:p-5 transition-all duration-150 card-hover flex flex-col justify-between"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-display text-[11px] tracking-[0.14em] uppercase text-muted-steel group-hover:text-accent-light transition-colors">
                Alunos Cadastrados
              </span>
              <div className="w-8 h-8 clip-bevel-sm bg-accent/10 border border-accent/25 flex items-center justify-center text-accent-light group-hover:bg-accent group-hover:text-[#170B04] transition-colors">
                <Users size={16} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl md:text-4xl text-bone tracking-tight">
                  {totalAlunos}
                </span>
                {totalPendentes > 0 ? (
                  <span className="text-[10.5px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 clip-bevel-sm">
                    {totalPendentes} convite pendente
                  </span>
                ) : (
                  <span className="text-[10.5px] font-bold text-ok bg-ok/10 border border-ok/20 px-1.5 py-0.5 clip-bevel-sm">
                    {totalAtivos} ativos
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 pt-2.5 border-t border-line text-[11px]">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 clip-bevel-sm bg-accent/15 border border-accent/30 text-accent-light font-bold">
                  <Crown size={11} className="text-accent" /> {totalVip} VIP
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 clip-bevel-sm bg-amber-500/10 border border-amber-500/25 text-amber-300 font-bold">
                  {totalPremium} Premium
                </span>
              </div>
            </div>
          </div>

          {/* CARD 2: Fichas Ativas */}
          <div
            id="kpi-card-treinos-vencer"
            onClick={() => navigate('/alunos')}
            className="group cursor-pointer bg-panel border border-line clip-bevel-sm p-4 md:p-5 transition-all duration-150 card-hover flex flex-col justify-between"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-display text-[11px] tracking-[0.14em] uppercase text-muted-steel group-hover:text-accent-light transition-colors">
                Fichas Ativas
              </span>
              <div className="w-8 h-8 clip-bevel-sm bg-accent/10 border border-accent/25 flex items-center justify-center text-accent-light group-hover:bg-accent group-hover:text-[#170B04] transition-colors">
                <Dumbbell size={16} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl md:text-4xl text-bone tracking-tight">
                  {fichasAtivasCount}
                </span>
                <span className="text-[10.5px] font-bold text-muted-steel bg-[#1C1C20] border border-line px-1.5 py-0.5 clip-bevel-sm">
                  prescritas
                </span>
              </div>
              <p className="mt-3 text-[11px] text-muted-steel pt-2.5 border-t border-line truncate">
                Fichas de treino em andamento
              </p>
            </div>
          </div>

          {/* CARD 3: Alunos em Alerta */}
          <div
            id="kpi-card-alertas"
            onClick={() => navigate('/alunos')}
            className="group cursor-pointer bg-panel border border-line clip-bevel-sm p-4 md:p-5 transition-all duration-150 card-hover flex flex-col justify-between"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-display text-[11px] tracking-[0.14em] uppercase text-muted-steel group-hover:text-amber-400 transition-colors">
                Radar de Atenção
              </span>
              <div className="w-8 h-8 clip-bevel-sm bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-[#170B04] transition-colors">
                <AlertTriangle size={16} />
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl md:text-4xl text-bone tracking-tight">
                  {alunosRisco.length}
                </span>
                {alunosRisco.length > 0 ? (
                  <span className="text-[10.5px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 clip-bevel-sm">
                    Requer Ação
                  </span>
                ) : (
                  <span className="text-[10.5px] font-bold text-ok bg-ok/10 border border-ok/20 px-1.5 py-0.5 clip-bevel-sm">
                    Tudo em Dia
                  </span>
                )}
              </div>
              <p className="mt-3 text-[11px] text-muted-steel pt-2.5 border-t border-line truncate">
                Inatividade ou sem treino prescrito
              </p>
            </div>
          </div>

          {/* CARD 4: Frequência Semanal (Sparkline dos 7 dias) */}
          <div
            id="kpi-card-frequencia"
            className="bg-panel border border-line clip-bevel-sm p-4 md:p-5 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-display text-[11px] tracking-[0.14em] uppercase text-muted-steel">
                Treinos na Semana
              </span>
              <div className="w-8 h-8 clip-bevel-sm bg-accent/10 border border-accent/25 flex items-center justify-center text-accent-light">
                <TrendingUp size={16} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-3xl md:text-4xl text-bone tracking-tight">
                  {dadosSemana.reduce((sum, d) => sum + d.count, 0)}
                </span>
                <span className="text-[10.5px] font-bold text-muted-steel">
                  concluídos
                </span>
              </div>

              {/* Sparkline estilo anilha de ferro */}
              <div className="pt-2">
                <div className="flex items-end justify-between gap-1.5 h-7 px-0.5">
                  {dadosSemana.map((d, i) => {
                    const isLast = i === dadosSemana.length - 1;
                    const heightPx = Math.max(4, Math.round((d.count / maxSparkCount) * 24));
                    return (
                      <div key={d.dia + i} className="flex-1 flex flex-col items-center gap-1 group/bar">
                        <div
                          className={`w-full transition-all duration-300 relative ${
                            d.count > 0
                              ? isLast
                                ? 'bg-gradient-to-t from-accent to-accent-light shadow-[0_0_8px_rgba(255,90,31,0.5)]'
                                : 'bg-accent/70 group-hover/bar:bg-accent-light'
                              : 'bg-[#232328]'
                          }`}
                          style={{ height: `${heightPx}px` }}
                        />
                        <span className="text-[9px] text-[#5D5D64] font-mono leading-none">{d.dia}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================== */}
        {/* 3. SEÇÃO CENTRAL (RADAR & GAMIFICAÇÃO REAIS) */}
        {/* ========================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* ========================================== */}
          {/* COLUNA ESQUERDA: RADAR DE ATENÇÃO */}
          {/* ========================================== */}
          <section id="radar-atencao-section" className="lg:col-span-7 bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col justify-between">
            <div>
              {/* Header do Radar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center">
                    <div className={`w-3.5 h-3.5 rounded-full ${alunosRisco.length > 0 ? 'bg-red-500 animate-ping absolute opacity-75' : 'bg-ok'}`} />
                    <div className={`w-3 h-3 rounded-full relative ${alunosRisco.length > 0 ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-ok'}`} />
                  </div>
                  <div>
                    <h2 className="font-display uppercase text-lg tracking-wide text-bone flex items-center gap-2">
                      RADAR DE ATENÇÃO
                      <span className={`font-sans text-[10px] font-bold px-2 py-0.5 clip-bevel-sm ${
                        alunosRisco.length > 0 ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-ok/20 text-ok border border-ok/40'
                      }`}>
                        {alunosRisco.length} {alunosRisco.length === 1 ? 'ALERTA' : 'ALERTAS'}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400">Identificação de inatividade e pendências dos seus alunos</p>
                  </div>
                </div>

                {/* Filtros em tab-chip */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setFiltroRisco('todos')}
                    className={`tab-chip min-h-[34px] px-3 text-xs font-bold ${filtroRisco === 'todos' ? 'tab-chip-active bg-accent/20 border-accent text-accent-light' : 'text-zinc-300'}`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFiltroRisco('inatividade')}
                    className={`tab-chip min-h-[34px] px-3 text-xs font-bold ${filtroRisco === 'inatividade' ? 'tab-chip-active bg-accent/20 border-accent text-accent-light' : 'text-zinc-300'}`}
                  >
                    Inativos
                  </button>
                  <button
                    onClick={() => setFiltroRisco('ficha')}
                    className={`tab-chip min-h-[34px] px-3 text-xs font-bold ${filtroRisco === 'ficha' ? 'tab-chip-active bg-accent/20 border-accent text-accent-light' : 'text-zinc-300'}`}
                  >
                    Fichas
                  </button>
                </div>
              </div>

              {/* Lista de Alunos em Risco */}
              {loadingAlunos || loadingMetricas ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 size={24} className="animate-spin text-accent-light" />
                  <span className="text-xs">Analisando frequência dos alunos...</span>
                </div>
              ) : totalAlunos === 0 ? (
                /* Estado quando não há nenhum aluno cadastrado */
                <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-3 bg-[#101012] clip-bevel-sm border border-dashed border-line">
                  <div className="w-12 h-12 clip-bevel-sm bg-accent/10 border border-accent/25 flex items-center justify-center text-accent-light">
                    <UserPlus size={22} />
                  </div>
                  <h3 className="font-display uppercase text-base text-bone tracking-wide">
                    Nenhum Aluno Cadastrado
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-sm">
                    Cadastre seus primeiros alunos para acompanhar frequência, criar fichas de treino personalizadas e monitorar resultados em tempo real.
                  </p>
                  <button
                    onClick={() => navigate('/alunos')}
                    className="btn-forge h-10 px-4 text-xs mt-2"
                  >
                    <UserPlus size={15} />
                    <span>Cadastrar Primeiro Aluno</span>
                  </button>
                </div>
              ) : alunosRiscoFiltrados.length === 0 ? (
                /* Estado quando todos os alunos estão em dia */
                <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-2 bg-[#101012] clip-bevel-sm border border-line">
                  <CheckCircle2 size={32} className="text-ok" />
                  <h3 className="font-display uppercase text-sm text-bone tracking-wide">
                    Tudo em Ordem!
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    Nenhum aluno com pendência crítica neste filtro no momento.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {alunosRiscoFiltrados.map((item) => {
                    const { aluno } = item;
                    const isCritico = item.gravidade === 'critica';
                    return (
                      <div
                        key={aluno.id}
                        className="group bg-[#121214] clip-bevel-sm p-3.5 border border-line card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        {/* Avatar e Informações */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 clip-bevel-sm bg-gradient-to-br from-[#232328] to-[#151517] border border-line flex items-center justify-center font-display text-base text-bone shadow-inner font-bold">
                              {aluno.nome?.charAt(0)?.toUpperCase() || 'A'}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#101012] ${
                                isCritico ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-amber-500 shadow-[0_0_6px_#f59e0b]'
                              }`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-bone truncate">{aluno.nome}</span>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 clip-bevel-sm ${
                                  aluno.pacote === 'VIP'
                                    ? 'bg-accent/20 text-accent-light border border-accent/40'
                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                {aluno.pacote || 'Premium'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 clip-bevel-sm ${
                                  isCritico
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                <AlertTriangle size={11} />
                                {item.motivo}
                              </span>
                              <span className="text-xs text-zinc-300 truncate font-medium">
                                {item.detalhe}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação Rápida */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-line w-full sm:w-auto justify-end">
                          {aluno.telefone && (
                            <button
                              onClick={() => abrirWhatsAppIncentivo(item)}
                              title="Enviar mensagem via WhatsApp"
                              className="btn-steel h-9 px-3 text-xs gap-1.5 text-ok hover:text-ok hover:border-ok/40"
                            >
                              <MessageCircle size={14} className="text-ok" />
                              <span>WhatsApp</span>
                            </button>
                          )}

                          <button
                            onClick={() => navigate(`/alunos/${aluno.id}/prontuario`)}
                            title="Abrir prontuário do aluno"
                            className="btn-steel h-9 px-3 text-xs gap-1 font-bold text-bone"
                          >
                            <span>Prontuário</span>
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé informativo */}
            <div className="mt-4 pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-ok" />
                Acompanhamento em tempo real sincronizado com a base de dados.
              </span>
              <button
                onClick={() => navigate('/alunos')}
                className="text-accent-light hover:underline font-bold text-xs self-end sm:self-auto"
              >
                Ver todos os alunos &rarr;
              </button>
            </div>
          </section>

          {/* ========================================== */}
          {/* COLUNA DIREITA: HALL DA FAMA (GAMIFICAÇÃO) */}
          {/* ========================================== */}
          <section id="hall-da-fama-section" className="lg:col-span-5 bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col justify-between">
            <div>
              {/* Header do Hall da Fama */}
              <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-line">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 clip-bevel-sm bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                    <Trophy size={18} strokeWidth={2.5} className="text-[#170B04]" />
                  </div>
                  <div>
                    <h2 className="font-display uppercase text-lg tracking-wide text-bone flex items-center gap-1.5">
                      HALL DA FAMA
                      <span className="text-accent-light">🔥</span>
                    </h2>
                    <p className="text-xs text-muted-steel">Desempenho real dos alunos</p>
                  </div>
                </div>

                {/* Alternância de Modo */}
                <div className="flex bg-[#101012] p-1 clip-bevel-sm border border-line">
                  <button
                    onClick={() => setAbaGamificacao('streak')}
                    title="Sequência de treinos concluídos"
                    className={`px-3 py-1 text-xs font-bold flex items-center gap-1.5 transition-all ${
                      abaGamificacao === 'streak'
                        ? 'bg-accent text-[#170B04] shadow-sm font-display uppercase tracking-wide'
                        : 'text-zinc-300 hover:text-bone hover:bg-[#1C1C20]'
                    }`}
                  >
                    <Flame size={13} className={abaGamificacao === 'streak' ? 'text-[#170B04]' : 'text-accent'} />
                    <span>Treinos</span>
                  </button>
                  <button
                    onClick={() => setAbaGamificacao('tonelagem')}
                    title="Volume total de peso levantado"
                    className={`px-3 py-1 text-xs font-bold flex items-center gap-1.5 transition-all ${
                      abaGamificacao === 'tonelagem'
                        ? 'bg-accent text-[#170B04] shadow-sm font-display uppercase tracking-wide'
                        : 'text-zinc-300 hover:text-bone hover:bg-[#1C1C20]'
                    }`}
                  >
                    <Weight size={13} className={abaGamificacao === 'tonelagem' ? 'text-[#170B04]' : 'text-accent'} />
                    <span>Volume</span>
                  </button>
                </div>
              </div>

              {/* Lista do Ranking */}
              {loadingAlunos || loadingMetricas ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 size={24} className="animate-spin text-accent-light" />
                  <span className="text-xs">Calculando ranking...</span>
                </div>
              ) : totalAlunos === 0 ? (
                <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2 bg-[#101012] clip-bevel-sm border border-line">
                  <Trophy size={28} className="text-zinc-500" />
                  <h3 className="font-display uppercase text-sm text-bone tracking-wide">
                    Sem Dados no Ranking
                  </h3>
                  <p className="text-xs text-zinc-400 max-w-xs">
                    Conforme seus alunos executarem e registrarem treinos no app, eles aparecerão classificados aqui.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {rankingOrdenado.slice(0, 5).map((item, index) => {
                    const { aluno } = item;
                    const isTop1 = index === 0 && (item.treinosMes > 0 || item.tonelagemKg > 0);
                    const isTop2 = index === 1 && (item.treinosMes > 0 || item.tonelagemKg > 0);
                    const isTop3 = index === 2 && (item.treinosMes > 0 || item.tonelagemKg > 0);

                    return (
                      <div
                        key={aluno.id}
                        className={`group clip-bevel-sm p-3.5 transition-all flex items-center justify-between gap-3 border ${
                          isTop1
                            ? 'bg-gradient-to-r from-accent/20 via-[#18181B] to-[#121214] border-accent/50 shadow-[0_0_16px_rgba(255,90,31,0.25)]'
                            : 'bg-[#121214] hover:bg-[#18181B] border-line card-hover'
                        }`}
                      >
                        {/* Posição + Avatar + Nome */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Indicador de Posição */}
                          <div className="w-6 text-center font-display shrink-0 text-lg">
                            {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : (
                              <span className="text-xs font-bold text-zinc-400 font-mono">{index + 1}º</span>
                            )}
                          </div>

                          {/* Avatar */}
                          <div className="w-9 h-9 clip-bevel-sm bg-[#1F1F24] border border-line flex items-center justify-center font-display text-sm font-bold text-bone shrink-0 shadow-inner">
                            {aluno.nome?.charAt(0)?.toUpperCase() || 'A'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-bone truncate tracking-wide">
                                {aluno.nome}
                              </span>
                              {isTop1 && (
                                <Crown size={14} className="text-amber-400 shrink-0 fill-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-300 mt-0.5 font-medium">
                              <span className="text-amber-400 font-bold">{item.badge}</span>
                              <span className="text-zinc-500">•</span>
                              <span className="text-zinc-300">{item.treinosMes} treinos/mês</span>
                            </div>
                          </div>
                        </div>

                        {/* Métricas e Botão de Reconhecimento */}
                        <div className="flex items-center gap-3 shrink-0">
                          {abaGamificacao === 'streak' ? (
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Flame size={16} className="text-accent fill-accent animate-pulse" />
                                <span className="font-display text-base md:text-lg tracking-wider text-bone font-bold">
                                  {item.treinosMes} <span className="text-accent-light text-xs md:text-sm font-bold">TREINOS</span>
                                </span>
                              </div>
                              <span className="text-[11px] text-zinc-300 font-medium font-mono block">
                                no mês atual
                              </span>
                            </div>
                          ) : (
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Weight size={15} className="text-accent" />
                                <span className="font-display text-base md:text-lg tracking-wider text-bone font-bold">
                                  {(item.tonelagemKg / 1000).toFixed(1)} <span className="text-accent-light text-xs md:text-sm font-bold">TON</span>
                                </span>
                              </div>
                              <span className="text-[11px] text-zinc-300 font-medium font-mono block">
                                volume levantado
                              </span>
                            </div>
                          )}

                          {/* Botão de Reconhecimento WhatsApp */}
                          {aluno.telefone && (
                            <button
                              onClick={() => abrirWhatsAppParabens(item)}
                              title="Enviar parabéns pelo WhatsApp"
                              className="p-2 clip-bevel-sm bg-ok/10 border border-ok/30 text-ok hover:bg-ok hover:text-[#170B04] transition-all min-h-[36px] min-w-[36px] flex items-center justify-center shadow-sm"
                            >
                              <MessageCircle size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Rodapé Gamificação */}
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-muted-steel">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Sparkles size={13} className="text-accent-light" />
                Dados dinâmicos calculados a partir dos treinos dos seus alunos.
              </span>
            </div>
          </section>
        </div>

        {/* ========================================== */}
        {/* 4. CENTRAL TÁTICA DE ATALHOS */}
        {/* ========================================== */}
        <section id="atalhos-taticos" className="bg-panel border border-line clip-bevel-sm p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 text-sm">
            <div className="w-9 h-9 clip-bevel-sm bg-[#1C1C20] border border-line flex items-center justify-center text-accent-light">
              <Shield size={18} />
            </div>
            <div>
              <p className="font-display uppercase text-sm tracking-wide text-bone">Atalhos da Gestão Tática</p>
              <p className="text-xs text-muted-steel">Acesse rapidamente as ferramentas de cadastro, prescrição e acompanhamento.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => navigate('/alunos')}
              className="btn-steel h-10 px-4 text-xs font-bold whitespace-nowrap gap-1.5"
            >
              <Users size={14} className="text-accent-light" />
              <span>Lista de Alunos</span>
            </button>
            <button
              onClick={() => navigate('/relatorios')}
              className="btn-steel h-10 px-4 text-xs font-bold whitespace-nowrap gap-1.5"
            >
              <FileText size={14} className="text-accent-light" />
              <span>Relatórios</span>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
