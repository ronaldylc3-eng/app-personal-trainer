// Mini-cache em memória (TTL + single-flight) para leituras do Supabase.
// Mantém os dados quentes entre trocas de abas e evita disparar requisições
// idênticas em paralelo (ex.: Inicio e TopHeader buscando o mesmo histórico).

const DEFAULT_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  inflight?: Promise<T>;
}

const store = new Map<string, CacheEntry<unknown>>();

function isFresh(entry: CacheEntry<unknown>): boolean {
  return Date.now() <= entry.expiresAt;
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (!isFresh(entry)) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheDelete(key: string): void {
  store.delete(key);
}

/** Remove todas as chaves que começam com o prefixo informado. */
export function cacheDeletePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function cacheClear(): void {
  store.clear();
}

/**
 * Executa `fn` usando o valor em cache enquanto ainda válido.
 * Chamadas concorrentes para a mesma chave compartilham a mesma promise
 * (single-flight), evitando N requisições iguais ao mesmo tempo.
 */
export function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return Promise.resolve(hit);

  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing?.inflight) return existing.inflight;

  const inflight = fn().then(
    (value) => {
      cacheSet(key, value, ttlMs);
      return value;
    },
    (err) => {
      if (store.get(key)?.inflight === inflight) store.delete(key);
      throw err;
    },
  );

  store.set(key, { value: undefined as unknown, expiresAt: Date.now(), inflight });
  return inflight;
}