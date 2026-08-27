// =============================================================
// Politica de sessao: "Manter login por 30 dias"
// -------------------------------------------------------------
// - remember -> a sessao persiste no localStorage (padrao do
//   cliente Supabase) ate fa_auth_expire expirar (30 dias apos
//   o login). Ao abrir o app depois desse prazo, o usuario e
//   deslogado automaticamente.
// - session  -> a sessao vive apenas enquanto o navegador estiver
//   aberto: um marcador e gravado em sessionStorage e, quando o
//   navegador fecha e reabre, o marcador nao existe mais e o
//   usuario e deslogado no proximo boot.
// - Sessoes criadas antes desta funcionalidade nao possuem
//   fa_auth_mode e preservam o comportamento antigo (permanecem
//   logadas ate o usuario clicar em Sair).
// =============================================================

const MODE_KEY = 'fa_auth_mode';
const EXPIRE_KEY = 'fa_auth_expire';
const LIVE_KEY = 'fa_live';

const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/** Grava os marcadores da politica escolhida no login. */
export function aplicarPolitica(lembrar: boolean) {
  try {
    localStorage.removeItem(EXPIRE_KEY);
    sessionStorage.removeItem(LIVE_KEY);
    if (lembrar) {
      localStorage.setItem(MODE_KEY, 'remember');
      localStorage.setItem(EXPIRE_KEY, String(Date.now() + TRINTA_DIAS_MS));
    } else {
      localStorage.setItem(MODE_KEY, 'session');
      sessionStorage.setItem(LIVE_KEY, '1');
    }
  } catch {
    // Storage indisponivel (navegador em modo privado restrito): ignora.
  }
}

/** Limpa todos os marcadores (usado no logout). */
export function limparPolitica() {
  try {
    localStorage.removeItem(MODE_KEY);
    localStorage.removeItem(EXPIRE_KEY);
    sessionStorage.removeItem(LIVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Verifica no boot se a sessao atual ainda e valida segundo a politica.
 * Retorna false quando o usuario deve ser deslogado.
 */
export function enforceSessionPolicy(): boolean {
  let mode: string | null = null;
  try {
    mode = localStorage.getItem(MODE_KEY);
  } catch {
    return true;
  }
  if (!mode) return true; // sessao legada (anterior a esta feature)
  if (mode === 'remember') {
    const expire = Number(localStorage.getItem(EXPIRE_KEY) || 0);
    return expire > Date.now();
  }
  if (mode === 'session') {
    return sessionStorage.getItem(LIVE_KEY) === '1';
  }
  return true;
}
