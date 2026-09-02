import React, { useRef, useState, useEffect } from 'react';
import { toPng, toBlob } from 'html-to-image';
import { 
  X, 
  Share2, 
  Download, 
  Check, 
  Flame, 
  Loader2, 
  Copy, 
  Image as ImageIcon,
  Sparkles,
  Clock,
} from 'lucide-react';
import { haptics } from '../../utils/haptics';
import { LogoWordmark } from '../icons/AppIcons';

export interface WorkoutStoryData {
  treinoNome: string;
  subtitulo?: string;
  duracaoSegundos: number;
  diasTreinadosNaSemana: number;
  metaDiasSemana: number;
  totalSeriesValidas: number;
  maiorCarga?: {
    exercicioNome: string;
    cargaKg: number;
    reps?: number;
  } | null;
  dataISO?: string;
  alunoNome?: string;
  cardioMeta?: {
    duracaoMinHoje: number;
    acumuladoSemanaMin: number;
    metaSemanalMin: number;
  } | null;
}

interface WorkoutStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: WorkoutStoryData | null;
}

// Opções de imagens aesthetic em P&B com pesos / treino
const BACKGROUND_PRESETS = [
  {
    id: 'aesthetic-barbell',
    label: 'Barra & Pegada',
    url: 'https://images.unsplash.com/photo-1646492169621-d8da8016354a?fm=jpg&q=80&w=1200&auto=format&fit=crop',
    position: 'center 38%',
  },
  {
    id: 'dumbbells-grit',
    label: 'Halteres & Chão',
    url: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?fm=jpg&q=80&w=1200&auto=format&fit=crop',
    position: 'center center',
  },
  {
    id: 'aesthetic-back',
    label: 'Foco & Costas',
    url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?fm=jpg&q=80&w=1200&auto=format&fit=crop',
    position: 'center 30%',
  },
  {
    id: 'iron-plates',
    label: 'Anilhas de Ferro',
    url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?fm=jpg&q=80&w=1200&auto=format&fit=crop',
    position: 'center center',
  },
];

function formatarDataExtensa(isoString?: string): string {
  if (!isoString) return 'Hoje';
  try {
    const d = isoString.includes('T') ? new Date(isoString) : new Date(isoString + 'T12:00:00');
    if (isNaN(d.getTime())) return 'Hoje';
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).replace('.', '');
  } catch {
    return 'Hoje';
  }
}

function formatarDuracaoStory(segundos: number): string {
  const mins = Math.max(1, Math.round(segundos / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function WorkoutStoryModal({ isOpen, onClose, data }: WorkoutStoryModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_PRESETS[0]);
  const [metricMode, setMetricMode] = useState<'dias' | 'series'>('dias');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isStickerMode, setIsStickerMode] = useState(false);

  // Fecha com ESC
  useEffect(() => {
    if (isOpen) setIsStickerMode(false);
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  const duracaoFormatada = formatarDuracaoStory(data.duracaoSegundos || 0);
  const diasFormatado = data.metaDiasSemana > 0
    ? `${data.diasTreinadosNaSemana} / ${data.metaDiasSemana} dias`
    : `${data.diasTreinadosNaSemana} dias`;
  const seriesFormatadas = `${data.totalSeriesValidas || 0} séries`;
  const dataFormatada = formatarDataExtensa(data.dataISO);
  const metaCardio = data.cardioMeta;
  const consistenciaDias = data.metaDiasSemana > 0
    ? `${data.diasTreinadosNaSemana} de ${data.metaDiasSemana} dias`
    : `${data.diasTreinadosNaSemana} dias`;
  const metaDiasAtingida = data.metaDiasSemana > 0 && data.diasTreinadosNaSemana >= data.metaDiasSemana;

  // Opções de exportação: no Modo Adesivo o PNG sai transparente
  // (html-to-image já usa fundo transparente por padrão; o '#000000'
  // é só para o modo Padrão).
  function exportOptions(): Parameters<typeof toBlob>[1] {
    return {
      cacheBust: true,
      pixelRatio: isStickerMode ? 3 : 2.5,
      quality: 0.95,
      fetchRequestInit: { mode: 'cors' },
      backgroundColor: isStickerMode ? undefined : '#000000',
    };
  }

  // Geração da Imagem em alta resolução
  async function generateBlob(): Promise<Blob | null> {
    const node = isStickerMode ? stickerRef.current : cardRef.current;
    if (!node) return null;
    try {
      return await toBlob(node, exportOptions());
    } catch (err) {
      // Fallback sem cross-origin styling
      return await toBlob(node, {
        cacheBust: true,
        pixelRatio: 2,
        quality: 0.9,
        skipFonts: true,
        backgroundColor: isStickerMode ? undefined : '#000000',
      });
    }
  }

  // Texto formatado para redes sociais
  const textoCompartilhamento = `🔥 *Treino Concluído no LOS GYM!* 💪\n\n🏋️‍♂️ *${data.treinoNome || 'Treino'}*\n⏱️ Duração: ${duracaoFormatada}\n📊 ${metaCardio ? `Cardio: ${metaCardio.duracaoMinHoje} min hoje · ${metaCardio.acumuladoSemanaMin}/${metaCardio.metaSemanalMin} min na semana` : metricMode === 'dias' ? `Sequência: ${diasFormatado}` : `Séries: ${seriesFormatadas}`}\n${data.maiorCarga && data.maiorCarga.cargaKg > 0 ? `⚡ Maior carga: ${data.maiorCarga.exercicioNome} (${data.maiorCarga.cargaKg} kg)\n` : ''}📅 ${dataFormatada}\n\n#LOSGYM #TreinoPago #Foco`;

  // Compartilhar Nativo (Celular ou navegadores com Web Share)
  async function handleShareNativo() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      const blob = await generateBlob();
      if (!blob) throw new Error('Não foi possível gerar a imagem.');

      const fileName = `losgym-${(data?.treinoNome || 'treino').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Treino Concluído — ${data?.treinoNome}`,
          text: textoCompartilhamento,
        });
        haptics.success();
        setFeedback('Compartilhado com sucesso!');
      } else {
        await handleDownload();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        await handleDownload();
      }
    } finally {
      setIsExporting(false);
    }
  }

  // Download do arquivo PNG
  async function handleDownload() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      const node = isStickerMode ? stickerRef.current : cardRef.current;
      if (!node) return;
      let dataUrl: string;
      try {
        dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: isStickerMode ? 3 : 2.5,
          quality: 0.95,
          fetchRequestInit: { mode: 'cors' },
          backgroundColor: isStickerMode ? undefined : '#000000',
        });
      } catch {
        dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          quality: 0.9,
          skipFonts: true,
          backgroundColor: isStickerMode ? undefined : '#000000',
        });
      }

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `losgym-story-${(data?.treinoNome || 'treino').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      haptics.success();
      setFeedback('Imagem PNG baixada! Pronta para postar no Story ou WhatsApp.');
    } catch (e) {
      setFeedback('Erro ao gerar imagem. Tente copiar para a área de transferência.');
    } finally {
      setIsExporting(false);
    }
  }

  // Copiar Imagem para Área de Transferência (Ctrl + V direto)
  async function handleCopy() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);
    try {
      const blob = await generateBlob();
      if (!blob) throw new Error('Não foi possível capturar o card.');
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        haptics.success();
        setCopied(true);
        setFeedback('Imagem copiada! Cole com Ctrl+V no WhatsApp Web, Instagram ou Chat.');
        setTimeout(() => setCopied(false), 3000);
      } else {
        await handleDownload();
      }
    } catch (e) {
      await handleDownload();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="relative bg-[#0E0E11] border border-line clip-bevel max-w-4xl w-full mx-auto my-auto shadow-[0_20px_70px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col md:flex-row gap-6 p-4 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Botão Fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-zinc-900/80 border border-zinc-700/60 text-muted-steel hover:text-bone hover:border-zinc-500 flex items-center justify-center transition-colors shadow-md"
          title="Fechar (ESC)"
        >
          <X size={16} />
        </button>

        {/* COLUNA ESQUERDA: Story Card Visual 9:16 */}
        <div className="relative flex flex-col items-center justify-center shrink-0 w-full md:w-auto">
          <div className="text-[11px] font-display uppercase tracking-[0.14em] text-muted-steel mb-2 flex items-center gap-1.5">
            <Sparkles size={12} className="text-accent" />
            {isStickerMode ? 'MODO ADESIVO · 9:16' : 'STORY CARD · 9:16'}
          </div>

          {isStickerMode ? (
            <>
              {/* Fundo quadriculado sutil APENAS como referência visual (fica FORA do captureRef, não é exportado) */}
              <div
                className="pointer-events-none absolute inset-0 opacity-15"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h12v12H0V0zm12 12h12v12H12V12z' fill='%23888888'/%3E%3C/svg%3E")`,
                  backgroundSize: '24px 24px',
                }}
              />

              {/* Proporção 9:16 apenas para o preview (o PNG recorta só o sticker) */}
              <div className="relative w-[320px] sm:w-[337px] h-[570px] sm:h-[600px]">
                {/* Apenas o adesivo é capturado (stickerRef): logo + título + músculos + métricas.
                    fundo 100% transparente nas bordas, nada de glass/foto/marca, sem chip FINALIZADO e sem rodapés */}
                <div
                  ref={stickerRef}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex w-[290px] sm:w-[310px] flex-col gap-3.5"
                >
                  {/* Logo LOS GYM */}
                  <div className="flex justify-between items-start">
                    <LogoWordmark size="sm" />
                  </div>

                  {/* Título do Treino + Músculos */}
                  <div>
                    <div className="font-display text-[10.5px] tracking-[0.18em] text-[#FF7A3D] flex items-center gap-1.5 uppercase">
                      <span className="w-4 h-[2px] bg-accent" />
                      TREINO FINALIZADO
                    </div>
                    <h2 className="font-display font-normal uppercase text-[24px] sm:text-[26px] leading-[1.05] text-white mt-1">
                      {data.treinoNome || 'Treino Realizado'}
                    </h2>
                    {data.subtitulo && (
                      <p className="text-[12px] sm:text-[12.5px] text-[#D8D7DC] mt-0.5 font-medium line-clamp-1">
                        {data.subtitulo}
                      </p>
                    )}
                  </div>

                  {/* Linha de Métricas */}
                  <div className="flex gap-2">
                    <div
                      className="flex-1 rounded-[10px] border border-white/10 p-2.5 sm:p-3"
                      style={{
                        backgroundColor: 'rgba(21,21,23,0.85)',
                        clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
                      }}
                    >
                      <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.05em] text-[#9A9AA2]">
                        <Clock size={10} className="text-[#FF7A3D]" />
                        Duração
                      </div>
                      <div className="font-display text-[18px] tracking-[0.01em] text-white sm:text-[19px]">{duracaoFormatada}</div>
                    </div>
                    <div
                      className="flex-1 rounded-[10px] border border-white/10 p-2.5 sm:p-3"
                      style={{
                        backgroundColor: 'rgba(21,21,23,0.85)',
                        clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
                      }}
                    >
                      <div className="mb-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.05em] text-[#9A9AA2]">
                        <Flame size={10} className="text-[#FF7A3D]" />
                        {metricMode === 'dias' ? 'Sequência' : 'Séries'}
                      </div>
                      <div className="font-display text-[18px] tracking-[0.01em] text-white sm:text-[19px]">
                        {metricMode === 'dias' ? diasFormatado : seriesFormatadas}
                      </div>
                    </div>
                  </div>

                  {/* Maior Carga / Consistência */}
                  {data.maiorCarga && data.maiorCarga.cargaKg > 0 ? (
                    <div
                      className="flex items-center gap-2.5 rounded-[10px] border border-accent/40 p-2.5 sm:p-3"
                      style={{ background: 'linear-gradient(90deg, rgba(255,90,31,0.18), rgba(255,90,31,0.03))' }}
                    >
                      <svg className="flex-none" viewBox="0 0 100 100" width="16" height="16" style={{ filter: 'drop-shadow(0 0 3px #ff7300) drop-shadow(0 0 8px rgba(255,115,0,0.5))' }}>
                        <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="mb-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[#FF7A3D]">
                          Maior Carga do Dia
                        </div>
                        <div className="truncate text-[13px] font-bold text-white">
                          {data.maiorCarga.exercicioNome} — {data.maiorCarga.cargaKg} kg
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2.5 rounded-[10px] border border-accent/40 p-2.5 sm:p-3"
                      style={{ background: 'linear-gradient(90deg, rgba(255,90,31,0.18), rgba(255,90,31,0.03))' }}
                    >
                      <svg className="flex-none" viewBox="0 0 100 100" width="16" height="16" style={{ filter: 'drop-shadow(0 0 3px #ff7300) drop-shadow(0 0 8px rgba(255,115,0,0.5))' }}>
                        <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="mb-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[#FF7A3D]">
                          Consistência
                        </div>
                        <div className="truncate text-[13px] font-bold text-white">Meta Semanal Concluída 🔥</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div
              ref={cardRef}
            className="relative w-[320px] sm:w-[337px] h-[570px] sm:h-[600px] overflow-hidden bg-black select-none shadow-[0_30px_70px_-20px_rgba(0,0,0,0.9)]"
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
            }}
          >
            {/* Foto de fundo aesthetic em P&B */}
            <div 
              className="absolute inset-0 bg-cover transition-all duration-300"
              style={{
                backgroundImage: `url('${selectedBg.url}')`,
                backgroundPosition: selectedBg.position,
                filter: 'grayscale(1) contrast(1.25) brightness(1.02)',
              }}
            />

            {/* Scrim Superior */}
            <div 
              className="absolute left-0 right-0 top-0 h-[16%] pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
              }}
            />

            {/* Scrim Inferior */}
            <div 
              className="absolute left-0 right-0 bottom-0 h-[12%] pointer-events-none"
              style={{
                background: 'linear-gradient(0deg, rgba(6,6,7,0.75) 0%, rgba(6,6,7,0) 100%)',
              }}
            />

            {/* Listras Chanfradas 115° */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'repeating-linear-gradient(115deg, rgba(255,90,31,0.08) 0 3px, transparent 3px 30px)',
                mixBlendMode: 'screen',
              }}
            />

            {/* Conteúdo do Card */}
            <div className="relative z-10 h-full flex flex-col p-[20px] sm:p-[22px] justify-between">
              
              {/* TOPO: Marca e Status */}
              <div className="flex items-center justify-between gap-2">
                <div 
                  className="flex items-center gap-2.5 px-3 py-2 border border-white/10"
                  style={{
                    backgroundColor: 'rgba(6,6,7,0.65)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <LogoWordmark size="sm" />
                </div>

                <div 
                  className="text-[9px] font-extrabold tracking-[0.08em] text-[#FF7A3D] border border-accent/50 px-2.5 py-1.5 uppercase flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'rgba(6,6,7,0.65)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A3D] animate-pulse" />
                  Finalizado
                </div>
              </div>

              {/* MEIO */}
              <div className="flex-1" />

              {/* RODAPÉ: Painel de Informações e Métricas */}
              <div 
                className="flex flex-col gap-3 p-4 border border-white/10 border-l-[3px] border-l-accent"
                style={{
                  backgroundColor: 'rgba(6,6,7,0.85)',
                  backdropFilter: 'blur(5px)',
                }}
              >
                {/* Cabeçalho do Treino */}
                <div>
                  <div className="font-display text-[10.5px] tracking-[0.18em] text-[#FF7A3D] flex items-center gap-1.5 uppercase">
                    <span className="w-4 h-[2px] bg-accent" />
                    TREINO FINALIZADO
                  </div>
                  <h2 className="font-display font-normal uppercase text-[24px] sm:text-[26px] leading-[1.05] text-white mt-1">
                    {data.treinoNome || 'Treino Realizado'}
                  </h2>
                  {data.subtitulo && (
                    <p className="text-[12px] sm:text-[12.5px] text-[#D8D7DC] mt-0.5 font-medium line-clamp-1">
                      {data.subtitulo}
                    </p>
                  )}
                </div>

                {/* Linha de Métricas */}
                <div className="flex gap-2">
                  {/* Chip Duração */}
                  <div 
                    className="flex-1 p-2.5 sm:p-3 border border-white/10"
                    style={{
                      backgroundColor: 'rgba(21,21,23,0.85)',
                      clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
                    }}
                  >
                    <div className="text-[9px] text-[#9A9AA2] uppercase tracking-[0.05em] font-bold mb-0.5 flex items-center gap-1">
                      <Clock size={10} className="text-[#FF7A3D]" />
                      Duração
                    </div>
                    <div className="font-display text-[18px] sm:text-[19px] text-white tracking-[0.01em]">
                      {duracaoFormatada}
                    </div>
                  </div>

                  {/* Chip Volume ou Séries */}
                  <div 
                    className="flex-1 p-2.5 sm:p-3 border border-white/10"
                    style={{
                      backgroundColor: 'rgba(21,21,23,0.85)',
                      clipPath: 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
                    }}
                  >
                    <div className="text-[9px] text-[#9A9AA2] uppercase tracking-[0.05em] font-bold mb-0.5 flex items-center gap-1">
                      <Flame size={10} className="text-[#FF7A3D]" />
                      {metricMode === 'dias' ? 'Sequência' : 'Séries'}
                    </div>
                    <div className="font-display text-[18px] sm:text-[19px] text-white tracking-[0.01em]">
                      {metricMode === 'dias' ? diasFormatado : seriesFormatadas}
                    </div>
                  </div>
                </div>

                {/* Card de Destaque / Maior Carga do Treino */}
                {data.maiorCarga && data.maiorCarga.cargaKg > 0 ? (
                  <div 
                    className="flex items-center gap-2.5 p-2.5 sm:p-3 border border-accent/40"
                    style={{
                      background: 'linear-gradient(90deg, rgba(255,90,31,0.18), rgba(255,90,31,0.03))',
                    }}
                  >
                    <div className="w-10 h-10 flex-none flex items-center justify-center relative">
                      {/* Glass panel with hexagonal clip-path */}
                      <div className="absolute inset-0" style={{
                        background: 'linear-gradient(135deg, rgba(50,50,55,0.3) 0%, rgba(15,15,20,0.7) 100%)',
                        backdropFilter: 'blur(12px)',
                        clipPath: 'polygon(15% 0, 100% 0, 100% 85%, 85% 100%, 0 100%, 0 15%)',
                        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9), inset 0 0 10px rgba(255,115,0,0.1)',
                      }} />
                      {/* Neon border */}
                      <svg className="absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ filter: 'url(#neon-glow)' }}>
                        <defs>
                          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="blur"/>
                            <feMerge>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        <polygon points="15,0 100,0 100,85 85,100 0,100 0,15" fill="none" stroke="#ff7300" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      </svg>
                      {/* Neon Crown + Barbell icon */}
                      <svg className="absolute inset-0 m-auto" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" width="55%" height="55%" style={{ filter: 'url(#neon-glow)' }}>
                        <defs>
                          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="blur"/>
                            <feMerge>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[8.5px] text-[#FF7A3D] uppercase tracking-[0.06em] font-extrabold mb-0.5">
                        Maior Carga do Dia
                      </div>
                      <div className="text-[13px] font-bold text-white truncate">
                        {data.maiorCarga.exercicioNome} — {data.maiorCarga.cargaKg} kg
                      </div>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-2.5 p-2.5 sm:p-3 border border-accent/40"
                    style={{
                      background: 'linear-gradient(90deg, rgba(255,90,31,0.18), rgba(255,90,31,0.03))',
                    }}
                  >
                    <div className="w-7 h-7 flex-none flex items-center justify-center relative">
                      <svg className="absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ filter: 'url(#neon-glow-flame)' }}>
                        <defs>
                          <filter id="neon-glow-flame" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="2" result="blur"/>
                            <feMerge>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="blur"/>
                              <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                          </filter>
                        </defs>
                        <polygon points="5,0 100,0 100,95 95,100 0,100 0,5" fill="none" stroke="#ff7300" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      </svg>
                      <svg className="relative z-10" viewBox="0 0 100 100" width="13" height="13" style={{ filter: 'drop-shadow(0 0 3px #ff7300) drop-shadow(0 0 8px rgba(255,115,0,0.5))' }}>
                        <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-[8.5px] text-[#FF7A3D] uppercase tracking-[0.06em] font-extrabold mb-0.5">
                        Consistência
                      </div>
                      <div className="text-[13px] font-bold text-white truncate">
                        Meta Semanal Concluída 🔥
                      </div>
                    </div>
                  </div>
                )}

                {/* Marca d'água */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9.5px] text-[#8E8E96]">
                  <span>Feito com <b className="text-[#C9C8CC] font-bold">LOS GYM</b></span>
                  <span>{dataFormatada}</span>
                </div>
              </div>

            </div>
          </div>
          )}
        </div>

        {/* COLUNA DIREITA: Controles, Personalização & Compartilhamento */}
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 text-accent font-bold text-xs uppercase tracking-wider mb-1">
                <Flame size={14} /> Treino Registrado!
              </div>
              <h3 className="font-display text-2xl text-bone tracking-wide">
                COMPARTILHE NAS REDES SOCIAIS
              </h3>
              <p className="text-xs text-muted-steel leading-relaxed">
                Gere o Story em alta resolução (1080×1920) pronto para o Instagram Stories, WhatsApp Status, grupos ou amigos.
              </p>
            </div>

            {!isStickerMode && (
              <div className="space-y-2">
                {/* Seletor de Foto Aesthetic de Fundo */}
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel flex items-center gap-1.5">
                  <ImageIcon size={13} className="text-accent" /> Estilo da Foto de Fundo
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                  {BACKGROUND_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        haptics.selection();
                        setSelectedBg(preset);
                      }}
                      className={`flex items-center gap-2 p-2 text-left border clip-bevel-sm transition-all ${
                        selectedBg.id === preset.id
                          ? 'border-accent bg-accent/15 text-bone font-semibold shadow-glow-sm'
                          : 'border-line bg-panel hover:border-zinc-600 text-muted-steel hover:text-bone'
                      }`}
                    >
                      <div 
                        className="w-8 h-8 rounded shrink-0 bg-cover border border-line"
                        style={{
                          backgroundImage: `url('${preset.url}')`,
                          backgroundPosition: preset.position,
                          filter: 'grayscale(1) contrast(1.2)',
                        }}
                      />
                      <span className="text-[12px] truncate">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isStickerMode && (
              <p className="text-[10.5px] italic text-muted-steel">
                A foto só aparece no modo Padrão — no Modo Adesivo o fundo é transparente.
              </p>
            )}

            {/* Alternador de Métrica */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel">
                Exibir no Card:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    haptics.selection();
                    setMetricMode('dias');
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold border clip-bevel-sm transition-all ${
                    metricMode === 'dias'
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-line bg-panel text-muted-steel'
                  }`}
                >
                  Dias na Semana
                </button>
                <button
                  onClick={() => {
                    haptics.selection();
                    setMetricMode('series');
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold border clip-bevel-sm transition-all ${
                    metricMode === 'series'
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-line bg-panel text-muted-steel'
                  }`}
                >
                  Total de Séries
                </button>
              </div>
            </div>

            {/* Modo Adesivo (Sticker Mode) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel flex items-center gap-1.5">
                <ImageIcon size={11} className="text-accent" /> Modo Adesivo
              </label>
              <button
                role="switch"
                aria-checked={isStickerMode}
                onClick={() => {
                  haptics.selection();
                  setIsStickerMode(v => !v);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 border clip-bevel-sm transition-all bg-panel border-line hover:border-zinc-600"
              >
                <span className="text-xs font-bold text-muted-steel">
                  {isStickerMode ? 'Ligado' : 'Desligado'}
                </span>
                <span
                  className={`relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors duration-200 ${
                    isStickerMode ? 'bg-accent' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow transition-transform duration-200 ${
                      isStickerMode ? 'translate-x-[22px]' : 'translate-x-[3px]'
                    }`}
                  />
                </span>
              </button>
            </div>

            {/* Feedback Message */}
            {feedback && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-ok/10 text-ok border border-ok/25 clip-bevel-sm animate-fade-in">
                <Check size={14} className="shrink-0" />
                <span>{feedback}</span>
              </div>
            )}
          </div>

          {/* Botões de Redes Sociais & Ações */}
          <div className="space-y-2.5 pt-2 border-t border-line">
            {/* Botão de Compartilhamento Nativo / Stories */}
            <button
              onClick={() => void handleShareNativo()}
              disabled={isExporting}
              className="btn-forge btn-full py-3 text-xs sm:text-sm flex items-center justify-center gap-2 shadow-plate"
            >
              {isExporting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Share2 size={16} />
              )}
              <span>Compartilhar</span>
            </button>

            {/* Ações Secundárias: Baixar PNG & Copiar */}
            <div className="flex gap-2">
              <button
                onClick={() => void handleDownload()}
                disabled={isExporting}
                className="btn-steel flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                <span>Baixar PNG HD</span>
              </button>

              <button
                onClick={() => void handleCopy()}
                disabled={isExporting}
                className="btn-steel flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                <span>{copied ? 'Copiado!' : 'Copiar Imagem (Ctrl+V)'}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full text-center py-1.5 text-xs text-muted-steel hover:text-bone transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

