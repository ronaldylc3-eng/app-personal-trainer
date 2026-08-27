import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { User, ChevronDown, Calculator, TrendingUp, TrendingDown } from 'lucide-react';
import { useStudentData } from '../../contexts/StudentDataContext';
import { useAlunos } from '../../hooks/useAlunos';
import { useAuth } from '../../hooks/useAuth';

interface AlunoProfile {
  nome: string;
  idade: number;
  sexo: 'M' | 'F';
  peso: number;
  altura: number;
  protein_meta: number;
  carb_meta: number;
  gordura_meta: number;
  estrategia: 'superavit' | 'deficit';
  ajuste_calorias: number;
  nivelAtividade: string;
}

interface PerAlunoProfiles {
  [alunoId: string]: AlunoProfile;
}

const DEFAULT_PROFILE: AlunoProfile = {
  nome: '',
  idade: 0,
  sexo: 'M',
  peso: 0,
  altura: 0,
  protein_meta: 0,
  carb_meta: 0,
  gordura_meta: 0,
  estrategia: 'superavit',
  ajuste_calorias: 0,
  nivelAtividade: 'sedentario',
};

const ATIVIDADE_FISICA = [
  { key: 'sedentario', label: 'Sedentário', desc: 'pouco ou nenhum exercício', fator: 1.2 },
  { key: 'leve', label: 'Leve', desc: 'exercício leve 1 a 3 dias na semana', fator: 1.375 },
  { key: 'moderado', label: 'Moderado', desc: 'exercício moderado 3 a 5 dias na semana', fator: 1.55 },
  { key: 'alto', label: 'Alto', desc: 'exercício pesado 6 a 7 dias na semana', fator: 1.725 },
  { key: 'muito_alto', label: 'Muito alto', desc: 'exercício muito pesado ou trabalho físico', fator: 1.9 },
];

export default function Profile() {
  const { isAdmin } = useAuth();
  // Aba da sidebar do gestor foi consolidada em /alunos; rota antiga redireciona.
  // O registro de novos acompanhamentos acontece dentro do Prontuario do Aluno.
  if (isAdmin) return <Navigate to="/alunos" replace />;
  return <AcompanhamentoView />;
}

function AcompanhamentoView() {
  const { getPeso, getAltura, setPeso, setAltura, getEstrategia, setEstrategia } = useStudentData();
  const { alunos } = useAlunos();
  const [selectedAlunoId, setSelectedAlunoId] = useState<string>('');
  const [profiles, setProfiles] = useState<PerAlunoProfiles>({});

  const selectedAluno = alunos.find(a => a.id === selectedAlunoId);
  const localProfile = selectedAlunoId ? (profiles[selectedAlunoId] || { ...DEFAULT_PROFILE, nome: selectedAluno?.nome || '' }) : null;

  const profile = localProfile ? {
    ...localProfile,
    peso: getPeso(selectedAlunoId) || localProfile.peso,
    altura: getAltura(selectedAlunoId) || localProfile.altura,
  } : null;

  const estrategiaCtx = selectedAlunoId ? getEstrategia(selectedAlunoId) : null;

  function setProfileField(field: keyof AlunoProfile, value: string | number) {
    if (!selectedAlunoId) return;
    if (field === 'peso') setPeso(selectedAlunoId, Number(value) || 0);
    if (field === 'altura') setAltura(selectedAlunoId, Number(value) || 0);

    // Sync strategy fields to shared context
    const strategyFields = ['estrategia', 'ajuste_calorias', 'idade', 'sexo', 'nivelAtividade'];
    if (strategyFields.includes(field) && estrategiaCtx) {
      setEstrategia(selectedAlunoId, { ...estrategiaCtx, [field]: value });
    }

    setProfiles(prev => ({
      ...prev,
      [selectedAlunoId]: {
        ...(prev[selectedAlunoId] || { ...DEFAULT_PROFILE, nome: selectedAluno?.nome || '' }),
        [field]: value,
      },
    }));
  }

  const tmb = useMemo(() => {
    if (!profile || profile.peso <= 0 || profile.altura <= 0 || profile.idade <= 0) return 0;
    const base = 10 * profile.peso + 6.25 * profile.altura - 5 * profile.idade;
    return profile.sexo === 'M' ? base + 5 : base - 161;
  }, [profile?.peso, profile?.altura, profile?.idade, profile?.sexo]);

  const fatorAtividade = ATIVIDADE_FISICA.find(a => a.key === profile?.nivelAtividade)?.fator || 1.2;
  const tdee = tmb > 0 ? Math.round(tmb * fatorAtividade) : 0;

  const caloriaFinal = useMemo(() => {
    if (tdee <= 0) return 0;
    const ajuste = profile?.ajuste_calorias || 0;
    return profile?.estrategia === 'superavit' ? tdee + ajuste : tdee - ajuste;
  }, [tdee, profile?.estrategia, profile?.ajuste_calorias]);

  const inputCls = "field-bevel";
  const selectCls = "field-bevel";

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
          <div className="w-[46px] h-[46px] shrink-0 clip-bevel bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center">
            <User size={22} className="text-[#170B04]" />
          </div>
          <div>
            <h1 className="font-display uppercase text-[26px] leading-none tracking-wide text-bone">Acompanhamento</h1>
            <p className="text-xs md:text-sm text-muted-steel mt-1">Dados antropométricos e cálculo metabólico por aluno.</p>
          </div>
        </div>

        {/* Seletor de Aluno */}
        <div className="relative mb-6 mt-8 max-w-md">
          <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-steel z-10 pointer-events-none" />
          <div className={`${selectCls}`}>
            <select
              value={selectedAlunoId}
              onChange={e => setSelectedAlunoId(e.target.value)}
              className="!pl-9"
            >
              <option value="">Selecione um aluno...</option>
              {alunos.map(a => (
                <option key={a.id} value={a.id}>{a.nome} ({a.email})</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-steel pointer-events-none" />
          </div>
        </div>

        {selectedAlunoId && profile ? (
          <div className="grid gap-6 md:grid-cols-5">
            {/* Coluna Esquerda */}
            <div className="md:col-span-3 space-y-6">
              {/* Dados Antropométricos */}
              <section className="bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-5 flex items-center gap-2">
                  Dados Antropométricos
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-muted-steel mb-1.5 font-medium">Nome</label>
                    <div className={inputCls}><input type="text" value={profile.nome} onChange={e => setProfileField('nome', e.target.value)} placeholder="Nome do aluno" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-muted-steel mb-1.5 font-medium">Idade (anos)</label>
                      <div className={inputCls}><input type="number" value={profile.idade || ''} onChange={e => setProfileField('idade', Number(e.target.value) || 0)} placeholder="0" /></div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-steel mb-1.5 font-medium">Peso (kg)</label>
                      <div className={inputCls}><input type="number" step="0.1" value={profile.peso || ''} onChange={e => setProfileField('peso', Number(e.target.value) || 0)} placeholder="0" /></div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-steel mb-1.5 font-medium">Altura (cm)</label>
                      <div className={inputCls}><input type="number" value={profile.altura || ''} onChange={e => setProfileField('altura', Number(e.target.value) || 0)} placeholder="0" /></div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-steel mb-1.5 font-medium">Sexo</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProfileField('sexo', 'M')}
                        className={`tab-chip flex-1 ${profile.sexo === 'M' ? 'bg-accent/10 border-accent text-accent-light' : ''}`}
                      >
                        Masculino
                      </button>
                      <button
                        onClick={() => setProfileField('sexo', 'F')}
                        className={`tab-chip flex-1 ${profile.sexo === 'F' ? 'bg-accent/10 border-accent text-accent-light' : ''}`}
                      >
                        Feminino
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Atividade Física Semanal */}
              <section className="bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-5 flex items-center gap-2">
                  Atividade Física Semanal
                </p>
                <div className="space-y-2">
                  {ATIVIDADE_FISICA.map(a => (
                    <button
                      key={a.key}
                      onClick={() => setProfileField('nivelAtividade', a.key)}
                      className={`tab-chip w-full !justify-between text-left px-4 ${
                        profile.nivelAtividade === a.key
                          ? 'bg-accent/10 border-accent text-accent-light'
                          : ''
                      }`}
                    >
                      <span className="flex flex-col items-start">
                        <span className="text-xs md:text-[13px] font-semibold">
                          {a.label}
                        </span>
                        <span className="text-[10.5px] font-normal opacity-70 normal-case tracking-normal">{a.desc}</span>
                      </span>
                      <span className="text-xs font-mono opacity-80 stat-number">×{a.fator}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Metas Nutricionais */}
              <section className="bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-5 flex items-center gap-2">
                  Metas Nutricionais
                </p>
                <div className="space-y-4">
                  {/* Estratégia Calórica */}
                  <div>
                    <label className="block text-xs text-muted-steel mb-1.5 font-medium">Estratégia</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setProfileField('estrategia', 'superavit')}
                        className={`tab-chip flex-1 ${
                          profile.estrategia === 'superavit'
                            ? 'bg-ok/10 !border-ok text-ok'
                            : ''
                        }`}
                      >
                        <TrendingUp size={15} /> Superávit
                      </button>
                      <button
                        onClick={() => setProfileField('estrategia', 'deficit')}
                        className={`tab-chip flex-1 ${
                          profile.estrategia === 'deficit'
                            ? 'bg-red-500/10 !border-red-500 text-red-400'
                            : ''
                        }`}
                      >
                        <TrendingDown size={15} /> Déficit
                      </button>
                    </div>
                  </div>
                  {/* Ajuste Calórico */}
                  <div>
                    <label className="block text-xs text-muted-steel mb-1.5 font-medium">
                      Ajuste Calórico (kcal)
                      <span className={`ml-2 text-[10px] font-mono stat-number ${
                        profile.estrategia === 'superavit' ? 'text-ok' : 'text-red-400'
                      }`}>
                        {profile.estrategia === 'superavit' ? `+${profile.ajuste_calorias || 0}` : `-${profile.ajuste_calorias || 0}`}
                      </span>
                    </label>
                    <div className={inputCls}>
                      <input
                        type="number"
                        value={profile.ajuste_calorias || ''}
                        onChange={e => setProfileField('ajuste_calorias', Number(e.target.value) || 0)}
                        placeholder="Ex: 300"
                      />
                    </div>
                    <p className="text-[10px] text-muted-steel mt-1 font-mono">
                      {tdee > 0
                        ? `TDEE (${tdee}) ${profile.estrategia === 'superavit' ? '+' : '−'} ${profile.ajuste_calorias || 0} = ${caloriaFinal} kcal`
                        : 'Preencha peso, altura, idade e atividade para calcular o TDEE'
                      }
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-steel mb-1.5 font-medium">Proteína (g) <span className="text-accent-light">*</span></label>
                    <div className={inputCls}><input type="number" value={profile.protein_meta || ''} onChange={e => setProfileField('protein_meta', Number(e.target.value) || 0)} placeholder="0" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-steel mb-1.5 font-medium">Carboidratos (g)</label>
                      <div className={inputCls}><input type="number" value={profile.carb_meta || ''} onChange={e => setProfileField('carb_meta', Number(e.target.value) || 0)} placeholder="0" /></div>
                    </div>
                    <div>
                      <label className="block text-xs text-muted-steel mb-1.5 font-medium">Gorduras (g)</label>
                      <div className={inputCls}><input type="number" value={profile.gordura_meta || ''} onChange={e => setProfileField('gordura_meta', Number(e.target.value) || 0)} placeholder="0" /></div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Coluna Direita - Resumo */}
            <div className="md:col-span-2">
              <aside className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 md:sticky md:top-6 space-y-6">
                {/* TMB + TDEE */}
                <div>
                  <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-4 flex items-center gap-2">
                    <Calculator size={14} className="text-accent-light" /> Metabolismo
                  </p>
                  <div className="space-y-3">
                    <div className="bg-[#101012] clip-bevel-sm border border-line p-4">
                      <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1">TMB (Mifflin-St Jeor)</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl md:text-3xl font-bold text-bone stat-number">{tmb > 0 ? Math.round(tmb) : '—'}</span>
                        <span className="text-xs text-muted-steel">{tmb > 0 ? 'kcal/dia' : ''}</span>
                      </div>
                      <p className="text-[10px] text-[#6C6C74] mt-1 font-mono">
                        {profile.sexo === 'M' ? '(10×peso) + (6,25×altura) − (5×idade) + 5' : '(10×peso) + (6,25×altura) − (5×idade) − 161'}
                      </p>
                    </div>
                    <div className="bg-[#101012] clip-bevel-sm border border-line p-4">
                      <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1">Gasto Energético Total (TDEE)</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl md:text-3xl font-bold text-accent-light stat-number">{tdee > 0 ? tdee : '—'}</span>
                        <span className="text-xs text-muted-steel">{tdee > 0 ? 'kcal/dia' : ''}</span>
                      </div>
                      <p className="text-[10px] text-[#6C6C74] mt-1 font-mono">
                        TMB × {fatorAtividade} ({ATIVIDADE_FISICA.find(a => a.key === profile.nivelAtividade)?.label || '—'})
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metas Diárias */}
                <div className="pt-5 border-t border-line">
                  <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-4">Meta Diária</p>
                  <div className="text-center mb-5">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 clip-bevel-sm border ${
                        profile.estrategia === 'superavit'
                          ? 'text-ok bg-ok/10 border-ok/30'
                          : 'text-red-400 bg-red-500/10 border-red-500/20'
                      }`}>
                        {profile.estrategia === 'superavit' ? 'Superávit' : 'Déficit'}
                      </span>
                    </div>
                    <span className="text-4xl md:text-5xl font-bold text-bone stat-number">{caloriaFinal > 0 ? caloriaFinal : 0}</span>
                    <span className="text-xs md:text-sm text-muted-steel ml-1">kcal</span>
                    {tdee > 0 && (
                      <p className="text-[10px] text-[#6C6C74] mt-1 font-mono">
                        {tdee} {profile.estrategia === 'superavit' ? '+' : '−'} {profile.ajuste_calorias || 0} = {caloriaFinal}
                      </p>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-zinc-400">Proteína</span>
                      <span className="text-lg md:text-xl font-bold text-bone stat-number">{profile.protein_meta || 0}<span className="text-xs md:text-sm font-normal text-muted-steel ml-0.5">g</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-zinc-400">Carboidrato</span>
                      <span className="text-lg md:text-xl font-bold text-bone stat-number">{profile.carb_meta || 0}<span className="text-xs md:text-sm font-normal text-muted-steel ml-0.5">g</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-zinc-400">Gordura</span>
                      <span className="text-lg md:text-xl font-bold text-bone stat-number">{profile.gordura_meta || 0}<span className="text-xs md:text-sm font-normal text-muted-steel ml-0.5">g</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs md:text-sm text-zinc-400">Fibras</span>
                      <span className="text-lg md:text-xl font-bold text-bone stat-number">{caloriaFinal ? Math.round((caloriaFinal / 1000) * 15) : 0}<span className="text-xs md:text-sm font-normal text-muted-steel ml-0.5">g</span></span>
                    </div>
                  </div>
                </div>

                {/* Distribuição Calórica */}
                <div className="pt-5 border-t border-line">
                  <p className="font-display text-[10px] tracking-[0.12em] uppercase text-muted-steel mb-3">Distribuição Calórica</p>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Proteína</span>
                      <span className="font-medium text-muted-steel stat-number">{caloriaFinal ? Math.round((profile.protein_meta * 4 / caloriaFinal) * 100) : 0}%</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Carboidratos</span>
                      <span className="font-medium text-muted-steel stat-number">{caloriaFinal ? Math.round((profile.carb_meta * 4 / caloriaFinal) * 100) : 0}%</span>
                    </div>
                    <div className="flex justify-between text-zinc-400">
                      <span>Gorduras</span>
                      <span className="font-medium text-muted-steel stat-number">{caloriaFinal ? Math.round((profile.gordura_meta * 9 / caloriaFinal) * 100) : 0}%</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#101012] clip-bevel-sm border border-line">
                  <p className="text-[11px] text-muted-steel leading-relaxed">
                    Fibras: <span className="text-zinc-300 font-mono">(Calorias / 1000) × 15 = {caloriaFinal ? Math.round((caloriaFinal / 1000) * 15) : 0}g</span>
                  </p>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          <div className="bg-panel border border-dashed border-[#37373E] clip-bevel-sm p-6 md:p-12 text-center">
            <User size={40} className="text-[#37373E] mx-auto mb-3" />
            <p className="text-xs md:text-sm text-muted-steel">Selecione um aluno para visualizar e editar seus dados antropométricos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
