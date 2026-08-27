import { useState, useMemo, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardCheck, Eye, TrendingDown, Scale, Ruler, Activity, Target, Zap, Loader2 } from 'lucide-react';
import { avaliacoes } from '../../services/api';
import type { AvaliacaoFisicaRecord, Usuario } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { useAlunos } from '../../hooks/useAlunos';

const DEFAULT_COMPOSICAO = { percentual_gordura: 0, massa_magra: 0, massa_gordura: 0 };

const PERIMETRO_LABELS: { key: string; label: string }[] = [
  { key: 'braco_direito', label: 'Braço Direito' },
  { key: 'braco_esquerdo', label: 'Braço Esquerdo' },
  { key: 'antebraco_direito', label: 'Antebraço Direito' },
  { key: 'antebraco_esquerdo', label: 'Antebraço Esquerdo' },
  { key: 'peitoral', label: 'Peitoral' },
  { key: 'cintura', label: 'Cintura' },
  { key: 'abdomen', label: 'Abdômen' },
  { key: 'quadril', label: 'Quadril' },
  { key: 'coxa_direita', label: 'Coxa Direita' },
  { key: 'coxa_esquerda', label: 'Coxa Esquerda' },
  { key: 'panturrilha_direita', label: 'Panturrilha Direita' },
  { key: 'panturrilha_esquerda', label: 'Panturrilha Esquerda' },
];

const ATIVIDADE_FISICA: Record<string, { label: string; fator: number }> = {
  sedentario: { label: 'Sedentário', fator: 1.2 },
  leve: { label: 'Leve', fator: 1.375 },
  moderado: { label: 'Moderado', fator: 1.55 },
  alto: { label: 'Alto', fator: 1.725 },
  muito_alto: { label: 'Muito alto', fator: 1.9 },
};

const KCAL_POR_KG = 7700;
const DIAS_CICLO = 90;

export default function AvaliacaoFisica({ isStudentView = false }: { isStudentView?: boolean }) {
  // Aba da sidebar do gestor foi consolidada em /alunos; rota antiga redireciona.
  // O registro de novas avaliacoes acontece dentro do Prontuario do Aluno.
  if (!isStudentView) return <Navigate to="/alunos" replace />;
  return <AvaliacaoAlunoView />;
}

function AvaliacaoAlunoView() {
  const { profile } = useAuth();
  const [avaliacaoData, setAvaliacaoData] = useState<AvaliacaoFisicaRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const { alunos } = useAlunos();

  const selectedAluno: Usuario | undefined = (alunos.find(a => a.id === profile?.id) || profile) ?? undefined;

  // Student view: fetch own data using profile.id
  useEffect(() => {
    if (!profile?.id) return;
    setLoading(true);
    avaliacoes.getByCliente(profile.id)
      .then(data => { setAvaliacaoData(data); })
      .catch(() => { setAvaliacaoData(null); })
      .finally(() => { setLoading(false); });
  }, [profile?.id]);

  const perimetros = avaliacaoData?.perimetros || {};
  const composicao = avaliacaoData?.composicao || DEFAULT_COMPOSICAO;
  const peso = avaliacaoData?.peso || 0;
  const altura = avaliacaoData?.altura || 0;

  // Strategy defaults for preview
  const [estrategiaLocal, setEstrategiaLocal] = useState({ estrategia: 'superavit' as 'superavit' | 'deficit', ajuste_calorias: 0, nivelAtividade: 'sedentario' });

  const tmb = useMemo(() => {
    if (peso <= 0 || altura <= 0) return 0;
    const idade = 25; // default for display
    const base = 10 * peso + 6.25 * altura - 5 * idade;
    return base + 5; // male default
  }, [peso, altura]);

  const fatorAtividade = ATIVIDADE_FISICA[estrategiaLocal.nivelAtividade]?.fator || 1.2;
  const tdee = tmb > 0 ? Math.round(tmb * fatorAtividade) : 0;
  const deficitDiario = estrategiaLocal.estrategia === 'deficit' && tdee > 0 ? estrategiaLocal.ajuste_calorias : 0;
  const diasPorKg = deficitDiario > 0 ? KCAL_POR_KG / deficitDiario : 0;
  const perda90Dias = deficitDiario > 0 ? (deficitDiario * DIAS_CICLO) / KCAL_POR_KG : 0;
  const imc = peso > 0 && altura > 0 ? (peso / ((altura / 100) ** 2)).toFixed(1) : null;

  const perimetrosPreenchidos = PERIMETRO_LABELS.filter(({ key }) => (perimetros[key] || 0) > 0);

  // ─── STUDENT VIEW ───
  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8 flex items-center justify-center">
        <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
          <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
          <span className="block text-xs text-muted-steel mt-3">Carregando avaliação...</span>
        </div>
      </div>
    );
  }

  if (!avaliacaoData) {
    return null;
  }

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-[46px] h-[46px] shrink-0 clip-bevel bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center">
            <ClipboardCheck size={22} className="text-[#170B04]" />
          </div>
          <div>
            <h1 className="font-display uppercase text-[26px] leading-none tracking-wide text-bone">Avaliação Física</h1>
            <p className="text-sm text-muted-steel mt-1">Somente leitura — dados preenchidos pelo seu personal trainer.</p>
          </div>
        </div>
        <div className="mt-4 mb-8 p-3 bg-accent/10 border border-accent/20 clip-bevel-sm flex items-center gap-2 max-w-md">
          <Eye size={15} className="text-accent-light shrink-0" />
          <p className="text-xs text-accent-light font-semibold">Modo Visualização</p>
        </div>

        <GestorPreviewView avaliacao={avaliacaoData} peso={peso} altura={altura} composicao={composicao} perimetrosPreenchidos={perimetrosPreenchidos} perimetros={perimetros} imc={imc} tdee={tdee} tmb={tmb} fatorAtividade={fatorAtividade} estrategiaLocal={estrategiaLocal} deficitDiario={deficitDiario} diasPorKg={diasPorKg} perda90Dias={perda90Dias} selectedAluno={selectedAluno} />
      </div>
    </div>
  );
}

// =============================================================
// GESTOR PREVIEW (view-only)
// =============================================================

function GestorPreviewView({ avaliacao, peso, altura, composicao, perimetrosPreenchidos, perimetros, imc, tdee, tmb, fatorAtividade, estrategiaLocal, deficitDiario, diasPorKg, perda90Dias, selectedAluno }: {
  avaliacao: AvaliacaoFisicaRecord;
  peso: number; altura: number;
  composicao: { percentual_gordura: number; massa_magra: number; massa_gordura: number };
  perimetrosPreenchidos: { key: string; label: string }[];
  perimetros: Record<string, number>;
  imc: string | null;
  tdee: number; tmb: number; fatorAtividade: number;
  estrategiaLocal: { estrategia: 'superavit' | 'deficit'; ajuste_calorias: number; nivelAtividade: string };
  deficitDiario: number; diasPorKg: number; perda90Dias: number;
  selectedAluno?: Usuario;
}) {
  const sectionTitle = "font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-5 flex items-center gap-2";
  const cardCls = "bg-panel border border-line clip-bevel-sm p-4 md:p-6";
  const metricCard = "bg-[#101012] clip-bevel-sm border border-line p-4 text-center";
  const labelCls = "text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1";
  const valueCls = "text-xl md:text-2xl font-bold text-bone stat-number";

  return (
    <div className="space-y-6">
      {deficitDiario > 0 ? (
        <div className="relative overflow-hidden bg-gradient-to-br from-accent/10 via-panel to-panel border border-accent/20 clip-bevel-sm p-6 md:p-8">
          <div
            className="absolute inset-y-0 right-0 w-40 pointer-events-none opacity-60"
            style={{ background: 'repeating-linear-gradient(115deg, rgba(255,90,31,0.08) 0 3px, transparent 3px 26px)' }}
            aria-hidden
          />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-accent-light" />
              <h2 className="font-display uppercase text-[13px] tracking-[0.12em] text-accent-light">Projeção de Perda de Peso — 3 Meses</h2>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Com seu déficit calórico atual de <span className="text-bone font-semibold stat-number">{deficitDiario} kcal/dia</span>, sua projeção estimada para o ciclo de 90 dias:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className={metricCard}>
                <p className={labelCls}>Déficit / Dia</p>
                <span className={valueCls}>{deficitDiario}</span>
                <span className="text-xs text-muted-steel ml-0.5">kcal</span>
              </div>
              <div className={metricCard}>
                <p className={labelCls}>Dias por 1 kg</p>
                <span className={valueCls}>{diasPorKg.toFixed(1)}</span>
                <span className="text-xs text-muted-steel ml-0.5">dias</span>
              </div>
              <div className="bg-accent/10 clip-bevel-sm border border-accent/30 p-4 text-center">
                <p className="text-[10px] text-accent-light uppercase tracking-[0.15em] font-semibold mb-1">Perda Estimada (90d)</p>
                <span className="text-2xl md:text-3xl font-bold text-accent-light stat-number">{perda90Dias.toFixed(1)}</span>
                <span className="text-sm text-accent/70 ml-0.5">kg</span>
              </div>
            </div>
            <div className="p-3 bg-[#101012]/70 clip-bevel-sm border border-line">
              <p className="text-xs text-zinc-400 leading-relaxed">
                <span className="text-accent-light font-medium">Fórmula:</span> {deficitDiario} kcal × 90 dias = {deficitDiario * DIAS_CICLO} kcal totais ÷ {KCAL_POR_KG} kcal/kg = <span className="text-bone font-semibold">{perda90Dias.toFixed(1)} kg</span>
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-muted-steel" />
            <h2 className="font-display uppercase text-[11.5px] tracking-[0.12em] text-muted-steel">Projeção de Perda de Peso</h2>
          </div>
          <p className="text-sm text-muted-steel">
            Configure o déficit calórico na aba Acompanhamento para visualizar a projeção.
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <section className={cardCls}>
            <h2 className={sectionTitle}><Scale size={14} className="text-accent-light" /> Medidas Básicas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className={metricCard}>
                <p className={labelCls}>Peso</p>
                <span className={valueCls}>{peso > 0 ? peso : '—'}</span>
                <span className="text-xs text-muted-steel ml-0.5">{peso > 0 ? 'kg' : ''}</span>
              </div>
              <div className={metricCard}>
                <p className={labelCls}>Altura</p>
                <span className={valueCls}>{altura > 0 ? altura : '—'}</span>
                <span className="text-xs text-muted-steel ml-0.5">{altura > 0 ? 'cm' : ''}</span>
              </div>
              <div className={metricCard}>
                <p className={labelCls}>IMC</p>
                <span className={valueCls}>{imc || '—'}</span>
                <span className="text-xs text-muted-steel ml-0.5">{imc ? 'kg/m²' : ''}</span>
              </div>
            </div>
          </section>
          <section className={cardCls}>
            <h2 className={sectionTitle}><Activity size={14} className="text-accent-light" /> Composição Corporal</h2>
            {(composicao.percentual_gordura > 0 || composicao.massa_magra > 0 || composicao.massa_gordura > 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={metricCard}>
                  <p className={labelCls}>% Gordura</p>
                  <span className={`${valueCls} ${composicao.percentual_gordura > 0 ? 'text-accent-light' : ''}`}>
                    {composicao.percentual_gordura > 0 ? composicao.percentual_gordura : '—'}
                  </span>
                  <span className="text-xs text-muted-steel ml-0.5">{composicao.percentual_gordura > 0 ? '%' : ''}</span>
                </div>
                <div className={metricCard}>
                  <p className={labelCls}>Massa Magra</p>
                  <span className={valueCls}>{composicao.massa_magra > 0 ? composicao.massa_magra : '—'}</span>
                  <span className="text-xs text-muted-steel ml-0.5">{composicao.massa_magra > 0 ? 'kg' : ''}</span>
                </div>
                <div className={metricCard}>
                  <p className={labelCls}>Massa Gorda</p>
                  <span className={valueCls}>{composicao.massa_gordura > 0 ? composicao.massa_gordura : '—'}</span>
                  <span className="text-xs text-muted-steel ml-0.5">{composicao.massa_gordura > 0 ? 'kg' : ''}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-steel">Composição corporal ainda não registrada.</p>
            )}
          </section>
          <section className={cardCls}>
            <h2 className={sectionTitle}><Target size={14} className="text-accent-light" /> Objetivo</h2>
            {avaliacao.objetivo ? (
              <p className="text-sm text-zinc-300 leading-relaxed">{avaliacao.objetivo}</p>
            ) : (
              <p className="text-sm text-muted-steel">Objetivo ainda não registrado.</p>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <section className={cardCls}>
            <h2 className={sectionTitle}><Ruler size={14} className="text-accent-light" /> Antropometria</h2>
            {perimetrosPreenchidos.length > 0 ? (
              <div className="space-y-2">
                {perimetrosPreenchidos.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-line last:border-0">
                    <span className="text-sm text-zinc-400">{label}</span>
                    <span className="text-sm font-semibold text-bone stat-number">
                      {perimetros[key]} <span className="text-xs font-normal text-muted-steel">cm</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-steel">Perímetros ainda não registrados.</p>
            )}
          </section>
          <section className={cardCls}>
            <h2 className={sectionTitle}><Activity size={14} className="text-accent-light" /> Flexibilidade e Força</h2>
            {avaliacao.flexibilidade_forca ? (
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{avaliacao.flexibilidade_forca}</p>
            ) : (
              <p className="text-sm text-muted-steel">Resultados de testes ainda não registrados.</p>
            )}
          </section>
          <aside className="bg-panel border border-line clip-bevel-sm p-6 sticky top-6">
            <h2 className={sectionTitle}> Resumo</h2>
            <div className="space-y-3">
              <div className="bg-[#101012] clip-bevel-sm border border-line p-4">
                <p className={labelCls}>Aluno</p>
                <p className="text-sm font-medium text-bone">{selectedAluno?.nome || '—'}</p>
              </div>
              {tdee > 0 && (
                <div className="bg-[#101012] clip-bevel-sm border border-line p-4">
                  <p className={labelCls}>Gasto Energético (TDEE)</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl md:text-2xl font-bold text-bone stat-number">{tdee}</span>
                    <span className="text-xs text-muted-steel">kcal/dia</span>
                  </div>
                  <p className="text-[10px] text-[#6C6C74] mt-1 font-mono">
                    TMB {Math.round(tmb)} × {fatorAtividade} ({ATIVIDADE_FISICA[estrategiaLocal.nivelAtividade]?.label || '—'})
                  </p>
                </div>
              )}
              <div className="bg-[#101012] clip-bevel-sm border border-line p-4">
                <p className={labelCls}>Estratégia</p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 clip-bevel-sm border ${
                    estrategiaLocal.estrategia === 'superavit'
                      ? 'text-ok bg-ok/10 border-ok/30'
                      : 'text-red-400 bg-red-500/10 border-red-500/20'
                  }`}>
                    {estrategiaLocal.estrategia === 'superavit' ? 'Superávit' : 'Déficit'}
                  </span>
                  {estrategiaLocal.ajuste_calorias > 0 && (
                    <span className="text-sm text-zinc-400 stat-number">
                      {estrategiaLocal.estrategia === 'superavit' ? '+' : '−'}{estrategiaLocal.ajuste_calorias} kcal
                    </span>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
