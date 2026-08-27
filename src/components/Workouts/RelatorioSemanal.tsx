import React from 'react';
import {
  CalendarCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Dumbbell,
  ArrowRight,
  Sparkles,
  Info,
  Calendar,
  Flame,
  Share2,
} from 'lucide-react';
import type { SessaoHistorico } from '../../types';
import type { TreinoUI } from './Workouts';
import {
  getIntervaloSemanaAtual,
  getDiaSemanaExtenso,
  formatarDataBr,
  formatarDuracaoExtensa,
} from '../../utils/semanaUtils';

interface RelatorioSemanalProps {
  logsSemana: SessaoHistorico[];
  treinosFicha: TreinoUI[];
  nomeAluno?: string;
  onIrParaTreino: (treinoKey: string) => void;
  onCompartilharStory?: (log: SessaoHistorico) => void;
}

export default function RelatorioSemanal({
  logsSemana,
  treinosFicha,
  nomeAluno,
  onIrParaTreino,
  onCompartilharStory,
}: RelatorioSemanalProps) {
  const semana = getIntervaloSemanaAtual();
  const totalTreinosFicha = treinosFicha.length;
  const treinosRealizadosCount = logsSemana.length;
  const tempoTotalSegundos = logsSemana.reduce((acc, curr) => acc + (curr.duracao_segundos || 0), 0);

  // Percentual de conclusão da semana
  const percentualConclusao = totalTreinosFicha > 0
    ? Math.min(100, Math.round((treinosRealizadosCount / totalTreinosFicha) * 100))
    : 0;

  const todosConcluidos = totalTreinosFicha > 0 && treinosRealizadosCount >= totalTreinosFicha;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header do Relatório com Período da Semana */}
      <div className="bg-panel border border-line p-5 md:p-6 clip-bevel-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 clip-bevel-sm bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-light">
              <CalendarCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display uppercase text-lg text-bone tracking-wide">
                  Relatório Semanal de Treinos
                </h2>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 clip-bevel-sm bg-accent/15 text-accent-light border border-accent/30">
                  Somente Leitura
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Acompanhamento da frequência semanal · {semana.inicioFormatado} a {semana.fimFormatado}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 border border-line text-zinc-300 self-start sm:self-auto">
            <Calendar size={13} className="text-accent-light" />
            <span>Reset na Segunda-feira</span>
          </div>
        </div>

        {/* Barra de Progresso Semanal */}
        {totalTreinosFicha > 0 && (
          <div className="pt-2 border-t border-line space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Flame size={14} className="text-accent-light" />
                Meta Semanal: {treinosRealizadosCount} de {totalTreinosFicha} treinos finalizados
              </span>
              <span className="font-display font-bold text-accent-light">
                {percentualConclusao}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-zinc-900 clip-bevel-sm border border-line overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500 rounded-sm"
                style={{ width: `${percentualConclusao}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Cards de Métricas Rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Treinos Realizados */}
        <div className="bg-panel border border-line p-4 clip-bevel-sm">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
            Treinos Realizados
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl md:text-3xl font-bold text-bone">
              {treinosRealizadosCount}
            </span>
            <span className="text-xs text-zinc-400 font-medium">
              / {totalTreinosFicha} nesta semana
            </span>
          </div>
        </div>

        {/* Tempo Total */}
        <div className="bg-panel border border-line p-4 clip-bevel-sm">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
            Tempo Total Treinado
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl md:text-3xl font-bold text-accent-light">
              {formatarDuracaoExtensa(tempoTotalSegundos)}
            </span>
          </div>
        </div>

        {/* Status do Ciclo */}
        <div className="bg-panel border border-line p-4 clip-bevel-sm">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
            Status do Ciclo
          </span>
          <div className="flex items-center gap-2 mt-1">
            {todosConcluidos ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ok bg-ok/15 border border-ok/30 px-2.5 py-1 clip-bevel-sm">
                <CheckCircle2 size={13} /> Semana Completa!
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 clip-bevel-sm">
                <Clock size={13} /> Em Andamento
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Parabéns por concluir a semana */}
      {todosConcluidos && (
        <div className="p-4 bg-gradient-to-r from-ok/15 via-ok/10 to-transparent border border-ok/40 clip-bevel-sm flex items-start gap-3">
          <Sparkles size={20} className="text-ok shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-bold text-sm text-bone">
              Excelente trabalho{nomeAluno ? `, ${nomeAluno}` : ''}! Todos os treinos da semana foram concluídos.
            </p>
            <p className="text-zinc-300">
              Você cumpriu toda a sua programação semanal. O ciclo será reiniciado na próxima segunda-feira às 00:00 com novas sessões liberadas.
            </p>
          </div>
        </div>
      )}

      {/* Seção 1: Histórico dos Treinos Realizados nesta Semana */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display uppercase text-sm text-bone tracking-wide flex items-center gap-2">
            <CheckCircle2 size={15} className="text-accent-light" />
            Treinos Finalizados Nesta Semana ({logsSemana.length})
          </h3>
          <span className="text-xs text-zinc-400">Semana Atual</span>
        </div>

        {logsSemana.length === 0 ? (
          <div className="bg-panel border border-dashed border-line p-8 text-center clip-bevel-sm space-y-2">
            <Clock size={28} className="mx-auto text-zinc-500" />
            <p className="text-sm font-semibold text-bone">Nenhum treino realizado nesta semana ainda</p>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Ao iniciar e finalizar um treino na aba &quot;Treinos&quot;, ele será automaticamente registrado aqui com a data, dia da semana e tempo de duração.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {logsSemana.map((log) => {
              const diaExtenso = getDiaSemanaExtenso(log.data_execucao);
              const dataFormatada = formatarDataBr(log.data_execucao);
              const duracaoFormatada = formatarDuracaoExtensa(log.duracao_segundos);

              return (
                <div
                  key={log.id}
                  className="bg-panel border border-line p-4 clip-bevel-sm flex flex-col justify-between gap-3 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 clip-bevel-sm bg-ok/15 text-ok border border-ok/30 inline-block">
                        {diaExtenso || 'Executado'}
                      </span>
                      <h4 className="font-bold text-sm text-bone truncate">{log.nome_treino}</h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-zinc-300 block">{dataFormatada}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-accent-light" />
                      <span>Duração: <strong className="text-bone">{duracaoFormatada}</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onCompartilharStory && (
                        <button
                          type="button"
                          onClick={() => onCompartilharStory(log)}
                          className="btn-forge text-[11px] py-1 px-2.5 flex items-center gap-1 shadow-plate"
                          title="Gerar e compartilhar Story deste treino"
                        >
                          <Share2 size={11} /> Story 📸
                        </button>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok">
                        <CheckCircle2 size={12} /> Validado
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Seção 2: Status dos Treinos da Ficha nesta Semana */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display uppercase text-sm text-bone tracking-wide flex items-center gap-2">
            <Dumbbell size={15} className="text-accent-light" />
            Status dos Treinos da Sua Ficha
          </h3>
          <span className="text-xs text-zinc-400">1 treino por semana</span>
        </div>

        <div className="space-y-2">
          {treinosFicha.map((treino) => {
            const logFeito = logsSemana.find(
              (l) => l.treino_id === treino.dbId || l.nome_treino.trim().toLowerCase() === treino.nome.trim().toLowerCase()
            );
            const jaRealizado = !!logFeito;

            return (
              <div
                key={treino.key}
                className={`p-3.5 clip-bevel-sm border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                  jaRealizado
                    ? 'bg-[#101012] border-ok/30'
                    : 'bg-panel border-line'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 clip-bevel-sm flex items-center justify-center shrink-0 ${
                      jaRealizado
                        ? 'bg-ok/20 text-ok border border-ok/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    {jaRealizado ? <CheckCircle2 size={18} /> : <Dumbbell size={16} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-bone truncate">{treino.nome}</h4>
                      <span className="text-xs text-zinc-500">
                        ({treino.exercicios.length} ex)
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400">
                      {jaRealizado && logFeito ? (
                        <span className="text-ok font-medium">
                          Concluído {getDiaSemanaExtenso(logFeito.data_execucao)} ({formatarDataBr(logFeito.data_execucao)}) · {formatarDuracaoExtensa(logFeito.duracao_segundos)}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Disponível para realizar nesta semana</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {jaRealizado ? (
                    <span className="px-3 py-1 text-xs font-bold text-ok bg-ok/10 border border-ok/30 clip-bevel-sm inline-flex items-center gap-1.5">
                      <CheckCircle2 size={13} /> Bloqueado até Segunda
                    </span>
                  ) : (
                    <button
                      onClick={() => onIrParaTreino(treino.key)}
                      className="btn-forge h-8 px-3 text-xs gap-1.5"
                    >
                      <span>Ir para Treino</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Box Explicativo das Regras Semanais */}
      <div className="p-4 bg-zinc-900/90 border border-line clip-bevel-sm flex items-start gap-3 text-xs text-zinc-400">
        <Info size={16} className="text-accent-light shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-bone">Como funciona a regra semanal de treinos?</p>
          <p className="leading-relaxed">
            • <strong>1 treino por semana:</strong> Cada treino cadastrado na sua ficha só pode ser finalizado uma vez por semana para garantir sua recuperação e adesão planejada.<br />
            • <strong>Descarte de sessão:</strong> Caso você inicie um treino e o descarte sem salvar, ele continuará liberado normalmente para ser realizado.<br />
            • <strong>Reset automático:</strong> Toda segunda-feira às 00:00, os bloqueios e este relatório semanal são reiniciados para o novo ciclo de treinos.
          </p>
        </div>
      </div>
    </div>
  );
}
