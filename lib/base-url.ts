// The public origin printed into QR labels. APP_URL wins (set it in production,
// so labels never depend on a request's Host header).
export function baseUrl(h: Headers): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
