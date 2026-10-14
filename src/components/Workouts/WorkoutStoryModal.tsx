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
  RefreshCw,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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

type ModoCompartilhamento = 'padrao' | 'adesivo' | 'minha-foto';

const MODOS_FORMATO: Array<{ id: ModoCompartilhamento; label: string }> = [
  { id: 'padrao', label: 'Padrão' },
  { id: 'adesivo', label: 'Adesivo' },
  { id: 'minha-foto', label: 'Minha Foto' },
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

const CAMADA_CAPTURA = 'story-is-capturing';

// Lock 1: durante o milissegundo da captura o fundo da página (html/body) fica
// 100% transparente, para nenhum background opaco do overlay contaminar o clone.
function ativarIsolamentoCaptura() {
  const html = document.documentElement;
  const body = document.body;
  html.classList.add(CAMADA_CAPTURA);
  html.style.setProperty('background-color', 'transparent', 'important');
  body.style.setProperty('background-color', 'transparent', 'important');
}

function desativarIsolamentoCaptura() {
  const html = document.documentElement;
  html.classList.remove(CAMADA_CAPTURA);
  html.style.removeProperty('background-color');
  document.body.style.removeProperty('background-color');
}

// Checa se o PNG gerado veio 100% opaco nas bordas (sintoma clássico de fundo
// preto ao invés de transparente). true = provável perda do canal alfa.
async function temBordaTodaOpaca(dataUrl: string): Promise<boolean> {
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('falha ao decodificar PNG'));
    });
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const pontos: Array<[number, number]> = [
      [1, 1],
      [w - 2, 1],
      [1, h - 2],
      [w - 2, h - 2],
      [Math.floor(w / 2), 1],
      [Math.floor(w / 2), h - 2],
      [1, Math.floor(h / 2)],
      [w - 2, Math.floor(h / 2)],
    ];
    for (const [x, y] of pontos) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      if (px[3] < 255) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Lock 3: nome do arquivo com extensão .png garantida (nunca .jpeg/sem extensão).
function nomeArquivoPng(prefixo: string, nome: string): string {
  const slug = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'treino';
  return `${prefixo}-${slug}-${Date.now()}.png`;
}

// Lock 3 (Off-Screen): clona o node do adesivo num container invisível fora da
// tela (position: fixed; left: -9999px). A captura roda "no vácuo", longe do
// overlay escuro do modal, então nenhum fundo do app vaza para o canvas.
const CLASSES_FUNDO_OPACO = ['bg-black', 'bg-zinc-950', 'bg-background'];

// Proporção 9:16 da captura do Modo Adesivo (CSS px). Com pixelRatio 3 a saída
// é exatamente um PNG 1080x1920 com canal alpha.
const ADESIVO_CSS_W = 360;
const ADESIVO_CSS_H = 640;
const ADESIVO_PNG_W = 1080;
const ADESIVO_PNG_H = 1920;

function montarCloneOffscreen(node: HTMLElement): { container: HTMLDivElement; clone: HTMLElement } {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.setProperty('position', 'fixed');
  container.style.setProperty('left', '-9999px');
  container.style.setProperty('top', '0');
  container.style.setProperty('width', 'auto');
  container.style.setProperty('height', 'auto');
  container.style.setProperty('background', 'transparent', 'important');
  container.style.setProperty('background-color', 'transparent', 'important');
  container.style.setProperty('pointer-events', 'none');
  container.style.setProperty('z-index', '-1');

  // Wrapper 9:16 transparente: é ELE o nó capturado (1080x1920 com ratio 3).
  // O adesivo fica centralizado dentro, igual ao preview da tela.
  const wrapper = document.createElement('div');
  wrapper.style.setProperty('width', `${ADESIVO_CSS_W}px`);
  wrapper.style.setProperty('height', `${ADESIVO_CSS_H}px`);
  wrapper.style.setProperty('display', 'flex');
  wrapper.style.setProperty('align-items', 'center');
  wrapper.style.setProperty('justify-content', 'center');
  wrapper.style.setProperty('background', 'transparent', 'important');
  wrapper.style.setProperty('background-color', 'transparent', 'important');

  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.setProperty('background', 'transparent', 'important');
  clone.style.setProperty('background-color', 'transparent', 'important');

  wrapper.appendChild(clone);
  container.appendChild(wrapper);
  document.body.appendChild(container);

  // Neutralização (Lock 4): remove classes de fundo opaco, box-shadow,
  // backdrop-filter e gradientes de fundo que criariam retângulos no recorte.
  clone.querySelectorAll('*').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    CLASSES_FUNDO_OPACO.forEach((c) => {
      if (el.classList.contains(c)) el.classList.remove(c);
    });
    el.style.setProperty('box-shadow', 'none', 'important');
    el.style.setProperty('backdrop-filter', 'none', 'important');
    el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    const bgImage = getComputedStyle(el).backgroundImage;
    if (bgImage && bgImage !== 'none' && bgImage.includes('gradient')) {
      el.style.setProperty('background-image', 'none', 'important');
    }
  });

  return { container, clone: wrapper };
}

function destruirCloneOffscreen(container: HTMLDivElement | null) {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

// Lock 4 (re-encode): desenha a imagem capturada num canvas próprio 1080x1920
// criado com { alpha: true }, limpa a tela via clearRect (nunca fillRect com
// cor de fundo) e exporta SOMENTE image/png via toBlob/toDataURL.
async function renderizarPngAlpha(src: string | Blob): Promise<{ dataUrl: string; blob: Blob }> {
  const objectUrl = typeof src === 'string' ? null : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl !== null ? objectUrl : (src as string);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('falha ao decodificar imagem'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = ADESIVO_PNG_W;
    canvas.height = ADESIVO_PNG_H;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob falhou'))), 'image/png');
    });
    return { dataUrl, blob };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// Lock 7 (Modo "Minha Foto"): re-encode alpha preservando as dimensões
// informadas (diferente do renderizarPngAlpha, que força 1080x1920).
async function renderizarAlphaCanvas(src: string | Blob, wPx: number, hPx: number): Promise<HTMLCanvasElement> {
  const objectUrl = typeof src === 'string' ? null : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl !== null ? objectUrl : (src as string);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('falha ao decodificar imagem'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(wPx));
    canvas.height = Math.max(1, Math.round(hPx));
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// Carrega a mídia de fundo escolhida (sempre URL local, nunca upload).
async function carregarElementoImagem(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('falha ao carregar a imagem de fundo'));
  });
  return img;
}

// Desenha origem preenchendo o retângulo de destino com object-fit: cover.
function desenharCover(
  ctx: CanvasRenderingContext2D,
  origem: HTMLImageElement | HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const escala = Math.max(dw / origem.width, dh / origem.height);
  const sw = dw / escala;
  const sh = dh / escala;
  const sx = (origem.width - sw) / 2;
  const sy = (origem.height - sh) / 2;
  ctx.drawImage(origem, sx, sy, sw, sh, dx, dy, dw, dh);
}

// Lock 5 (fallback): desenha o adesivo 1080x1920 direto em Canvas 2D com alpha
// real, sem NENHUM preenchimento de fundo. Usado quando a captura DOM ainda
// entrega um fundo opaco (quirk de WebView/Android em canvas grande).
async function renderizarAdesivoCanvas2D(aderecos: {
  treinoNome: string;
  subtitulo?: string;
  chipEsqRotulo: string;
  chipEsqValor: string;
  chipDirRotulo: string;
  chipDirValor: string;
  cargoRotulo: string;
  cargoValor: string;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = ADESIVO_PNG_W;
  canvas.height = ADESIVO_PNG_H;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D indisponível no Modo Adesivo');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;

  const anton = '\'Anton\', sans-serif';
  const inter = '\'Inter\', sans-serif';
  const cx = ADESIVO_PNG_W / 2;
  const largura = 1050;
  const x0 = (ADESIVO_PNG_W - largura) / 2;

  const sombraTexto = () => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
  };
  const semSombra = () => {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  };

  function carregarIcone(svg: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('falha ao carregar ícone'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }

  const pintarArredondado = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  const medirEspacado = (txt: string, font: string, gap: number): number => {
    ctx.font = font;
    return [...txt].reduce((acc, c) => acc + ctx.measureText(c).width, 0) + gap * (txt.length - 1);
  };

  const desenharEspacado = (txt: string, startX: number, y: number, font: string, cor: string, gap: number) => {
    ctx.font = font;
    ctx.fillStyle = cor;
    ctx.textAlign = 'left';
    sombraTexto();
    const ws = [...txt].map((c) => ctx.measureText(c).width);
    let x = startX;
    [...txt].forEach((c, i) => {
      ctx.fillText(c, x, y);
      x += ws[i] + gap;
    });
    semSombra();
  };

  const desenharCentrado = (txt: string, y: number, font: string, cor: string, maxW = largura) => {
    ctx.font = font;
    let t = txt;
    while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -1) + '…';
    ctx.fillStyle = cor;
    ctx.textAlign = 'center';
    sombraTexto();
    ctx.fillText(t, cx, y);
    semSombra();
  };

  const iconeClock = await carregarIcone(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FF7A3D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
  );
  const iconeFlama = await carregarIcone(
    `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FF7A3D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294.95-3.5a2.5 2.5 0 0 0 1.7-.7z"/></svg>`
  );
  const iconeBarra = await carregarIcone(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 100 100" fill="none" stroke="#FF7A3D" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z"/><path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z"/></svg>`
  );

  let y = 520;

  // LOGO
  const wLos = medirEspacado('L O S', `24px ${anton}`, 14);
  desenharEspacado('L O S', cx - wLos / 2, y, `24px ${anton}`, '#FF7A3D', 14);
  y += 38;
  desenharCentrado('GYM', y, `100px ${anton}`, '#F3F2EF');
  y += 104;
  ctx.fillStyle = '#FF5A1F';
  semSombra();
  ctx.fillRect(cx - 60, y, 120, 8);
  y += 54;

  // TREINO FINALIZADO + linha accent à esquerda
  const lbl = 'TREINO FINALIZADO';
  const gapLbl = 6;
  const wLbl = medirEspacado(lbl, `30px ${anton}`, gapLbl);
  ctx.fillStyle = '#FF5A1F';
  semSombra();
  ctx.fillRect(cx - wLbl / 2 - 42, y - 5, 26, 5);
  desenharEspacado(lbl, cx - wLbl / 2, y, `30px ${anton}`, '#FF7A3D', gapLbl);
  y += 42;

  // TÍTULO
  desenharCentrado(aderecos.treinoNome || 'Treino Realizado', y, `84px ${anton}`, '#FFFFFF');
  y += 96;

  // SUBTÍTULO
  if (aderecos.subtitulo) {
    desenharCentrado(aderecos.subtitulo, y, `42px ${inter}`, '#D8D7DC');
    y += 62;
  }
  y += 8;

  // CHIPS DE MÉTRICAS
  const chipLarg = (largura - 28) / 2;
  const chipAlt = 270;
  const chipY = y;

  const desenharChip = (x: number, rotulo: string, valor: string, icone: HTMLImageElement) => {
    sombraTexto();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 4;
    pintarArredondado(x, chipY, chipLarg, chipAlt, 30);
    ctx.stroke();
    semSombra();

    ctx.font = `bold 27px ${inter}`;
    const esConj = ctx.measureText(rotulo).width + 38 + 14;
    const conjX = x + chipLarg / 2 - esConj / 2;
    ctx.drawImage(icone, conjX, chipY + 44, 38, 38);
    ctx.fillStyle = '#9A9AA2';
    ctx.textAlign = 'left';
    sombraTexto();
    ctx.fillText(rotulo, conjX + 52, chipY + 44 + 38 / 2 + 9);
    semSombra();

    ctx.font = `62px ${anton}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    sombraTexto();
    ctx.fillText(valor, x + chipLarg / 2, chipY + chipAlt - 68);
    semSombra();
  };

  desenharChip(x0, aderecos.chipEsqRotulo, aderecos.chipEsqValor, iconeClock);
  const chip2X = x0 + chipLarg + 28;
  desenharChip(chip2X, aderecos.chipDirRotulo, aderecos.chipDirValor, iconeFlama);

  y = chipY + chipAlt + 34;

  // CARD MAIOR CARGA / CONSISTÊNCIA
  const cargoAlt = 260;
  sombraTexto();
  ctx.strokeStyle = 'rgba(255,90,49,0.5)';
  ctx.lineWidth = 4;
  pintarArredondado(x0, y, largura, cargoAlt, 30);
  ctx.stroke();
  semSombra();

  ctx.drawImage(iconeBarra, x0 + 56, y + (cargoAlt - 64) / 2, 64, 64);
  const tx = x0 + 158;
  ctx.font = `800 30px ${inter}`;
  ctx.fillStyle = '#FF7A3D';
  ctx.textAlign = 'left';
  sombraTexto();
  ctx.fillText(aderecos.cargoRotulo, tx, y + cargoAlt / 2 - 14);
  semSombra();
  ctx.font = `700 42px ${inter}`;
  ctx.fillStyle = '#FFFFFF';
  sombraTexto();
  let cv = aderecos.cargoValor;
  while (cv.length > 1 && ctx.measureText(cv).width > largura - 220) cv = cv.slice(0, -1) + '…';
  ctx.fillText(cv, tx, y + cargoAlt / 2 + 56);
  semSombra();

  return canvas;
}

export function WorkoutStoryModal({ isOpen, onClose, data }: WorkoutStoryModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const fotoPreviewRef = useRef<HTMLDivElement>(null);
  const fotoStickerContentRef = useRef<HTMLDivElement>(null);
  const inputMidiaRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedBg, setSelectedBg] = useState(BACKGROUND_PRESETS[0]);
  const [metricMode, setMetricMode] = useState<'dias' | 'series'>('dias');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modoCompartilhamento, setModoCompartilhamento] = useState<ModoCompartilhamento>('padrao');
  const [midiaFundo, setMidiaFundo] = useState<{ url: string; tipo: 'imagem' | 'video'; nome: string } | null>(null);
  const [posSticker, setPosSticker] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.78 });
  const [escalaSticker, setEscalaSticker] = useState(0.85);
  const [arrastandoSticker, setArrastandoSticker] = useState(false);
  const gestoStickerRef = useRef<{
    modo: 'arrastar' | 'redimensionar';
    inicioX: number;
    inicioY: number;
    escalaInicial: number;
    dxFrac: number;
    dyFrac: number;
  } | null>(null);

  // O modo Adesivo continua existindo como qualquer modo que NÃO seja o
  // Padrão ("minha-foto" também reaproveita o sticker como overlay).
  const isStickerMode = modoCompartilhamento !== 'padrao';

  // Fecha com ESC
  useEffect(() => {
    if (isOpen) {
      setModoCompartilhamento('padrao');
      setMidiaFundo(null);
      setPosSticker({ x: 0.5, y: 0.78 });
      setEscalaSticker(0.85);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Revoga o objectURL local da mídia escolhida ao trocar/fechar.
  useEffect(() => {
    return () => {
      if (midiaFundo) URL.revokeObjectURL(midiaFundo.url);
    };
  }, [midiaFundo]);

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

  // Suporte a copiar imagem (ClipboardItem image/png). Sem suporte, o botão
  // "Copiar Imagem" some e sobra apenas "Baixar PNG HD".
  const podeCopiarImagem =
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof window !== 'undefined' &&
    typeof window.ClipboardItem !== 'undefined';

  // Lock 2: opções estritas de PNG. No Modo Adesivo o backgroundColor NÃO é
  // definido (o canvas nasce transparente — html-to-image só pinta fillRect
  // quando backgroundColor existe); no Padrão '#000000'. toPng/toBlob emitem
  // PNG sempre (type: 'image/png' explícito).
  function optsExportacao(): Parameters<typeof toBlob>[1] {
    return {
      cacheBust: true,
      pixelRatio: isStickerMode ? 3 : 2.5,
      fetchRequestInit: { mode: 'cors' },
      type: 'image/png',
      ...(isStickerMode ? {} : { backgroundColor: '#000000' }),
    };
  }

  // Geração do base64 (Share/Filesystem e Download) com as travas do Modo
  // Adesivo: clone off-screen 9:16 (1080x1920), sem backgroundColor, re-encode
  // alpha garantido e fallback Canvas 2D se os cantos vierem opacos.
  async function capturarPng(): Promise<string> {
    const node = isStickerMode ? stickerRef.current : cardRef.current;
    if (!node) throw new Error('Não foi possível gerar a imagem.');
    ativarIsolamentoCaptura();
    let cloneCtx: { container: HTMLDivElement; clone: HTMLElement } | null = null;
    try {
      if (isStickerMode) {
        cloneCtx = montarCloneOffscreen(node);
        const alvo = cloneCtx.clone;
        let dataUrl: string;
        try {
          dataUrl = await toPng(alvo, optsExportacao());
        } catch {
          dataUrl = await toPng(alvo, {
            cacheBust: true,
            pixelRatio: 3,
            skipFonts: true,
            type: 'image/png',
          });
        }
        const reencodado = await renderizarPngAlpha(dataUrl);
        const opaco = await temBordaTodaOpaca(reencodado.dataUrl);
        if (opaco) {
          console.warn('[LOS GYM Story] PNG do Modo Adesivo opaco após re-encode; renderizando em Canvas 2D.');
          return adesivoFallbackDataUrl();
        }
        return reencodado.dataUrl;
      }
      // Modo Padrão (inalterado)
      let dataUrl: string;
      try {
        dataUrl = await toPng(node, optsExportacao());
      } catch {
        dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 2,
          skipFonts: true,
          type: 'image/png',
          backgroundColor: '#000000',
        });
      }
      return dataUrl;
    } finally {
      destruirCloneOffscreen(cloneCtx?.container ?? null);
      desativarIsolamentoCaptura();
    }
  }

  // Blob para a área de transferência (Ctrl+V), com as mesmas travas.
  async function gerarBlob(): Promise<Blob | null> {
    const node = isStickerMode ? stickerRef.current : cardRef.current;
    if (!node) return null;
    ativarIsolamentoCaptura();
    let cloneCtx: { container: HTMLDivElement; clone: HTMLElement } | null = null;
    try {
      if (isStickerMode) {
        cloneCtx = montarCloneOffscreen(node);
        const alvo = cloneCtx.clone;
        let dataUrl: string;
        try {
          dataUrl = await toPng(alvo, optsExportacao());
        } catch {
          dataUrl = await toPng(alvo, {
            cacheBust: true,
            pixelRatio: 3,
            skipFonts: true,
            type: 'image/png',
          });
        }
        const reencodado = await renderizarPngAlpha(dataUrl);
        const opaco = await temBordaTodaOpaca(reencodado.dataUrl);
        if (opaco) {
          console.warn('[LOS GYM Story] PNG do Modo Adesivo opaco após re-encode; renderizando em Canvas 2D.');
          return canvasParaBlobPng(await adesivoFallbackCanvas());
        }
        return reencodado.blob;
      }
      // Modo Padrão (inalterado)
      let blob: Blob | null = null;
      try {
        blob = await toBlob(node, optsExportacao());
      } catch (err) {
        blob = await toBlob(node, {
          cacheBust: true,
          pixelRatio: 2,
          skipFonts: true,
          type: 'image/png',
          backgroundColor: '#000000',
        });
      }
      if (!blob) return null;
      // Lock 4: garante MIME image/png (nunca image/jpeg).
      if (blob.type !== 'image/png') return new Blob([blob], { type: 'image/png' });
      return blob;
    } finally {
      destruirCloneOffscreen(cloneCtx?.container ?? null);
      desativarIsolamentoCaptura();
    }
  }

  // Dados do adesivo repassados ao fallback Canvas 2D (Lock 5).
  function adesivoDados() {
    const cargoNo = data?.maiorCarga && data.maiorCarga.cargaKg > 0
      ? { rotulo: 'MAIOR CARGA DO DIA', valor: `${data.maiorCarga.exercicioNome} — ${data.maiorCarga.cargaKg} kg` }
      : { rotulo: 'CONSISTÊNCIA', valor: 'Meta Semanal Concluída 🔥' };
    return {
      treinoNome: data?.treinoNome || 'Treino Realizado',
      subtitulo: data?.subtitulo,
      chipEsqRotulo: 'DURAÇÃO',
      chipEsqValor: duracaoFormatada,
      chipDirRotulo: metricMode === 'dias' ? 'SEQUÊNCIA' : 'SÉRIES',
      chipDirValor: metricMode === 'dias' ? diasFormatado : seriesFormatadas,
      cargoRotulo: cargoNo.rotulo,
      cargoValor: cargoNo.valor,
    };
  }

  async function adesivoFallbackCanvas(): Promise<HTMLCanvasElement> {
    return renderizarAdesivoCanvas2D(adesivoDados());
  }

  function canvasParaBlobPng(c: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => {
      c.toBlob((b) => resolve(b), 'image/png');
    });
  }

  async function adesivoFallbackDataUrl(): Promise<string> {
    const c = await adesivoFallbackCanvas();
    return c.toDataURL('image/png');
  }

  // Texto formatado para redes sociais
  const textoCompartilhamento = `🔥 *Treino Concluído no LOS GYM!* 💪\n\n🏋️‍♂️ *${data.treinoNome || 'Treino'}*\n⏱️ Duração: ${duracaoFormatada}\n📊 ${metaCardio ? `Cardio: ${metaCardio.duracaoMinHoje} min hoje · ${metaCardio.acumuladoSemanaMin}/${metaCardio.metaSemanalMin} min na semana` : metricMode === 'dias' ? `Sequência: ${diasFormatado}` : `Séries: ${seriesFormatadas}`}\n${data.maiorCarga && data.maiorCarga.cargaKg > 0 ? `⚡ Maior carga: ${data.maiorCarga.exercicioNome} (${data.maiorCarga.cargaKg} kg)\n` : ''}📅 ${dataFormatada}\n\n#LOSGYM #TreinoPago #Foco`;

  // Compartilhar Nativo (gaveta de compartilhamento do celular via Capacitor,
  // ou Web Share nos navegadores com suporte)
  async function handleShareNativo() {
    if (modoCompartilhamento === 'minha-foto') {
      return handleShareMinhaFoto();
    }
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      if (Capacitor.isNativePlatform()) {
        const dataUrl = await capturarPng();
        const fileName = nomeArquivoPng('losgym', data?.treinoNome || 'treino');
        const { uri } = await Filesystem.writeFile({
          path: fileName,
          data: dataUrl.split(',')[1],
          directory: Directory.Cache,
        });

        await Share.share({
          url: uri,
          dialogTitle: 'Compartilhar Treino',
          title: `Treino Concluído — ${data?.treinoNome}`,
          text: textoCompartilhamento,
        });

        haptics.success();
        setFeedback('Compartilhado com sucesso!');
      } else {
        // Lock 6: Web Share com File estrito de image/png (nunca jpeg).
        const blob = await gerarBlob();
        if (!blob) return handleDownload();
        const file = new File([blob], 'treino-adesivo.png', { type: 'image/png' });
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Treino Concluído — ${data?.treinoNome}`,
            text: textoCompartilhamento,
          });
          haptics.success();
          setFeedback('Compartilhado com sucesso!');
        } else {
          return handleDownload();
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'CancelError') {
        haptics.error();
        setFeedback('Não foi possível compartilhar. Tente baixar o PNG HD.');
      }
    } finally {
      setIsExporting(false);
    }
  }

  // Download do arquivo PNG (Documents no celular via Filesystem, `<a download>` no navegador)
  async function handleDownload() {
    if (modoCompartilhamento === 'minha-foto') {
      return handleDownloadMinhaFoto();
    }
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);

    try {
      const dataUrl = await capturarPng();
      const fileName = nomeArquivoPng('losgym-story', data?.treinoNome || 'treino');

      if (Capacitor.isNativePlatform()) {
        const perms = await Filesystem.checkPermissions();
        if (perms.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }

        await Filesystem.writeFile({
          path: fileName,
          data: dataUrl.split(',')[1],
          directory: Directory.Documents,
        });

        haptics.success();
        setFeedback('Imagem PNG salva! Encontre em Documents/Downloads no seu celular.');
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        haptics.success();
        setFeedback('Imagem PNG baixada! Pronta para postar no Story ou WhatsApp.');
      }
    } catch (e) {
      haptics.error();
      setFeedback('Erro ao salvar a imagem. Tente copiar para a área de transferência.');
    } finally {
      setIsExporting(false);
    }
  }

  // Copiar Imagem para Área de Transferência (Ctrl + V direto)
  async function handleCopy() {
    if (modoCompartilhamento === 'minha-foto') {
      return handleDownloadMinhaFoto();
    }
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);
    try {
      const blob = await gerarBlob();
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

  // Mídia escolhida pelo usuário: SEMPRE local (URL.createObjectURL), nunca upload.
  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      haptics.selection();
      setMidiaFundo({
        url: URL.createObjectURL(file),
        tipo: file.type.startsWith('video/') ? 'video' : 'imagem',
        nome: file.name,
      });
      setFeedback(null);
    } else {
      haptics.error();
      setFeedback('Escolha uma imagem (.jpg, .png…) ou vídeo (.mp4).');
    }
  }

  // Frame de fundo (imagem completa ou primeiro frame do vídeo) p/ compor o JPEG.
  async function obterFrameFundo(): Promise<HTMLCanvasElement> {
    if (!midiaFundo) throw new Error('Escolha uma foto de fundo primeiro.');
    if (midiaFundo.tipo === 'imagem') {
      const img = await carregarElementoImagem(midiaFundo.url);
      const quadro = document.createElement('canvas');
      quadro.width = img.naturalWidth || 1080;
      quadro.height = img.naturalHeight || 1920;
      const qctx = quadro.getContext('2d');
      if (!qctx) throw new Error('Canvas 2D indisponível');
      qctx.drawImage(img, 0, 0);
      return quadro;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = midiaFundo.url;
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error('falha ao carregar o vídeo de fundo'));
    });
    await new Promise<void>((resolve) => {
      const fallback = window.setTimeout(resolve, 3000);
      v.onseeked = () => {
        window.clearTimeout(fallback);
        resolve();
      };
      try {
        v.currentTime = 0;
      } catch {
        resolve();
      }
    });
    const quadro = document.createElement('canvas');
    quadro.width = 1080;
    quadro.height = 1920;
    const qctx2 = quadro.getContext('2d');
    if (!qctx2) throw new Error('Canvas 2D indisponível');
    qctx2.drawImage(v, 0, 0, quadro.width, quadro.height);
    return quadro;
  }

  // Export 1080x1920 do Modo "Minha Foto": fundo em COVER + adesivo (capturado
  // transparente no tamanho natural) mapeado da posição exata do preview → JPEG 0.92.
  async function capturarJpegMinhaFoto(): Promise<{ dataUrl: string; blob: Blob }> {
    const preview = fotoPreviewRef.current;
    const node = fotoStickerContentRef.current;
    if (!preview || !node) throw new Error('Não foi possível gerar a imagem.');
    if (!midiaFundo) throw new Error('Escolha uma foto de fundo primeiro.');

    const fundo = await obterFrameFundo();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    desenharCover(ctx, fundo, 0, 0, 1080, 1920);

    const pRect = preview.getBoundingClientRect();
    const stRect = node.getBoundingClientRect();
    const sx = 1080 / pRect.width;
    const sy = 1920 / pRect.height;

    ativarIsolamentoCaptura();
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.setProperty('position', 'fixed');
    box.style.setProperty('left', '-9999px');
    box.style.setProperty('top', '0');
    box.style.setProperty('width', `${stRect.width}px`);
    box.style.setProperty('height', `${stRect.height}px`);
    box.style.setProperty('background', 'transparent', 'important');
    box.style.setProperty('background-color', 'transparent', 'important');
    box.style.setProperty('pointer-events', 'none');
    box.style.setProperty('z-index', '-1');
    const clone = node.cloneNode(true) as HTMLElement;
    clone.style.setProperty('background', 'transparent', 'important');
    clone.style.setProperty('background-color', 'transparent', 'important');
    box.appendChild(clone);
    document.body.appendChild(box);
    try {
      let dataUrlSticker: string;
      try {
        dataUrlSticker = await toPng(box, { cacheBust: true, pixelRatio: 3, type: 'image/png' });
      } catch {
        dataUrlSticker = await toPng(box, {
          cacheBust: true,
          pixelRatio: 3,
          skipFonts: true,
          type: 'image/png',
        });
      }
      const stickerCanvas = await renderizarAlphaCanvas(dataUrlSticker, stRect.width * 3, stRect.height * 3);
      const dx = (stRect.left - pRect.left) * sx;
      const dy = (stRect.top - pRect.top) * sy;
      const dw = stRect.width * sx;
      const dh = stRect.height * sy;
      ctx.drawImage(stickerCanvas, dx, dy, dw, dh);
    } finally {
      if (box.parentNode) box.parentNode.removeChild(box);
      desativarIsolamentoCaptura();
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        reject(err);
      }
    });
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob falhou'))), 'image/jpeg', 0.92);
    });
    return { dataUrl, blob };
  }

  // Compartilhamento do Modo "Minha Foto" (JPEG; vídeo é a próxima etapa).
  async function handleShareMinhaFoto() {
    if (!midiaFundo) {
      haptics.error();
      setFeedback('Escolha uma foto de fundo primeiro.');
      return;
    }
    if (midiaFundo.tipo === 'video') {
      haptics.error();
      setFeedback('Vídeo chega na próxima etapa. Por enquanto, use "Baixar" para capturar o primeiro frame como imagem.');
      return;
    }
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);
    try {
      const { dataUrl, blob } = await capturarJpegMinhaFoto();
      const entryName = `losgym-minha-foto-${Date.now()}.jpg`;
      if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({
          path: entryName,
          data: dataUrl.split(',')[1],
          directory: Directory.Cache,
        });
        await Share.share({
          url: uri,
          dialogTitle: 'Compartilhar Treino',
          title: `Treino Concluído — ${data?.treinoNome}`,
          text: textoCompartilhamento,
        });
        haptics.success();
        setFeedback('Compartilhado com sucesso!');
      } else {
        const file = new File([blob], entryName, { type: 'image/jpeg' });
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `Treino Concluído — ${data?.treinoNome}`,
            text: textoCompartilhamento,
          });
          haptics.success();
          setFeedback('Compartilhado com sucesso!');
        } else {
          return handleDownloadMinhaFoto();
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'CancelError') {
        haptics.error();
        setFeedback('Não foi possível compartilhar. Tente baixar a imagem.');
      }
    } finally {
      setIsExporting(false);
    }
  }

  // Download do JPEG (Documents no celular via Filesystem, `<a download>` na web).
  async function handleDownloadMinhaFoto() {
    haptics.impact();
    setIsExporting(true);
    setFeedback(null);
    try {
      const { dataUrl } = await capturarJpegMinhaFoto();
      const fileName = `losgym-minha-foto-${Date.now()}.jpg`;
      if (Capacitor.isNativePlatform()) {
        const perms = await Filesystem.checkPermissions();
        if (perms.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }
        await Filesystem.writeFile({
          path: fileName,
          data: dataUrl.split(',')[1],
          directory: Directory.Documents,
        });
        haptics.success();
        setFeedback('Imagem JPEG salva! Encontre em Documents/Downloads no seu celular.');
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        haptics.success();
        setFeedback('Imagem JPEG baixada! Pronta para postar no Story ou WhatsApp.');
      }
    } catch (e) {
      haptics.error();
      setFeedback('Erro ao gerar a imagem. Tente escolher outra foto.');
    } finally {
      setIsExporting(false);
    }
  }

  // Arrastar / redimensionar o adesivo sobre a foto (posições fracionárias 0..1).
  function iniciarArrasteSticker(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !fotoPreviewRef.current) return;
    e.preventDefault();
    const preview = fotoPreviewRef.current;
    const el = e.currentTarget;
    const pRect = preview.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const centroX = (elRect.left - pRect.left + elRect.width / 2) / pRect.width;
    const centroY = (elRect.top - pRect.top + elRect.height / 2) / pRect.height;
    gestoStickerRef.current = {
      modo: 'arrastar',
      inicioX: e.clientX,
      inicioY: e.clientY,
      escalaInicial: escalaSticker,
      dxFrac: (e.clientX - pRect.left) / pRect.width - centroX,
      dyFrac: (e.clientY - pRect.top) / pRect.height - centroY,
    };
    el.setPointerCapture(e.pointerId);
    setArrastandoSticker(true);
  }

  function iniciarResizeSticker(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    gestoStickerRef.current = {
      modo: 'redimensionar',
      inicioX: e.clientX,
      inicioY: e.clientY,
      escalaInicial: escalaSticker,
      dxFrac: 0,
      dyFrac: 0,
    };
    el.setPointerCapture(e.pointerId);
    setArrastandoSticker(true);
  }

  function moverArrasteSticker(e: React.PointerEvent<HTMLDivElement>) {
    const gesto = gestoStickerRef.current;
    const preview = fotoPreviewRef.current;
    if (!gesto || !preview) return;
    const pRect = preview.getBoundingClientRect();
    if (gesto.modo === 'redimensionar') {
      const delta = (e.clientX - gesto.inicioX) / 180;
      setEscalaSticker(Math.min(1.3, Math.max(0.4, gesto.escalaInicial + delta)));
    } else {
      const nx = (e.clientX - pRect.left) / pRect.width - gesto.dxFrac;
      const ny = (e.clientY - pRect.top) / pRect.height - gesto.dyFrac;
      setPosSticker({
        x: Math.min(0.92, Math.max(0.08, nx)),
        y: Math.min(0.95, Math.max(0.2, ny)),
      });
    }
  }

  function finalizarArrasteSticker(e: React.PointerEvent<HTMLDivElement>) {
    gestoStickerRef.current = null;
    setArrastandoSticker(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  // Conteúdo do adesivo (compartilhado entre Modo Adesivo e "Minha Foto").
  // Texto usa text-shadow leve (0 1px 3px rgba(0,0,0,.5)) — sem halo escuro.
  const ConteudoSticker = ({ refEl, fill }: { refEl?: React.Ref<HTMLDivElement>; fill?: boolean }) => (
    <div
      ref={refEl}
      style={{ backgroundColor: 'transparent', background: 'transparent' }}
      className={`inline-flex ${fill ? 'w-full' : 'w-auto max-w-sm'} flex-col items-center justify-center gap-3.5 ${
        fill ? 'p-3' : 'p-5 sm:p-6'
      } bg-transparent select-none`}
    >
      {/* Logo LOS GYM */}
      <div className="flex justify-center items-center">
        <LogoWordmark size="sm" />
      </div>

      {/* Título do Treino + Músculos */}
      <div className="w-full text-center">
        <div
          className="font-display text-[10.5px] tracking-[0.18em] text-[#FF7A3D] flex items-center justify-center gap-1.5 uppercase"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          <span className="w-4 h-[2px] bg-accent" />
          TREINO FINALIZADO
        </div>
        <h2
          className="font-display font-normal uppercase text-[24px] sm:text-[26px] leading-[1.05] text-white mt-1"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          {data.treinoNome || 'Treino Realizado'}
        </h2>
        {data.subtitulo && (
          <p
            className="text-[12px] sm:text-[12.5px] text-[#D8D7DC] mt-0.5 font-medium line-clamp-1"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            {data.subtitulo}
          </p>
        )}
      </div>

      {/* Linha de Métricas */}
      <div className="flex gap-2 w-full">
        <div className="flex-1 rounded-[10px] border border-white/20 p-2.5 sm:p-3">
          <div
            className="mb-0.5 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-[0.05em] text-[#9A9AA2]"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            <Clock size={10} className="text-[#FF7A3D]" />
            Duração
          </div>
          <div
            className="font-display text-[18px] tracking-[0.01em] text-white sm:text-[19px] text-center"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            {duracaoFormatada}
          </div>
        </div>
        <div className="flex-1 rounded-[10px] border border-white/20 p-2.5 sm:p-3">
          <div
            className="mb-0.5 flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-[0.05em] text-[#9A9AA2]"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            <Flame size={10} className="text-[#FF7A3D]" />
            {metricMode === 'dias' ? 'Sequência' : 'Séries'}
          </div>
          <div
            className="font-display text-[18px] tracking-[0.01em] text-white sm:text-[19px] text-center"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
          >
            {metricMode === 'dias' ? diasFormatado : seriesFormatadas}
          </div>
        </div>
      </div>

      {/* Maior Carga / Consistência */}
      {data.maiorCarga && data.maiorCarga.cargaKg > 0 ? (
        <div className="flex items-center justify-center gap-2.5 rounded-[10px] border border-accent/50 p-2.5 sm:p-3 w-full">
          <svg className="flex-none" viewBox="0 0 100 100" width="16" height="16" style={{ filter: 'drop-shadow(0 0 3px #ff7300) drop-shadow(0 0 8px rgba(255,115,0,0.5))' }}>
            <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0 flex-1 leading-tight text-center">
            <div
              className="mb-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[#FF7A3D]"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              Maior Carga do Dia
            </div>
            <div className="truncate text-[13px] font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              {data.maiorCarga.exercicioNome} — {data.maiorCarga.cargaKg} kg
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2.5 rounded-[10px] border border-accent/50 p-2.5 sm:p-3 w-full">
          <svg className="flex-none" viewBox="0 0 100 100" width="16" height="16" style={{ filter: 'drop-shadow(0 0 3px #ff7300) drop-shadow(0 0 8px rgba(255,115,0,0.5))' }}>
            <path d="M 30 35 L 25 15 L 40 25 L 50 8 L 60 25 L 75 15 L 70 35 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 34 62 L 66 62 L 66 45 L 74 45 L 74 52 L 82 52 L 82 60 L 86 60 L 86 70 L 82 70 L 82 78 L 74 78 L 74 85 L 66 85 L 66 68 L 34 68 L 34 85 L 26 85 L 26 78 L 18 78 L 18 70 L 14 70 L 14 60 L 18 60 L 18 52 L 26 52 L 26 45 L 34 45 L 34 62 Z" fill="none" stroke="#ff7300" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="min-w-0 flex-1 leading-tight text-center">
            <div
              className="mb-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.06em] text-[#FF7A3D]"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              Consistência
            </div>
            <div className="truncate text-[13px] font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              Meta Semanal Concluída 🔥
            </div>
          </div>
        </div>
      )}
    </div>
  );

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
            {modoCompartilhamento === 'minha-foto'
              ? 'SOBRE MINHA FOTO · 9:16'
              : isStickerMode
              ? 'MODO ADESIVO · 9:16'
              : 'STORY CARD · 9:16'}
          </div>

          {modoCompartilhamento === 'minha-foto' ? (
            <div
              ref={fotoPreviewRef}
              className="relative w-[320px] sm:w-[337px] h-[570px] sm:h-[600px] overflow-hidden rounded-[6px] bg-black select-none touch-none"
            >
              {midiaFundo ? (
                midiaFundo.tipo === 'imagem' ? (
                  <img
                    src={midiaFundo.url}
                    alt=""
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    key={midiaFundo.url}
                    src={midiaFundo.url}
                    className="absolute inset-0 w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    autoPlay
                  />
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <ImageIcon size={28} className="text-muted-steel" />
                  <p className="text-xs text-muted-steel leading-relaxed">
                    Escolha uma foto (ou vídeo) para o fundo. O adesivo aparece sobre ela e dá para arrastar e redimensionar.
                  </p>
                </div>
              )}

              {midiaFundo && (
                <div
                  className={`absolute touch-none ${arrastandoSticker ? 'cursor-grabbing' : 'cursor-grab'}`}
                  style={{
                    left: `${posSticker.x * 100}%`,
                    top: `${posSticker.y * 100}%`,
                    width: `${escalaSticker * 92}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={iniciarArrasteSticker}
                  onPointerMove={moverArrasteSticker}
                  onPointerUp={finalizarArrasteSticker}
                  onPointerCancel={finalizarArrasteSticker}
                >
                  <ConteudoSticker refEl={fotoStickerContentRef} fill />
                  <button
                    type="button"
                    title="Redimensionar"
                    aria-label="Redimensionar adesivo"
                    className="absolute -bottom-2.5 -right-2.5 z-10 w-6 h-6 rounded-full bg-accent border-2 border-white/90 shadow-md flex items-center justify-center"
                    onPointerDown={iniciarResizeSticker}
                  >
                    <span className="block w-2 h-2 bg-white" />
                  </button>
                </div>
              )}
            </div>
          ) : isStickerMode ? (
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
              <div className="relative w-[320px] sm:w-[337px] h-[570px] sm:h-[600px] flex items-center justify-center">
                {/* Apenas o adesivo é capturado (stickerRef): conteúdo compartilhado entre
                    o Modo Adesivo e o "Minha Foto"; fundo transparente nas bordas */}
                <ConteudoSticker refEl={stickerRef} />
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

            {isStickerMode && modoCompartilhamento !== 'minha-foto' && (
              <p className="text-[10.5px] italic text-muted-steel">
                A foto só aparece no modo Padrão — no Modo Adesivo o fundo é transparente.
              </p>
            )}

            {modoCompartilhamento === 'minha-foto' && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel flex items-center gap-1.5">
                  <ImageIcon size={13} className="text-accent" /> Foto de Fundo
                </label>
                <input
                  ref={inputMidiaRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleArquivoSelecionado}
                />
                <button
                  onClick={() => inputMidiaRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 p-3 text-left border clip-bevel-sm transition-all border-accent bg-accent/15 text-bone font-semibold shadow-glow-sm hover:bg-accent/25"
                >
                  {midiaFundo ? <RefreshCw size={14} /> : <ImageIcon size={14} />}
                  <span className="text-[12px]">
                    {midiaFundo ? 'Trocar foto/vídeo de fundo' : 'Escolher foto de fundo'}
                  </span>
                </button>
                <p className="text-[10.5px] italic text-muted-steel">
                  Arquivo fica só no aparelho (nenhum upload). O adesivo pode ser arrastado e redimensionado antes de exportar.
                  Video chega na próxima etapa — por ora o "Compartilhar" pede imagem.
                </p>
              </div>
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

            {/* Seletor de Formato do Card (Padrão | Adesivo | Minha Foto) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-steel flex items-center gap-1.5">
                <ImageIcon size={11} className="text-accent" /> Formato do Card
              </label>
              <div className="grid grid-cols-3 gap-1 border border-line clip-bevel-sm bg-panel p-1">
                {MODOS_FORMATO.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      haptics.selection();
                      setModoCompartilhamento(m.id);
                      setFeedback(null);
                    }}
                    className={`py-1.5 px-1 text-[11px] font-bold rounded-sm transition-colors ${
                      modoCompartilhamento === m.id
                        ? 'bg-accent text-black'
                        : 'text-muted-steel hover:text-bone'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
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
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                <span>
                  {isExporting
                    ? 'Salvando…'
                    : modoCompartilhamento === 'minha-foto'
                    ? 'Baixar JPEG'
                    : 'Baixar PNG HD'}
                </span>
              </button>

              {podeCopiarImagem && modoCompartilhamento !== 'minha-foto' && (
                <button
                  onClick={() => void handleCopy()}
                  disabled={isExporting}
                  className="btn-steel flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
                  <span>{copied ? 'Copiado!' : 'Copiar Imagem (Ctrl+V)'}</span>
                </button>
              )}
            </div>

            {/* Aviso exclusivo do Modo Adesivo / Minha Foto */}
            {modoCompartilhamento === 'minha-foto' && (
              <p className="text-[10.5px] italic text-muted-steel leading-relaxed">
                Export em JPEG 1080×1920 com o card exatamente na posição do preview. Vídeo (export em vídeo) chega na próxima etapa.
              </p>
            )}
            {isStickerMode && modoCompartilhamento !== 'minha-foto' && (
              <p className="text-[10.5px] italic text-muted-steel leading-relaxed">
                No Instagram, adicione como <b className="text-bone">ADESIVO</b> (ícone de figurinha &gt; foto) ou cole
                no Story com <b className="text-bone">Aa</b>. Se escolher como fundo, ele fica preto.
              </p>
            )}

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

