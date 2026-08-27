import { supabase } from '../lib/supabase';
import { aplicarPolitica, limparPolitica } from '../lib/authSession';
import type {
  Usuario,
  FichaTreino, FichaCompleta, TreinoFicha, TreinoComExercicios,
  ExercicioTreino, LogExecucao, LogCardioInput,
  MuscleGroupGoal, Activity, Meal, FixedFood,
  AvaliacaoFisicaRecord,
  FichaTipo,
  AvaliacaoOs, AvaliacaoOsInput,
  AcompanhamentoOs, AcompanhamentoOsInput,
  EventoClinico,
  RefeicaoDieta, RefeicaoDietaInput,
  MetasNutricionais,
  LogTreino, SessaoHistorico, ExercicioSessao, SessaoComProgresso,
  SerieItem, ExercicioSeriesSessao,
  PlanejamentoItem, PlanejamentoAlocacao,
} from '../types';

// Data de hoje no fuso America/Sao_Paulo ('YYYY-MM-DD')
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const METAS_PADRAO: NonNullable<MetasNutricionais> = {
  meta_kcal: 2000,
  meta_proteina: 150,
  meta_carbo: 220,
  meta_gordura: 70,
  meta_fibra: 33,
};

export const DURACAO_MAX_SEG = 10800;
export const DURACAO_TETO_SEG = 7200;
export const DURACAO_MINIMA_SEG = 300;

// =============================================================
// AUTH
// =============================================================

export const auth = {
  signUp: async (email: string, password: string, nome?: string, role: 'gestor' | 'aluno' = 'aluno') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome: nome?.trim(),
          role,
        },
      },
    });
    if (error) throw error;
    return data;
  },

  signIn: async (email: string, password: string, lembrar: boolean = true) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    aplicarPolitica(lembrar);
    return data;
  },

  checkEmailExists: async (email: string): Promise<boolean> => {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase
      .from('usuarios')
      .select('id')
      .ilike('email', cleanEmail)
      .limit(1);

    if (error) {
      console.warn('[auth.checkEmailExists] Erro ao consultar email:', error.message);
      return true;
    }
    return !!(data && data.length > 0);
  },

  resetPassword: async (email: string) => {
    const redirectUrl = `${window.location.origin}/nova-senha`;
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
  },

  updatePassword: async (password: string) => {
    return supabase.auth.updateUser({ password });
  },

  signOut: async () => {
    limparPolitica();
    return supabase.auth.signOut();
  },

  getSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  getUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// =============================================================
// USUARIOS
// =============================================================

export const usuarios = {
  getByAuthId: async (authId: string): Promise<Usuario | null> => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_id', authId)
      .single();
    if (error) return null;
    return data as Usuario;
  },

  getById: async (id: string): Promise<Usuario | null> => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data as Usuario;
  },

  getAll: async (): Promise<Usuario[]> => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('nome');
    if (error) return [];
    return data as Usuario[];
  },

  getClientes: async (q?: string): Promise<Usuario[]> => {
    let query = supabase
      .from('usuarios')
      .select('*')
      .eq('role', 'aluno')
      .order('created_at', { ascending: false });

    if (q && q.trim()) {
      query = query.or(`nome.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return [];
    return data as Usuario[];
  },

  update: async (id: string, updates: Partial<Usuario>): Promise<Usuario | null> => {
    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return data as Usuario;
  },

  updatePerfil: async (
    userId: string,
    dados: { nome?: string; telefone?: string; cpf?: string; pacote?: 'Premium' | 'VIP'; genero?: 'masculino' | 'feminino' }
  ): Promise<Usuario> => {
    const payload: Record<string, any> = {};
    if (dados.nome !== undefined) payload.nome = dados.nome.trim();
    if (dados.telefone !== undefined) payload.telefone = dados.telefone.replace(/\D/g, '');
    if (dados.cpf !== undefined) payload.cpf = dados.cpf.replace(/\D/g, '');
    if (dados.pacote !== undefined) payload.pacote = dados.pacote;
    if (dados.genero !== undefined) payload.genero = dados.genero;

    const { data, error } = await supabase
      .from('usuarios')
      .update(payload)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Usuario;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  inviteAluno: async (data: { email: string; nome: string; telefone?: string; cpf?: string; pacote?: 'Premium' | 'VIP'; genero?: 'masculino' | 'feminino'; frontendUrl?: string }) => {
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (supabaseUrl && session?.access_token) {
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-aluno`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: data.email.trim(),
          nome: data.nome.trim(),
          telefone: data.telefone?.replace(/\D/g, '') || '',
          cpf: data.cpf?.replace(/\D/g, '') || '',
          pacote: data.pacote || 'Premium',
          genero: data.genero,
          frontendUrl: data.frontendUrl || window.location.origin,
        }),
      });

      if (res.ok) {
        return res.json();
      }
    }

    // Fallback direct insert if function is unavailable
    const { data: inserted, error } = await supabase
      .from('usuarios')
      .insert({
        nome: data.nome.trim(),
        email: data.email.trim().toLowerCase(),
        telefone: data.telefone?.replace(/\D/g, '') || '',
        cpf: data.cpf?.replace(/\D/g, '') || '',
        pacote: data.pacote || 'Premium',
        genero: data.genero || null,
        role: 'aluno',
        status: 'pendente',
      })
      .select()
      .single();

    if (error) throw error;
    return inserted;
  },
};

// =============================================================
// FICHAS
// =============================================================

export const fichas = {
  getByCliente: async (userId: string): Promise<FichaTreino[]> => {
    const { data, error } = await supabase
      .from('fichas')
      .select('*')
      .eq('user_id', userId)
      .order('data_criacao', { ascending: false });
    if (error) return [];
    return data as FichaTreino[];
  },

  getAtiva: async (userId: string, tipo: FichaTipo): Promise<FichaCompleta | null> => {
    const { data: fichasData, error: fichaError } = await supabase
      .from('fichas')
      .select('*')
      .eq('user_id', userId)
      .eq('tipo', tipo)
      .eq('status', 'ativa')
      .order('data_criacao', { ascending: false })
      .limit(1);

    if (fichaError || !fichasData || fichasData.length === 0) return null;
    const fichaBase = fichasData[0] as FichaTreino;

    const { data: treinosData } = await supabase
      .from('treinos_ficha')
      .select('*')
      .eq('ficha_id', fichaBase.id)
      .order('created_at', { ascending: true });

    const treinos = (treinosData || []) as TreinoFicha[];

    const treinosComExercicios: TreinoComExercicios[] = await Promise.all(
      treinos.map(async (t) => {
        const { data: exData } = await supabase
          .from('exercicios_treino')
          .select('*')
          .eq('treino_id', t.id)
          .order('ordem', { ascending: true });
        return {
          ...t,
          exercicios: (exData || []) as ExercicioTreino[],
        };
      })
    );

    let refeicoes: RefeicaoDieta[] = [];
    if (tipo === 'dieta') {
      const { data: refData } = await supabase
        .from('refeicoes_dieta')
        .select('*')
        .eq('ficha_id', fichaBase.id)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });
      refeicoes = (refData || []) as RefeicaoDieta[];
    }

    return {
      ...fichaBase,
      treinos: treinosComExercicios,
      refeicoes,
    };
  },

  getHistorico: async (userId: string): Promise<FichaTreino[]> => {
    const { data, error } = await supabase
      .from('fichas')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'arquivada')
      .order('data_criacao', { ascending: false });
    if (error) return [];
    return data as FichaTreino[];
  },

  create: async (userId: string, nome: string, tipo: FichaTipo = 'treino'): Promise<FichaTreino> => {
    await supabase
      .from('fichas')
      .update({ status: 'arquivada' })
      .eq('user_id', userId)
      .eq('tipo', tipo)
      .eq('status', 'ativa');

    const { data, error } = await supabase
      .from('fichas')
      .insert({
        user_id: userId,
        nome: nome.trim(),
        tipo,
        status: 'ativa',
      })
      .select()
      .single();

    if (error) throw error;
    return data as FichaTreino;
  },

  update: async (id: string, updates: Partial<Pick<FichaTreino, 'nome' | 'status'>>): Promise<FichaTreino> => {
    const { data, error } = await supabase
      .from('fichas')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as FichaTreino;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('fichas')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  criarAvaliacao: async (userId: string, dados: AvaliacaoOsInput): Promise<AvaliacaoOs> => {
    const { data: ficha, error: fichaError } = await supabase
      .from('fichas')
      .insert({
        user_id: userId,
        nome: dados.nome || 'Avaliação Física',
        tipo: 'avaliacao',
        status: 'arquivada',
      })
      .select()
      .single();

    if (fichaError) throw fichaError;

    const { data: os, error: osError } = await supabase
      .from('avaliacoes_os')
      .insert({
        ficha_id: ficha.id,
        anamnese: dados.anamnese || '',
        perimetros: dados.perimetros || {},
        composicao: dados.composicao || { percentual_gordura: 0, massa_magra: 0, massa_gordura: 0 },
        flexibilidade_forca: dados.flexibilidade_forca || '',
        objetivo: dados.objetivo || '',
        peso: dados.peso || 0,
        altura: dados.altura || 0,
      })
      .select()
      .single();

    if (osError) throw osError;
    return os as AvaliacaoOs;
  },

  criarAcompanhamento: async (userId: string, dados: AcompanhamentoOsInput): Promise<AcompanhamentoOs> => {
    const { data: ficha, error: fichaError } = await supabase
      .from('fichas')
      .insert({
        user_id: userId,
        nome: dados.nome || 'Acompanhamento',
        tipo: 'acompanhamento',
        status: 'arquivada',
      })
      .select()
      .single();

    if (fichaError) throw fichaError;

    const { data: os, error: osError } = await supabase
      .from('acompanhamentos_os')
      .insert({
        ficha_id: ficha.id,
        relato: dados.relato || '',
        feedback: dados.feedback || '',
        fotos: dados.fotos || [],
        peso: dados.peso ?? null,
        meta_kcal: dados.meta_kcal ?? null,
        meta_proteina: dados.meta_proteina ?? null,
        meta_carbo: dados.meta_carbo ?? null,
        meta_gordura: dados.meta_gordura ?? null,
        meta_fibra: dados.meta_fibra ?? null,
      })
      .select()
      .single();

    if (osError) throw osError;
    return os as AcompanhamentoOs;
  },

  getUltimasMetasNutricionais: async (userId: string): Promise<MetasNutricionais> => {
    const { data, error } = await supabase
      .from('acompanhamentos_os')
      .select(`
        meta_kcal,
        meta_proteina,
        meta_carbo,
        meta_gordura,
        meta_fibra,
        fichas!inner(user_id, tipo)
      `)
      .eq('fichas.user_id', userId)
      .eq('fichas.tipo', 'acompanhamento')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const m = data[0] as any;
    const todasVazias =
      m.meta_kcal == null &&
      m.meta_proteina == null &&
      m.meta_carbo == null &&
      m.meta_gordura == null &&
      m.meta_fibra == null;

    if (todasVazias) return null;

    return {
      meta_kcal: m.meta_kcal ?? 0,
      meta_proteina: m.meta_proteina ?? 0,
      meta_carbo: m.meta_carbo ?? 0,
      meta_gordura: m.meta_gordura ?? 0,
      meta_fibra: m.meta_fibra ?? 0,
    };
  },

  getEventos: async (userId: string): Promise<EventoClinico[]> => {
    const { data: fichasData, error } = await supabase
      .from('fichas')
      .select(`
        id,
        nome,
        tipo,
        data_criacao,
        avaliacoes_os (*),
        acompanhamentos_os (*)
      `)
      .eq('user_id', userId)
      .in('tipo', ['avaliacao', 'acompanhamento'])
      .order('data_criacao', { ascending: false });

    if (error || !fichasData) return [];

    return fichasData.map((f: any) => {
      const avaliacao = Array.isArray(f.avaliacoes_os) ? f.avaliacoes_os[0] || null : f.avaliacoes_os || null;
      const acompanhamento = Array.isArray(f.acompanhamentos_os) ? f.acompanhamentos_os[0] || null : f.acompanhamentos_os || null;
      const data = avaliacao?.created_at || acompanhamento?.created_at || f.data_criacao;

      return {
        ficha_id: f.id,
        nome: f.nome,
        data,
        tipo: f.tipo as 'avaliacao' | 'acompanhamento',
        avaliacao,
        acompanhamento,
      };
    });
  },

  getEventosPorTipo: async (userId: string, tipo: 'avaliacao' | 'acompanhamento'): Promise<EventoClinico[]> => {
    const todos = await fichas.getEventos(userId);
    return todos.filter(e => e.tipo === tipo);
  },
};

// =============================================================
// REFEICOES DIETA
// =============================================================

export const refeicoesDieta = {
  getByFicha: async (fichaId: string): Promise<RefeicaoDieta[]> => {
    const { data, error } = await supabase
      .from('refeicoes_dieta')
      .select('*')
      .eq('ficha_id', fichaId)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return [];
    return data as RefeicaoDieta[];
  },

  create: async (fichaId: string, dados: RefeicaoDietaInput): Promise<RefeicaoDieta> => {
    const { data, error } = await supabase
      .from('refeicoes_dieta')
      .insert({
        ficha_id: fichaId,
        nome_refeicao: dados.nome_refeicao,
        descricao_alimentos: dados.descricao_alimentos,
        horario: dados.horario || null,
        ordem: dados.ordem ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return data as RefeicaoDieta;
  },

  update: async (id: string, dados: RefeicaoDietaInput): Promise<RefeicaoDieta> => {
    const { data, error } = await supabase
      .from('refeicoes_dieta')
      .update(dados)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as RefeicaoDieta;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('refeicoes_dieta')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// TREINOS DA FICHA
// =============================================================

export const treinosFicha = {
  getByFicha: async (fichaId: string): Promise<TreinoComExercicios[]> => {
    const { data: treinos, error } = await supabase
      .from('treinos_ficha')
      .select('*')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: true });

    if (error || !treinos) return [];

    const result: TreinoComExercicios[] = await Promise.all(
      (treinos as TreinoFicha[]).map(async (t) => {
        const { data: exs } = await supabase
          .from('exercicios_treino')
          .select('*')
          .eq('treino_id', t.id)
          .order('ordem', { ascending: true });
        return {
          ...t,
          exercicios: (exs || []) as ExercicioTreino[],
        };
      })
    );

    return result;
  },

  create: async (fichaId: string, letraOuNome: string, observacoes?: string): Promise<TreinoFicha> => {
    const { data, error } = await supabase
      .from('treinos_ficha')
      .insert({
        ficha_id: fichaId,
        letra_ou_nome: letraOuNome,
        observacoes: observacoes?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as TreinoFicha;
  },

  update: async (id: string, updates: { letra_ou_nome?: string; observacoes?: string }): Promise<TreinoFicha> => {
    const payload: Record<string, any> = {};
    if (updates.letra_ou_nome !== undefined) payload.letra_ou_nome = updates.letra_ou_nome;
    if (updates.observacoes !== undefined) payload.observacoes = updates.observacoes.trim() || null;

    const { data, error } = await supabase
      .from('treinos_ficha')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as TreinoFicha;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('treinos_ficha')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// EXERCICIOS DO TREINO
// =============================================================

export const exerciciosTreino = {
  createMany: async (
    treinoId: string,
    items: Omit<ExercicioTreino, 'id' | 'treino_id'>[]
  ): Promise<ExercicioTreino[]> => {
    if (items.length === 0) return [];
    const rows = items.map((ex, idx) => ({
      treino_id: treinoId,
      nome_exercicio: ex.nome_exercicio,
      grupo_muscular: ex.grupo_muscular || null,
      musculo_principal: ex.musculo_principal || null,
      series: ex.series || 3,
      repeticoes_prescritas: ex.repeticoes_prescritas || null,
      repeticoes_por_serie: ex.repeticoes_por_serie || null,
      series_aquecimento: ex.series_aquecimento || null,
      descanso: ex.descanso || 60,
      ordem: ex.ordem ?? idx,
      categoria: ex.categoria || 'forca',
      meta_tempo_min: ex.meta_tempo_min ?? null,
      meta_distancia_km: ex.meta_distancia_km ?? null,
    }));

    const { data, error } = await supabase
      .from('exercicios_treino')
      .insert(rows)
      .select();

    if (error) throw error;
    return (data || []) as ExercicioTreino[];
  },

  update: async (id: string, updates: Partial<Omit<ExercicioTreino, 'id' | 'treino_id'>>): Promise<void> => {
    const { error } = await supabase
      .from('exercicios_treino')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('exercicios_treino')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// LOGS DE EXECUCAO
// =============================================================

export const logsExecucao = {
  upsertDia: async (rows: Omit<LogExecucao, 'id' | 'data_registro'>[]): Promise<void> => {
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('logs_execucao')
      .upsert(rows, { onConflict: 'exercicio_id,num_serie,data_treino' });
    if (error) throw error;
  },

  getVolumeTotal: async (userId: string, dias = 30): Promise<number> => {
    const corte = new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000);
    const corteISO = `${corte.getFullYear()}-${String(corte.getMonth() + 1).padStart(2, '0')}-${String(corte.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('logs_execucao')
      .select(`
        carga,
        repeticoes_realizadas,
        serie_valida,
        is_warmup,
        exercicios_treino!inner(
          treinos_ficha!inner(
            fichas!inner(user_id)
          )
        )
      `)
      .eq('exercicios_treino.treinos_ficha.fichas.user_id', userId)
      .gte('data_treino', corteISO)
      .eq('serie_valida', true)
      .neq('is_warmup', true);

    if (error || !data) return 0;

    return data.reduce((sum: number, r: any) => {
      const carga = Number(r.carga) || 0;
      const reps = Number(r.repeticoes_realizadas) || 0;
      return sum + carga * reps;
    }, 0);
  },

  getByExercicio: async (exercicioId: string, limitCount = 30): Promise<LogExecucao[]> => {
    const { data, error } = await supabase
      .from('logs_execucao')
      .select('*')
      .eq('exercicio_id', exercicioId)
      .order('data_registro', { ascending: false })
      .limit(limitCount);
    if (error) return [];
    return data as LogExecucao[];
  },

  getProgresso: async (userId: string): Promise<SessaoComProgresso[]> => {
    const { data: sessoes, error: sessError } = await supabase
      .from('logs_treino')
      .select('id, treino_id, data_execucao, duracao_segundos, treinos_ficha(letra_ou_nome)')
      .eq('user_id', userId)
      .order('data_execucao', { ascending: false });

    if (sessError || !sessoes || sessoes.length === 0) return [];

    const treinoIds = [...new Set(sessoes.map(s => s.treino_id))];

    const { data: exercicios, error: exError } = await supabase
      .from('exercicios_treino')
      .select('id, treino_id, nome_exercicio, grupo_muscular, musculo_principal, ordem')
      .in('treino_id', treinoIds)
      .order('ordem', { ascending: true });

    if (exError || !exercicios || exercicios.length === 0) return [];

    const exercicioIds = exercicios.map(e => e.id);
    const sessaoIds = sessoes.map(s => s.id);

    const [{ data: logs, error: logsError }, { data: cardiosData }] = await Promise.all([
      supabase
        .from('logs_execucao')
        .select('exercicio_id, carga, repeticoes_realizadas, serie_valida, is_warmup, log_treino_id, num_serie')
        .in('exercicio_id', exercicioIds)
        .not('log_treino_id', 'is', null),
      supabase
        .from('logs_cardio')
        .select('exercicio_id, duracao_min, distancia_km, log_treino_id')
        .in('log_treino_id', sessaoIds),
    ]);

    if (logsError || !logs) return [];

    const exercicioPorTreino = new Map<string, typeof exercicios>();
    for (const ex of exercicios) {
      const lista = exercicioPorTreino.get(ex.treino_id) || [];
      lista.push(ex);
      exercicioPorTreino.set(ex.treino_id, lista);
    }

    const picoPorSessao = new Map<string, Map<string, number>>();
    const seriesPorSessao = new Map<string, Map<string, SerieItem[]>>();
    const cardiosPorSessao = new Map<string, { exercicio_id: string; duracao_min: number; distancia_km?: number | null }[]>();

    if (cardiosData) {
      for (const c of cardiosData) {
        if (!c.log_treino_id) continue;
        const lista = cardiosPorSessao.get(c.log_treino_id) || [];
        lista.push({
          exercicio_id: c.exercicio_id,
          duracao_min: Number(c.duracao_min) || 0,
          distancia_km: c.distancia_km ?? null,
        });
        cardiosPorSessao.set(c.log_treino_id, lista);
      }
    }

    for (const log of logs) {
      const sessaoId = log.log_treino_id as string;
      if (!sessaoId) continue;

      if (!picoPorSessao.has(sessaoId)) picoPorSessao.set(sessaoId, new Map());
      const porEx = picoPorSessao.get(sessaoId)!;
      const atual = porEx.get(log.exercicio_id) ?? 0;
      if ((log.carga ?? 0) > atual) porEx.set(log.exercicio_id, log.carga ?? 0);

      if (!seriesPorSessao.has(sessaoId)) seriesPorSessao.set(sessaoId, new Map());
      const porExSeries = seriesPorSessao.get(sessaoId)!;
      if (!porExSeries.has(log.exercicio_id)) porExSeries.set(log.exercicio_id, []);
      porExSeries.get(log.exercicio_id)!.push({
        num_serie: log.num_serie ?? 0,
        reps: log.repeticoes_realizadas ?? 0,
        carga: log.carga ?? 0,
        valida: log.serie_valida === true && !log.is_warmup,
      });
    }

    const arredondar = (v: number) => Math.round(v * 100) / 100;

    return sessoes.map((s, idx) => {
      const anteriorMesmoTreino = sessoes.find((outro, j) => j > idx && outro.treino_id === s.treino_id);
      const picosAtuais = picoPorSessao.get(s.id) || new Map<string, number>();
      const picosAnteriores = anteriorMesmoTreino ? (picoPorSessao.get(anteriorMesmoTreino.id) || new Map<string, number>()) : new Map<string, number>();

      const exerciciosSessao = exercicioPorTreino.get(s.treino_id) || [];
      const exerciciosResult: ExercicioSessao[] = exerciciosSessao
        .filter(ex => picosAtuais.has(ex.id))
        .map(ex => {
          const cargaAtual = picosAtuais.get(ex.id) ?? null;
          const cargaAnterior = picosAnteriores.has(ex.id) ? (picosAnteriores.get(ex.id) ?? null) : null;
          const primeira = cargaAnterior === null;
          return {
            exercicio_id: ex.id,
            nome_exercicio: ex.nome_exercicio,
            grupo_muscular: ex.grupo_muscular,
            musculo_principal: ex.musculo_principal,
            carga_atual: cargaAtual,
            carga_anterior: cargaAnterior,
            delta_carga: primeira ? 0 : arredondar((cargaAtual ?? 0) - (cargaAnterior ?? 0)),
            primeira_execucao: primeira,
          };
        });

      const seriesDoMapa = seriesPorSessao.get(s.id);
      const seriesResult: ExercicioSeriesSessao[] = [];
      if (seriesDoMapa) {
        for (const ex of exerciciosSessao) {
          const itens = seriesDoMapa.get(ex.id);
          if (!itens || itens.length === 0) continue;
          itens.sort((a, b) => a.num_serie - b.num_serie);
          seriesResult.push({
            nome_exercicio: ex.nome_exercicio,
            grupo_muscular: ex.grupo_muscular,
            musculo_principal: ex.musculo_principal,
            itens,
          });
        }
      }

      const nomeTreino = Array.isArray(s.treinos_ficha)
        ? s.treinos_ficha[0]?.letra_ou_nome || 'Treino'
        : (s.treinos_ficha as any)?.letra_ou_nome || 'Treino';

      return {
        id: s.id,
        treino_id: s.treino_id,
        nome_treino: nomeTreino,
        data_execucao: s.data_execucao,
        duracao_segundos: s.duracao_segundos ?? 0,
        exercicios: exerciciosResult,
        series: seriesResult,
        cardios: cardiosPorSessao.get(s.id) || [],
      };
    });
  },
};

// =============================================================
// LOGS DE CARDIO
// =============================================================

export const logsCardio = {
  upsertDia: async (rows: LogCardioInput[]): Promise<void> => {
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('logs_cardio')
      .upsert(rows, { onConflict: 'exercicio_id,data_treino' });
    if (error) throw error;
  },

  getByExercicio: async (exercicioId: string, limitCount = 30): Promise<LogCardioInput[]> => {
    const { data, error } = await supabase
      .from('logs_cardio')
      .select('*')
      .eq('exercicio_id', exercicioId)
      .order('data_registro', { ascending: false })
      .limit(limitCount);
    if (error) return [];
    return (data || []) as LogCardioInput[];
  },
};

// =============================================================
// LOGS DE TREINO
// =============================================================

export const logsTreino = {
  create: async (userId: string, treinoId: string, duracaoSegundos: number): Promise<LogTreino> => {
    const duracaoNormalizada = Math.max(0, Math.round(duracaoSegundos));
    const duracaoFinal = duracaoNormalizada > DURACAO_MAX_SEG ? DURACAO_TETO_SEG : duracaoNormalizada;

    const { data, error } = await supabase
      .from('logs_treino')
      .insert({
        user_id: userId,
        treino_id: treinoId,
        duracao_segundos: duracaoFinal,
      })
      .select()
      .single();

    if (error) throw error;
    return data as LogTreino;
  },

  getByCliente: async (userId: string): Promise<SessaoHistorico[]> => {
    const { data, error } = await supabase
      .from('logs_treino')
      .select('id, treino_id, data_execucao, duracao_segundos, treinos_ficha(letra_ou_nome)')
      .eq('user_id', userId)
      .order('data_execucao', { ascending: false });

    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      treino_id: r.treino_id,
      nome_treino: Array.isArray(r.treinos_ficha)
        ? r.treinos_ficha[0]?.letra_ou_nome || 'Treino'
        : r.treinos_ficha?.letra_ou_nome || 'Treino',
      data_execucao: r.data_execucao,
      duracao_segundos: r.duracao_segundos ?? 0,
    }));
  },
};

// =============================================================
// PERIODIZACAO SEMANAL
// =============================================================

export const planejamento = {
  get: async (userId: string): Promise<PlanejamentoAlocacao[]> => {
    const { data, error } = await supabase
      .from('planejamento_semanal')
      .select('id, dia_semana, treino_id, is_descanso, ordem, treinos_ficha(letra_ou_nome)')
      .eq('user_id', userId)
      .order('dia_semana', { ascending: true })
      .order('ordem', { ascending: true });

    if (error || !data) return [];

    return data.map((item: any) => ({
      id: item.id,
      user_id: userId,
      dia_semana: item.dia_semana,
      treino_id: item.treino_id,
      is_descanso: item.is_descanso,
      ordem: item.ordem,
      treino_nome: Array.isArray(item.treinos_ficha)
        ? item.treinos_ficha[0]?.letra_ou_nome || null
        : item.treinos_ficha?.letra_ou_nome || null,
    }));
  },

  salvar: async (userId: string, semana: PlanejamentoItem[]): Promise<void> => {
    await supabase
      .from('planejamento_semanal')
      .delete()
      .eq('user_id', userId);

    const rows = semana.map(p => ({
      user_id: userId,
      dia_semana: p.dia_semana,
      treino_id: p.treino_id || null,
      is_descanso: p.is_descanso === true,
      ordem: p.ordem ?? 0,
    }));

    const { error } = await supabase
      .from('planejamento_semanal')
      .insert(rows);

    if (error) throw error;
  },
};

// =============================================================
// MUSCLE GROUP GOALS
// =============================================================

export const muscleGoals = {
  get: async (userId: string): Promise<MuscleGroupGoal[]> => {
    const { data, error } = await supabase
      .from('muscle_group_goals')
      .select('*')
      .eq('user_id', userId);
    if (error) return [];
    return data as MuscleGroupGoal[];
  },

  upsert: async (userId: string, muscleGroup: string, targetSets: number): Promise<MuscleGroupGoal> => {
    const { data, error } = await supabase
      .from('muscle_group_goals')
      .upsert(
        { user_id: userId, muscle_group: muscleGroup, target_valid_sets: targetSets },
        { onConflict: 'user_id,muscle_group' }
      )
      .select()
      .single();
    if (error) throw error;
    return data as MuscleGroupGoal;
  },
};

// =============================================================
// ACTIVITIES
// =============================================================

export const activities = {
  get: async (userId: string): Promise<Activity[]> => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('day_of_week');
    if (error) return [];
    return data as Activity[];
  },

  create: async (userId: string, data: { day_of_week: number; activity_type: string; duration_minutes: number }): Promise<Activity> => {
    const { data: act, error } = await supabase
      .from('activities')
      .insert({ user_id: userId, ...data })
      .select()
      .single();
    if (error) throw error;
    return act as Activity;
  },

  update: async (id: string, updates: Partial<Activity>): Promise<Activity | null> => {
    const { data, error } = await supabase
      .from('activities')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return null;
    return data as Activity;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// DIETA & MEALS
// =============================================================

export const dieta = {
  getConsumoHoje: async (userId: string): Promise<Meal[]> => {
    const hoje = hojeSP();
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .eq('date', hoje)
      .order('created_at', { ascending: true });
    if (error) return [];
    return data as Meal[];
  },

  getRelatorioConsumo: async (userId: string, dias = 30): Promise<Meal[]> => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const agora = Date.now();
    const inicio = fmt.format(new Date(agora - (dias - 1) * 86400000));
    const hoje = hojeSP();

    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .gte('date', inicio)
      .lte('date', hoje)
      .order('date', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) return [];
    return data as Meal[];
  },
};

export const meals = {
  get: async (userId: string, date: string): Promise<Meal[]> => {
    const { data, error } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at');
    if (error) return [];
    return data as Meal[];
  },

  create: async (meal: Omit<Meal, 'id' | 'created_at'>): Promise<Meal> => {
    const { data, error } = await supabase
      .from('meals')
      .insert(meal)
      .select()
      .single();
    if (error) throw error;
    return data as Meal;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('meals')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  getDailyMacros: async (userId: string, date: string) => {
    const list = await meals.get(userId, date);
    if (!list || list.length === 0) return { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
    return list.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        carbs: acc.carbs + (m.carbs || 0),
        protein: acc.protein + (m.protein || 0),
        fat: acc.fat + (m.fat || 0),
        fiber: acc.fiber + (m.fiber || 0),
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 }
    );
  },
};

// =============================================================
// FIXED FOODS
// =============================================================

export const fixedFoods = {
  get: async (userId: string): Promise<FixedFood[]> => {
    const { data, error } = await supabase
      .from('fixed_foods')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name');
    if (error) return [];
    return data as FixedFood[];
  },

  create: async (food: Omit<FixedFood, 'id'>): Promise<FixedFood> => {
    const { data, error } = await supabase
      .from('fixed_foods')
      .insert(food)
      .select()
      .single();
    if (error) throw error;
    return data as FixedFood;
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('fixed_foods')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// AVALIACOES FISICAS (Legado)
// =============================================================

export const avaliacoes = {
  getByCliente: async (clienteId: string): Promise<AvaliacaoFisicaRecord | null> => {
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .select('*')
      .eq('id_cliente', clienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data as AvaliacaoFisicaRecord;
  },

  upsert: async (clienteId: string, av: Partial<AvaliacaoFisicaRecord>): Promise<AvaliacaoFisicaRecord> => {
    const existing = await avaliacoes.getByCliente(clienteId);
    if (existing) {
      const { data, error } = await supabase
        .from('avaliacoes_fisicas')
        .update(av)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as AvaliacaoFisicaRecord;
    }
    const { data, error } = await supabase
      .from('avaliacoes_fisicas')
      .insert({ id_cliente: clienteId, ...av })
      .select()
      .single();
    if (error) throw error;
    return data as AvaliacaoFisicaRecord;
  },
};

// =============================================================
// BACKWARD COMPATIBILITY SHIM
// =============================================================

export const api = {
  getProfile: async (id: string) => usuarios.getByAuthId(id),
  updateProfile: async (id: string, data: Partial<Usuario>) => usuarios.update(id, data),
  getActivities: (id: string) => activities.get(id),
  createActivity: (id: string, data: any) => activities.create(id, data),
  updateActivity: (id: string, data: any) => activities.update(id, data),
  deleteActivity: (id: string) => activities.delete(id),
  getMuscleGoals: (id: string) => muscleGoals.get(id),
  updateMuscleGoal: (id: string, data: any) => muscleGoals.upsert(id, data.muscle_group, data.target_valid_sets),
  getMeals: (id: string, date: string) => meals.get(id, date),
  deleteMeal: (id: string) => meals.delete(id),
  getFixedFoods: (id: string) => fixedFoods.get(id),
  createFixedFood: (id: string, data: any) => fixedFoods.create({ user_id: id, ...data }),
  deleteFixedFood: (id: string) => fixedFoods.delete(id),
  getDailyMacros: (id: string, date: string) => meals.getDailyMacros(id, date),
  getClients: (q?: string) => usuarios.getClientes(q),
  analyzeFood: async (data: { food_description: string; date?: string; meal_label?: string; user_id?: string }) => {
    const res = await fetch('/api/ai/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao analisar alimento');
    return res.json();
  },
};
