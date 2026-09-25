// Display helpers (client-safe). Inputs are NUMERIC strings from Postgres.
export function fmtQty(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '0';
  const s = String(v);
  const [whole, frac = ''] = s.split('.');
  const f = frac.replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? `${grouped}.${f}` : grouped;
}

export function fmtMoney(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
