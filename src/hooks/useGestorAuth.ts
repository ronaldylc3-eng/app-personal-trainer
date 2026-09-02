import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { enforceSessionPolicy } from '../lib/authSession';
import type { Usuario } from '../types';

// =============================================================
// HOOK: useGestorAuth
// Verifica se o usuario logado possui role='gestor' na tabela
// usuarios do Supabase. Re-verifica a cada mudanca de auth.
// =============================================================

interface GestorAuthState {
  isGestor: boolean;
  loading: boolean;
  profile: Usuario | null;
  error: string | null;
}

export function useGestorAuth(): GestorAuthState {
  const [state, setState] = useState<GestorAuthState>({
    isGestor: false,
    loading: true,
    profile: null,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const checkRole = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          if (mounted) {
            setState({ isGestor: false, loading: false, profile: null, error: 'Nao autenticado' });
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('usuarios')
          .select('*')
          .eq('auth_id', user.id)
          .single();

        if (profileError || !profile) {
          if (mounted) {
            setState({ isGestor: false, loading: false, profile: null, error: 'Perfil nao encontrado' });
          }
          return;
        }

        const gestorConfirmado = profile.role === 'gestor';

        if (gestorConfirmado) {
          console.log('✅ Acesso Admin (Gestor) Confirmado no Supabase!');
        } else {
          console.log('⛔ Acesso Negado: role =', profile.role);
        }

        if (mounted) {
          setState({
            isGestor: gestorConfirmado,
            loading: false,
            profile: profile as Usuario,
            error: null,
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        if (mounted) {
          setState({ isGestor: false, loading: false, profile: null, error: message });
        }
      }
    };

    checkRole();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
    (async () => {
      // Politica "Manter login por 30 dias": desloga sessoes expiradas
      // ou de navegador reaberto (modo sem lembrar) antes de checar a role.
      try {
        if (!enforceSessionPolicy()) {
          await supabase.auth.signOut();
        }
      } catch {
        // ignore
      }
      checkRole();
    })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

// =============================================================
// FUNCAO STANDALONE: checkAdminStatus
// Para uso em callbacks ou logica condicional fora de componentes.
// Retorna true apenas se o usuario logado for gestor.
// =============================================================

export async function checkAdminStatus(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('usuarios')
    .select('role')
    .eq('auth_id', user.id)
    .single();

  if (!profile) return false;

  const isGestor = profile.role === 'gestor';

  if (isGestor) {
    console.log('✅ Acesso Admin (Gestor) Confirmado no Supabase!');
  } else {
    console.log('⛔ Acesso Negado: role =', profile.role);
  }

  return isGestor;
}
