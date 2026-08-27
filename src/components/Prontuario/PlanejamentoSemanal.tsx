import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable, closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CalendarRange, Moon, X, Save, Check, Loader2, AlertCircle,
  GripVertical, Dumbbell, MousePointerClick,
} from 'lucide-react';
import { fichas, planejamento } from '../../services/api';
import { DAYS_OF_WEEK, DAYS_SHORT } from '../../types';
import { useAlunoContext } from './AlunoLayout';
import type { FichaCompleta, PlanejamentoItem } from '../../types';

function erroMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Erro inesperado. Tente novamente.';
}

interface Alocacao {
  treinoId: string;
}

interface DiaState {
  descanso: boolean;
  treinos: Alocacao[];
}

function semanaVazia(): DiaState[] {
  return DAYS_OF_WEEK.map(() => ({ descanso: false, treinos: [] }));
}

// IDs do dnd-kit
const BANCO_ID = 'banco';
const bancoChipId = (treinoId: string) => `banchip:${treinoId}`;
const diaId = (dia: number) => `dia:${dia}`;
const cardId = (dia: number, idx: number) => `card:${dia}:${idx}`;

function parseDiaDeOver(id: string): number | null {
  if (id.startsWith('dia:')) return Number(id.slice(4));
  if (id.startsWith('card:')) return Number(id.split(':')[1]);
  return null;
}

export default function PlanejamentoSemanal() {
  const { aluno } = useAlunoContext();
  const alunoId = aluno?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);
  const [ficha, setFicha] = useState<FichaCompleta | null>(null);
  const [semana, setSemana] = useState<DiaState[]>(semanaVazia);
  const [snapshotSalvo, setSnapshotSalvo] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Fallback mobile: chip selecionado + toque no dia aloca
  const [chipSelecionado, setChipSelecionado] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!alunoId) return;
    let cancel = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [f, plano] = await Promise.all([
          fichas.getAtiva(alunoId, 'treino'),
          planejamento.get(alunoId),
        ]);
        if (cancel) return;
        const base = semanaVazia();
        const treinosValidos = new Set((f?.treinos || []).map(t => t.id));
        for (const p of plano) {
          if (p.dia_semana < 0 || p.dia_semana > 6) continue;
          if (p.is_descanso) {
            base[p.dia_semana].descanso = true;
          } else if (p.treino_id && treinosValidos.has(p.treino_id)) {
            base[p.dia_semana].treinos.push({ treinoId: p.treino_id });
          }
        }
        setFicha(f);
        setSemana(base);
        setSnapshotSalvo(JSON.stringify(base));
      } catch (e) {
        if (!cancel) setError(erroMsg(e));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [alunoId]);

  const sujo = useMemo(() => JSON.stringify(semana) !== snapshotSalvo, [semana, snapshotSalvo]);

  const salvarSemana = useCallback(async () => {
    if (!alunoId || !sujo) return;
    setSaveStatus('saving');
    setError('');
    try {
      const itens: PlanejamentoItem[] = [];
      semana.forEach((dia, diaIdx) => {
        dia.treinos.forEach((a, i) => {
          itens.push({ dia_semana: diaIdx, treino_id: a.treinoId, is_descanso: false, ordem: i });
        });
        if (dia.descanso && dia.treinos.length === 0) {
          itens.push({ dia_semana: diaIdx, treino_id: null, is_descanso: true, ordem: 0 });
        }
      });
      await planejamento.salvar(alunoId, itens);
      setSnapshotSalvo(JSON.stringify(semana));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(s => (s === 'saved' ? 'idle' : s)), 2000);
    } catch (e) {
      setSaveStatus('error');
      setError(erroMsg(e));
    }
  }, [alunoId, semana, sujo]);

  // -----------------------------------------------------------
  // Mutacoes locais
  // -----------------------------------------------------------

  function atualizarDia(dia: number, fn: (d: DiaState) => DiaState) {
    setSemana(prev => prev.map((d, i) => (i === dia ? fn(d) : d)));
  }

  function alocarTreino(treinoId: string, dia: number) {
    setChipSelecionado(null);
    atualizarDia(dia, d => ({
      descanso: false,
      treinos: [...d.treinos.filter(a => a.treinoId !== treinoId), { treinoId }],
    }));
  }

  function removerAlocacao(dia: number, idx: number) {
    atualizarDia(dia, d => ({ ...d, treinos: d.treinos.filter((_, i) => i !== idx) }));
  }

  function toggleDescanso(dia: number) {
    setChipSelecionado(null);
    atualizarDia(dia, d => ({ ...d, descanso: !d.descanso }));
  }

  function handleDragStart(e: DragStartEvent) {
    setArrastando(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setArrastando(null);
    if (!over) return;
    const activeStr = String(active.id);
    const overStr = String(over.id);

    // Chip do banco -> dia da semana
    if (activeStr.startsWith('banchip:')) {
      const treinoId = activeStr.slice('banchip:'.length);
      const diaAlvo = parseDiaDeOver(overStr);
      if (diaAlvo === null || diaAlvo === undefined) return;
      alocarTreino(treinoId, diaAlvo);
      return;
    }

    // Card alocado: reordenar / mover de dia / remover ao soltar no banco
    const m = activeStr.match(/^card:(\d+):(\d+)$/);
    if (!m) return;
    const fromDia = Number(m[1]);
    const fromIdx = Number(m[2]);
    const origem = semana[fromDia];
    if (!origem) return;

    if (overStr === BANCO_ID) {
      removerAlocacao(fromDia, fromIdx);
      return;
    }

    let toDia = fromDia;
    let toIdx = origem.treinos.length - 1;
    if (overStr.startsWith('dia:')) {
      toDia = Number(overStr.slice(4));
      const destino = semana[toDia];
      toIdx = destino ? destino.treinos.length : 0;
    } else if (overStr.startsWith('card:')) {
      const om = overStr.match(/^card:(\d+):(\d+)$/);
      if (om) {
        toDia = Number(om[1]);
        toIdx = Number(om[2]);
      }
    }

    if (fromDia === toDia) {
      atualizarDia(fromDia, d => ({ ...d, treinos: arrayMove(d.treinos, fromIdx, toIdx) }));
    } else {
      const movido = origem.treinos[fromIdx];
      setSemana(prev => prev.map((d, i) => {
        if (i === fromDia) return { ...d, treinos: d.treinos.filter((_, j) => j !== fromIdx) };
        if (i === toDia) {
          const inseridos = [...d.treinos];
          inseridos.splice(Math.min(toIdx, inseridos.length), 0, movido);
          return { descanso: false, treinos: inseridos };
        }
        return d;
      }));
    }
    setChipSelecionado(null);
  }

  // -----------------------------------------------------------

  const treinosFicha = useMemo(
    () => (ficha?.treinos || []).map(t => ({ id: t.id, nome: t.letra_ou_nome, qtdEx: t.exercicios?.length ?? 0 })),
    [ficha]
  );

  const diasUsados = useMemo(() => {
    const map = new Map<string, number>();
    semana.forEach(d => d.treinos.forEach(a => map.set(a.treinoId, (map.get(a.treinoId) || 0) + 1)));
    return map;
  }, [semana]);

  const totalAlocacoes = useMemo(() => semana.reduce((s, d) => s + d.treinos.length, 0), [semana]);

  function nomeTreino(id: string): string {
    return treinosFicha.find(t => t.id === id)?.nome || 'Treino removido';
  }

  const dragInfo = useMemo(() => {
    if (!arrastando) return null;
    if (arrastando.startsWith('banchip:')) {
      const id = arrastando.slice('banchip:'.length);
      return { tipo: 'chip' as const, nome: nomeTreino(id), qtdEx: treinosFicha.find(t => t.id === id)?.qtdEx ?? 0 };
    }
    const m = arrastando.match(/^card:(\d+):(\d+)$/);
    if (m) {
      const a = semana[Number(m[1])]?.treinos[Number(m[2])];
      if (a) return { tipo: 'card' as const, nome: nomeTreino(a.treinoId), qtdEx: treinosFicha.find(t => t.id === a.treinoId)?.qtdEx ?? 0 };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrastando, semana, treinosFicha]);

  if (!alunoId) return null;

  return (
    <div className="p-4 md:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Cabeçalho */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3.5">
          <div className="w-[46px] h-[46px] flex-none bg-gradient-to-br from-accent-light to-plate flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] clip-bevel">
            <CalendarRange size={22} className="text-[#170B04]" strokeWidth={2.4} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display uppercase text-[26px] leading-tight text-bone">Periodização Semanal</h2>
            <p className="text-[13.5px] text-muted-steel truncate">
              Arraste os treinos da ficha para o dia correspondente · {totalAlocacoes} alocação(ões)
              {sujo && <span className="text-amber-400"> · não salvo</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 px-2.5 py-1 clip-bevel-sm bg-panel-2 border border-line text-muted-steel text-[10px] font-semibold uppercase tracking-wider">
                <Loader2 size={11} className="animate-spin" /> Salvando...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 px-2.5 py-1 clip-bevel-sm bg-ok/10 text-ok border-ok/30 border text-[10px] font-semibold uppercase tracking-wider">
                <Check size={11} /> Salvo
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 px-2.5 py-1 clip-bevel-sm bg-red-500/10 text-red-400 border-red-500/20 border text-[10px] font-semibold uppercase tracking-wider">
                <AlertCircle size={11} /> Erro ao salvar
              </span>
            )}
            <button
              onClick={() => void salvarSemana()}
              disabled={!sujo || saveStatus === 'saving'}
              className="btn-forge disabled:opacity-50 disabled:pointer-events-none"
            >
              {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar Planejamento
            </button>
          </div>
        </div>

        {(feedback || error) && (() => {
          const isOk = !!feedback && feedback.tipo === 'ok' && !error;
          const msg = error || feedback!.msg;
          return (
            <div className={`flex items-center gap-2 clip-bevel-sm px-4 py-2.5 text-xs ${isOk ? 'bg-ok/10 text-ok border-ok/30' : 'bg-red-500/10 text-red-300 border-red-500/20'} border`}>
              <AlertCircle size={14} className="shrink-0" />
              <span className="flex-1">{msg}</span>
              <button onClick={() => { setFeedback(null); setError(''); }} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>
            </div>
          );
        })()}

        {loading ? (
          <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
            <Loader2 size={22} className="mx-auto text-muted-steel animate-spin" />
            <p className="text-xs text-muted-steel mt-3">Carregando planejamento...</p>
          </div>
        ) : !ficha ? (
          <div className="bg-panel border border-line clip-bevel-sm p-8 text-center">
            <Dumbbell size={28} className="mx-auto text-[#4A4A50] mb-3" />
            <p className="text-sm text-zinc-400">Este aluno não possui ficha de treino ativa.</p>
            <p className="text-xs text-[#6C6C74] mt-1">Crie a ficha na aba Visão Geral antes de montar a periodização.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setArrastando(null)}
          >
            {/* Banco de treinos */}
            <ZonaBanco
              fichaNome={ficha.nome}
              treinos={treinosFicha.map(t => ({ ...t, usos: diasUsados.get(t.id) || 0 }))}
              chipSelecionado={chipSelecionado}
              onSelectChip={(id) => setChipSelecionado(c => (c === id ? null : id))}
              temSelecao={!!chipSelecionado}
            />

            {/* Grade semanal */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2.5">
              {DAYS_OF_WEEK.map(({ index, name }) => (
                <ColunaDia
                  key={index}
                  dia={index}
                  estado={semana[index]}
                  nomeCurto={DAYS_SHORT[index]}
                  nomeCompleto={name}
                  hoje={false}
                  chipSelecionado={chipSelecionado}
                  onSoltarSelecionado={(treinoId) => alocarTreino(treinoId, index)}
                  onToggleDescanso={() => toggleDescanso(index)}
                  onRemover={(idx) => removerAlocacao(index, idx)}
                  nomeTreino={nomeTreino}
                  qtdExTreino={(id) => treinosFicha.find(t => t.id === id)?.qtdEx ?? 0}
                />
              ))}
            </div>

            {/* Overlay do item arrastado */}
            <DragOverlay dropAnimation={null}>
              {dragInfo && (
                <div className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-accent/60 clip-bevel-sm shadow-xl shadow-black/50 rotate-2 cursor-grabbing">
                  {dragInfo.tipo === 'card' ? <GripVertical size={12} className="text-accent shrink-0" /> : <MousePointerClick size={12} className="text-accent shrink-0" />}
                  <span className="text-xs font-bold text-bone whitespace-nowrap">{dragInfo.nome}</span>
                  <span className="text-[10px] text-muted-steel">{dragInfo.qtdEx} ex</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {!loading && ficha && (
          <p className="text-[11px] text-[#6C6C74]">
            Dias marcados como <Moon size={10} className="inline text-sky-400 -mt-0.5" /> Off aparecem como descanso no painel do aluno. O mesmo treino pode ser usado em vários dias.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================
// CHIP DE TREINO NO BANCO (draggable)
// =============================================================

function ChipBancoTreino({ id, nome, qtdEx, usos, selecionado, temSelecao, onSelect }: {
  id: string;
  nome: string;
  qtdEx: number;
  usos: number;
  selecionado: boolean;
  temSelecao: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: bancoChipId(id), data: { fonte: 'banco' } });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.detail > 0 && onSelect();
      }}
      title="Arraste para um dia ou clique para selecionar"
      className={`relative inline-flex items-center gap-2 px-3 py-2 clip-bevel-sm border text-left transition-all duration-150 touch-none ${
        selecionado
          ? 'border-accent bg-accent/15 ring-1 ring-accent/50'
          : isDragging
            ? 'border-accent/40 opacity-30'
            : 'border-line bg-panel-2 hover:border-accent/40'
      }`}
    >
      <GripVertical size={13} className={`shrink-0 ${temSelecao && !selecionado ? 'text-[#37373E]' : 'text-accent'}`} />
      <span className="text-xs font-bold text-bone">{nome}</span>
      <span className="text-[10px] text-muted-steel">{qtdEx} ex</span>
      {usos > 0 && (
        <span className="text-[9px] font-extrabold uppercase tracking-wide text-accent-light bg-accent/15 border border-accent/30 px-1.5 py-0.5">
          {usos}×
        </span>
      )}
    </button>
  );
}

// =============================================================
// ZONA DO BANCO (droppable: soltar aqui remove a alocação)
// =============================================================

function ZonaBanco({ fichaNome, treinos, chipSelecionado, onSelectChip, temSelecao }: {
  fichaNome: string;
  treinos: { id: string; nome: string; qtdEx: number; usos: number }[];
  chipSelecionado: string | null;
  onSelectChip: (id: string) => void;
  temSelecao: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANCO_ID });

  return (
    <div
      ref={setNodeRef}
      className={`bg-panel border clip-bevel-sm p-4 transition-colors duration-150 ${
        isOver ? 'border-red-400/70 bg-red-500/[0.04]' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <p className="font-display text-[12px] tracking-[0.12em] uppercase text-bone flex items-center gap-2">
          <Dumbbell size={13} className="text-accent-light" /> Banco de Treinos
        </p>
        <p className="text-[11px] text-muted-steel">
          {fichaNome}{isOver ? ' · solte para remover do calendário' : temSelecao ? ' · clique em um dia para alocar' : ' · arraste para um dia'}
        </p>
      </div>

      {treinos.length === 0 ? (
        <p className="text-xs text-muted-steel py-3 text-center">A ficha ativa não tem treinos cadastrados ainda.</p>
      ) : (
        <SortableContext items={treinos.map(t => bancoChipId(t.id))}>
          <div className="flex flex-wrap gap-2">
            {treinos.map(t => (
              <ChipBancoTreino
                key={t.id}
                {...t}
                selecionado={chipSelecionado === t.id}
                temSelecao={temSelecao}
                onSelect={() => onSelectChip(t.id)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

// =============================================================
// COLUNA DO DIA (droppable com cards ordenáveis)
// =============================================================

function ColunaDia({ dia, estado, nomeCurto, nomeCompleto, hoje, chipSelecionado, onSoltarSelecionado, onToggleDescanso, onRemover, nomeTreino, qtdExTreino }: {
  dia: number;
  estado: DiaState;
  nomeCurto: string;
  nomeCompleto: string;
  hoje: boolean;
  chipSelecionado: string | null;
  onSoltarSelecionado: (treinoId: string) => void;
  onToggleDescanso: () => void;
  onRemover: (idx: number) => void;
  nomeTreino: (id: string) => string;
  qtdExTreino: (id: string) => number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: diaId(dia) });

  return (
    <div
      ref={setNodeRef}
      onPointerUp={() => { if (chipSelecionado) onSoltarSelecionado(chipSelecionado); }}
      className={`bg-panel border clip-bevel-sm min-h-[150px] flex flex-col transition-colors duration-150 ${
        isOver
          ? 'border-accent/80 bg-accent/[0.05]'
          : hoje
            ? 'border-accent/40'
            : 'border-line'
      }`}
    >
      {/* Header do dia */}
      <div className={`px-3 pt-2.5 pb-2 border-b ${estado.descanso && estado.treinos.length === 0 ? 'border-sky-500/20' : 'border-line/70'}`}>
        <div className="flex items-center justify-between gap-1.5">
          <div className="min-w-0">
            <p className={`text-[13px] font-bold leading-none ${hoje ? 'text-accent-light' : 'text-bone'}`}>
              {nomeCurto}{hoje && <span className="ml-1.5 text-[9px] font-extrabold uppercase tracking-wider text-accent-light">hoje</span>}
            </p>
            <p className="text-[9.5px] text-muted-steel mt-1 truncate">{nomeCompleto}</p>
          </div>
          <button
            onClick={onToggleDescanso}
            disabled={estado.treinos.length > 0}
            title={estado.treinos.length > 0 ? 'Remova os treinos para marcar como Off' : estado.descanso ? 'Desmarcar descanso' : 'Marcar dia como Off (descanso)'}
            aria-pressed={estado.descanso && estado.treinos.length === 0}
            className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-1 text-[9px] font-extrabold uppercase tracking-wider border rounded transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
              estado.descanso && estado.treinos.length === 0
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                : 'bg-panel-2 text-muted-steel border-line hover:text-sky-300 hover:border-sky-500/30'
            }`}
          >
            <Moon size={10} /> Off
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 p-2 space-y-1.5">
        {estado.descanso && estado.treinos.length === 0 ? (
          <div className="h-full min-h-[86px] flex flex-col items-center justify-center text-center gap-1.5 py-3">
            <Moon size={18} className="text-sky-400/80" />
            <p className="text-[10.5px] font-semibold text-sky-300/90 uppercase tracking-wider">Descanso</p>
            <p className="text-[9.5px] text-muted-steel leading-snug">O painel do aluno sugerirá recuperação neste dia.</p>
          </div>
        ) : estado.treinos.length === 0 ? (
          <div className="h-full min-h-[86px] flex flex-col items-center justify-center text-center py-3 border border-dashed border-[#26262B] rounded-lg">
            <p className="text-[10px] text-[#6C6C74] leading-snug px-2">Arraste um treino<br />para este dia</p>
          </div>
        ) : (
          <SortableContext items={estado.treinos.map((_, i) => cardId(dia, i))} strategy={verticalListSortingStrategy}>
            {estado.treinos.map((a, i) => (
              <CardTreinoDia
                key={`${a.treinoId}-${i}`}
                idDrag={cardId(dia, i)}
                nome={nomeTreino(a.treinoId)}
                qtdEx={qtdExTreino(a.treinoId)}
                onRemover={() => onRemover(i)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// =============================================================
// CARD ALOCADO EM UM DIA (sortable)
// =============================================================

function CardTreinoDia({ idDrag, nome, qtdEx, onRemover }: {
  idDrag: string;
  nome: string;
  qtdEx: number;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idDrag });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={`group relative flex items-center gap-1.5 pl-2 pr-7 py-2 bg-panel-2 border border-line clip-bevel-sm touch-none transition-opacity ${
        isDragging ? 'opacity-30 border-dashed' : 'hover:border-accent/40'
      }`}
    >
      <GripVertical size={11} className="text-accent shrink-0 cursor-grab active:cursor-grabbing" />
      <div className="min-w-0">
        <p className="text-[11.5px] font-bold text-bone leading-none truncate">{nome}</p>
        <p className="text-[9.5px] text-muted-steel mt-0.5">{qtdEx} exercício(s)</p>
      </div>
      <button
        onPointerDown={e => { e.stopPropagation(); }}
        onClick={e => { e.stopPropagation(); onRemover(); }}
        title="Remover deste dia"
        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[#6C6C74] hover:text-red-400 transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}
