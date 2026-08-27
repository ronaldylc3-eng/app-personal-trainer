import { useEffect, useState } from 'react';
import { FileText, Loader2, ChevronDown, AlertCircle, Inbox, Flame, CalendarDays, TrendingUp, Apple } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAlunos } from '../../hooks/useAlunos';
import { dieta, hojeSP } from '../../services/api';
import type { Meal } from '../../types';

function partesData(iso: string): { dia: string; mes: string; semanaCurta: string; completa: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    dia: String(d).padStart(2, '0'),
    mes: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    semanaCurta: dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    completa: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  };
}

function horaRegistro(m: Meal): string {
  if (!m.created_at) return '';
  return new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

interface DiaGrupo {
  data: string;
  refeicoes: Meal[];
  totalKcal: number;
  totalProt: number;
  totalCarb: number;
  totalFat: number;
}

function agruparPorDia(refeicoes: Meal[]): DiaGrupo[] {
  const mapa = new Map<string, DiaGrupo>();
  for (const r of refeicoes) {
    const g = mapa.get(r.date) || { data: r.date, refeicoes: [], totalKcal: 0, totalProt: 0, totalCarb: 0, totalFat: 0 };
    g.refeicoes.push(r);
    g.totalKcal += r.calories || 0;
    g.totalProt += r.protein || 0;
    g.totalCarb += r.carbs || 0;
    g.totalFat += r.fat || 0;
    mapa.set(r.date, g);
  }
  return Array.from(mapa.values()).sort((a, b) => b.data.localeCompare(a.data));
}

export default function Relatorios() {
  const { isAdmin } = useAuth();
  const { alunos, loading: loadingAlunos } = useAlunos();
  const [alunoId, setAlunoId] = useState('');
  const [refeicoes, setRefeicoes] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [diasAbertos, setDiasAbertos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!alunoId) { setRefeicoes([]); return; }
    let cancel = false;
    setLoading(true);
    setError('');
    setDiasAbertos({});
    dieta.getRelatorioConsumo(alunoId)
      .then(r => { if (!cancel) setRefeicoes(r); })
      .catch(() => { if (!cancel) setError('Falha ao carregar o relatório de consumo.'); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [alunoId]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 md:p-8 lg:p-10 flex items-center justify-center">
        <div className="bg-panel border border-line clip-bevel p-8 md:p-12 text-center max-w-md w-full">
          <div className="w-[46px] h-[46px] mx-auto mb-5 bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
            <FileText size={22} className="text-[#170B04]" strokeWidth={2.4} />
          </div>
          <h2 className="font-display uppercase text-[22px] text-bone mb-2">Área exclusiva do gestor</h2>
          <p className="text-sm text-muted-steel">Os relatórios de consumo são auditados pelo seu treinador.</p>
        </div>
      </div>
    );
  }

  const grupos = agruparPorDia(refeicoes);
  const totalKcal = grupos.reduce((s, g) => s + g.totalKcal, 0);
  const diasRegistrados = grupos.length;
  const mediaDia = diasRegistrados > 0 ? Math.round(totalKcal / diasRegistrados) : 0;
  const hoje = hojeSP();

  const stats = [
    { icon: Flame, iconClasses: 'text-accent-light border-accent/30', label: 'KCAL NO PERÍODO', value: Math.round(totalKcal).toLocaleString('pt-BR') },
    { icon: CalendarDays, iconClasses: 'text-sky-400 border-sky-500/30', label: 'DIAS REGISTRADOS', value: String(diasRegistrados) },
    { icon: TrendingUp, iconClasses: 'text-ok border-ok/30', label: 'MÉDIA KCAL/DIA', value: mediaDia.toLocaleString('pt-BR') },
  ];

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Cabecalho da pagina */}
        <div>
          <div className="flex items-start gap-3.5">
            <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
              <FileText size={22} className="text-[#170B04]" strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="font-display uppercase text-[26px] leading-tight text-bone">Relatórios</h1>
              <p className="text-[13.5px] text-muted-steel">Auditoria do consumo real dos últimos 30 dias.</p>
            </div>
          </div>
        </div>

        {/* Seletor de aluno */}
        <div className="field-bevel max-w-md">
          <Apple size={15} className="ml-3.5 shrink-0 text-muted-steel pointer-events-none" />
          <select value={alunoId} onChange={e => setAlunoId(e.target.value)} disabled={loadingAlunos}>
            <option value="">{loadingAlunos ? 'Carregando alunos...' : 'Selecione um aluno...'}</option>
            {alunos.map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <ChevronDown size={14} className="mr-3 shrink-0 text-muted-steel pointer-events-none" />
        </div>

        {error && (
          <div className="flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {!alunoId ? (
          <div className="bg-panel border border-line clip-bevel-sm p-12 text-center">
            <Inbox size={32} className="mx-auto text-[#4A4A50] mb-3" />
            <p className="text-sm text-muted-steel">Selecione um aluno para auditar o consumo.</p>
          </div>
        ) : loading ? (
          <div className="bg-panel border border-line p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando relatório...</p>
          </div>
        ) : (
          <>
            {/* Resumo do periodo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map(s => (
                <div key={s.label} className="bg-panel border border-line p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-[34px] h-[34px] flex-none bg-[#212126] border border-line flex items-center justify-center clip-bevel-sm ${s.iconClasses}`}>
                      <s.icon size={16} />
                    </div>
                    <span className="font-display text-[11px] tracking-[0.1em] text-muted-steel">{s.label}</span>
                  </div>
                  <p className="font-display text-[28px] leading-none text-bone stat-number">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Feed por dia */}
            {grupos.length === 0 ? (
              <div className="bg-panel border border-dashed border-[#2E2E34] clip-bevel-sm p-12 text-center">
                <Inbox size={32} className="mx-auto text-[#4A4A50] mb-3" />
                <p className="text-sm text-zinc-400">Nenhum consumo registrado nos últimos 30 dias.</p>
                <p className="text-xs text-[#6C6C74] mt-1">Os registros do aluno aparecerão aqui automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {grupos.map(g => {
                  const p = partesData(g.data);
                  const aberto = !!diasAbertos[g.data];
                  return (
                    <div key={g.data} className="bg-panel border border-line overflow-hidden hover:border-[#3A3A40] transition-colors duration-150">
                      {/* Header do dia */}
                      <button
                        onClick={() => setDiasAbertos(prev => ({ ...prev, [g.data]: !aberto }))}
                        className="w-full flex items-center justify-between px-4 md:px-[18px] py-4 hover:bg-panel-2/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-11 h-11 border clip-bevel-sm flex flex-col items-center justify-center shrink-0 ${g.data === hoje ? 'bg-accent/15 border-accent/40' : 'bg-[#212126] border-line'}`}>
                            <span className="text-[8px] uppercase tracking-wider text-muted-steel leading-none">{p.semanaCurta.slice(0, 3)}</span>
                            <span className={`text-sm font-bold leading-tight stat-number ${g.data === hoje ? 'text-accent-light' : 'text-zinc-200'}`}>{p.dia}</span>
                          </div>
                          <div className="text-left min-w-0">
                            <p className="text-sm font-bold text-bone truncate">
                              {p.completa}
                              {g.data === hoje && <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.06em] text-accent-light">Hoje</span>}
                            </p>
                            <p className="text-[11px] text-muted-steel">{g.refeicoes.length} registro{g.refeicoes.length > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden sm:flex flex-col items-end leading-tight">
                            <span className="font-display text-[14px] tracking-[0.02em] text-bone bg-[#212126] border border-line px-[11px] py-[5px] clip-bevel-sm stat-number">
                              {Math.round(g.totalKcal)} <span className="text-[10px] text-muted-steel">kcal</span>
                            </span>
                            <span className="text-[10px] text-[#6C6C74] mt-1 stat-number">{Math.round(g.totalProt)}p · {Math.round(g.totalCarb)}c · {Math.round(g.totalFat)}g</span>
                          </div>
                          <ChevronDown size={16} className={`text-muted-steel transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {/* Itens do dia */}
                      {aberto && (
                        <div className="border-t border-line divide-y divide-line/60 bg-panel-2/20 animate-slide-down">
                          {g.refeicoes.map(r => (
                            <div key={r.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 px-4 md:px-5 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5">
                                  <span className="text-xs font-bold text-bone">{r.meal_label}</span>
                                  <span className="text-[10px] text-[#6C6C74]">{horaRegistro(r)}</span>
                                </div>
                                <p className="text-xs text-zinc-400 break-words">{r.food_description}</p>
                              </div>
                              <div className="flex gap-3 shrink-0 text-[11px] text-muted-steel stat-number sm:text-right">
                                <span className="text-zinc-200 font-semibold">{r.calories} kcal</span>
                                <span>{r.protein}g</span>
                                <span>{r.carbs}g</span>
                                <span>{r.fat}g</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
