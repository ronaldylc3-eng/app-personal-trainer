import { useState, useEffect } from 'react';
import { X, Flame, Timer, Loader2, Check, Ruler } from 'lucide-react';
import { logsCardio } from '../../services/api';
import { haptics } from '../../utils/haptics';

const MODALIDADES_CARDIO = [
  'Esteira',
  'Bike Ergométrica',
  'Boxe',
  'Elíptico',
  'Pular Corda',
  'Natação',
  'Corrida Outdoor',
  'Caminhada Outdoor',
  'Remo',
  'Outro',
];

type Feedback = { tipo: 'ok' | 'erro'; msg: string } | null;

export interface CardioIsoladoResultado {
  nomeCardio: string;
  duracaoMin: number;
  distanciaKm: number | null;
}

interface CardioIsoladoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSaved: (resultado: CardioIsoladoResultado) => void | Promise<void>;
}

export function CardioIsoladoModal({ isOpen, onClose, userId, onSaved }: CardioIsoladoModalProps) {
  const [modalidade, setModalidade] = useState(MODALIDADES_CARDIO[0]);
  const [modalidadeLivre, setModalidadeLivre] = useState('');
  const [minutos, setMinutos] = useState('');
  const [km, setKm] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (isOpen) {
      setModalidade(MODALIDADES_CARDIO[0]);
      setModalidadeLivre('');
      setMinutos('');
      setKm('');
      setSaving(false);
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const minValor = Math.max(0, Math.round(parseFloat(minutos.replace(',', '.')) || 0));
  const kmValor = Math.max(0, parseFloat(km.replace(',', '.')) || 0);
  const nomeFinal = modalidade === 'Outro'
    ? (modalidadeLivre.trim() || 'Cardio')
    : modalidade;
  const valido = minValor > 0;

  async function handleSalvar() {
    if (saving) return;
    if (!valido) {
      haptics.error?.();
      setFeedback({ tipo: 'erro', msg: 'Informe quantos minutos você praticou (mínimo 1 minuto).' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    haptics.impact?.();
    try {
      await logsCardio.criarCardioIsolado(userId, {
        nomeCardio: nomeFinal,
        duracaoMin: minValor,
        distanciaKm: kmValor > 0 ? kmValor : null,
      });
      haptics.success?.();
      await onSaved({
        nomeCardio: nomeFinal,
        duracaoMin: minValor,
        distanciaKm: kmValor > 0 ? kmValor : null,
      });
    } catch (e) {
      setFeedback({
        tipo: 'erro',
        msg: e instanceof Error ? e.message : 'Erro ao registrar. Tente novamente.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="relative bg-[#0E0E11] border border-line clip-bevel max-w-md w-full mx-auto my-auto shadow-[0_20px_70px_rgba(0,0,0,0.9)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 w-8 h-8 rounded-full bg-zinc-900/80 border border-zinc-700/60 text-muted-steel hover:text-bone hover:border-zinc-500 flex items-center justify-center transition-colors"
          title="Fechar (ESC)"
        >
          <X size={16} />
        </button>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-gradient-to-br from-orange-500 to-orange-800 clip-bevel-sm">
              <Flame size={19} className="text-[#170B04]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[17px] text-bone tracking-wide uppercase">Registrar Cardio Isolado</h2>
              <p className="text-[11.5px] text-muted-steel leading-snug">
                Lançe o tempo que você praticou hoje. Ele abate direto da sua meta semanal de cardio.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Modalidade */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel mb-1.5 block flex items-center gap-1.5">
                <Flame size={12} className="text-accent-light" /> Modalidade
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {MODALIDADES_CARDIO.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      haptics.selection?.();
                      setModalidade(m);
                    }}
                    className={`px-2 py-1.5 text-[11.5px] font-bold border clip-bevel-sm transition-all text-left ${
                      modalidade === m
                        ? 'border-orange-400/70 bg-orange-400/15 text-orange-200'
                        : 'border-line bg-panel text-muted-steel hover:text-bone hover:border-zinc-600'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {modalidade === 'Outro' && (
                <input
                  type="text"
                  value={modalidadeLivre}
                  onChange={e => setModalidadeLivre(e.target.value)}
                  placeholder="Digite a modalidade (ex.: Boxe Thai)"
                  className="mt-2 w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent"
                />
              )}
            </div>

            {/* Minutos */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel mb-1.5 block flex items-center gap-1.5">
                <Timer size={12} className="text-accent-light" /> Minutos praticados hoje
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={minutos}
                onChange={e => setMinutos(e.target.value)}
                placeholder="Ex.: 60"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2.5 text-lg font-bold text-bone focus:outline-none focus:border-accent tabular-nums"
              />
            </div>

            {/* Distância (opcional) */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel mb-1.5 block flex items-center gap-1.5">
                <Ruler size={12} className="text-accent-light" /> Distância (km) · opcional
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.1"
                value={km}
                onChange={e => setKm(e.target.value)}
                placeholder="Ex.: 5.0 (deixe vazio se não quiser informar)"
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent"
              />
            </div>

            {feedback && (
              <div className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border clip-bevel-sm ${
                feedback.tipo === 'ok'
                  ? 'bg-ok/10 text-ok border-ok/25'
                  : 'bg-red-500/10 text-red-400 border-red-500/25'
              }`}>
                {feedback.tipo === 'ok' ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0" />}
                <span>{feedback.msg}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSalvar}
                disabled={saving}
                className="btn-forge flex-1 py-2.5 text-xs sm:text-sm flex items-center justify-center gap-2 shadow-plate"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                <span>{valido ? `Salvar ${minValor} min de ${nomeFinal}` : 'Salvar registro'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="btn-steel px-4 py-2.5 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
