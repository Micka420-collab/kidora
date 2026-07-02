// Browser-side fetch helper for the dashboard. Adds a request timeout and a
// single safe retry (GET only — mutations are never auto-retried, to avoid
// double-submitting) so a brief network blip doesn't surface as a hard error.

const TIMEOUT_MS = 20000;

async function once(method: string, path: string, body?: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function networkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === "AbortError") return new Error("Délai d'attente dépassé");
  if (typeof navigator !== "undefined" && !navigator.onLine) return new Error("Hors connexion");
  return new Error("Réseau indisponible");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const retryable = method === "GET"; // never retry mutations
  let res: Response;
  try {
    res = await once(method, path, body);
    if (!res.ok && retryable && res.status >= 500) {
      res = await once(method, path, body); // one retry on a server error
    }
  } catch (e) {
    if (!retryable) throw networkError(e);
    try {
      res = await once(method, path, body); // one retry on a network failure
    } catch (e2) {
      throw networkError(e2);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b),
  put: <T>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};
