import { useEffect, useState } from 'react';
import { X, Loader2, MessageSquarePlus, Plus, Trash2, AlertCircle, Link2, Flame, BarChart3 } from 'lucide-react';
import { fichas } from '../../services/api';
import { diaSemanaSP } from '../../utils/semanaUtils';
import type { AcompanhamentoOsInput, MetasNutricionais, MetasPorDia } from '../../types';

interface ModalAcompanhamentoProps {
  alunoId: string;
  alunoNome: string;
  onClose: () => void;
  onSubmit: (dados: AcompanhamentoOsInput) => Promise<void>;
}

type MetasForm = { kcal: string; proteina: string; carbo: string; gordura: string; fibra: string };

const METAS_VAZIAS: MetasForm = { kcal: '', proteina: '', carbo: '', gordura: '', fibra: '' };

type DiaMetaForm = { kcal: string; carb: string; prot: string; gord: string };

const DIA_META_VAZIO: DiaMetaForm = { kcal: '', carb: '', prot: '', gord: '' };

// Ordem de exibicao Segunda..Domingo (chaves do JSONB: "1".."6", "0")
const DIAS_ORDEM: Array<keyof MetasPorDia> = ['1', '2', '3', '4', '5', '6', '0'];
const DIAS_LABEL: Record<keyof MetasPorDia, string> = {
  '0': 'Domingo',
  '1': 'Segunda',
  '2': 'Terça',
  '3': 'Quarta',
  '4': 'Quinta',
  '5': 'Sexta',
  '6': 'Sábado',
};

function criarDiasVazios(): Record<keyof MetasPorDia, DiaMetaForm> {
  return {
    '0': { ...DIA_META_VAZIO },
    '1': { ...DIA_META_VAZIO },
    '2': { ...DIA_META_VAZIO },
    '3': { ...DIA_META_VAZIO },
    '4': { ...DIA_META_VAZIO },
    '5': { ...DIA_META_VAZIO },
    '6': { ...DIA_META_VAZIO },
  };
}

export default function ModalAcompanhamento({ alunoId, alunoNome, onClose, onSubmit }: ModalAcompanhamentoProps) {
  const [peso, setPeso] = useState('');
  const [relato, setRelato] = useState('');
  const [feedback, setFeedback] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [metas, setMetas] = useState<MetasForm>(METAS_VAZIAS);
  const [cicloAtivado, setCicloAtivado] = useState(false);
  const [metasDias, setMetasDias] = useState<Record<keyof MetasPorDia, DiaMetaForm>>(criarDiasVazios);
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
        setCicloAtivado(m.is_ciclo_ativado === true);
        if (m.metas_por_dia) {
          const dias = criarDiasVazios();
          for (const dia of DIAS_ORDEM) {
            const v = m.metas_por_dia[dia];
            if (!v) continue;
            dias[dia] = {
              kcal: v.kcal != null ? String(v.kcal) : '',
              carb: v.carb != null ? String(v.carb) : '',
              prot: v.prot != null ? String(v.prot) : '',
              gord: v.gord != null ? String(v.gord) : '',
            };
          }
          setMetasDias(dias);
        }
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

  function updateDia(dia: keyof MetasPorDia, campo: keyof DiaMetaForm, valor: string) {
    setMetasDias(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor } }));
  }

  // Copia os valores da Meta Base para todos os 7 dias
  function preencherComBase() {
    const dias = { ...metasDias };
    for (const dia of DIAS_ORDEM) {
      dias[dia] = {
        kcal: metas.kcal,
        carb: metas.carbo,
        prot: metas.proteina,
        gord: metas.gordura,
      };
    }
    setMetasDias(dias);
  }

  const baseKcal = metaNumero(metas.kcal);
  const totalSemana = cicloAtivado
    ? DIAS_ORDEM.reduce((acc, dia) => {
        const n = Number(metasDias[dia].kcal);
        const kcalDia = metasDias[dia].kcal.trim() && !isNaN(n) && n > 0 ? n : (baseKcal ?? 0);
        return acc + kcalDia;
      }, 0)
    : baseKcal ? baseKcal * 7 : 0;
  const mediaSemana = Math.round(totalSemana / 7);

  async function handleSubmit() {
    setError('');
    const temMeta = Object.values(metas).some(v => v.trim());
    const metasPorDia: MetasPorDia = {};
    for (const dia of DIAS_ORDEM) {
      const v = metasDias[dia];
      const kcal = metaNumero(v.kcal);
      const carb = metaNumero(v.carb);
      const prot = metaNumero(v.prot);
      const gord = metaNumero(v.gord);
      if (kcal != null || carb != null || prot != null || gord != null) {
        metasPorDia[dia] = { kcal, carb, prot, gord };
      }
    }
    const temCiclo = cicloAtivado && Object.keys(metasPorDia).length > 0;

    if (!relato.trim() && !feedback.trim() && !peso && fotos.every(f => !f.trim()) && !temMeta && !temCiclo) {
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
        metas_por_dia: cicloAtivado ? metasPorDia : null,
        is_ciclo_ativado: cicloAtivado,
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
              <label className={`${labelCls} mb-0`}>
                {cicloAtivado ? 'Meta Base (fallback)' : 'Ajuste de Metas (Macros)'}
              </label>
              {prefillOk && <span className="text-[10px] text-muted-steel">pré-preenchido do último</span>}
            </div>
            <p className="text-[11px] text-[#6C6C74] mb-3">
              {cicloAtivado
                ? 'Vale como padrão para os dias sem ajuste no ciclo abaixo.'
                : 'Define o gráfico de dieta do aluno. Deixe em branco para não alterar.'}
            </p>
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

            {/* Ciclo de Carboidratos / Metas por Dia */}
            <div className="mt-3 pt-3 border-t border-line">
              <button
                role="switch"
                aria-checked={cicloAtivado}
                onClick={() => setCicloAtivado(v => !v)}
                className="w-full flex items-center justify-between gap-3 py-1 transition-all"
              >
                <span className="text-[11px] font-bold text-muted-steel flex items-center gap-1.5">
                  <Flame size={13} className="text-accent-light" /> Ciclo de Carboidratos / Metas por Dia
                </span>
                <span className={`relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors duration-200 ${cicloAtivado ? 'bg-accent' : 'bg-zinc-700'}`}>
                  <span className={`inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow transition-transform duration-200 ${cicloAtivado ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                </span>
              </button>
            </div>

            {cicloAtivado && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className={`${labelCls} mb-0`}>Metas por Dia</p>
                  <button onClick={preencherComBase} className="btn-ghost !py-1 text-[10px]">
                    Preencher com a Meta Base
                  </button>
                </div>
                <p className="text-[11px] text-[#6C6C74]">Dias em branco herdam a Meta Base. Ajuste apenas os dias de High/Low Carb.</p>

                <div className="grid grid-cols-[70px_1fr_1fr_1fr_1fr] gap-1.5 items-center">
                  <span />
                  {(['kcal', 'carb', 'prot', 'gord'] as const).map(h => (
                    <span key={h} className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-steel">
                      {h === 'kcal' ? 'Kcal' : h}
                    </span>
                  ))}
                  {DIAS_ORDEM.map(d => {
                    const hoje = diaSemanaSP() === Number(d);
                    return (
                      <div key={d} className="contents">
                        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${hoje ? 'text-accent-light' : 'text-muted-steel'}`}>
                          {DIAS_LABEL[d]}
                          {hoje && <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                        </span>
                        <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metasDias[d].kcal} onChange={e => updateDia(d, 'kcal', e.target.value)} placeholder={baseKcal ? String(baseKcal) : '—'} /></div>
                        <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metasDias[d].carb} onChange={e => updateDia(d, 'carb', e.target.value)} placeholder={metas.carbo || '—'} /></div>
                        <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metasDias[d].prot} onChange={e => updateDia(d, 'prot', e.target.value)} placeholder={metas.proteina || '—'} /></div>
                        <div className="field-bevel-sm"><input type="number" min={0} inputMode="numeric" value={metasDias[d].gord} onChange={e => updateDia(d, 'gord', e.target.value)} placeholder={metas.gordura || '—'} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Resumo Semanal */}
            <div className="mt-3 bg-[#101012] border border-accent/25 clip-bevel-sm p-3">
              <p className="text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-accent-light mb-2 flex items-center gap-1.5">
                <BarChart3 size={11} /> Resumo Semanal
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-muted-steel">Total da Semana</p>
                  <p className="font-display text-xl text-bone stat-number tabular-nums">
                    {totalSemana.toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-muted-steel">kcal</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-steel">Média Calórica Diária</p>
                  <p className="font-display text-xl text-bone stat-number tabular-nums">
                    {mediaSemana.toLocaleString('pt-BR')} <span className="text-[10px] font-normal text-muted-steel">kcal</span>
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-[#6C6C74] mt-2">
                {cicloAtivado
                  ? 'Soma dos 7 dias (dias em branco usam a Meta Base).'
                  : 'Meta Base multiplicada por 7 dias.'}
              </p>
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
