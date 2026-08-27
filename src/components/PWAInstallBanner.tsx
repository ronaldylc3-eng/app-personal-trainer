import { useState, useEffect } from 'react';
import { Smartphone, X, Download, Share, PlusSquare } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    // Verificar se já está rodando como app instalado
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    if (standalone) return;

    // Verificar se já dispensou o aviso recentemente
    const dismissed = localStorage.getItem('pwa_banner_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Exibe novamente após 7 dias se não instalou
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // Detectar iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    if (isIosDevice) {
      // No iOS Safari, exibe após 2 segundos
      const timer = setTimeout(() => setShowBanner(true), 2000);
      return () => clearTimeout(timer);
    }

    // No Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    haptics.tap();
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    haptics.tap();
    setShowBanner(false);
    localStorage.setItem('pwa_banner_dismissed', Date.now().toString());
  };

  if (isStandalone || !showBanner) return null;

  return (
    <>
      {/* Banner flutuante no topo ou acima do bottom nav */}
      <div className="fixed top-3 left-3 right-3 md:left-auto md:right-4 md:w-96 z-50 bg-[#151518]/95 backdrop-blur-xl border border-[#28282D] rounded-2xl p-3.5 shadow-2xl shadow-black/80 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-light to-accent flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(255,90,31,0.4)]">
          <Smartphone size={20} className="text-[#170B04]" strokeWidth={2.4} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="text-[13px] font-bold text-bone leading-tight">Instalar o App</h4>
          <p className="text-[11.5px] text-muted-steel leading-tight mt-0.5 truncate">
            Acesso rápido, tela cheia e sem barra de navegador
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1 bg-accent hover:bg-accent-light active:scale-95 text-[#170B04] text-[11.5px] font-bold px-3 py-1.5 rounded-lg transition-all"
          >
            <Download size={13} strokeWidth={2.5} />
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Fechar"
            className="p-1.5 text-muted-steel hover:text-bone active:scale-90 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Modal explicativo para iPhone / iPad (Safari) */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#151518] border border-[#28282D] rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent-light">
                  <Smartphone size={20} />
                </div>
                <h3 className="text-[16px] font-bold text-bone">Instalar no iPhone</h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-muted-steel hover:text-bone"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-[13px] text-muted-steel mb-5 leading-relaxed">
              Para instalar este app no seu iPhone ou iPad em tela cheia:
            </p>

            <div className="space-y-3.5 mb-6 text-[13px] text-bone">
              <div className="flex items-start gap-3 bg-[#1B1B1F] p-3 rounded-xl border border-line">
                <div className="w-6 h-6 rounded-lg bg-[#2A2A30] flex items-center justify-center shrink-0 text-accent-light">
                  1
                </div>
                <div className="flex-1">
                  Toque no botão <b>Compartilhar</b> <Share size={14} className="inline mx-1 text-accent-light" /> na barra inferior do Safari.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#1B1B1F] p-3 rounded-xl border border-line">
                <div className="w-6 h-6 rounded-lg bg-[#2A2A30] flex items-center justify-center shrink-0 text-accent-light">
                  2
                </div>
                <div className="flex-1">
                  Role para baixo e toque em <b>Adicionar à Tela de Início</b> <PlusSquare size={14} className="inline mx-1 text-accent-light" />.
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#1B1B1F] p-3 rounded-xl border border-line">
                <div className="w-6 h-6 rounded-lg bg-[#2A2A30] flex items-center justify-center shrink-0 text-accent-light">
                  3
                </div>
                <div className="flex-1">
                  Toque em <b>Adicionar</b> no canto superior direito.
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIOSModal(false);
                setShowBanner(false);
              }}
              className="btn-forge btn-full text-[13.5px] h-12"
            >
              Entendido!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
