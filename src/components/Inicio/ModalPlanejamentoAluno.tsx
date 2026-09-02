import React, { useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  X,
  CalendarRange,
  Dumbbell,
  Moon,
  Save,
  Loader2,
  AlertCircle,
  GripVertical,
  Flame,
  Info,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { DAYS_OF_WEEK, DAYS_SHORT } from '../../types';
import type { FichaCompleta, PlanejamentoItem } from '../../types';
import { diaSemanaSP } from './Inicio';
import { planejamento } from '../../services/api';

interface ModalPlanejamentoAlunoProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  fichaTreino: FichaCompleta | null;
  planoSemanaAtual: PlanejamentoItem[];
  onSucesso: (novoPlano: PlanejamentoItem[]) => void;
}

interface AlocacaoItem {
  id: string; // ID único da alocação para dnd-kit
  treinoId: string;
}

interface DiaConfig {
  descanso: boolean;
  treinos: AlocacaoItem[];
}

export default function ModalPlanejamentoAluno({
  isOpen,
  onClose,
  userId,
  fichaTreino,
  planoSemanaAtual,
  onSucesso,
}: ModalPlanejamentoAlunoProps) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [arrastandoId, setArrastandoId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const treinosValidos = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; qtdEx: number; isCardio: boolean }>();
    (fichaTreino?.treinos || []).forEach((t) => {
      const isCardio = (t.exercicios || []).length > 0 && t.exercicios.every((e) => e.categoria === 'cardio');
      map.set(t.id, {
        id: t.id,
        nome: t.letra_ou_nome,
        qtdEx: t.exercicios?.length ?? 0,
        isCardio,
      });
    });
    return map;
  }, [fichaTreino]);

  // Função para criar o estado inicial a partir do plano atual do banco
  const criarEstadoInicial = () => {
    const base: DiaConfig[] = DAYS_OF_WEEK.map(() => ({ descanso: false, treinos: [] }));
    let alocCounter = 0;

    for (const p of planoSemanaAtual) {
      if (p.dia_semana < 0 || p.dia_semana > 6) continue;
      if (p.is_descanso) {
        base[p.dia_semana].descanso = true;
      } else if (p.treino_id && treinosValidos.has(p.treino_id)) {
        alocCounter++;
        base[p.dia_semana].treinos.push({
          id: `aloc-${p.dia_semana}-${p.treino_id}-${alocCounter}`,
          treinoId: p.treino_id,
        });
      }
    }
    return base;
  };

  // Inicializa o estado dos 7 dias
  const [semanaState, setSemanaState] = useState<DiaConfig[]>(criarEstadoInicial);

  // Snapshot inicial para detectar alterações pendentes (dirty state)
  const snapshotInicial = useMemo(() => {
    const base = criarEstadoInicial();
    return JSON.stringify(base.map(d => ({
      descanso: d.descanso,
      treinos: d.treinos.map(t => t.treinoId),
    })));
  }, [planoSemanaAtual, treinosValidos]);

  const snapshotAtual = useMemo(() => {
    return JSON.stringify(semanaState.map(d => ({
      descanso: d.descanso,
      treinos: d.treinos.map(t => t.treinoId),
    })));
  }, [semanaState]);

  const temAlteracoesNaoSalvas = snapshotInicial !== snapshotAtual;

  const hoje = diaSemanaSP();

  const totalTreinosSemana = useMemo(() => {
    return semanaState.reduce((acc, d) => acc + d.treinos.length, 0);
  }, [semanaState]);

  if (!isOpen) return null;

  function handleResetar() {
    setSemanaState(criarEstadoInicial());
    setErro('');
  }

  function handleFecharComConfirmacao() {
    if (temAlteracoesNaoSalvas) {
      if (!window.confirm('Você tem alterações não salvas no calendário. Deseja descartá-las?')) {
        return;
      }
    }
    onClose();
  }

  function handleDragStart(e: DragStartEvent) {
    setArrastandoId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setArrastandoId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Encontrar dia e índice de origem
    let fromDia = -1;
    let fromIdx = -1;
    for (let d = 0; d < 7; d++) {
      const idx = semanaState[d].treinos.findIndex((a) => a.id === activeId);
      if (idx !== -1) {
        fromDia = d;
        fromIdx = idx;
        break;
      }
    }

    if (fromDia === -1 || fromIdx === -1) return;

    // Descobrir dia e posição de destino
    let toDia = fromDia;
    let toIdx = 0;

    if (overId.startsWith('dia:')) {
      toDia = Number(overId.replace('dia:', ''));
      toIdx = semanaState[toDia].treinos.length;
    } else if (overId.startsWith('aloc:')) {
      // Soltou sobre outro card de treino
      for (let d = 0; d < 7; d++) {
        const idx = semanaState[d].treinos.findIndex((a) => a.id === overId.replace('aloc:', ''));
        if (idx !== -1) {
          toDia = d;
          toIdx = idx;
          break;
        }
      }
    }

    if (toDia < 0 || toDia > 6) return;

    if (fromDia === toDia) {
      // Reordena dentro do mesmo dia
      setSemanaState((prev) =>
        prev.map((dia, i) =>
          i === fromDia ? { ...dia, treinos: arrayMove(dia.treinos, fromIdx, toIdx) } : dia
        )
      );
    } else {
      // Move de um dia para outro dia
      setSemanaState((prev) => {
        const itemMovido = prev[fromDia].treinos[fromIdx];
        return prev.map((dia, i) => {
          if (i === fromDia) {
            const novosTreinosOrigem = dia.treinos.filter((_, idx) => idx !== fromIdx);
            return {
              ...dia,
              treinos: novosTreinosOrigem,
              descanso: novosTreinosOrigem.length === 0 && dia.descanso,
            };
          }
          if (i === toDia) {
            const novosTreinosDestino = [...dia.treinos];
            novosTreinosDestino.splice(Math.min(toIdx, novosTreinosDestino.length), 0, itemMovido);
            return {
              ...dia,
              descanso: false,
              treinos: novosTreinosDestino,
            };
          }
          return dia;
        });
      });
    }
  }

  function handleToggleDescanso(diaIdx: number) {
    setErro('');
    setSemanaState((prev) => {
      const novo = [...prev];
      const dia = { ...novo[diaIdx] };
      // Só alterna descanso se o dia não tiver treinos
      if (dia.treinos.length === 0) {
        dia.descanso = !dia.descanso;
      }
      novo[diaIdx] = dia;
      return novo;
    });
  }

  async function handleSalvar() {
    if (!userId) return;
    setSalvando(true);
    setErro('');

    try {
      const itens: PlanejamentoItem[] = [];
      semanaState.forEach((dia, diaIdx) => {
        dia.treinos.forEach((a, i) => {
          itens.push({
            dia_semana: diaIdx,
            treino_id: a.treinoId,
            is_descanso: false,
            ordem: i,
          });
        });
        if (dia.descanso && dia.treinos.length === 0) {
          itens.push({
            dia_semana: diaIdx,
            treino_id: null,
            is_descanso: true,
            ordem: 0,
          });
        }
      });

      await planejamento.salvar(userId, itens);
      onSucesso(itens);
      onClose();
    } catch (e: any) {
      console.error('Erro ao salvar planejamento do aluno:', e);
      setErro(e?.message || 'Falha ao salvar planejamento. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  // Info do card sendo arrastado
  const itemArrastadoInfo = useMemo(() => {
    if (!arrastandoId) return null;
    for (const d of semanaState) {
      const aloc = d.treinos.find((t) => t.id === arrastandoId);
      if (aloc) {
        return treinosValidos.get(aloc.treinoId) || null;
      }
    }
    return null;
  }, [arrastandoId, semanaState, treinosValidos]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-panel border border-line w-full max-w-4xl max-h-[92vh] flex flex-col clip-bevel-sm shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-planejamento-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between gap-3 bg-panel-2/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 clip-bevel-sm bg-accent/15 border border-accent/30 flex items-center justify-center text-accent-light shrink-0">
              <CalendarRange size={20} />
            </div>
            <div>
              <h2 id="modal-planejamento-title" className="font-display uppercase text-base sm:text-lg text-bone tracking-wide">
                Organizar Treinos da Semana
              </h2>
              <p className="text-xs text-muted-steel">
                Arraste os treinos prescritos pelo seu treinador para os dias que preferir treinar
              </p>
            </div>
          </div>

          <button
            onClick={handleFecharComConfirmacao}
            className="text-zinc-400 hover:text-bone p-1.5 rounded hover:bg-zinc-800 transition-colors"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {erro && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 clip-bevel-sm flex items-center gap-2.5 text-xs text-red-400">
              <AlertCircle size={15} className="shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          {/* Banner de Alterações Pendentes */}
          {temAlteracoesNaoSalvas ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 clip-bevel-sm flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-300 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-400 shrink-0" />
                <span>
                  <strong>Alterações pendentes:</strong> Você moveu treinos no calendário. Clique no botão <strong>Salvar Alterações</strong> para aplicar. Caso feche ou cancele, nada será salvo.
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetar}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:text-white bg-amber-500/20 hover:bg-amber-500/30 clip-bevel-sm transition-colors shrink-0"
              >
                <RotateCcw size={12} />
                Descartar Mudanças
              </button>
            </div>
          ) : (
            <div className="p-3 bg-panel-2 border border-line clip-bevel-sm flex items-start gap-2.5 text-xs text-zinc-300">
              <Info size={16} className="text-accent-light shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-bone">Distribuição semanal: </span>
                A quantidade de treinos da semana ({totalTreinosSemana} no total) é prescrita pelo seu treinador. Arraste cada treino para o dia em que preferir treinar e confirme no botão <strong>Salvar</strong>.
              </div>
            </div>
          )}

          {/* Quadro dos 7 dias com DndKit */}
          {totalTreinosSemana === 0 ? (
            <div className="p-8 bg-zinc-900/60 border border-dashed border-line text-center space-y-2 clip-bevel-sm">
              <Dumbbell size={28} className="mx-auto text-muted-steel/60" />
              <p className="text-sm font-semibold text-bone">Nenhum treino prescrito para esta semana</p>
              <p className="text-xs text-muted-steel max-w-md mx-auto">
                Seu treinador ainda não distribuiu treinos na sua ficha semanal. Fale com seu treinador para prescrever os treinos no seu prontuário.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                {DAYS_OF_WEEK.map((nomeDia, diaIdx) => {
                  const isHoje = diaIdx === hoje;
                  const dia = semanaState[diaIdx];

                  return (
                    <ColunaDiaAluno
                      key={diaIdx}
                      diaIdx={diaIdx}
                      nomeDia={nomeDia}
                      nomeCurto={DAYS_SHORT[diaIdx]}
                      isHoje={isHoje}
                      diaConfig={dia}
                      treinosValidos={treinosValidos}
                      onToggleDescanso={() => handleToggleDescanso(diaIdx)}
                    />
                  );
                })}
              </div>

              {/* Overlay do item arrastado */}
              <DragOverlay dropAnimation={null}>
                {itemArrastadoInfo && (
                  <div className="inline-flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-accent text-bone clip-bevel-sm shadow-2xl shadow-black/80 rotate-2 cursor-grabbing">
                    <GripVertical size={13} className="text-accent shrink-0" />
                    {itemArrastadoInfo.isCardio ? (
                      <Flame size={13} className="text-orange-400 shrink-0" />
                    ) : (
                      <Dumbbell size={13} className="text-accent-light shrink-0" />
                    )}
                    <span className="text-xs font-bold whitespace-nowrap">{itemArrastadoInfo.nome}</span>
                    <span className="text-[10px] text-muted-steel">({itemArrastadoInfo.qtdEx} ex)</span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {/* Nota treino flexível */}
          <div className="p-3 bg-panel-2/50 border border-line clip-bevel-sm flex items-start gap-2.5 text-[11px] text-zinc-400">
            <Info size={14} className="text-accent-light shrink-0 mt-0.5" />
            <span>
              Dias livres ficam sem compromisso — em rotinas flexíveis você treina neles quando preferir ou aproveita para descansar.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-line flex flex-wrap items-center justify-between gap-3 bg-panel-2/70">
          <div className="flex items-center gap-2 text-xs">
            {temAlteracoesNaoSalvas ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                Alterações não salvas
              </span>
            ) : (
              <span className="text-zinc-400">
                <span className="font-bold text-bone">{totalTreinosSemana}</span> treino(s) distribuídos na semana
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {temAlteracoesNaoSalvas && (
              <button
                type="button"
                onClick={handleResetar}
                className="px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-bone hover:bg-zinc-800 clip-bevel-sm transition-colors border border-line"
              >
                Descartar
              </button>
            )}
            <button
              type="button"
              onClick={handleFecharComConfirmacao}
              className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-bone hover:bg-zinc-800 clip-bevel-sm transition-colors border border-transparent hover:border-line"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvar}
              disabled={salvando || (!temAlteracoesNaoSalvas && !planoSemanaAtual.length)}
              className={`flex items-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                temAlteracoesNaoSalvas
                  ? 'btn-forge shadow-lg shadow-accent/20 ring-2 ring-accent/50 scale-[1.02]'
                  : 'btn-forge opacity-90'
              }`}
            >
              {salvando ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// COLUNA DE DIA DO ALUNO (DROPPABLE & SORTABLE)
// =============================================================

function ColunaDiaAluno({
  diaIdx,
  nomeDia,
  nomeCurto,
  isHoje,
  diaConfig,
  treinosValidos,
  onToggleDescanso,
}: {
  diaIdx: number;
  nomeDia: string;
  nomeCurto: string;
  isHoje: boolean;
  diaConfig: DiaConfig;
  treinosValidos: Map<string, { id: string; nome: string; qtdEx: number; isCardio: boolean }>;
  onToggleDescanso: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `dia:${diaIdx}`,
  });

  const temTreinos = diaConfig.treinos.length > 0;
  const isDescanso = diaConfig.descanso && !temTreinos;

  return (
    <div
      ref={setNodeRef}
      className={`bg-panel-2 border clip-bevel-sm flex flex-col min-h-[160px] sm:min-h-[190px] transition-all duration-150 ${
        isOver
          ? 'border-accent ring-1 ring-accent/40 bg-accent/[0.04]'
          : isHoje
            ? 'border-accent/50 ring-1 ring-accent/30'
            : isDescanso
              ? 'border-sky-500/20 bg-sky-950/[0.08]'
              : 'border-line'
      }`}
    >
      {/* Header do Dia */}
      <div className={`px-2.5 py-2 border-b border-line flex items-center justify-between gap-1.5 ${isHoje ? 'bg-accent/10' : 'bg-zinc-900/50'}`}>
        <div className="flex items-center gap-1 min-w-0">
          <span className={`text-[11px] font-bold uppercase truncate ${isHoje ? 'text-accent-light' : 'text-bone'}`}>
            {nomeCurto}
          </span>
          {isHoje && (
            <span className="text-[9px] font-extrabold uppercase px-1 py-0.2 bg-accent/20 text-accent-light clip-bevel-sm">
              Hoje
            </span>
          )}
        </div>

        {/* Botão de descanso quando não tem treinos */}
        {!temTreinos && (
          <button
            type="button"
            onClick={onToggleDescanso}
            title={isDescanso ? 'Desmarcar descanso' : 'Marcar como descanso'}
            className={`p-1 rounded transition-colors ${
              isDescanso ? 'text-sky-400 bg-sky-500/15' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Moon size={11} />
          </button>
        )}
      </div>

      {/* Lista de treinos alocados (Sortable) */}
      <div className="flex-1 p-2 space-y-1.5 flex flex-col justify-start">
        <SortableContext
          items={diaConfig.treinos.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {diaConfig.treinos.map((aloc) => {
            const info = treinosValidos.get(aloc.treinoId);
            return (
              <CardTreinoArrastavel
                key={aloc.id}
                alocId={aloc.id}
                nomeTreino={info?.nome || 'Treino'}
                qtdEx={info?.qtdEx ?? 0}
                isCardio={info?.isCardio ?? false}
              />
            );
          })}
        </SortableContext>

        {/* Estado vazio / descanso */}
        {!temTreinos && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-2 rounded border border-dashed border-line/40 text-muted-steel">
            {isDescanso ? (
              <div className="space-y-1">
                <Moon size={14} className="mx-auto text-sky-400" />
                <span className="text-[10px] font-semibold text-sky-300 block">Descanso</span>
              </div>
            ) : (
              <div className="space-y-0.5">
                <span className="text-[10px] text-zinc-500 block">Livre</span>
                <span className="text-[9px] text-zinc-600 block">Arraste para cá</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================
// CARD DE TREINO ARRASTÁVEL PELO ALUNO
// =============================================================

function CardTreinoArrastavel({
  alocId,
  nomeTreino,
  qtdEx,
  isCardio,
}: {
  alocId: string;
  nomeTreino: string;
  qtdEx: number;
  isCardio: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: alocId,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative flex items-center justify-between gap-1.5 p-2 clip-bevel-sm border text-left cursor-grab active:cursor-grabbing select-none transition-all duration-150 touch-none ${
        isDragging
          ? 'opacity-30 border-accent bg-accent/10'
          : 'bg-zinc-900 border-line hover:border-accent/50 hover:bg-zinc-800/80 shadow-sm'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripVertical size={12} className="text-zinc-500 group-hover:text-accent-light shrink-0" />
        {isCardio ? (
          <Flame size={12} className="text-orange-400 shrink-0" />
        ) : (
          <Dumbbell size={12} className="text-accent-light shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold text-bone truncate leading-tight">{nomeTreino}</p>
          <p className="text-[10px] text-muted-steel">{qtdEx} ex</p>
        </div>
      </div>
    </div>
  );
}
