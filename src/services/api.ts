import { supabase } from '../lib/supabase';
import { aplicarPolitica, limparPolitica } from '../lib/authSession';
import { withCache, cacheDeletePrefix, cacheClear } from '../lib/apiCache';
import type {
  Usuario,
  FichaTreino, FichaCompleta, TreinoFicha, TreinoComExercicios,
  ExercicioTreino, LogExecucao, LogCardioInput,
  MuscleGroupGoal, Activity, Meal, FixedFood,
  AvaliacaoFisicaRecord,
  FichaTipo,
  Periodizacao, PeriodizacaoComTreinos,
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
    const { data, error } = await supabase.rpc('check_email_exists', { email_input: cleanEmail });

    if (error) {
      console.warn('[auth.checkEmailExists] Erro ao consultar email:', error.message);
      return true;
    }
    return !!data;
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
    cacheClear();
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
    const chave = `clientes:${(q || '').trim()}`;
    return withCache(chave, async () => {
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
    });
  },

  update: async (id: string, updates: Partial<Usuario>): Promise<Usuario | null> => {
    cacheDeletePrefix('clientes:');
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
    cacheDeletePrefix('clientes:');
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
    cacheDeletePrefix('clientes:');
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  renovarPlano: async (userId: string): Promise<Usuario> => {
    cacheDeletePrefix('clientes:');
    const { data, error } = await supabase.rpc('renovar_plano', { p_user_id: userId });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as Usuario;
    if (!row) throw new Error('Aluno não encontrado');
    return row;
  },

  inviteAluno: async (data: { email: string; nome: string; telefone?: string; cpf?: string; pacote?: 'Premium' | 'VIP'; genero?: 'masculino' | 'feminino'; frontendUrl?: string }) => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Sessão expirada. Faça login novamente como gestor.');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sessão expirada. Faça login novamente como gestor.');
    }

    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL || 'https://brwsxmmcvozyqavueyrh.supabase.co';

    try {
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
        cacheDeletePrefix('clientes:');
        return res.json();
      }

      let mensagem = `Falha ao convidar o aluno (HTTP ${res.status}).`;
      try {
        const corpo = await res.json();
        if (corpo?.error) mensagem = corpo.error;
      } catch {
        // corpo não-JSON; mantém a mensagem genérica
      }
      const erroHttp = new Error(mensagem);
      (erroHttp as { isHttp?: boolean }).isHttp = true;
      throw erroHttp;
    } catch (e) {
      if (e instanceof Error && !(e as { isHttp?: boolean }).isHttp) {
        throw new Error('Não foi possível acessar a edge function de convite. Verifique a conexão ou se a function está publicada.');
      }
      throw e;
    }
  },
};

// =============================================================
// FICHAS
// =============================================================

// Helper: monta FichaCompleta a partir da resposta bruta do Supabase,
// incluindo periodizações agrupadas e o alias `treinos` (compat: todos
// os treinos, independente da periodização, para o front do aluno).
function montarFichaCompleta(raw: any): FichaCompleta {
  const sorter = (a: any, b: any) => Number(new Date(a.created_at)) - Number(new Date(b.created_at));

  const mapearTreino = (t: any): TreinoComExercicios => ({
    ...t,
    exercicios: ((t.exercicios_treino || []) as ExercicioTreino[])
      .slice()
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)),
  });

  const todosTreinos: TreinoComExercicios[] = (raw.treinos_ficha || [])
    .slice()
    .sort(sorter)
    .map(mapearTreino);

  const periodizacoes: PeriodizacaoComTreinos[] = (raw.periodizacoes || [])
    .slice()
    .sort(sorter)
    .map((p: any) => ({
      id: p.id,
      ficha_id: p.ficha_id,
      nome: p.nome,
      created_at: p.created_at,
      treinos: (p.treinos_ficha || [])
        .slice()
        .sort(sorter)
        .map(mapearTreino),
    }));

  const refeicoes = ((raw.refeicoes_dieta || []) as RefeicaoDieta[])
    .slice()
    .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));

  return {
    id: raw.id,
    user_id: raw.user_id,
    nome: raw.nome,
    tipo: raw.tipo,
    status: raw.status,
    data_criacao: raw.data_criacao,
    treinos: todosTreinos,
    refeicoes,
    periodizacoes,
  };
}

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
    const chave = `fichaAtiva:${userId}:${tipo}`;
    return withCache(chave, async () => {
      const { data: fichasData, error: fichaError } = await supabase
        .from('fichas')
        .select(`
          *,
          treinos_ficha(
            *,
            exercicios_treino(*)
          ),
          periodizacoes(
            *,
            treinos_ficha(
              *,
              exercicios_treino(*)
            )
          ),
          refeicoes_dieta(*)
        `)
        .eq('user_id', userId)
        .eq('tipo', tipo)
        .eq('status', 'ativa')
        .order('data_criacao', { ascending: false })
        .limit(1);

      if (fichaError || !fichasData || fichasData.length === 0) return null;
      return montarFichaCompleta(fichasData[0] as any);
    });
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

  getByIdComConteudo: async (id: string): Promise<FichaCompleta | null> => {
    const { data, error } = await supabase
      .from('fichas')
      .select(`
        *,
        treinos_ficha(
          *,
          exercicios_treino(*)
        ),
        periodizacoes(
          *,
          treinos_ficha(
            *,
            exercicios_treino(*)
          )
        ),
        refeicoes_dieta(*)
      `)
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return montarFichaCompleta(data as any);
  },

  create: async (userId: string, nome: string, tipo: FichaTipo = 'treino'): Promise<FichaTreino> => {
    cacheDeletePrefix('fichaAtiva:');
    const { data, error } = await supabase.rpc('criar_ficha', {
      p_user_id: userId,
      p_nome: nome.trim(),
      p_tipo: tipo,
    });

    if (error) throw error;
    return data as FichaTreino;
  },

  update: async (id: string, updates: Partial<Pick<FichaTreino, 'nome' | 'status'>>): Promise<FichaTreino> => {
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('fichaAtiva:');
    const { error } = await supabase
      .from('fichas')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  criarAvaliacao: async (userId: string, dados: AvaliacaoOsInput): Promise<AvaliacaoOs> => {
    const { data, error } = await supabase.rpc('criar_avaliacao_os', {
      p_user_id: userId,
      p_dados: {
        nome: dados.nome,
        anamnese: dados.anamnese,
        perimetros: dados.perimetros,
        composicao: dados.composicao,
        flexibilidade_forca: dados.flexibilidade_forca,
        objetivo: dados.objetivo,
        peso: dados.peso,
        altura: dados.altura,
      },
    });

    if (error) throw error;
    return data as AvaliacaoOs;
  },

  criarAcompanhamento: async (userId: string, dados: AcompanhamentoOsInput): Promise<AcompanhamentoOs> => {
    cacheDeletePrefix('metas:');
    const { data, error } = await supabase.rpc('criar_acompanhamento_os', {
      p_user_id: userId,
      p_dados: {
        nome: dados.nome,
        relato: dados.relato,
        feedback: dados.feedback,
        fotos: dados.fotos,
        peso: dados.peso ?? '',
        meta_kcal: dados.meta_kcal ?? '',
        meta_proteina: dados.meta_proteina ?? '',
        meta_carbo: dados.meta_carbo ?? '',
        meta_gordura: dados.meta_gordura ?? '',
        meta_fibra: dados.meta_fibra ?? '',
      },
    });

    if (error) throw error;
    return data as AcompanhamentoOs;
  },

  getUltimasMetasNutricionais: async (userId: string): Promise<MetasNutricionais> => {
    const chave = `metas:${userId}`;
    return withCache(chave, async () => {
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
    });
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
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('fichaAtiva:');
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

    const treinoIds = (treinos as TreinoFicha[]).map(t => t.id);

    let exercicios: ExercicioTreino[] = [];
    if (treinoIds.length > 0) {
      const { data: exs, error: exError } = await supabase
        .from('exercicios_treino')
        .select('*')
        .in('treino_id', treinoIds);
      if (!exError) exercicios = (exs || []) as ExercicioTreino[];
    }

    const exsPorTreino = new Map<string, ExercicioTreino[]>();
    for (const ex of exercicios) {
      const grupo = exsPorTreino.get(ex.treino_id) || [];
      grupo.push(ex);
      exsPorTreino.set(ex.treino_id, grupo);
    }

    return (treinos as TreinoFicha[]).map(t => ({
      ...t,
      exercicios: exsPorTreino.get(t.id) || [],
    }));
  },

  create: async (fichaId: string, letraOuNome: string, observacoes?: string, periodizacaoId?: string): Promise<TreinoFicha> => {
    cacheDeletePrefix('fichaAtiva:');
    const { data, error } = await supabase
      .from('treinos_ficha')
      .insert({
        ficha_id: fichaId,
        letra_ou_nome: letraOuNome,
        observacoes: observacoes?.trim() || null,
        periodizacao_id: periodizacaoId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as TreinoFicha;
  },

  // DEEP COPY de um treino para outra periodizacao: cria um novo registro
  // em treinos_ficha + copia todos os exercicios (exercicios_treino), evitando
  // recadastro manual. Se o nome ja existir na periodizacao alvo, aplica
  // sufixo " (copia)" (atencao: a origem da copia nao e alterada).
  duplicar: async (treinoId: string, periodizacaoAlvoId: string): Promise<TreinoComExercicios> => {
    cacheDeletePrefix('fichaAtiva:');

    const { data: origem, error: erroOrigem } = await supabase
      .from('treinos_ficha')
      .select(`
        *,
        exercicios_treino(*)
      `)
      .eq('id', treinoId)
      .single();
    if (erroOrigem || !origem) throw new Error('Treino de origem não encontrado.');

    const base = origem as any;
    const nomeBase = String(base.letra_ou_nome || 'Treino').trim();

    const { data: existentes, error: erroExistentes } = await supabase
      .from('treinos_ficha')
      .select('letra_ou_nome')
      .eq('periodizacao_id', periodizacaoAlvoId);
    if (erroExistentes) throw erroExistentes;

    const nomesExistentes = new Set((existentes || []).map((t: any) => String(t.letra_ou_nome).trim().toLowerCase()));
    let nomeFinal = nomeBase;
    if (nomesExistentes.has(nomeFinal.toLowerCase())) {
      let contador = 1;
      let candidato = `${nomeBase} (copia)`;
      while (nomesExistentes.has(candidato.toLowerCase())) {
        contador += 1;
        candidato = `${nomeBase} (copia ${contador})`;
      }
      nomeFinal = candidato;
    }

    const { data: criado, error: erroCriado } = await supabase
      .from('treinos_ficha')
      .insert({
        ficha_id: base.ficha_id,
        letra_ou_nome: nomeFinal,
        observacoes: base.observacoes ?? null,
        periodizacao_id: periodizacaoAlvoId,
      })
      .select()
      .single();
    if (erroCriado || !criado) throw erroCriado || new Error('Não foi possível duplicar o treino.');

    const novoId = (criado as TreinoFicha).id;

    const exerciciosOrigem = ((base.exercicios_treino || []) as ExercicioTreino[])
      .slice()
      .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));

    if (exerciciosOrigem.length > 0) {
      const rows = exerciciosOrigem.map((ex, idx) => ({
        treino_id: novoId,
        nome_exercicio: ex.nome_exercicio,
        grupo_muscular: ex.grupo_muscular || null,
        musculo_principal: ex.musculo_principal || null,
        series: ex.series || 3,
        repeticoes_prescritas: ex.repeticoes_prescritas || null,
        repeticoes_por_serie: ex.repeticoes_por_serie || null,
        series_aquecimento: ex.series_aquecimento || null,
        descanso: ex.descanso || 60,
        ordem: idx,
        categoria: ex.categoria || 'forca',
        meta_tempo_min: ex.meta_tempo_min ?? null,
        meta_distancia_km: ex.meta_distancia_km ?? null,
      }));

      const { data: novos, error: erroEx } = await supabase
        .from('exercicios_treino')
        .insert(rows)
        .select();
      if (erroEx) throw erroEx;

      return {
        ...(criado as TreinoFicha),
        exercicios: ((novos || []) as ExercicioTreino[]).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
      };
    }

    return { ...(criado as TreinoFicha), exercicios: [] };
  },

  update: async (id: string, updates: { letra_ou_nome?: string; observacoes?: string }): Promise<TreinoFicha> => {
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('fichaAtiva:');
    const { error } = await supabase
      .from('treinos_ficha')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

// =============================================================
// PERIODIZACOES (blocos de treinamento dentro da ficha)
// =============================================================

export const periodizacoes = {
  getByFicha: async (fichaId: string): Promise<Periodizacao[]> => {
    const { data, error } = await supabase
      .from('periodizacoes')
      .select('*')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return (data || []) as Periodizacao[];
  },

  create: async (fichaId: string, nome: string): Promise<Periodizacao> => {
    cacheDeletePrefix('fichaAtiva:');
    const trimNome = nome.trim();
    if (!trimNome) throw new Error('O nome da periodização não pode ser vazio.');

    const { data: existentes, error: erroExistentes } = await supabase
      .from('periodizacoes')
      .select('nome')
      .eq('ficha_id', fichaId);
    if (erroExistentes) throw erroExistentes;
    const duplicado = (existentes || []).some(
      (p: any) => String(p.nome).trim().toLowerCase() === trimNome.toLowerCase()
    );
    if (duplicado) throw new Error(`Já existe uma periodização com o nome "${trimNome}".`);

    const { data, error } = await supabase
      .from('periodizacoes')
      .insert({ ficha_id: fichaId, nome: trimNome })
      .select()
      .single();
    if (error) throw error;
    return data as Periodizacao;
  },

  update: async (id: string, nome: string): Promise<Periodizacao> => {
    cacheDeletePrefix('fichaAtiva:');
    const trimNome = nome.trim();
    if (!trimNome) throw new Error('O nome da periodização não pode ser vazio.');
    const { data, error } = await supabase
      .from('periodizacoes')
      .update({ nome: trimNome })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Periodizacao;
  },

  delete: async (id: string): Promise<void> => {
    cacheDeletePrefix('fichaAtiva:');
    const { error } = await supabase
      .from('periodizacoes')
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
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('fichaAtiva:');
    const { error } = await supabase
      .from('exercicios_treino')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },

  delete: async (id: string): Promise<void> => {
    cacheDeletePrefix('fichaAtiva:');
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
    cacheDeletePrefix('progresso:');
    cacheDeletePrefix('volume:');
    const { error } = await supabase
      .from('logs_execucao')
      .upsert(rows, { onConflict: 'exercicio_id,num_serie,data_treino,log_treino_id' });
    if (error) throw error;
  },

  getVolumeTotal: async (userId: string, dias = 30): Promise<number> => {
    const chave = `volume:${userId}:${dias}`;
    return withCache(chave, async () => {
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
    });
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
    const chave = `progresso:${userId}`;
    return withCache(chave, async () => {
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
        .select('exercicio_id, nome_cardio, user_id, duracao_min, distancia_km, log_treino_id')
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
    const cardiosPorSessao = new Map<string, { exercicio_id: string | null; nome_cardio?: string | null; duracao_min: number; distancia_km?: number | null }[]>();

    if (cardiosData) {
      for (const c of cardiosData) {
        if (!c.log_treino_id) continue;
        const lista = cardiosPorSessao.get(c.log_treino_id) || [];
        lista.push({
          exercicio_id: c.exercicio_id ?? null,
          nome_cardio: c.nome_cardio ?? null,
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
    });
  },
};

// =============================================================
// LOGS DE CARDIO
// =============================================================

export const logsCardio = {
  upsertDia: async (rows: LogCardioInput[]): Promise<void> => {
    if (rows.length === 0) return;
    cacheDeletePrefix('progresso:');
    cacheDeletePrefix('volume:');
    const { error } = await supabase
      .from('logs_cardio')
      .upsert(rows, { onConflict: 'exercicio_id,data_treino,log_treino_id' });
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

  // Registro avulso de Cardio Isolado Livre (fora da ficha).
  // Cria a sessão em logs_treino (treino_id NULL) + linha em logs_cardio
  // (exercicio_id NULL, identificada por user_id + nome_cardio).
  criarCardioIsolado: async (userId: string, dados: {
    nomeCardio: string;
    duracaoMin: number;
    distanciaKm?: number | null;
    dataTreino?: string;
  }): Promise<{ logTreinoId: string }> => {
    if (!userId) throw new Error('Usuário não informado.');
    const duracaoMin = Math.max(1, Math.round(dados.duracaoMin) || 0);
    const nomeCardio = (dados.nomeCardio || 'Cardio').trim();

    const logTreino = await logsTreino.create(userId, null, Math.round(duracaoMin * 60));

    const row: LogCardioInput = {
      exercicio_id: null,
      user_id: userId,
      nome_cardio: nomeCardio,
      duracao_min: Math.min(duracaoMin, 999.9),
      distancia_km: dados.distanciaKm && dados.distanciaKm > 0 ? Math.min(dados.distanciaKm, 999.99) : null,
      data_treino: dados.dataTreino || hojeSP(),
      log_treino_id: logTreino.id,
    };
    const { error } = await supabase.from('logs_cardio').insert(row);
    if (error) throw error;

    return { logTreinoId: logTreino.id };
  },
};

// =============================================================
// LOGS DE TREINO
// =============================================================

export const logsTreino = {
  create: async (userId: string, treinoId: string | null, duracaoSegundos: number): Promise<LogTreino> => {
    cacheDeletePrefix('progresso:');
    cacheDeletePrefix('volume:');
    cacheDeletePrefix('sequencia:');
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
    const chave = `sequencia:${userId}`;
    return withCache(chave, async () => {
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
    });
  },
};

// =============================================================
// PERIODIZACAO SEMANAL
// =============================================================

export const planejamento = {
  get: async (userId: string): Promise<PlanejamentoAlocacao[]> => {
    const chave = `planejamento:${userId}`;
    return withCache(chave, async () => {
      const { data, error } = await supabase
        .from('planejamento_semanal')
        .select('id, dia_semana, treino_id, is_descanso, ordem, meta_cardio_semanal, treinos_ficha(letra_ou_nome)')
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
        meta_cardio_semanal: item.meta_cardio_semanal ?? null,
        treino_nome: Array.isArray(item.treinos_ficha)
          ? item.treinos_ficha[0]?.letra_ou_nome || null
          : item.treinos_ficha?.letra_ou_nome || null,
      }));
    });
  },

  salvar: async (userId: string, semana: PlanejamentoItem[], metaCardioSemanal?: number | null): Promise<void> => {
    cacheDeletePrefix('planejamento:');
    const rows = semana.map(p => ({
      dia: p.dia_semana,
      treino_id: p.treino_id || null,
      descanso: p.is_descanso === true,
      ordem: p.ordem ?? 0,
    }));

    const { error } = await supabase.rpc('salvar_planejamento', {
      p_user_id: userId,
      p_semana: rows,
      p_meta_cardio: metaCardioSemanal == null ? null : Math.max(0, Math.round(metaCardioSemanal)),
    });

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
    const chave = `consumo:${userId}:${hojeSP()}`;
    return withCache(chave, async () => {
      const hoje = hojeSP();
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .eq('date', hoje)
        .order('created_at', { ascending: true });
      if (error) return [];
      return data as Meal[];
    });
  },

  getRelatorioConsumo: async (userId: string, dias = 30): Promise<Meal[]> => {
    const chave = `relatorio:${userId}:${dias}`;
    return withCache(chave, async () => {
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
    });
  },
};

export const meals = {
  get: async (userId: string, date: string): Promise<Meal[]> => {
    const chave = `meals:${userId}:${date}`;
    return withCache(chave, async () => {
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .order('created_at');
      if (error) return [];
      return data as Meal[];
    });
  },

  create: async (meal: Omit<Meal, 'id' | 'created_at'>): Promise<Meal> => {
    cacheDeletePrefix(`consumo:${meal.user_id}:`);
    cacheDeletePrefix(`meals:${meal.user_id}:`);
    cacheDeletePrefix(`relatorio:${meal.user_id}:`);
    const { data, error } = await supabase
      .from('meals')
      .insert(meal)
      .select()
      .single();
    if (error) throw error;
    return data as Meal;
  },

  delete: async (id: string): Promise<void> => {
    cacheDeletePrefix('consumo:');
    cacheDeletePrefix('meals:');
    cacheDeletePrefix('relatorio:');
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
    const chave = `fixedfoods:${userId}`;
    return withCache(chave, async () => {
      const { data, error } = await supabase
        .from('fixed_foods')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('name');
      if (error) return [];
      return data as FixedFood[];
    });
  },

  create: async (food: Omit<FixedFood, 'id'>): Promise<FixedFood> => {
    cacheDeletePrefix(`fixedfoods:${food.user_id}`);
    const { data, error } = await supabase
      .from('fixed_foods')
      .insert(food)
      .select()
      .single();
    if (error) throw error;
    return data as FixedFood;
  },

  delete: async (id: string): Promise<void> => {
    cacheDeletePrefix('fixedfoods:');
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
};
