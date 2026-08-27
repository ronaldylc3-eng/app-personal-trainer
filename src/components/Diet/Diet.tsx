import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Apple, Plus, Trash2, Bot, Clock, Pin, Lock, Crown, Check, AlertTriangle, FileText, Pencil, UtensilsCrossed, Loader2 } from 'lucide-react';
import { useAlunos } from '../../hooks/useAlunos';
import { useAuth } from '../../hooks/useAuth';
import { meals as mealsApi, fixedFoods as fixedFoodsApi, fichas, refeicoesDieta, dieta, hojeSP, METAS_PADRAO } from '../../services/api';
import type { Meal, FixedFood, FichaCompleta, RefeicaoDieta, MetasNutricionais } from '../../types';

const MACRO_LABELS: Record<string, string> = { calories: 'Calorias', protein: 'Proteína', carbs: 'Carboidrato', fat: 'Gordura', fiber: 'Fibras' };
const MEAL_LABELS = ['Café da Manhã', 'Almoço', 'Lanche da Tarde', 'Jantar', 'Ceia', 'Pré-Treino', 'Pós-Treino'];

const REFEICAO_VAZIA: RefeicaoFormValor = { nome_refeicao: '', horario: '', descricao_alimentos: '' };

function horaRefeicao(m: Meal): string {
  if (!m.created_at) return '';
  return new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

const GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY as string) || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.6-27b',
  'groq/compound-mini',
  'groq/compound'
];

interface MacroResult {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  calories: number;
}

async function analisarComGroq(description: string): Promise<MacroResult> {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'sua-anon-key-aqui') {
    throw new Error('Chave API da Groq não configurada. Adicione VITE_GROQ_API_KEY no arquivo .env');
  }

  let lastError = '';

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Voce e um nutricionista. Retorne SOMENTE um JSON com protein, carbs, fat, fiber, calories (numeros). Regras: 1) Sempre use valores de alimentos COZIDOS/prontos para consumo (TACO), nao crus/in natura; 2) Considere quantidades mencionadas; 3) Porcoes padrao: 1 pao frances = 50g (150kcal), 1 ovo = 50g (78kcal), 1 banana = 100g (96kcal), 1 xicara arroz = 130g (170kcal), 1 concha feijao = 150g (114kcal), 1 fatia pao de forma = 30g (80kcal); 4) Seja preciso e realista. Retorne APENAS o JSON.`
            },
            {
              role: 'user',
              content: `Analise esta refeição e retorne o JSON nutricional: ${description}`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Sem corpo de erro');
        console.warn(`Groq modelo ${model} retornou ${response.status}:`, errorBody);
        lastError = errorBody;
        continue;
      }

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content?.trim() || '';

      // Remove tags de reasoning se houver
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        const startIdx = content.indexOf('{');
        if (startIdx === -1) throw new Error('Resposta da IA não contém JSON válido');

        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < content.length; i++) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        if (endIdx === -1) throw new Error('JSON da IA incompleto (chaves desbalanceadas)');
        const jsonStr = content.slice(startIdx, endIdx + 1);
        parsed = JSON.parse(jsonStr);
      }

      return {
        protein: Number(parsed.protein ?? parsed.proteinas) || 0,
        carbs: Number(parsed.carbs ?? parsed.carboidratos) || 0,
        fat: Number(parsed.fat ?? parsed.gorduras) || 0,
        fiber: Number(parsed.fiber ?? parsed.fibras) || 0,
        calories: Number(parsed.calories ?? parsed.calorias) || 0,
      };
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`Tentativa com ${model} falhou:`, err);
    }
  }

  throw new Error(`Não foi possível analisar com a Groq. Detalhe: ${lastError.slice(0, 120)}`);
}

interface LastMealResult {
  meal: Meal;
  visible: boolean;
}

interface DietProps {
  alunoId?: string;
}

export default function Diet({ alunoId }: DietProps = {}) {
  const { isAdmin, profile } = useAuth();
  // Aba da sidebar foi consolidada em /alunos; rota antiga do gestor redireciona.
  if (isAdmin && !alunoId) return <Navigate to="/alunos" replace />;
  // Modo Gestor (prescricao): alunoId vem da rota do prontuario.
  // Modo Aluno: o ID vem EXCLUSIVAMENTE do perfil do usuario logado
  const efetivoId = alunoId || profile?.id || '';
  return <DietView alunoId={efetivoId} modoGestor={!!alunoId} currentProfile={profile} />;
}

interface DietViewProps {
  alunoId: string;
  modoGestor: boolean;
  currentProfile?: any;
}

function DietView({ alunoId, modoGestor, currentProfile }: DietViewProps) {
  const { alunos } = useAlunos();
  const [selectedAlunoId, setSelectedAlunoId] = useState<string>(alunoId);

  // Sincroniza com o ID resolvido pela autenticacao (chega async no modo Aluno)
  useEffect(() => {
    if (alunoId) {
      setSelectedAlunoId(alunoId);
    }
  }, [alunoId]);
  const [selectedMeal, setSelectedMeal] = useState(MEAL_LABELS[0]);
  const [foodDescription, setFoodDescription] = useState('');
  const [fixedFoodsByAluno, setFixedFoodsByAluno] = useState<Record<string, FixedFood[]>>({});
  const [mealsByAluno, setMealsByAluno] = useState<Record<string, Meal[]>>({});
  const [showAddFixed, setShowAddFixed] = useState(false);
  const [fixedForm, setFixedForm] = useState({ name: '', calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 });
  const [lastResult, setLastResult] = useState<LastMealResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loadingDiet, setLoadingDiet] = useState(false);

  // Ficha de dieta ativa (Prontuario do Aluno)
  const [fichaDieta, setFichaDieta] = useState<FichaCompleta | null>(null);
  const [showCriarFicha, setShowCriarFicha] = useState(false);
  const [novaFichaNome, setNovaFichaNome] = useState('');
  const [savingFicha, setSavingFicha] = useState(false);

  // Prescricao de dieta (cardapio estruturado)
  const [refeicoes, setRefeicoes] = useState<RefeicaoDieta[]>([]);
  const [showNovaRefeicao, setShowNovaRefeicao] = useState(false);
  const [novaRefeicao, setNovaRefeicao] = useState<RefeicaoFormValor>(REFEICAO_VAZIA);
  const [editandoRefeicao, setEditandoRefeicao] = useState<string | null>(null);
  const [formEdicao, setFormEdicao] = useState<RefeicaoFormValor>(REFEICAO_VAZIA);
  const [savingRefeicao, setSavingRefeicao] = useState(false);

  // Metas nutricionais (do acompanhamento mais recente do gestor)
  const [metas, setMetas] = useState<MetasNutricionais>(null);

  // Carrega a ficha de dieta ativa do aluno selecionado
  useEffect(() => {
    if (!selectedAlunoId) return;
    let cancel = false;
    fichas.getAtiva(selectedAlunoId, 'dieta')
      .then(f => {
        if (cancel) return;
        setFichaDieta(f);
        setRefeicoes(f?.refeicoes ? [...f.refeicoes] : []);
      })
      .catch(() => {
        if (!cancel) { setFichaDieta(null); setRefeicoes([]); }
      });
    return () => { cancel = true; };
  }, [selectedAlunoId]);

  async function abrirCriarFichaDieta() {
    if (!selectedAlunoId) return;
    try {
      const todas = await fichas.getByCliente(selectedAlunoId);
      const doTipo = todas.filter(f => f.tipo === 'dieta');
      const alunoNome = alunos.find(a => a.id === selectedAlunoId)?.nome || '';
      setNovaFichaNome(`Dieta ${String(doTipo.length + 1).padStart(2, '0')} - ${alunoNome}`);
    } catch {
      setNovaFichaNome(`Dieta - ${alunos.find(a => a.id === selectedAlunoId)?.nome || ''}`);
    }
    setShowCriarFicha(true);
  }

  async function handleCriarFichaDieta() {
    const nome = novaFichaNome.trim();
    if (!nome || !selectedAlunoId) return;
    setSavingFicha(true);
    try {
      const nova = await fichas.create(selectedAlunoId, nome, 'dieta');
      setFichaDieta({ ...nova, treinos: [] });
      setShowCriarFicha(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setApiError(`Nao foi possivel criar a ficha de dieta: ${msg.slice(0, 120)}`);
    } finally {
      setSavingFicha(false);
    }
  }

  // Carrega refeicoes do dia + alimentos fixos salvos no banco
  useEffect(() => {
    if (!selectedAlunoId) return;
    let cancel = false;
    setLoadingDiet(true);
    Promise.all([
      dieta.getConsumoHoje(selectedAlunoId),
      fixedFoodsApi.get(selectedAlunoId),
      fichas.getUltimasMetasNutricionais(selectedAlunoId).catch(() => null),
    ])
      .then(([ms, ffs, m]) => {
        if (cancel) return;
        setMealsByAluno(prev => ({ ...prev, [selectedAlunoId]: ms }));
        setFixedFoodsByAluno(prev => ({ ...prev, [selectedAlunoId]: ffs }));
        setMetas(m);
      })
      .catch(() => {
        if (!cancel) setApiError('Erro ao carregar dados salvos da dieta.');
      })
      .finally(() => {
        if (!cancel) setLoadingDiet(false);
      });
    return () => { cancel = true; };
  }, [selectedAlunoId]);

  // Timer para fade-out do card nutricional
  useEffect(() => {
    if (!lastResult?.visible) return;
    const timer = setTimeout(() => {
      setLastResult(prev => prev ? { ...prev, visible: false } : null);
    }, 4000); // começa fade aos 4s, desaparece aos 5s
    return () => clearTimeout(timer);
  }, [lastResult?.meal.id]);

  // Remove o card do DOM depois do fade-out completo (5s)
  useEffect(() => {
    if (!lastResult || lastResult.visible) return;
    const timer = setTimeout(() => setLastResult(null), 1000);
    return () => clearTimeout(timer);
  }, [lastResult?.visible]);

  const fixedFoods = selectedAlunoId ? (fixedFoodsByAluno[selectedAlunoId] || []) : [];
  const meals = selectedAlunoId ? (mealsByAluno[selectedAlunoId] || []) : [];

  const selectedAluno = alunos.find(a => a.id === selectedAlunoId) || (currentProfile?.id === selectedAlunoId ? currentProfile : null);
  const isPremium = selectedAluno?.pacote === 'Premium' || currentProfile?.pacote === 'Premium';

  const consumed = meals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
    fiber: acc.fiber + (m.fiber || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

  // Metas efetivas: acompanhamento mais recente -> fallback padrao
  const goals = {
    calories: metas?.meta_kcal || METAS_PADRAO.meta_kcal,
    protein: metas?.meta_proteina || METAS_PADRAO.meta_proteina,
    carbs: metas?.meta_carbo || METAS_PADRAO.meta_carbo,
    fat: metas?.meta_gordura || METAS_PADRAO.meta_gordura,
    fiber: metas?.meta_fibra || METAS_PADRAO.meta_fibra,
  };

  async function handleAnalyze() {
    if (!foodDescription.trim() || !selectedAlunoId) return;

    setAnalyzing(true);
    setApiError(null);

    let macros: MacroResult;

    try {
      macros = await analisarComGroq(foodDescription);
    } catch (err) {
      setAnalyzing(false);
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      if (msg.includes('não configurada')) {
        setApiError(msg);
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setApiError('Erro de conexão. Verifique sua internet e tente novamente.');
      } else if (msg.includes('401')) {
        setApiError('Chave API inválida ou expirada. Gere uma nova em console.groq.com/keys');
      } else if (msg.includes('404')) {
        setApiError('Modelo não encontrado. Verifique se o modelo está disponível na sua conta Groq.');
      } else if (msg.includes('429')) {
        setApiError('Limite de requisições atingido. Aguarde um momento e tente novamente.');
      } else if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
        setApiError('Servidor da Groq temporariamente indisponível. Tente novamente em instantes.');
      } else {
        setApiError(`Erro: ${msg.slice(0, 150)}`);
      }
      return;
    }

    setAnalyzing(false);

    try {
      const criada = await mealsApi.create({
        user_id: selectedAlunoId,
        date: hojeSP(),
        meal_label: selectedMeal,
        food_description: foodDescription,
        calories: macros.calories,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        fiber: macros.fiber,
      });

      setMealsByAluno(prev => ({
        ...prev,
        [selectedAlunoId]: [...(prev[selectedAlunoId] || []), criada],
      }));

      setLastResult({ meal: criada, visible: true });
      setFoodDescription('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setApiError(`Nao foi possivel salvar a refeicao: ${msg.slice(0, 120)}`);
    }
  }

  async function handleAddFixed() {
    if (!fixedForm.name.trim() || !selectedAlunoId) return;
    try {
      const criado = await fixedFoodsApi.create({
        user_id: selectedAlunoId,
        name: fixedForm.name.trim(),
        calories: fixedForm.calories,
        carbs: fixedForm.carbs,
        protein: fixedForm.protein,
        fat: fixedForm.fat,
        fiber: fixedForm.fiber,
      });
      setFixedFoodsByAluno(prev => ({
        ...prev,
        [selectedAlunoId]: [...(prev[selectedAlunoId] || []), criado],
      }));
      setFixedForm({ name: '', calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 });
      setShowAddFixed(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setApiError(`Nao foi possivel salvar o alimento fixo: ${msg.slice(0, 120)}`);
    }
  }

  async function handleDeleteFixed(id: string) {
    if (!selectedAlunoId) return;
    const anterior = fixedFoodsByAluno[selectedAlunoId] || [];
    setFixedFoodsByAluno(prev => ({
      ...prev,
      [selectedAlunoId]: (prev[selectedAlunoId] || []).filter(f => f.id !== id),
    }));
    try {
      await fixedFoodsApi.delete(id);
    } catch {
      setFixedFoodsByAluno(prev => ({ ...prev, [selectedAlunoId]: anterior }));
      setApiError('Erro ao remover alimento fixo. Tente novamente.');
    }
  }

  async function handleDeleteMeal(id: string) {
    if (!selectedAlunoId) return;
    const anterior = mealsByAluno[selectedAlunoId] || [];
    setMealsByAluno(prev => ({
      ...prev,
      [selectedAlunoId]: (prev[selectedAlunoId] || []).filter(m => m.id !== id),
    }));
    try {
      await mealsApi.delete(id);
    } catch {
      setMealsByAluno(prev => ({ ...prev, [selectedAlunoId]: anterior }));
      setApiError('Erro ao remover refeicao. Tente novamente.');
    }
  }

  // -----------------------------------------------------------
  // Prescricao de dieta (CRUD - Modo Gestor)
  // -----------------------------------------------------------

  async function handleSalvarRefeicao() {
    const nome = novaRefeicao.nome_refeicao.trim();
    const alimentos = novaRefeicao.descricao_alimentos.trim();
    if (!nome || !alimentos || !fichaDieta) return;
    setSavingRefeicao(true);
    try {
      const criada = await refeicoesDieta.create(fichaDieta.id, {
        nome_refeicao: nome,
        descricao_alimentos: alimentos,
        horario: novaRefeicao.horario || null,
        ordem: refeicoes.length,
      });
      setRefeicoes(prev => [...prev, criada]);
      setNovaRefeicao(REFEICAO_VAZIA);
      setShowNovaRefeicao(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setApiError(`Nao foi possivel salvar a refeição prescrita: ${msg.slice(0, 120)}`);
    } finally {
      setSavingRefeicao(false);
    }
  }

  function iniciarEdicaoRefeicao(r: RefeicaoDieta) {
    setShowNovaRefeicao(false);
    setEditandoRefeicao(r.id);
    setFormEdicao({
      nome_refeicao: r.nome_refeicao,
      descricao_alimentos: r.descricao_alimentos,
      horario: r.horario || '',
    });
  }

  async function handleSalvarEdicaoRefeicao(id: string) {
    const nome = formEdicao.nome_refeicao.trim();
    const alimentos = formEdicao.descricao_alimentos.trim();
    if (!nome || !alimentos) return;
    setSavingRefeicao(true);
    try {
      const atualizada = await refeicoesDieta.update(id, {
        nome_refeicao: nome,
        descricao_alimentos: alimentos,
        horario: formEdicao.horario || null,
      });
      setRefeicoes(prev => prev.map(r => (r.id === id ? atualizada : r)));
      setEditandoRefeicao(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setApiError(`Nao foi possivel atualizar a refeição prescrita: ${msg.slice(0, 120)}`);
    } finally {
      setSavingRefeicao(false);
    }
  }

  async function handleRemoverRefeicao(id: string) {
    const anterior = refeicoes;
    setRefeicoes(prev => prev.filter(r => r.id !== id));
    try {
      await refeicoesDieta.delete(id);
    } catch {
      setRefeicoes(anterior);
      setApiError('Erro ao remover refeição prescrita. Tente novamente.');
    }
  }

  const inputCls = "field-bevel";

  return (
    <div className="min-h-screen p-4 md:p-7 pb-24 md:pb-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <div className="flex items-center gap-3 mb-2 sm:mb-2">
            <div className="w-[46px] h-[46px] shrink-0 clip-bevel bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center">
              <Apple size={22} className="text-[#170B04]" />
            </div>
            <div>
              <h1 className="font-display uppercase text-[26px] leading-none tracking-wide text-bone">Dieta</h1>
              <p className="text-sm text-muted-steel mt-1 hidden sm:block">{modoGestor ? 'Prescrição nutricional do aluno.' : 'Seu desempenho começa na alimentação.'}</p>
            </div>
          </div>
        </div>

        {!selectedAlunoId ? (
          <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando dieta...</p>
          </div>
        ) : (
          <>
            {/* Ficha de Dieta Ativa (Prontuario do Aluno - Modo Gestor) */}
            {modoGestor && (
              <div className="mb-6">
                {fichaDieta ? (
                  <div className="bg-panel border border-line clip-bevel-sm p-4 flex items-center gap-3">
                    <div className="w-1 h-6 bg-accent-light hidden sm:block" />
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-bold text-bone truncate">{fichaDieta.nome}</h2>
                      <p className="text-xs text-muted-steel">Ficha de dieta ativa</p>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 clip-bevel-sm border text-ok bg-ok/10 border-ok/30">
                      Ativa
                    </span>
                  </div>
                ) : showCriarFicha ? (
                  <div className="bg-panel border border-line clip-bevel-sm p-4 space-y-3">
                    <p className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                      Nova Ficha de Dieta
                    </p>
                    <div className="field-bevel w-full">
                      <input
                        type="text"
                        value={novaFichaNome}
                        onChange={e => setNovaFichaNome(e.target.value)}
                        placeholder="Nome da ficha"
                        autoFocus
                      />
                    </div>
                    <p className="text-[11px] text-muted-steel">A ficha ativa anterior de dieta será arquivada automaticamente.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCriarFichaDieta}
                        disabled={!novaFichaNome.trim() || savingFicha}
                        className="btn-forge"
                      >
                        {savingFicha ? 'Criando...' : 'Criar Ficha'}
                      </button>
                      <button
                        onClick={() => setShowCriarFicha(false)}
                        className="btn-steel"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-panel border border-dashed border-[#37373E] clip-bevel-sm p-6 text-center space-y-3">
                    <FileText size={24} className="mx-auto text-muted-steel" />
                    <p className="text-sm text-zinc-400">Este aluno não possui ficha de dieta ativa.</p>
                    <button
                      onClick={abrirCriarFichaDieta}
                      className="btn-forge"
                    >
                      <Plus size={15} /> Criar Nova Ficha de Dieta
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ===== PRESCRICAO DE DIETA ===== */}
            {modoGestor ? (
              <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                    <UtensilsCrossed size={14} className="text-accent-light" /> Prescrição de Dieta
                  </h3>
                  {fichaDieta && (
                    <button
                      onClick={() => { setEditandoRefeicao(null); setShowNovaRefeicao(!showNovaRefeicao); }}
                      className="btn-steel"
                    >
                      <Plus size={14} /> Nova Refeição
                    </button>
                  )}
                </div>

                {!fichaDieta ? (
                  <p className="text-xs text-muted-steel py-6 text-center">
                    Crie uma ficha de dieta ativa acima para começar a prescrever o cardápio.
                  </p>
                ) : (
                  <>
                    {showNovaRefeicao && (
                      <div className="mb-4 bg-[#101012] clip-bevel-sm p-4 border border-line">
                        <RefeicaoForm
                          valor={novaRefeicao}
                          onChange={setNovaRefeicao}
                          onSave={handleSalvarRefeicao}
                          onCancel={() => setShowNovaRefeicao(false)}
                          saving={savingRefeicao}
                          rotuloSalvar="Adicionar Refeição"
                        />
                      </div>
                    )}

                    {refeicoes.length > 0 ? (
                      <div className="space-y-1.5">
                        {refeicoes.map(r => editandoRefeicao === r.id ? (
                          <div key={r.id} className="bg-[#101012] clip-bevel-sm p-4 border border-accent/40">
                            <RefeicaoForm
                              valor={formEdicao}
                              onChange={setFormEdicao}
                              onSave={() => handleSalvarEdicaoRefeicao(r.id)}
                              onCancel={() => setEditandoRefeicao(null)}
                              saving={savingRefeicao}
                              rotuloSalvar="Salvar Alterações"
                            />
                          </div>
                        ) : (
                          <div key={r.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between bg-[#101012] clip-bevel-sm px-4 py-3 border border-line card-hover gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-0.5">
                                <span className="text-sm font-bold text-bone">{r.nome_refeicao}</span>
                                {r.horario && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 border border-line bg-panel clip-bevel-sm px-1.5 py-0.5 stat-number">
                                    <Clock size={10} /> {r.horario}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">{r.descricao_alimentos}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => iniciarEdicaoRefeicao(r)} title="Editar" className="text-muted-steel hover:text-accent-light transition-colors p-1.5 clip-bevel-sm hover:bg-accent/10 min-h-[44px] min-w-[44px] flex items-center justify-center"><Pencil size={13} /></button>
                              <button onClick={() => handleRemoverRefeicao(r.id)} title="Remover" className="text-muted-steel hover:text-red-400 transition-colors p-1.5 clip-bevel-sm hover:bg-red-500/10 min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !showNovaRefeicao && (
                      <div className="text-center py-8">
                        <p className="text-zinc-400 text-sm">Nenhuma refeição prescrita nesta ficha.</p>
                        <p className="text-muted-steel text-xs mt-1">Monte o cardápio que o aluno deve seguir (ex: Café da Manhã → 2 ovos, 30g de whey).</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              /* Aluno: prescricao em modo leitura (topo da tela) */
              <section className="mb-6">
                <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2 mb-3">
                  <UtensilsCrossed size={14} className="text-accent-light" /> Prescrição do seu Nutricionista
                </h3>
                {!fichaDieta || refeicoes.length === 0 ? (
                  <div className="bg-panel border border-dashed border-[#37373E] clip-bevel-sm p-8 text-center">
                    <UtensilsCrossed size={24} className="mx-auto text-muted-steel mb-2" />
                    <p className="text-sm text-zinc-400">Seu nutricionista ainda não montou sua dieta.</p>
                    <p className="text-[11px] text-muted-steel mt-1">Quando a prescrição ficar pronta, ela aparecerá aqui.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {refeicoes.map(r => (
                      <div key={r.id} className="bg-panel border border-line clip-bevel-sm p-4 card-hover">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4 className="text-sm font-bold text-bone truncate">{r.nome_refeicao}</h4>
                          {r.horario && (
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-zinc-400 border border-line bg-[#101012] clip-bevel-sm px-1.5 py-0.5 stat-number">
                              <Clock size={10} /> {r.horario}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{r.descricao_alimentos}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Aviso de restrição Premium */}
            {modoGestor && isPremium && (
              <div className="mb-6 bg-yellow-500/5 border border-yellow-500/20 clip-bevel-sm px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-3">
                <div className="w-8 h-8 clip-bevel-sm bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <Lock size={16} className="text-yellow-400" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] md:text-xs font-semibold text-yellow-400">Pacote Premium — Dieta bloqueada para o aluno</p>
                  <p className="text-[10px] md:text-[11px] text-yellow-500/70 mt-0.5">
                    O aluno não terá acesso a esta aba. Você (gestor) continua vendo tudo para montar a prescrição.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 clip-bevel-sm border border-yellow-500/20">
                  <Crown size={12} className="text-yellow-400" />
                  <span className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Premium</span>
                </div>
              </div>
            )}
            {modoGestor && selectedAluno && !isPremium && (
              <div className="mb-6 bg-accent/5 border border-accent/20 clip-bevel-sm px-3 py-2.5 md:px-4 md:py-3 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[11px] md:text-xs font-semibold text-accent-light">Pacote VIP — Acesso total</p>
                  <p className="text-[10px] md:text-[11px] text-accent/60 mt-0.5">O aluno tem acesso completo a Treino e Dieta.</p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 clip-bevel-sm border border-accent/20">
                  <Crown size={12} className="text-accent" />
                  <span className="text-[10px] font-bold text-accent uppercase tracking-wider">VIP</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2 mb-6">
                  Consumo do Dia
                </h3>
                {!metas && (
                  <div className="mb-5 flex items-center gap-2 clip-bevel-sm px-3 py-2 text-[11px] bg-amber-500/5 border border-amber-500/20 text-amber-400/90">
                    <Lock size={12} className="shrink-0" />
                    Metas aguardando avaliação do gestor — exibindo valores padrão.
                  </div>
                )}
                <div className="space-y-5">
                  {(Object.keys(MACRO_LABELS) as Array<keyof typeof goals>).map(key => {
                    const val = consumed[key] || 0;
                    const goal = goals[key];
                    const excedido = goal > 0 && val > goal;
                    const pct = goal > 0 ? Math.min(100, (val / goal) * 100) : 0;
                    const remaining = Math.max(0, goal - val);
                    return (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-zinc-300 font-medium">{MACRO_LABELS[key]}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold stat-number ${excedido ? 'text-red-400' : 'text-bone'}`}>{Math.round(val)}</span>
                            <span className="text-[#4A4A50]">/</span>
                            <span className="text-muted-steel stat-number">{goal}</span>
                            {excedido ? (
                              <span className="text-[11px] text-red-400 font-semibold">+{Math.round(val - goal)} excedente</span>
                            ) : (
                              <span className="text-[11px] text-muted-steel">(restam {Math.round(remaining)})</span>
                            )}
                          </div>
                        </div>
                        <div className="nutrient-bar">
                          <div className={`nutrient-bar-fill transition-all duration-500 ${excedido ? 'excedido' : ''}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col justify-center items-center text-center relative overflow-hidden">
                <div className="relative z-10">
                  <p className="font-display uppercase text-2xl md:text-3xl text-bone leading-tight mb-1 tracking-wide">DISCIPLINA</p>
                  <p className="font-display uppercase text-2xl md:text-3xl text-accent-light leading-tight mb-1 tracking-wide drop-shadow-[0_0_14px_rgba(255,90,31,0.35)]">CONSTRÓI</p>
                  <p className="font-display uppercase text-2xl md:text-3xl text-bone leading-tight mb-6 tracking-wide">RESULTADOS.</p>
                  <div className="w-8 h-px bg-[#28282D] mx-auto mb-4" />
                  <p className="text-[11px] md:text-xs text-muted-steel leading-relaxed">Boa alimentação.</p>
                  <p className="text-[11px] md:text-xs text-muted-steel leading-relaxed">Melhor performance.</p>
                </div>
              </div>
            </div>

            <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
                  <Pin size={14} className="text-accent-light" /> Alimentos Fixos Diários
                </h3>
                <button onClick={() => setShowAddFixed(!showAddFixed)} className="btn-steel">
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              {showAddFixed && (
                <div className="mb-4 bg-[#101012] clip-bevel-sm p-4 border border-line space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2">
                    <div className={inputCls + " col-span-1 sm:col-span-2 md:col-span-6"}><input value={fixedForm.name} onChange={e => setFixedForm({ ...fixedForm, name: e.target.value })} placeholder="Nome (ex: Whey Protein)" autoFocus /></div>
                    <div className={inputCls}><input type="number" value={fixedForm.calories || ''} onChange={e => setFixedForm({ ...fixedForm, calories: Number(e.target.value) })} placeholder="Calorias" /></div>
                    <div className={inputCls}><input type="number" value={fixedForm.protein || ''} onChange={e => setFixedForm({ ...fixedForm, protein: Number(e.target.value) })} placeholder="Proteína (g)" /></div>
                    <div className={inputCls}><input type="number" value={fixedForm.carbs || ''} onChange={e => setFixedForm({ ...fixedForm, carbs: Number(e.target.value) })} placeholder="Carboidrato (g)" /></div>
                    <div className={inputCls}><input type="number" value={fixedForm.fat || ''} onChange={e => setFixedForm({ ...fixedForm, fat: Number(e.target.value) })} placeholder="Gordura (g)" /></div>
                    <div className={inputCls}><input type="number" value={fixedForm.fiber || ''} onChange={e => setFixedForm({ ...fixedForm, fiber: Number(e.target.value) })} placeholder="Fibras (g)" /></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleAddFixed} className="btn-forge">Salvar</button>
                    <button onClick={() => setShowAddFixed(false)} className="btn-steel">Cancelar</button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {fixedFoods.length > 0 ? fixedFoods.map(ff => (
                  <div key={ff.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[#101012] clip-bevel-sm px-4 py-3 border border-line card-hover gap-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="text-bone font-medium">{ff.name}</span>
                      <span className="text-muted-steel text-xs stat-number">{ff.calories} kcal</span>
                      <span className="text-muted-steel text-xs stat-number">{ff.protein}g prot</span>
                      <span className="text-muted-steel text-xs stat-number">{ff.carbs}g carb</span>
                    </div>
                    <button onClick={() => handleDeleteFixed(ff.id)} className="text-muted-steel hover:text-accent-light transition-colors p-1.5 clip-bevel-sm hover:bg-accent/10 min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={14} /></button>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <p className="text-zinc-400 text-sm">Nenhum alimento fixo cadastrado</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2 mb-5">
                  <Bot size={14} className="text-accent-light" /> Registrar Refeição
                  <span className="text-muted-steel font-sans font-normal normal-case tracking-normal text-xs ml-1 hidden sm:inline">— Análise nutricional com IA</span>
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-muted-steel mb-2 font-medium">Tipo de Refeição</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MEAL_LABELS.map(label => (
                        <button key={label} onClick={() => setSelectedMeal(label)} className={`tab-chip ${selectedMeal === label ? 'bg-accent/10 border-accent text-accent-light' : ''}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-steel mb-2 font-medium">Descreva o que você comeu</label>
                    <div className="field-bevel w-full">
                      <textarea className="resize-none" rows={3} value={foodDescription} onChange={e => setFoodDescription(e.target.value)} placeholder="Ex: 150g de arroz, 100g de frango grelhado..." />
                    </div>
                  </div>
                  <button onClick={handleAnalyze} disabled={!foodDescription.trim() || analyzing} className="btn-forge">
                    {analyzing ? (
                      <>
                        <span className="w-4 h-4 border-2 border-[#150800]/30 border-t-[#150800] rounded-full animate-spin" />
                        Analisando com IA...
                      </>
                    ) : (
                      <>
                        <Bot size={16} /> Analisar Refeição
                      </>
                    )}
                  </button>

                  {/* Erro da API */}
                  {apiError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 clip-bevel-sm text-red-400 text-xs">
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{apiError}</span>
                      <button onClick={() => setApiError(null)} className="ml-auto text-red-500 hover:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
                    </div>
                  )}
                </div>

                {/* Card de resultado nutricional com fade-out */}
                {lastResult && (
                  <div
                    className={`mt-5 bg-accent/5 border border-accent/20 clip-bevel-sm p-4 transition-opacity duration-1000 ${
                      lastResult.visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 clip-bevel-sm bg-ok/15 flex items-center justify-center">
                        <Check size={13} className="text-ok" />
                      </div>
                      <span className="text-xs font-semibold text-ok">Refeição registrada via IA</span>
                    </div>
                    <p className="text-xs text-zinc-400 mb-3">{lastResult.meal.food_description}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
                      {[
                        { label: 'Calorias', val: lastResult.meal.calories, unit: 'kcal', color: 'text-bone' },
                        { label: 'Proteína', val: lastResult.meal.protein, unit: 'g', color: 'text-blue-400' },
                        { label: 'Carbos', val: lastResult.meal.carbs, unit: 'g', color: 'text-yellow-400' },
                        { label: 'Gordura', val: lastResult.meal.fat, unit: 'g', color: 'text-accent-light' },
                        { label: 'Fibras', val: lastResult.meal.fiber, unit: 'g', color: 'text-ok' },
                      ].map(item => (
                        <div key={item.label} className="bg-[#101012] clip-bevel-sm py-2 px-1 border border-line">
                          <p className="text-[10px] text-muted-steel uppercase tracking-wider mb-0.5">{item.label}</p>
                          <p className={`text-sm font-bold stat-number ${item.color}`}>{item.val}<span className="text-[10px] font-normal text-[#4A4A50] ml-0.5">{item.unit}</span></p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-steel mt-2 font-mono text-center">
                      Prot({lastResult.meal.protein}×4) + Carb({lastResult.meal.carbs}×4) + Gord({lastResult.meal.fat}×9) = {lastResult.meal.calories} kcal
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6">
                <h3 className="font-display text-[11.5px] tracking-[0.12em] uppercase text-bone mb-5 flex items-center gap-2">
                  Refeições do Dia
                </h3>
                {loadingDiet ? (
                  <div className="text-center py-8">
                    <Loader2 size={18} className="mx-auto text-muted-steel animate-spin" />
                    <p className="text-muted-steel text-sm mt-3">Carregando dieta...</p>
                  </div>
                ) : meals.length > 0 ? (
                  <div className="space-y-0 max-h-[400px] sm:max-h-none overflow-y-auto">
                    {meals.map((meal, idx) => (
                      <div key={meal.id} className={`timeline-line ${idx === meals.length - 1 ? '' : 'pb-5'}`}>
                        <div className="timeline-dot" />
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-bone">{meal.meal_label}</span>
                            <span className="text-[#4A4A50] text-[11px] flex items-center gap-1">
                              <Clock size={10} /> {horaRefeicao(meal)}
                            </span>
                          </div>
                          <button onClick={() => handleDeleteMeal(meal.id)} className="text-[#4A4A50] hover:text-accent-light transition-colors p-1 clip-bevel-sm hover:bg-accent/10 min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={12} /></button>
                        </div>
                        <p className="text-zinc-400 text-xs mb-1.5">{meal.food_description}</p>
                        <div className="flex gap-3 text-[11px] text-muted-steel">
                          <span className="stat-number">{meal.calories} kcal</span>
                          <span className="stat-number">{meal.protein}g prot</span>
                          <span className="stat-number">{meal.carbs}g carb</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-steel text-sm">Nenhuma refeição registrada ainda</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================
// Formulario de refeicao prescrita (adicionar/editar - Gestor)
// =============================================================

interface RefeicaoFormValor {
  nome_refeicao: string;
  horario: string;
  descricao_alimentos: string;
}

function RefeicaoForm({ valor, onChange, onSave, onCancel, saving, rotuloSalvar }: {
  valor: RefeicaoFormValor;
  onChange: (v: RefeicaoFormValor) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  rotuloSalvar: string;
}) {
  const inputCls = "field-bevel";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className={inputCls + ' sm:col-span-2'}>
          <input
            list="meal-labels-prescricao"
            value={valor.nome_refeicao}
            onChange={e => onChange({ ...valor, nome_refeicao: e.target.value })}
            placeholder="Nome da refeição (ex: Café da Manhã)"
            autoFocus
          />
        </div>
        <datalist id="meal-labels-prescricao">
          {MEAL_LABELS.map(l => <option key={l} value={l} />)}
        </datalist>
        <div className={inputCls}>
          <input
            type="time"
            className="[color-scheme:dark]"
            value={valor.horario}
            onChange={e => onChange({ ...valor, horario: e.target.value })}
          />
        </div>
      </div>
      <div className={inputCls}>
        <textarea
          rows={2}
          className="resize-none"
          value={valor.descricao_alimentos}
          onChange={e => onChange({ ...valor, descricao_alimentos: e.target.value })}
          placeholder="Alimentos e quantidades (ex: 2 ovos, 30g de whey, 1 banana)"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={!valor.nome_refeicao.trim() || !valor.descricao_alimentos.trim() || saving}
          className="btn-forge"
        >
          {rotuloSalvar}
        </button>
        <button onClick={onCancel} className="btn-steel">Cancelar</button>
      </div>
    </div>
  );
}
