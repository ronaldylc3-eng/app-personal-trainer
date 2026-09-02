import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dumbbell, Apple, Plus, Pencil, History, Loader2,
  AlertCircle, X, Check, Inbox, Lock, Eye,
} from 'lucide-react';
import { fichas } from '../../services/api';
import { useAlunoContext } from './AlunoLayout';
import type {
  FichaCompleta, FichaTreino, FichaTipo, Usuario,
} from '../../types';

function formatarData(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ProntuarioAluno() {
  const { aluno } = useAlunoContext();
  const navigate = useNavigate();

  const [fichaTreino, setFichaTreino] = useState<FichaCompleta | null>(null);
  const [fichaDieta, setFichaDieta] = useState<FichaCompleta | null>(null);
  const [historico, setHistorico] = useState<FichaTreino[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal de criação
  const [modalTipo, setModalTipo] = useState<FichaTipo | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal de visualização de ficha arquivada
  const [fichaVisualizando, setFichaVisualizando] = useState<FichaCompleta | null>(null);
  const [loadingVisualizar, setLoadingVisualizar] = useState(false);

  const alunoId = aluno?.id;

  const carregar = useCallback(async () => {
    if (!alunoId) return;
    setLoading(true);
    setError('');
    try {
      const [treino, dieta, hist] = await Promise.all([
        fichas.getAtiva(alunoId, 'treino'),
        fichas.getAtiva(alunoId, 'dieta'),
        fichas.getHistorico(alunoId),
      ]);
      setFichaTreino(treino);
      setFichaDieta(dieta);
      setHistorico(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o prontuário.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirModal(tipo: FichaTipo) {
    if (!aluno) return;
    const ativas = tipo === 'treino' ? (fichaTreino ? 1 : 0) : (fichaDieta ? 1 : 0);
    const arquivadas = historico.filter(f => f.tipo === tipo).length;
    const numero = String(ativas + arquivadas + 1).padStart(2, '0');
    const prefixo = tipo === 'treino' ? 'Treino' : 'Dieta';
    setNovoNome(`${prefixo} ${numero} - ${aluno.nome}`);
    setModalTipo(tipo);
  }

  async function handleCriar() {
    if (!alunoId || !modalTipo || !novoNome.trim()) return;
    setSaving(true);
    setError('');
    try {
      await fichas.create(alunoId, novoNome, modalTipo);
      const destino = modalTipo === 'treino' ? 'treino' : 'dieta';
      setModalTipo(null);
      navigate(`/alunos/${alunoId}/${destino}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar ficha.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVisualizarFicha(ficha: FichaTreino) {
    setLoadingVisualizar(true);
    try {
      const completa = await fichas.getByIdComConteudo(ficha.id);
      setFichaVisualizando(completa);
    } catch {
      setError('Erro ao carregar conteúdo da ficha.');
    } finally {
      setLoadingVisualizar(false);
    }
  }

  if (!aluno) {
    return (
      <div className="p-4 md:p-8 lg:p-10">
        <div className="max-w-6xl mx-auto">
          <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
            <AlertCircle size={28} className="mx-auto text-[#4A4A50] mb-3" />
            <p className="text-sm text-zinc-400">Selecione um aluno válido para abrir o prontuário.</p>
          </div>
        </div>
      </div>
    );
  }

  const isVip = aluno.pacote === 'VIP';

  return (
    <div className="p-4 md:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex items-start gap-3.5">
          <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
            <History size={22} className="text-[#170B04]" strokeWidth={2.4} />
          </div>
          <div>
            <h2 className="font-display uppercase text-[26px] leading-tight text-bone">Prontuário do Aluno</h2>
            <p className="text-[13.5px] text-muted-steel">Visão geral das fichas de treino e dieta.</p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <div className="bg-panel border border-line p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando prontuário...</p>
          </div>
        ) : (
          <>
            {/* Cards de fichas ativas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FichaAtivaCard
                tipo="treino"
                ficha={fichaTreino}
                onAcessar={() => navigate(`/alunos/${alunoId}/treino`)}
                onCriar={() => abrirModal('treino')}
              />
              <FichaAtivaCard
                tipo="dieta"
                ficha={fichaDieta}
                onAcessar={() => navigate(`/alunos/${alunoId}/dieta`)}
                onCriar={() => abrirModal('dieta')}
                bloqueado={!isVip}
              />
            </div>

            {/* Histórico de fichas arquivadas */}
            <section>
              <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2 mb-3">
                <History size={13} className="text-accent-light" />
                Histórico (Fichas Arquivadas)
              </p>

              {historico.length === 0 ? (
                <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
                  <Inbox size={28} className="mx-auto text-[#4A4A50] mb-3" />
                  <p className="text-sm text-zinc-400">Nenhuma ficha arquivada ainda.</p>
                  <p className="text-xs text-[#6C6C74] mt-1">Ao criar uma nova ficha, a anterior é arquivada automaticamente.</p>
                </div>
              ) : (
                <div className="bg-panel border border-line overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead>
                        <tr className="text-muted-steel border-b border-line bg-panel-2/40">
                          <th className="text-left py-3 px-4 md:px-5 font-medium uppercase text-[10px] tracking-[0.1em]">Ficha</th>
                          <th className="text-left py-3 px-4 md:px-5 font-medium uppercase text-[10px] tracking-[0.1em]">Tipo</th>
                          <th className="text-left py-3 px-4 md:px-5 font-medium uppercase text-[10px] tracking-[0.1em]">Criada em</th>
                          <th className="text-left py-3 px-4 md:px-5 font-medium uppercase text-[10px] tracking-[0.1em]">Status</th>
                          <th className="text-right py-3 px-4 md:px-5 font-medium uppercase text-[10px] tracking-[0.1em]">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historico.map(f => (
                          <tr key={f.id} className="border-b border-line/60 last:border-0 hover:bg-panel-2/40 transition-colors">
                            <td className="py-3 px-4 md:px-5 text-bone font-medium">{f.nome}</td>
                            <td className="py-3 px-4 md:px-5">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm ${
                                f.tipo === 'treino'
                                  ? 'bg-accent/10 text-accent-light border-accent/30'
                                  : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                              }`}>
                                {f.tipo === 'treino' ? <Dumbbell size={10} /> : <Apple size={10} />}
                                {f.tipo === 'treino' ? 'Treino' : 'Dieta'}
                              </span>
                            </td>
                            <td className="py-3 px-4 md:px-5 text-muted-steel">{formatarData(f.data_criacao)}</td>
                            <td className="py-3 px-4 md:px-5">
                              <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 bg-panel-2 text-muted-steel border border-line clip-bevel-sm">
                                Arquivada
                              </span>
                            </td>
                            <td className="py-3 px-4 md:px-5 text-right">
                              <button
                                onClick={() => handleVisualizarFicha(f)}
                                disabled={loadingVisualizar}
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] px-2.5 py-1 border border-accent/30 bg-accent/10 text-accent-light clip-bevel-sm hover:bg-accent/20 transition-colors disabled:opacity-50"
                              >
                                {loadingVisualizar ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
                                Visualizar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Modal: criar nova ficha (treino/dieta) */}
      {modalTipo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !saving && setModalTipo(null)}
        >
          <div
            className="bg-panel border border-line clip-bevel p-5 md:p-6 max-w-md w-full space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone">
                Nova Ficha de {modalTipo === 'treino' ? 'Treino' : 'Dieta'}
              </p>
              <button onClick={() => setModalTipo(null)} disabled={saving} className="text-muted-steel hover:text-bone transition-colors disabled:opacity-40" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1.5">Nome da Ficha</label>
              <div className="field-bevel">
                <input
                  type="text"
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && novoNome.trim() && handleCriar()}
                  placeholder={`Ficha - ${aluno.nome}`}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-[#6C6C74] mt-1.5">
                A ficha será criada com status <span className="text-ok font-medium">ativa</span>. A ficha ativa anterior de {modalTipo === 'treino' ? 'treino' : 'dieta'} será arquivada.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-end pt-1">
              <button
                onClick={() => setModalTipo(null)}
                disabled={saving}
                className="btn-steel"
              >
                Cancelar
              </button>
              <button
                onClick={handleCriar}
                disabled={!novoNome.trim() || saving}
                className="btn-forge disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Criando...' : 'Criar Ficha'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: visualizar ficha arquivada */}
      {fichaVisualizando && (
        <FichaArquivadaModal
          ficha={fichaVisualizando}
          onClose={() => setFichaVisualizando(null)}
        />
      )}

    </div>
  );
}

// =============================================================
// CARD DE FICHA ATIVA (treino ou dieta)
// =============================================================

function FichaAtivaCard({ tipo, ficha, onAcessar, onCriar, bloqueado = false }: {
  tipo: FichaTipo;
  ficha: FichaCompleta | null;
  onAcessar: () => void;
  onCriar: () => void;
  bloqueado?: boolean;
}) {
  const isTreino = tipo === 'treino';
  const Icon = isTreino ? Dumbbell : Apple;
  const label = isTreino ? 'Treino' : 'Dieta';

  const totalTreinos = ficha?.treinos?.length ?? 0;
  const totalExercicios = ficha?.treinos?.reduce((sum, t) => sum + (t.exercicios?.length ?? 0), 0) ?? 0;

  return (
    <div className="bg-panel border border-line clip-bevel-sm p-4 md:p-6 flex flex-col min-h-[180px]">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 clip-bevel-sm flex items-center justify-center border ${
            isTreino
              ? 'bg-accent/10 border-accent/30'
              : 'bg-sky-500/10 border-sky-500/30'
          }`}>
            <Icon size={18} className={isTreino ? 'text-accent-light' : 'text-sky-400'} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-bone">Ficha de {label} Ativa</h3>
            <p className="text-[11px] text-muted-steel">
              {isTreino ? 'Prescrição de exercícios' : 'Plano alimentar'}
            </p>
          </div>
        </div>
        {ficha && (
          <span className="text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm text-ok bg-ok/10 border-ok/30 shrink-0">
            Ativa
          </span>
        )}
      </div>

      {ficha ? (
        <>
          <div className="flex-1 mb-4">
            <p className="text-sm font-semibold text-zinc-200 truncate">{ficha.nome}</p>
            <p className="text-[11px] text-muted-steel mt-0.5">
              Criada em {formatarData(ficha.data_criacao)}
              {isTreino && totalTreinos > 0 && ` · ${totalTreinos} treino(s) · ${totalExercicios} exercício(s)`}
            </p>
          </div>
          <button
            onClick={onAcessar}
            className="btn-forge btn-full !h-[44px] text-[13px]"
          >
            <Pencil size={13} /> Acessar / Editar
          </button>
        </>
      ) : (
        <>
          <div className="flex-1 mb-4 flex items-center">
            <p className="text-xs text-muted-steel">Nenhuma ficha ativa no momento.</p>
          </div>
          {bloqueado ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[11px] text-amber-400/90">
                <Lock size={12} /> Recurso do pacote VIP — faça o upgrade para liberar.
              </p>
              <button
                disabled
                title="Disponível apenas no pacote VIP"
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-[#2E2E34] text-[#6C6C74] clip-bevel-sm text-xs font-medium cursor-not-allowed opacity-70"
              >
                <Lock size={14} /> Criar Nova Ficha de {label}
              </button>
            </div>
          ) : (
            <button
              onClick={onCriar}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-[#37373E] hover:border-accent/50 hover:text-accent-light text-muted-steel clip-bevel-sm text-xs font-medium transition-all duration-150"
            >
              <Plus size={14} /> Criar Nova Ficha de {label}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================
// MODAL DE VISUALIZAÇÃO DE FICHA ARQUIVADA (somente leitura)
// =============================================================

function FichaArquivadaModal({ ficha, onClose }: {
  ficha: FichaCompleta;
  onClose: () => void;
}) {
  const isTreino = ficha.tipo === 'treino';
  const Icon = isTreino ? Dumbbell : Apple;
  const label = isTreino ? 'Treino' : 'Dieta';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-line clip-bevel p-5 md:p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-10 h-10 clip-bevel-sm flex items-center justify-center border shrink-0 ${
              isTreino ? 'bg-accent/10 border-accent/30' : 'bg-sky-500/10 border-sky-500/30'
            }`}>
              <Icon size={18} className={isTreino ? 'text-accent-light' : 'text-sky-400'} />
            </div>
            <div className="min-w-0">
              <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone">
                Ficha de {label} Arquivada
              </p>
              <h3 className="text-base font-bold text-zinc-100 truncate mt-0.5">{ficha.nome}</h3>
              <p className="text-[11px] text-muted-steel mt-0.5">
                Criada em {formatarData(ficha.data_criacao)}
                {isTreino
                  ? ` · ${ficha.treinos.length} treino(s) · ${ficha.treinos.reduce((s, t) => s + (t.exercicios?.length ?? 0), 0)} exercício(s)`
                  : ` · ${ficha.refeicoes?.length ?? 0} refeição(ões)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-steel hover:text-bone transition-colors shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto pr-1 space-y-3 flex-1">
          {isTreino ? (
            ficha.treinos.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">Nenhum treino registrado nesta ficha.</p>
            ) : (
              ficha.treinos.map(t => (
                <div key={t.id} className="bg-panel-2/40 border border-line clip-bevel-sm p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-bold text-bone">
                      <span className="text-accent-light mr-1.5">●</span>
                      {t.letra_ou_nome || `Treino ${t.created_at}`}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.06em] text-muted-steel font-semibold">{t.exercicios.length} ex</span>
                  </div>
                  {t.observacoes?.trim() && (
                    <p className="text-[11px] text-muted-steel mb-2 whitespace-pre-wrap break-words">
                      <span className="text-accent-light font-semibold">Obs:</span> {t.observacoes}
                    </p>
                  )}
                  <div className="space-y-1">
                    {t.exercicios.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">Sem exercícios.</p>
                    ) : (
                      t.exercicios.map((ex, idx) => (
                        <div key={ex.id} className="flex items-center gap-3 text-[12px] py-1 border-b border-line/40 last:border-0">
                          <span className="text-[10px] text-zinc-600 font-mono w-4 shrink-0">{idx + 1}</span>
                          <span className="text-zinc-200 font-medium min-w-0 flex-1 truncate">{ex.nome_exercicio}</span>
                          {ex.categoria === 'cardio' ? (
                            <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                              {ex.meta_tempo_min ? `${ex.meta_tempo_min} min` : ex.meta_distancia_km ? `${ex.meta_distancia_km} km` : 'Cardio'}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-steel shrink-0">
                              {ex.series}s × {ex.repeticoes_prescritas || '—'} · {ex.descanso}s
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )
          ) : (
            (ficha.refeicoes?.length ?? 0) === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-6">Nenhuma refeição registrada nesta ficha.</p>
            ) : (
              ficha.refeicoes!.map(r => (
                <div key={r.id} className="bg-panel-2/40 border border-line clip-bevel-sm p-4">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-bold text-bone">{r.nome_refeicao}</p>
                    {r.horario && <span className="text-[11px] text-muted-steel">{r.horario}</span>}
                  </div>
                  <p className="text-[12.5px] text-zinc-300 whitespace-pre-wrap break-words">{r.descricao_alimentos}</p>
                </div>
              ))
            )
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="btn-steel">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
