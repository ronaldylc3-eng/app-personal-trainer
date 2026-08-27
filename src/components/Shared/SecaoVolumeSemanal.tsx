// =============================================================
// Secao "VOLUME MUSCULAR SEMANAL" — reutilizada pelo Aluno
// (Progressao) e pelo Gestor (ProntuarioProgressao).
// Agrupa EXCLUSIVAMENTE por Músculo Principal (sem porções).
// =============================================================

import { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { agregarVolumeSemanal, rotuloSemana } from '../../utils/volumeSemanal';
import type { SessaoComProgresso } from '../../types';

export default function SecaoVolumeSemanal({ sessoes, genero }: {
  sessoes: SessaoComProgresso[];
  genero?: string | null;
}) {
  const [semanaOffset, setSemanaOffset] = useState(0); // 0 = semana atual

  const volume = useMemo(
    () => agregarVolumeSemanal(sessoes, semanaOffset, genero),
    [sessoes, semanaOffset, genero]
  );

  function trocarSemana(delta: -1 | 1) {
    setSemanaOffset(prev => Math.max(0, prev + delta));
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1.5">
        <p className="font-display text-[12.5px] tracking-[0.12em] text-bone flex items-center gap-2">
          <BarChart3 size={15} className="text-accent-light" />
          VOLUME MUSCULAR SEMANAL
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => trocarSemana(1)}
            title="Semana anterior"
            className="w-7 h-7 flex-none bg-panel-2 border border-line flex items-center justify-center text-muted-steel hover:text-bone hover:border-zinc-600 transition-colors clip-bevel-sm"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-display text-[11px] uppercase tracking-[0.08em] text-muted-steel min-w-[128px] text-center tabular-nums" title="Séries de trabalho (seg–dom)">
            {semanaOffset === 0 ? 'Semana atual' : `${rotuloSemana(volume.ini, volume.fim)}`}
          </span>
          <button
            onClick={() => trocarSemana(-1)}
            disabled={semanaOffset === 0}
            title="Semana seguinte"
            className="w-7 h-7 flex-none bg-panel-2 border border-line flex items-center justify-center text-muted-steel hover:text-bone hover:border-zinc-600 transition-colors clip-bevel-sm disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <p className="text-[12px] text-muted-steel mb-3.5">
        Séries de trabalho válidas por músculo principal {semanaOffset > 0 ? `(${rotuloSemana(volume.ini, volume.fim)})` : '(segunda a domingo)'}.
      </p>

      <div className="bg-panel border border-line p-5 md:p-[22px]">
        {volume.lista.length === 0 ? (
          <p className="text-[#6C6C74] text-[13px] text-center py-6">
            Nenhuma série válida nesta semana.
          </p>
        ) : (
          <>
            {volume.lista.map(vp => {
              const max = Math.max(...volume.lista.map(x => x.total));
              const pct = Math.round((vp.total / max) * 100);
              return (
                <div key={vp.principal}>
                  <div className="flex items-center justify-between text-[13.5px] font-bold mb-2 gap-2">
                    <span className="text-zinc-200 truncate min-w-0">{vp.principal}</span>
                    <span className="text-accent-light ml-2 shrink-0 stat-number tabular-nums">
                      {vp.total} série{vp.total !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 bg-panel-2 border border-line overflow-hidden mb-[18px]">
                    <div className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between text-[13.5px] text-muted-steel pt-1">
              <span>Total da semana</span>
              <b className="font-display font-normal text-accent-light text-[15px] tracking-[0.02em] stat-number">
                {volume.totalGeral} série{volume.totalGeral !== 1 ? 's' : ''}
              </b>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
