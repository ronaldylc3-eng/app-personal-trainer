import { useEffect, useState } from 'react';
import { X, Loader2, MessageSquarePlus, Plus, Trash2, AlertCircle, Link2 } from 'lucide-react';
import { fichas } from '../../services/api';
import type { AcompanhamentoOsInput, MetasNutricionais } from '../../types';

interface ModalAcompanhamentoProps {
  alunoId: string;
  alunoNome: string;
  onClose: () => void;
  onSubmit: (dados: AcompanhamentoOsInput) => Promise<void>;
}

type MetasForm = { kcal: string; proteina: string; carbo: string; gordura: string; fibra: string };

const METAS_VAZIAS: MetasForm = { kcal: '', proteina: '', carbo: '', gordura: '', fibra: '' };

export default function ModalAcompanhamento({ alunoId, alunoNome, onClose, onSubmit }: ModalAcompanhamentoProps) {
  const [peso, setPeso] = useState('');
  const [relato, setRelato] = useState('');
  const [feedback, setFeedback] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [metas, setMetas] = useState<MetasForm>(METAS_VAZIAS);
  const [prefillOk, setPrefillOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-preenche com as metas do acompanhamento anterior (se existir)
  useEffect(() => {
    let cancel = false;
    fichas.getUltimasMetasNutricionais(alunoId)
      .then(m => {
        if (cancel || !m) return;
        setMetas({
          kcal: m.meta_kcal ? String(m.meta_kcal) : '',
          proteina: m.meta_proteina ? String(m.meta_proteina) : '',
          carbo: m.meta_carbo ? String(m.meta_carbo) : '',
          gordura: m.meta_gordura ? String(m.meta_gordura) : '',
          fibra: m.meta_fibra ? String(m.meta_fibra) : '',
        });
        setPrefillOk(true);
      })
      .catch(() => { /* sem prefill */ });
    return () => { cancel = true; };
  }, [alunoId]);

  function handleFotoChange(idx: number, value: string) {
    setFotos(prev => prev.map((f, i) => (i === idx ? value : f)));
  }

  function handleRemoverFoto(idx: number) {
    setFotos(prev => prev.filter((_, i) => i !== idx));
  }

  function metaNumero(valor: string): number | null {
    const n = Number(valor);
    return valor.trim() && !isNaN(n) && n > 0 ? n : null;
  }

  async function handleSubmit() {
    setError('');
    const temMeta = Object.values(metas).some(v => v.trim());
    if (!relato.trim() && !feedback.trim() && !peso && fotos.every(f => !f.trim()) && !temMeta) {
      setError('Preencha ao menos um campo (peso, relato, feedback, foto ou metas).');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        nome: `Acompanhamento - ${alunoNome}`,
        peso: peso ? Number(peso) : null,
        relato: relato.trim(),
        feedback: feedback.trim(),
        fotos: fotos.map(f => f.trim()).filter(Boolean),
        meta_kcal: metaNumero(metas.kcal),
        meta_proteina: metaNumero(metas.proteina),
        meta_carbo: metaNumero(metas.carbo),
        meta_gordura: metaNumero(metas.gordura),
        meta_fibra: metaNumero(metas.fibra),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar acompanhamento.');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = "text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div
        className="bg-panel border border-line clip-bevel w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
            <MessageSquarePlus size={14} className="text-accent-light" />
            Registrar Acompanhamento
          </p>
          <button onClick={onClose} disabled={saving} className="text-muted-steel hover:text-bone transition-colors disabled:opacity-40" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Peso atual (kg) — opcional</label>
            <div className="field-bevel"><input type="number" min={0} step={0.1} value={peso} onChange={e => setPeso(e.target.value)} placeholder="Ex: 78.5" autoFocus /></div>
          </div>

          <div>
            <label className={labelCls}>Relato do aluno</label>
            <div className="field-bevel">
              <textarea
                className="min-h-[80px] resize-y"
                value={relato}
                onChange={e => setRelato(e.target.value)}
                placeholder="Como foi a semana? Dificuldades, adesão ao treino/dieta..."
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Feedback do gestor</label>
            <div className="field-bevel">
              <textarea
                className="min-h-[80px] resize-y"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Orientações, ajustes de rota, reconhecimentos..."
              />
            </div>
          </div>

          {/* Ajuste de Metas (Macros) */}
          <div className="bg-panel-2/40 border border-line clip-bevel-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>Ajuste de Metas (Macros)</label>
              {prefillOk && <span className="text-[10px] text-muted-steel">pré-preenchido do último</span>}
            </div>
            <p className="text-[11px] text-[#6C6C74] mb-3">Define o gráfico de dieta do aluno. Deixe em branco para não alterar.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-muted-steel block mb-1">Calorias (kcal)</label>
                <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metas.kcal} onChange={e => setMetas({ ...metas, kcal: e.target.value })} placeholder="2000" /></div>
              </div>
              <div>
                <label className="text-[10px] text-muted-steel block mb-1">Proteínas (g)</label>
                <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metas.proteina} onChange={e => setMetas({ ...metas, proteina: e.target.value })} placeholder="150" /></div>
              </div>
              <div>
                <label className="text-[10px] text-muted-steel block mb-1">Carboidratos (g)</label>
                <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metas.carbo} onChange={e => setMetas({ ...metas, carbo: e.target.value })} placeholder="220" /></div>
              </div>
              <div>
                <label className="text-[10px] text-muted-steel block mb-1">Gorduras (g)</label>
                <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metas.gordura} onChange={e => setMetas({ ...metas, gordura: e.target.value })} placeholder="70" /></div>
              </div>
              <div>
                <label className="text-[10px] text-muted-steel block mb-1">Fibras (g)</label>
                <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metas.fibra} onChange={e => setMetas({ ...metas, fibra: e.target.value })} placeholder="33" /></div>
              </div>
            </div>
          </div>

          {/* Fotos por URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`${labelCls} mb-0`}>Fotos (URLs)</label>
              <button
                onClick={() => setFotos(prev => [...prev, ''])}
                className="btn-ghost"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>
            {fotos.length === 0 ? (
              <p className="text-[11px] text-[#6C6C74]">Nenhuma foto anexada. Cole links de imagens (Drive, Imgur...).</p>
            ) : (
              <div className="space-y-2">
                {fotos.map((foto, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="field-bevel flex-1">
                      <Link2 size={13} className="ml-3 shrink-0 text-muted-steel pointer-events-none" />
                      <input
                        type="url"
                        value={foto}
                        onChange={e => handleFotoChange(idx, e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                    <button
                      onClick={() => handleRemoverFoto(idx)}
                      className="p-2.5 text-muted-steel hover:text-red-400 clip-bevel-sm hover:bg-red-500/10 transition-colors shrink-0"
                      title="Remover foto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 clip-bevel-sm text-red-300 text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-line shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="btn-steel"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-forge"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
            {saving ? 'Registrando...' : 'Registrar OS'}
          </button>
        </div>
      </div>
    </div>
  );
}
