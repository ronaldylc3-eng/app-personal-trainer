import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, AlertCircle, X } from 'lucide-react';
import { fichas } from '../../services/api';
import { useAlunoContext } from './AlunoLayout';
import ModalAvaliacao from './ModalAvaliacao';
import TimelineEventos from './TimelineEventos';
import type { AvaliacaoOsInput, EventoClinico } from '../../types';

export default function ProntuarioAvaliacaoFisica() {
  const { aluno } = useAlunoContext();

  const [eventos, setEventos] = useState<EventoClinico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [saving, setSaving] = useState(false);

  const alunoId = aluno?.id;

  const carregar = useCallback(async () => {
    if (!alunoId) return;
    setLoading(true);
    setError('');
    try {
      setEventos(await fichas.getEventosPorTipo(alunoId, 'avaliacao'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar o histórico de avaliações.');
    } finally {
      setLoading(false);
    }
  }, [alunoId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleRegistrar(dados: AvaliacaoOsInput) {
    if (!alunoId) return;
    setSaving(true);
    try {
      await fichas.criarAvaliacao(alunoId, dados);
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
            <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
              <ClipboardCheck size={22} className="text-[#170B04]" strokeWidth={2.4} />
            </div>
            <div>
              <h2 className="font-display uppercase text-[26px] leading-tight text-bone">Avaliação Física</h2>
              <p className="text-[13.5px] text-muted-steel">Histórico cronológico de avaliações do aluno.</p>
            </div>
          </div>
          <button
            onClick={() => setModalAberto(true)}
            className="btn-forge-sm"
          >
            <ClipboardCheck size={15} /> Nova Avaliação Física
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs bg-red-500/10 text-red-300 border border-red-500/20">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
          </div>
        )}

        <TimelineEventos
          eventos={eventos}
          loading={loading}
          mensagemVazio="Nenhuma avaliação física registrada."
          submensagemVazio="Use o botão acima para registrar a primeira."
        />
      </div>

      {/* Modal: Registrar Avaliação Física (OS) */}
      {modalAberto && aluno && (
        <ModalAvaliacao
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
