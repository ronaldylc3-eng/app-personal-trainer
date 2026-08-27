import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

// Inicialização da StatusBar nativa
export async function initNativeMobile() {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#08090A' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch {
      // Ignora em caso de não suporte
    }
  }
}

// Utilitário de feedback háptico para experiência mobile nativa (com Capacitor + fallback web)
export const haptics = {
  // Toque suave (navegação de abas, checkboxes, botões comuns)
  tap: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
        return;
      } catch {
        // Fallback
      }
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignora
      }
    }
  },

  // Seleção ou marcação de série concluída
  success: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type: NotificationType.Success });
        return;
      } catch {
        // Fallback
      }
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([15, 30, 20]);
      } catch {
        // Ignora
      }
    }
  },

  // Alerta / Finalização de Timer de Descanso
  timerComplete: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type: NotificationType.Warning });
        return;
      } catch {
        // Fallback
      }
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100, 50, 200]);
      } catch {
        // Ignora
      }
    }
  },

  // Erro ou cancelamento
  error: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type: NotificationType.Error });
        return;
      } catch {
        // Fallback
      }
    }
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([40, 40, 40]);
      } catch {
        // Ignora
      }
    }
  },
};

