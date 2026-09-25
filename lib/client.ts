// Browser-side JSON calls. A network failure is reported separately from a
// refusal, because only a network failure is safe to retry with the same key.
export type Reply<T> = { ok: true; data: T } | { ok: false; code: string; message: string; network?: boolean };

export async function postJson<T>(url: string, body: unknown): Promise<Reply<T>> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, code: 'NETWORK', message: 'No connection. Nothing was lost — tap again to retry.', network: true };
  }
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true, data } : { ok: false, code: data.error ?? 'ERROR', message: data.message ?? res.statusText };
}

export async function getJson<T>(url: string): Promise<Reply<T>> {
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, data } : { ok: false, code: data.error ?? 'ERROR', message: data.message ?? res.statusText };
  } catch {
    return { ok: false, code: 'NETWORK', message: 'No connection', network: true };
  }
}

export const newKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
