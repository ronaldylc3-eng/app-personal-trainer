import { useState, useEffect } from 'react';
import { auth, usuarios } from '../services/api';
import { enforceSessionPolicy } from '../lib/authSession';
import type { Usuario } from '../types';

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // Politica "Manter login por 30 dias": encerra sessoes expiradas
        // ou de navegador reaberto (modo sem lembrar) antes de restaurar.
        if (!enforceSessionPolicy()) {
          await auth.signOut();
        }
        const session = await auth.getSession();
        if (!mounted) return;
        setUser(session?.user || null);
        if (session?.user) {
          const p = await usuarios.getByAuthId(session.user.id);
          if (mounted) setProfile(p);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
        const p = await usuarios.getByAuthId(session.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === 'gestor';
  const isPremium = profile?.pacote === 'Premium';
  const isVIP = profile?.pacote === 'VIP';

  return { user, profile, loading, isAdmin, isPremium, isVIP };
}
