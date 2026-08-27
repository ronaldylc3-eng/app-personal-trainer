import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Clock, CalendarDays, ChevronDown, Dumbbell, Loader2, AlertCircle, Trophy, BarChart3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { logsExecucao } from '../../services/api';
import SecaoVolumeSemanal from '../Shared/SecaoVolumeSemanal';
import type { ExercicioSessao, SessaoComProgresso } from '../../types';

function formatarData(valor: string): string {
  const d = valor.includes('T')
    ? new Date(valor)
    : (() => {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
        return m
          ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
          : new Date(valor);
      })();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatarHora(valor: string): string {
  if (!valor.includes('T')) return '';
  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarDuracao(totalSegundos: number): string {
  const s = Math.max(0, Math.floor(totalSegundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(seg).padStart(2, '0')}s`;
  return `${seg}s`;
}

function formatarPesoKg(valor: number): string {
  return `${Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}

// =============================================================
// STAT CARD (estilo forge: quadrado, icone chanfrado, Anton)
// =============================================================

function StatCard({ icon: Icon, iconClasses, titulo, children }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClasses?: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-panel border border-line p-5 md:p-[22px]">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-[34px] h-[34px] flex-none bg-[#212126] border border-line flex items-center justify-center clip-bevel-sm ${iconClasses || ''}`}>
          <Icon size={16} />
        </div>
        <span className="font-display text-[11.5px] tracking-[0.1em] text-muted-steel">{titulo}</span>
      </div>
      {children}
    </div>
  );
}

// =============================================================
// CHIP DE STATUS DA SERIE
// =============================================================

function StatusChip({ valida }: { valida: boolean }) {
  if (valida) {
    return (
      <span className="inline-block px-2 py-[2px] text-[10.5px] font-extrabold text-ok bg-ok/10 border border-ok/35">
        Válida
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-[2px] text-[10.5px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/35">
      Aquecimento
    </span>
  );
}

// =============================================================
// CARD DE SESSAO (accordion, estilo forge)
// =============================================================

function SessaoCard({ sessao, aberta, onToggle }: {
  sessao: SessaoComProgresso;
  aberta: boolean;
  onToggle: () => void;
}) {
  const hora = formatarHora(sessao.data_execucao);
  const seriesPorExercicio = sessao.series || [];
  const temSeries = seriesPorExercicio.length > 0;

  return (
    <div className="bg-panel border border-line mb-3 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 md:px-[18px] py-4 flex items-center gap-3.5 hover:bg-panel-2/40 transition-colors duration-150 text-left"
      >
        <div className="w-[38px] h-[38px] flex-none bg-[#212126] border border-line flex items-center justify-center clip-bevel-sm">
          <Clock size={16} className="text-accent-light" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-bold text-bone truncate leading-tight">{sessao.nome_treino}</p>
          <p className="text-xs text-muted-steel mt-0.5">
            {formatarData(sessao.data_execucao)}{hora && ` · ${hora}`}
          </p>
        </div>

        <span className="font-display text-[13px] tracking-[0.02em] text-bone bg-[#212126] border border-line px-[11px] py-[5px] clip-bevel-sm shrink-0 tabular-nums">
          {formatarDuracao(sessao.duracao_segundos)}
        </span>

        <ChevronDown size={16} className={`text-muted-steel shrink-0 transition-transform duration-200 ${aberta ? 'rotate-180' : ''}`} />
      </button>

      {aberta && (
        <div className="border-t border-line animate-slide-down">
          {!temSeries ? (
            <p className="px-[18px] py-4 text-[13px] text-muted-steel text-center">
              Nenhuma série registrada nesta sessão.
            </p>
          ) : (
            <div className="px-4 md:px-[18px] py-4 space-y-5">
              {seriesPorExercicio.map((ex, i) => (
                <div key={`${ex.nome_exercicio}-${i}`}>
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <Dumbbell size={12} className="text-accent-light shrink-0" />
                    <p className="text-[13px] font-bold text-zinc-300 truncate">{ex.nome_exercicio}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr>
                          <th className="text-left text-[10px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2 pb-2 border-b border-line w-10">#</th>
                          <th className="text-left text-[10px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2 pb-2 border-b border-line">Reps</th>
                          <th className="text-left text-[10px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2 pb-2 border-b border-line">Carga</th>
                          <th className="text-left text-[10px] tracking-[0.08em] uppercase text-[#6C6C74] font-bold px-2 pb-2 border-b border-line">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ex.itens.map(it => (
                          <tr key={it.num_serie} className="border-b border-line last:border-b-0">
                            <td className="py-[9px] px-2 text-zinc-300 tabular-nums">{it.num_serie}</td>
                            <td className="py-[9px] px-2 text-zinc-300 tabular-nums">{it.reps}</td>
                            <td className="py-[9px] px-2 text-zinc-300 tabular-nums">{formatarPesoKg(it.carga)}</td>
                            <td className="py-[9px] px-2">
                              <StatusChip valida={it.valida} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================
// TELA PRINCIPAL
// =============================================================

export default function Progressao() {
  const { profile } = useAuth();
  const userId = profile?.id || '';

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, setSessoes] = useState<SessaoComProgresso[]>([]);
  const [expandidaId, setExpandidaId] = useState<string | null>(null);
  const [volumeTotal, setVolumeTotal] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    setLoading(true);
    setErro(null);
    logsExecucao.getProgresso(userId)
      .then(data => {
        if (cancel) return;
        setSessoes(data);
        setExpandidaId(data[0]?.id ?? null);
      })
      .catch(e => {
        if (!cancel) setErro(e instanceof Error ? e.message : 'Erro ao carregar progressão.');
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    logsExecucao.getVolumeTotal(userId)
      .then(v => {
        if (!cancel) setVolumeTotal(v);
      })
      .catch(() => {
        // Falha silenciosa: card exibe 0 kg
      });
    return () => { cancel = true; };
  }, [userId]);

  // -----------------------------------------------------------
  // Highlights derivados (janela: ultimos 30 dias)
  // -----------------------------------------------------------

  const highlights = useMemo(() => {
    const limite = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sessoes30 = sessoes.filter(
      s => new Date(s.data_execucao).getTime() >= limite
    );

    let maiorSalto: ExercicioSessao | null = null;
    for (const s of sessoes30) {
      for (const ex of s.exercicios) {
        if (ex.delta_carga > 0 && (!maiorSalto || ex.delta_carga > maiorSalto.delta_carga)) {
          maiorSalto = ex;
        }
      }
    }

    return { sessoes30, maiorSalto };
  }, [sessoes]);

  const { maiorSalto } = highlights;

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24">
      <div className="max-w-[1120px] mx-auto">

        {/* Cabecalho da pagina */}
        <div className="flex items-start gap-3.5 mb-7">
          <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
            <BarChart3 size={22} className="text-[#170B04]" strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display uppercase text-[26px] leading-tight text-bone">Progressão</h1>
            <p className="text-[13.5px] text-muted-steel">
              Cada treino finalizado comparado com a execução anterior do mesmo treino.
            </p>
          </div>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-center gap-2 px-4 py-2.5 mb-6 text-xs border bg-red-500/10 text-red-300 border-red-500/20 clip-bevel-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-panel border border-line p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando seu histórico...</p>
          </div>
        )}

        {!loading && !erro && (
          <>
            {/* =====================================================
                SECAO 1: CABECALHO DE CONQUISTAS (ultimos 30 dias)
                ===================================================== */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <StatCard
                icon={Trophy}
                iconClasses="text-[#E8B23D] border-[#E8B23D]/30"
                titulo="MAIOR EVOLUÇÃO"
              >
                {maiorSalto ? (
                  <div className="min-w-0">
                    <p className="text-sm md:text-base font-bold text-bone truncate mb-2">
                      {maiorSalto.nome_exercicio}
                    </p>
                    <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 tabular-nums">
                      ↑ +
                      {maiorSalto.delta_carga.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg
                    </span>
                  </div>
                ) : (
                  <p className="text-[13.5px] text-[#6C6C74]">Sem evoluções nos últimos 30 dias.</p>
                )}
              </StatCard>

              <StatCard
                icon={CalendarDays}
                iconClasses="text-accent-light"
                titulo="TREINOS REALIZADOS"
              >
                <p className="font-display text-[32px] leading-none text-bone stat-number">
                  {highlights.sessoes30.length}
                </p>
                <p className="text-xs text-muted-steel mt-1.5">nos últimos 30 dias</p>
              </StatCard>

              <StatCard
                icon={Dumbbell}
                iconClasses="text-accent-light"
                titulo="VOLUME TOTAL MOVIDO"
              >
                <p className="font-display text-[32px] leading-none text-bone stat-number">
                  {volumeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg
                </p>
                <p className="text-xs text-muted-steel mt-1.5">nos últimos 30 dias</p>
              </StatCard>
            </div>

            {/* =====================================================
                SECAO 2: VOLUME MUSCULAR SEMANAL (macro-grupos)
                ===================================================== */}
            <SecaoVolumeSemanal sessoes={sessoes} genero={profile?.genero} />

            {/* =====================================================
                SECAO 3: HISTORICO DE EXECUCOES (accordion)
                ===================================================== */}
            <section>
              <p className="font-display text-[12.5px] tracking-[0.12em] text-bone flex items-center gap-2 mb-3.5">
                <TrendingUp size={15} className="text-accent-light" />
                HISTÓRICO DE EXECUÇÕES
              </p>

              {sessoes.length === 0 ? (
                <div className="bg-panel border border-line p-8 text-center">
                  <Dumbbell size={28} className="mx-auto text-[#4A4A50] mb-3" />
                  <p className="text-sm text-zinc-400">Nenhum treino concluído ainda.</p>
                  <p className="text-xs text-muted-steel mt-1">
                    Vá em <span className="text-accent-light">Treino</span>, toque em "Iniciar Treino", preencha as séries e finalize para registrar.
                  </p>
                </div>
              ) : (
                <div>
                  {sessoes.map(s => (
                    <SessaoCard
                      key={s.id}
                      sessao={s}
                      aberta={expandidaId === s.id}
                      onToggle={() => setExpandidaId(expandidaId === s.id ? null : s.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
