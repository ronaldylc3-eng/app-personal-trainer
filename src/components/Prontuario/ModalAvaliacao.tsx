import { useState } from 'react';
import { X, Loader2, ClipboardCheck, ChevronDown, AlertCircle } from 'lucide-react';
import type { AvaliacaoOsInput } from '../../types';

const PERIMETRO_LABELS: { key: string; label: string }[] = [
  { key: 'braco_direito', label: 'Braço Dir.' },
  { key: 'braco_esquerdo', label: 'Braço Esq.' },
  { key: 'antebraco_direito', label: 'Antebraço Dir.' },
  { key: 'antebraco_esquerdo', label: 'Antebraço Esq.' },
  { key: 'peitoral', label: 'Peitoral' },
  { key: 'cintura', label: 'Cintura' },
  { key: 'abdomen', label: 'Abdômen' },
  { key: 'quadril', label: 'Quadril' },
  { key: 'coxa_direita', label: 'Coxa Dir.' },
  { key: 'coxa_esquerda', label: 'Coxa Esq.' },
  { key: 'panturrilha_direita', label: 'Panturrilha Dir.' },
  { key: 'panturrilha_esquerda', label: 'Panturrilha Esq.' },
];

interface ModalAvaliacaoProps {
  alunoNome: string;
  onClose: () => void;
  onSubmit: (dados: AvaliacaoOsInput) => Promise<void>;
}

export default function ModalAvaliacao({ alunoNome, onClose, onSubmit }: ModalAvaliacaoProps) {
  const [peso, setPeso] = useState('');
  const [altura, setAltura] = useState('');
  const [percentualGordura, setPercentualGordura] = useState('');
  const [massaMagra, setMassaMagra] = useState('');
  const [massaGordura, setMassaGordura] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [anamnese, setAnamnese] = useState('');
  const [flexibilidade, setFlexibilidade] = useState('');
  const [perimetros, setPerimetros] = useState<Record<string, string>>({});
  const [showPerimetros, setShowPerimetros] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePerimetro(key: string, value: string) {
    setPerimetros(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError('');
    if (!peso && !altura && !percentualGordura && !anamnese.trim() && !objetivo.trim()) {
      setError('Preencha ao menos um dado da avaliação (peso, altura, composição ou anamnese).');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        nome: `Avaliação Física - ${alunoNome}`,
        peso: Number(peso) || 0,
        altura: Number(altura) || 0,
        objetivo: objetivo.trim(),
        anamnese: anamnese.trim(),
        flexibilidade_forca: flexibilidade.trim(),
        composicao: {
          percentual_gordura: Number(percentualGordura) || 0,
          massa_magra: Number(massaMagra) || 0,
          massa_gordura: Number(massaGordura) || 0,
        },
        perimetros: Object.fromEntries(
          Object.entries(perimetros)
            .map(([k, v]): [string, number] => [k, Number(v) || 0])
            .filter(([, v]) => v > 0)
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar avaliação.');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = "text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => !saving && onClose()}>
      <div
        className="bg-panel border border-line clip-bevel w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <p className="font-display text-[12.5px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
            <ClipboardCheck size={14} className="text-accent-light" />
            Registrar Avaliação Física
          </p>
          <button onClick={onClose} disabled={saving} className="text-muted-steel hover:text-bone transition-colors disabled:opacity-40" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Peso (kg)</label>
              <div className="field-bevel"><input type="number" min={0} step={0.1} value={peso} onChange={e => setPeso(e.target.value)} placeholder="0" autoFocus /></div>
            </div>
            <div>
              <label className={labelCls}>Altura (cm)</label>
              <div className="field-bevel"><input type="number" min={0} step={0.1} value={altura} onChange={e => setAltura(e.target.value)} placeholder="0" /></div>
            </div>
            <div>
              <label className={labelCls}>% Gordura</label>
              <div className="field-bevel"><input type="number" min={0} step={0.1} value={percentualGordura} onChange={e => setPercentualGordura(e.target.value)} placeholder="0" /></div>
            </div>
            <div>
              <label className={labelCls}>Massa Magra (kg)</label>
              <div className="field-bevel"><input type="number" min={0} step={0.1} value={massaMagra} onChange={e => setMassaMagra(e.target.value)} placeholder="0" /></div>
            </div>
            <div>
              <label className={labelCls}>Massa Gordura (kg)</label>
              <div className="field-bevel"><input type="number" min={0} step={0.1} value={massaGordura} onChange={e => setMassaGordura(e.target.value)} placeholder="0" /></div>
            </div>
            <div>
              <label className={labelCls}>Objetivo</label>
              <div className="field-bevel"><input type="text" value={objetivo} onChange={e => setObjetivo(e.target.value)} placeholder="Ex: Hipertrofia" /></div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Anamnese</label>
            <div className="field-bevel">
              <textarea
                className="min-h-[80px] resize-y"
                value={anamnese}
                onChange={e => setAnamnese(e.target.value)}
                placeholder="Histórico, rotina, restrições, lesões..."
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Flexibilidade / Força</label>
            <div className="field-bevel">
              <textarea
                className="min-h-[60px] resize-y"
                value={flexibilidade}
                onChange={e => setFlexibilidade(e.target.value)}
                placeholder="Observações de mobilidade e força..."
              />
            </div>
          </div>

          {/* Perímetros (colapsável) */}
          <div className="bg-panel-2/40 border border-line clip-bevel-sm overflow-hidden">
            <button
              onClick={() => setShowPerimetros(!showPerimetros)}
              className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-display tracking-[0.12em] uppercase text-muted-steel hover:text-bone transition-colors"
            >
              <span className="flex items-center gap-2">
                <ClipboardCheck size={13} className="text-accent-light" />
                Perímetros (cm) — opcional
              </span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${showPerimetros ? 'rotate-180' : ''}`} />
            </button>
            {showPerimetros && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 pb-4">
                {PERIMETRO_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-muted-steel block mb-1">{label}</label>
                    <div className="field-bevel-sm">
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={perimetros[key] ?? ''}
                        onChange={e => handlePerimetro(key, e.target.value)}
                        placeholder="0"
                      />
                    </div>
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
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
            {saving ? 'Registrando...' : 'Registrar OS'}
          </button>
        </div>
      </div>
    </div>
  );
}
