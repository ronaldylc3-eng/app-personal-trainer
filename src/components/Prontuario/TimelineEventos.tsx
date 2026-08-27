import { useState } from 'react';
import {
  ClipboardCheck, MessageSquare, ChevronDown, Inbox,
  Scale, Ruler, Target, Camera, Loader2,
} from 'lucide-react';
import type { EventoClinico, AcompanhamentoOs } from '../../types';

const PERIMETRO_LABELS: Record<string, string> = {
  braco_direito: 'Braço Dir.', braco_esquerdo: 'Braço Esq.',
  antebraco_direito: 'Antebraço Dir.', antebraco_esquerdo: 'Antebraço Esq.',
  peitoral: 'Peitoral', cintura: 'Cintura', abdomen: 'Abdômen', quadril: 'Quadril',
  coxa_direita: 'Coxa Dir.', coxa_esquerda: 'Coxa Esq.',
  panturrilha_direita: 'Panturrilha Dir.', panturrilha_esquerda: 'Panturrilha Esq.',
};

function formatarData(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface TimelineEventosProps {
  eventos: EventoClinico[];
  loading?: boolean;
  mensagemVazio?: string;
  submensagemVazio?: string;
}

export default function TimelineEventos({ eventos, loading = false, mensagemVazio = 'Nenhum evento clínico registrado.', submensagemVazio }: TimelineEventosProps) {
  const [expandido, setExpandido] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-panel border border-line p-8 text-center">
        <Loader2 size={20} className="text-muted-steel animate-spin mx-auto" />
        <p className="text-xs text-muted-steel mt-3">Carregando registros...</p>
      </div>
    );
  }

  if (eventos.length === 0) {
    return (
      <div className="bg-panel border border-dashed border-[#2E2E34] clip-bevel-sm p-8 text-center">
        <Inbox size={28} className="mx-auto text-[#4A4A50] mb-3" />
        <p className="text-sm text-zinc-400">{mensagemVazio}</p>
        {submensagemVazio && <p className="text-xs text-[#6C6C74] mt-1">{submensagemVazio}</p>}
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-3">
      {/* Linha vertical */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-[#2E2E34]" aria-hidden />

      {eventos.map(ev => {
        const isAvaliacao = ev.tipo === 'avaliacao';
        const av = ev.avaliacao;
        const ac = ev.acompanhamento;
        const aberto = expandido === ev.ficha_id;

        const resumo = isAvaliacao
          ? [
              av && av.peso > 0 ? `${av.peso} kg` : null,
              av && av.composicao?.percentual_gordura > 0 ? `${av.composicao.percentual_gordura}% BF` : null,
              av && av.altura > 0 ? `${av.altura} cm` : null,
            ].filter(Boolean).join(' · ') || 'Avaliação física'
          : [
              ac && ac.peso != null && ac.peso > 0 ? `${ac.peso} kg` : null,
              ac && ac.meta_kcal != null && ac.meta_kcal > 0 ? `Meta: ${ac.meta_kcal} kcal` : null,
              ac && ac.relato ? truncar(ac.relato, 60) : null,
              ac && ac.fotos?.length > 0 ? `${ac.fotos.length} foto(s)` : null,
            ].filter(Boolean).join(' · ') || 'Acompanhamento';

        return (
          <div key={ev.ficha_id} className="relative">
            {/* Ponto da timeline */}
            <div
              className={`absolute -left-6 top-4 w-[19px] h-[19px] clip-bevel-sm border-2 flex items-center justify-center ${
                isAvaliacao ? 'bg-accent/15 border-accent/40' : 'bg-sky-500/15 border-sky-500/40'
              }`}
            >
              <div className={`w-1.5 h-1.5 ${isAvaliacao ? 'bg-accent-light' : 'bg-sky-400'}`} />
            </div>

            <div className="bg-panel border border-line overflow-hidden hover:border-[#3A3A40] transition-colors duration-150">
              <button
                onClick={() => setExpandido(aberto ? null : ev.ficha_id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              >
                <div className={`w-9 h-9 clip-bevel-sm flex items-center justify-center border shrink-0 ${
                  isAvaliacao ? 'bg-accent/10 border-accent/30' : 'bg-sky-500/10 border-sky-500/30'
                }`}>
                  {isAvaliacao
                    ? <ClipboardCheck size={16} className="text-accent-light" />
                    : <MessageSquare size={16} className="text-sky-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.06em] px-2 py-0.5 border clip-bevel-sm ${
                      isAvaliacao
                        ? 'bg-accent/10 text-accent-light border-accent/30'
                        : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                    }`}>
                      {isAvaliacao ? 'Avaliação Física' : 'Acompanhamento'}
                    </span>
                    <span className="text-[11px] text-muted-steel">{formatarData(ev.data)}</span>
                  </div>
                  <p className="text-xs text-zinc-300 truncate mt-1">{resumo}</p>
                </div>

                <ChevronDown size={15} className={`text-muted-steel shrink-0 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
              </button>

              {aberto && (
                <div className="px-4 pb-4 pt-1 border-t border-line animate-slide-down">
                  {isAvaliacao && av && (
                    <div className="space-y-3 pt-3">
                      {(av.peso > 0 || av.altura > 0 || (av.composicao?.percentual_gordura ?? 0) > 0) && (
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {av.peso > 0 && <Metrica icon={<Scale size={12} />} label="Peso" valor={`${av.peso} kg`} />}
                          {av.altura > 0 && <Metrica icon={<Ruler size={12} />} label="Altura" valor={`${av.altura} cm`} />}
                          {(av.composicao?.percentual_gordura ?? 0) > 0 && <Metrica label="% Gordura" valor={`${av.composicao.percentual_gordura}%`} />}
                          {(av.composicao?.massa_magra ?? 0) > 0 && <Metrica label="M. Magra" valor={`${av.composicao.massa_magra} kg`} />}
                          {(av.composicao?.massa_gordura ?? 0) > 0 && <Metrica label="M. Gordura" valor={`${av.composicao.massa_gordura} kg`} />}
                        </div>
                      )}

                      {av.objetivo && (
                        <Detalhe icon={<Target size={12} />} titulo="Objetivo" texto={av.objetivo} />
                      )}
                      {av.anamnese && <Detalhe titulo="Anamnese" texto={av.anamnese} />}
                      {av.flexibilidade_forca && <Detalhe titulo="Flexibilidade / Força" texto={av.flexibilidade_forca} />}

                      {av.perimetros && Object.values(av.perimetros).some(v => v > 0) && (
                        <div>
                          <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1.5">Perímetros</p>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(av.perimetros)
                              .filter(([, v]) => v > 0)
                              .map(([k, v]) => (
                                <span key={k} className="text-[11px] bg-panel-2 border border-line clip-bevel-sm px-2 py-1 text-zinc-300">
                                  {PERIMETRO_LABELS[k] || k}: <span className="text-bone font-semibold">{v} cm</span>
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!isAvaliacao && ac && (
                    <div className="space-y-3 pt-3">
                      {ac.peso != null && ac.peso > 0 && (
                        <Metrica icon={<Scale size={12} />} label="Peso no dia" valor={`${ac.peso} kg`} />
                      )}
                      <MetasNutricionaisGrid ac={ac} />
                      {ac.relato && <Detalhe titulo="Relato do aluno" texto={ac.relato} />}
                      {ac.feedback && <Detalhe titulo="Feedback do gestor" texto={ac.feedback} />}
                      {ac.fotos?.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1.5 flex items-center gap-1.5">
                            <Camera size={11} /> Fotos ({ac.fotos.length})
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {ac.fotos.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden border border-line bg-panel-2 hover:border-accent/50 transition-colors">
                                <img src={url} alt={`Foto ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}...` : texto;
}

function MetasNutricionaisGrid({ ac }: { ac: AcompanhamentoOs }) {
  const itens = [
    ac.meta_kcal != null ? { label: 'Kcal', valor: String(ac.meta_kcal) } : null,
    ac.meta_proteina != null ? { label: 'Proteína', valor: `${ac.meta_proteina} g` } : null,
    ac.meta_carbo != null ? { label: 'Carboidrato', valor: `${ac.meta_carbo} g` } : null,
    ac.meta_gordura != null ? { label: 'Gordura', valor: `${ac.meta_gordura} g` } : null,
    ac.meta_fibra != null ? { label: 'Fibra', valor: `${ac.meta_fibra} g` } : null,
  ].filter((m): m is { label: string; valor: string } => m !== null);

  if (itens.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1.5 flex items-center gap-1.5">
        <Target size={11} /> Metas Nutricionais
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {itens.map(m => (
          <Metrica key={m.label} label={m.label} valor={m.valor} />
        ))}
      </div>
    </div>
  );
}

function Metrica({ icon, label, valor }: { icon?: React.ReactNode; label: string; valor: string }) {
  return (
    <div className="bg-panel-2/50 border border-line p-2.5 text-center">
      <p className="text-[10px] text-muted-steel uppercase tracking-wider font-semibold flex items-center justify-center gap-1">
        {icon} {label}
      </p>
      <p className="text-sm font-bold text-bone stat-number mt-0.5">{valor}</p>
    </div>
  );
}

function Detalhe({ titulo, texto, icon }: { titulo: string; texto: string; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted-steel uppercase tracking-[0.15em] font-semibold mb-1 flex items-center gap-1.5">
        {icon} {titulo}
      </p>
      <p className="text-xs text-zinc-300 whitespace-pre-wrap bg-panel-2/40 border border-line px-3 py-2.5 leading-relaxed">
        {texto}
      </p>
    </div>
  );
}
