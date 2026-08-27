import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Dumbbell, Apple, ClipboardCheck, MessageSquare,
  Loader2, AlertCircle, FolderOpen,
} from 'lucide-react';
import { fichas } from '../../services/api';
import type { Usuario, FichaCompleta, EventoClinico } from '../../types';

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function truncar(texto: string, max = 140): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}

function SecaoVazia({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[#6C6C74] italic">{children}</p>;
}

export default function ResumoCompletoModal({ aluno, onClose }: { aluno: Usuario; onClose: () => void }) {
  const navigate = useNavigate();
  const [fichaTreino, setFichaTreino] = useState<FichaCompleta | null>(null);
  const [fichaDieta, setFichaDieta] = useState<FichaCompleta | null>(null);
  const [eventos, setEventos] = useState<EventoClinico[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroMsg, setErroMsg] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErroMsg('');
    try {
      const [treino, dieta, evs] = await Promise.all([
        fichas.getAtiva(aluno.id, 'treino'),
        fichas.getAtiva(aluno.id, 'dieta'),
        fichas.getEventos(aluno.id),
      ]);
      setFichaTreino(treino);
      setFichaDieta(dieta);
      setEventos(evs);
    } catch (e) {
      setErroMsg(e instanceof Error ? e.message : 'Falha ao carregar o resumo.');
    } finally {
      setLoading(false);
    }
  }, [aluno.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const totalExercicios = fichaTreino?.treinos.reduce((acc, t) => acc + t.exercicios.length, 0) ?? 0;
  const ultimaAvaliacao = eventos.find(e => e.tipo === 'avaliacao') || null;
  const ultimoAcompanhamento = eventos.find(e => e.tipo === 'acompanhamento') || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 md:p-6" onClick={onClose}>
      <div
        className="bg-panel border border-line clip-bevel w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-panel/95 backdrop-blur border-b border-line px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 clip-bevel-sm bg-gradient-to-br from-accent-light to-plate shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] flex items-center justify-center text-sm font-bold text-[#170B04]">
              {aluno.nome.trim().charAt(0).toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-bone truncate">{aluno.nome}</h3>
              <p className="text-[11px] text-muted-steel">Resumo completo do prontuário</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-steel hover:text-bone clip-bevel-sm hover:bg-panel-2 transition-colors shrink-0" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-muted-steel">
              <Loader2 size={20} className="animate-spin mr-2" /> Carregando resumo...
            </div>
          ) : erroMsg ? (
            <div className="flex flex-col items-center py-10 text-center">
              <AlertCircle size={24} className="text-red-400 mb-3" />
              <p className="text-xs text-zinc-400 mb-4 max-w-xs">{erroMsg}</p>
              <button
                onClick={carregar}
                className="btn-steel"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {/* Ficha de Treino ativa */}
              <div className="bg-panel-2/40 border border-line p-4">
                <h4 className="font-display text-[11.5px] tracking-[0.12em] uppercase mb-2.5 flex items-center gap-2 text-bone">
                  <Dumbbell size={13} className="text-accent-light" /> Ficha de Treino
                </h4>
                {fichaTreino ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-zinc-200 truncate">{fichaTreino.nome}</span>
                    <span className="shrink-0 text-[11px] text-muted-steel whitespace-nowrap">
                      {fichaTreino.treinos.length} treino(s) · {totalExercicios} exercício(s)
                    </span>
                  </div>
                ) : (
                  <SecaoVazia>Sem ficha de treino ativa.</SecaoVazia>
                )}
              </div>

              {/* Ficha de Dieta ativa */}
              <div className="bg-panel-2/40 border border-line p-4">
                <h4 className="font-display text-[11.5px] tracking-[0.12em] uppercase mb-2.5 flex items-center gap-2 text-bone">
                  <Apple size={13} className="text-accent-light" /> Ficha de Dieta
                </h4>
                {fichaDieta ? (
                  <span className="text-xs font-medium text-zinc-200">{fichaDieta.nome}</span>
                ) : (
                  <SecaoVazia>Sem dieta ativa.</SecaoVazia>
                )}
              </div>

              {/* Última Avaliação Física */}
              <div className="bg-panel-2/40 border border-line p-4">
                <h4 className="font-display text-[11.5px] tracking-[0.12em] uppercase mb-2.5 flex items-center gap-2 text-bone">
                  <ClipboardCheck size={13} className="text-accent-light" /> Última Avaliação Física
                </h4>
                {ultimaAvaliacao ? (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-medium text-zinc-200 truncate">{ultimaAvaliacao.nome}</span>
                      <span className="shrink-0 text-[11px] text-muted-steel">{fmtData(ultimaAvaliacao.data)}</span>
                    </div>
                    <div className="flex gap-3 text-[11px] text-zinc-400 stat-number">
                      {ultimaAvaliacao.avaliacao?.peso != null && (
                        <span>{ultimaAvaliacao.avaliacao.peso} kg</span>
                      )}
                      {ultimaAvaliacao.avaliacao?.altura != null && (
                        <span>{ultimaAvaliacao.avaliacao.altura} cm</span>
                      )}
                      {ultimaAvaliacao.avaliacao?.composicao?.percentual_gordura != null && (
                        <span>BF {ultimaAvaliacao.avaliacao.composicao.percentual_gordura}%</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <SecaoVazia>Nenhuma avaliação registrada.</SecaoVazia>
                )}
              </div>

              {/* Último Acompanhamento */}
              <div className="bg-panel-2/40 border border-line p-4">
                <h4 className="font-display text-[11.5px] tracking-[0.12em] uppercase mb-2.5 flex items-center gap-2 text-bone">
                  <MessageSquare size={13} className="text-accent-light" /> Último Acompanhamento
                </h4>
                {ultimoAcompanhamento ? (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-xs font-medium text-zinc-200 truncate">{ultimoAcompanhamento.nome}</span>
                      <span className="shrink-0 text-[11px] text-muted-steel">{fmtData(ultimoAcompanhamento.data)}</span>
                    </div>
                    {(ultimoAcompanhamento.acompanhamento?.feedback || ultimoAcompanhamento.acompanhamento?.relato) && (
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {truncar(ultimoAcompanhamento.acompanhamento.feedback || ultimoAcompanhamento.acompanhamento.relato)}
                      </p>
                    )}
                  </div>
                ) : (
                  <SecaoVazia>Nenhum acompanhamento registrado.</SecaoVazia>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !erroMsg && (
          <div className="border-t border-line px-5 py-3.5 flex justify-end">
            <button
              onClick={() => navigate(`/alunos/${aluno.id}`)}
              className="btn-forge !h-[44px] text-[13px]"
            >
              <FolderOpen size={13} /> Abrir Prontuário Completo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
