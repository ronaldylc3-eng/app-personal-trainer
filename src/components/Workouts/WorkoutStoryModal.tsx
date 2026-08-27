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
  Zap,
  Clock,
  Dumbbell,
  Send,
  MessageCircle,
} from 'lucide-react';
import { haptics } from '../../utils/haptics';

export interface WorkoutStoryData {
  treinoNome: string;
  subtitulo?: string;
  duracaoSegundos: number;
  volumeTotalKg: number;
  totalSeriesValidas: number;
  maiorCarga?: {
    exercicioNome: string;
    cargaKg: number;
    reps?: number;
  } | null;
  dataISO?: string;
  alunoNome?: string;
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

function formatarNumeroBr(num: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(num));
}

export function WorkoutStoryModal({ isOpen, onClose, data }: WorkoutStoryModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_PRESETS[0]);
  const [metricMode, setMetricMode] = useState<'volume' | 'series'>('volume');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Fecha com ESC
  useEffect(() => {
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
  const volumeFormatado = `${formatarNumeroBr(data.volumeTotalKg || 0)} kg`;
  const seriesFormatadas = `${data.totalSeriesValidas || 0} séries`;
  const dataFormatada = formatarDataExtensa(data.dataISO);

  // Geração da Imagem em alta resolução
  async function generateBlob(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    try {
      return await toBlob(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        quality: 0.95,
        backgroundColor: '#000000',
        fetchRequestInit: { mode: 'cors' },
      });
    } catch (err) {
      // Fallback sem cross-origin styling
      return await toBlob(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        quality: 0.9,
        backgroundColor: '#000000',
        skipFonts: true,
      });
    }
  }

  // Texto formatado para redes sociais
  const textoCompartilhamento = `🔥 *Treino Concluído no FitnessApp!* 💪\n\n🏋️‍♂️ *${data.treinoNome || 'Treino'}*\n⏱️ Duração: ${duracaoFormatada}\n📊 ${metricMode === 'volume' ? `Volume Total: ${volumeFormatado}` : `Séries: ${seriesFormatadas}`}\n${data.maiorCarga && data.maiorCarga.cargaKg > 0 ? `⚡ Maior carga: ${data.maiorCarga.exercicioNome} (${data.maiorCarga.cargaKg} kg)\n` : ''}📅 ${dataFormatada}\n\n#FitnessApp #TreinoPago #Foco`;

  // Compartilhar Nativo (Celular ou navegadores com Web Share)
  async function handleShareNativo() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      const blob = await generateBlob();
      if (!blob) throw new Error('Não foi possível gerar a imagem.');

      const fileName = `fitnessapp-${(data?.treinoNome || 'treino').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
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

  // Compartilhar no WhatsApp
  async function handleShareWhatsApp() {
    haptics.impact();
    setFeedback(null);
    try {
      // Baixa a imagem para o usuário anexar no WhatsApp se desejar
      void handleDownload();
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textoCompartilhamento)}`;
      window.open(url, '_blank');
      setFeedback('Abrindo WhatsApp... Imagem baixada para anexar!');
    } catch (e) {
      setFeedback('Erro ao abrir WhatsApp.');
    }
  }

  // Compartilhar no Telegram
  async function handleShareTelegram() {
    haptics.impact();
    setFeedback(null);
    try {
      void handleDownload();
      const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(textoCompartilhamento)}`;
      window.open(url, '_blank');
      setFeedback('Abrindo Telegram... Imagem baixada!');
    } catch (e) {
      setFeedback('Erro ao abrir Telegram.');
    }
  }

  // Download do arquivo PNG
  async function handleDownload() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      if (!cardRef.current) return;
      let dataUrl: string;
      try {
        dataUrl = await toPng(cardRef.current, {
          cacheBust: true,
          pixelRatio: 2.5,
          quality: 0.95,
          backgroundColor: '#000000',
          fetchRequestInit: { mode: 'cors' },
        });
      } catch {
        dataUrl = await toPng(cardRef.current, {
          cacheBust: true,
          pixelRatio: 2,
          quality: 0.9,
          backgroundColor: '#000000',
          skipFonts: true,
        });
      }

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `fitnessapp-story-${(data?.treinoNome || 'treino').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
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
        <div className="flex flex-col items-center justify-center shrink-0 w-full md:w-auto">
          <div className="text-[11px] font-display uppercase tracking-[0.14em] text-muted-steel mb-2 flex items-center gap-1.5">
            <Sparkles size={12} className="text-accent" />
            STORY CARD · 9:16
          </div>

          {/* O Card exportável em proporção 9:16 (337x600 px) */}
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
                  className="flex items-center gap-2.5 px-2.5 py-1.5 border border-white/10"
                  style={{
                    backgroundColor: 'rgba(6,6,7,0.65)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <div 
                    className="w-7 h-7 flex-none flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]"
                    style={{
                      background: 'linear-gradient(160deg, #FF7A3D, #8A2A0A)',
                      clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#170B04" strokeWidth="2.8">
                      <path d="M6.5 6.5h11v11h-11z"/>
                      <path d="M3 10v4M21 10v4"/>
                    </svg>
                  </div>
                  <div className="leading-tight">
                    <div className="font-display text-[13px] tracking-[0.03em] text-white uppercase">FITNESSAPP</div>
                    <div className="text-[9px] text-[#C9C8CC]">Treinos &amp; Dieta</div>
                  </div>
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
                      <Dumbbell size={10} className="text-[#FF7A3D]" />
                      {metricMode === 'volume' ? 'Volume' : 'Séries'}
                    </div>
                    <div className="font-display text-[18px] sm:text-[19px] text-white tracking-[0.01em]">
                      {metricMode === 'volume' ? volumeFormatado : seriesFormatadas}
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
                    <div 
                      className="w-7 h-7 flex-none flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(160deg, #FF7A3D, #8A2A0A)',
                        clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
                      }}
                    >
                      <Zap size={13} className="text-[#170B04] stroke-[2.6]" />
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
                    <div 
                      className="w-7 h-7 flex-none flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(160deg, #FF7A3D, #8A2A0A)',
                        clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
                      }}
                    >
                      <Flame size={13} className="text-[#170B04] stroke-[2.6]" />
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
                  <span>Feito com <b className="text-[#C9C8CC] font-bold">FitnessApp</b></span>
                  <span>{dataFormatada}</span>
                </div>
              </div>

            </div>
          </div>
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

            {/* Seletor de Foto Aesthetic de Fundo */}
            <div className="space-y-2">
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

            {/* Alternador de Métrica */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel">
                Exibir no Card:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    haptics.selection();
                    setMetricMode('volume');
                  }}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold border clip-bevel-sm transition-all ${
                    metricMode === 'volume'
                      ? 'border-accent bg-accent/20 text-accent'
                      : 'border-line bg-panel text-muted-steel'
                  }`}
                >
                  Volume Total (kg)
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
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-steel mb-1">
              Compartilhar Direto:
            </div>

            {/* Grid de Redes Sociais */}
            <div className="grid grid-cols-2 gap-2">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={() => void handleShareWhatsApp()}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 clip-bevel-sm font-bold text-xs transition-all shadow-sm"
              >
                <MessageCircle size={15} />
                <span>WhatsApp</span>
              </button>

              {/* Telegram */}
              <button
                type="button"
                onClick={() => void handleShareTelegram()}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#0088cc]/15 hover:bg-[#0088cc]/25 text-[#29b6f6] border border-[#0088cc]/30 clip-bevel-sm font-bold text-xs transition-all shadow-sm"
              >
                <Send size={15} />
                <span>Telegram</span>
              </button>
            </div>

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
              <span>Compartilhar nos Stories (Instagram / Celular)</span>
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

