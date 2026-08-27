import { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus, Lock, Loader2, AlertCircle, X, MessageSquare } from 'lucide-react';
import { fichas } from '../../services/api';
import { useAlunoContext } from './AlunoLayout';
import ModalAcompanhamento from './ModalAcompanhamento';
import TimelineEventos from './TimelineEventos';
import type { AcompanhamentoOsInput, EventoClinico } from '../../types';

export default function ProntuarioAcompanhamento() {
  const { aluno } = useAlunoContext();

  const [eventos, setEventos] = useState<EventoClinico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [saving, setSaving] = useState(false);

  const alunoId = aluno?.id;
  const isVip = aluno?.pacote === 'VIP';

  const carregar = useCallback(async () => {
    if (!alunoId) return;
    setLoading(true);
    setError('');
    try {
      setEventos(await fichas.getEventosPorTipo(alunoId, 'acompanhamento'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o histórico de acompanhamentos.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleRegistrar(dados: AcompanhamentoOsInput) {
    if (!alunoId) return;
    setSaving(true);
    try {
      await fichas.criarAcompanhamento(alunoId, dados);
      setModalAberto(false);
      await carregar();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 md:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-200">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-sky-400 to-sky-800 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] clip-bevel">
              <MessageSquare size={22} className="text-[#0B1520]" strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="font-display uppercase text-[26px] leading-tight text-bone">Acompanhamento</h2>
              <p className="text-[13.5px] text-muted-steel">Registros do aluno e metas de macros cadastradas.</p>
            </div>
          </div>
          {isVip ? (
            <button
              onClick={() => setModalAberto(true)}
              className="btn-forge-sm"
            >
              <MessageSquarePlus size={15} /> Registrar Novo Acompanhamento
            </button>
          ) : (
            <button
              disabled
              title="Disponível apenas no pacote VIP"
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-[#2E2E34] text-[#6C6C74] clip-bevel-sm text-xs font-medium cursor-not-allowed opacity-70"
            >
              <Lock size={14} /> Registrar Novo Acompanhamento
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}

        {!isVip && (
          <div className="clip-bevel-sm px-4 py-2.5 text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/25">
            O registro de acompanhamentos está disponível apenas para alunos do pacote VIP.
          </div>
        )}

        <TimelineEventos
          eventos={eventos}
          loading={loading}
          mensagemVazio="Nenhum acompanhamento registrado."
          submensagemVazio="Use o botão acima para registrar o primeiro."
        />
      </div>

      {/* Modal: Registrar Acompanhamento (OS) */}
      {modalAberto && aluno && (
        <ModalAcompanhamento
          alunoId={aluno.id}
          alunoNome={aluno.nome}
          onClose={() => !saving && setModalAberto(false)}
          onSubmit={handleRegistrar}
        />
      )}

      {/* Spinner de salvamento fora da timeline */}
      {saving && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-panel border border-line clip-bevel-sm px-4 py-2.5 text-xs text-zinc-300 shadow-2xl">
          <Loader2 size={13} className="text-accent-light animate-spin" /> Salvando...
        </div>
      )}
    </div>
  );
}
