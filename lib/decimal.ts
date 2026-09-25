// Exact decimal arithmetic for quantities and money (DB-5). Values are BigInt
// integers scaled by 10^dp. Postgres returns NUMERIC as strings, which parse
// here without ever passing through a float.
import { fail } from './errors.ts';

export const QTY_DP = 4;
export const FACTOR_DP = 6;
export const SCALE = 10n ** BigInt(QTY_DP);
export const FACTOR_SCALE = 10n ** BigInt(FACTOR_DP);

const DECIMAL = /^(-?)(\d{1,14})(?:\.(\d+))?$/;

// User or database input → scaled BigInt. Rejects more than `dp` decimals
// instead of rounding them away.
//
// A JS number is a binary approximation: 0.1 + 0.2 is 0.30000000000000004. A
// number is accepted when it lies within float noise of a dp-decimal value —
// the same tolerance as the reference model. Text input must be exact.
export function parseDec(input: unknown, dp = QTY_DP, what = 'quantity'): bigint {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('BAD_QTY', `${what} must be a number`);
    const scaled = input * 10 ** dp;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6 * Math.max(1, Math.abs(rounded))) {
      return fail('BAD_QTY', `${what} ${input} has more than ${dp} decimal places`);
    }
    if (!Number.isSafeInteger(rounded)) return fail('BAD_QTY', `${what} ${input} is too large`);
    return BigInt(rounded);
  }
  const text = typeof input === 'string' ? input.trim() : '';
  const m = DECIMAL.exec(text);
  if (!m) return fail('BAD_QTY', `${what} must be a number, got ${JSON.stringify(input)}`);
  const [, sign, whole, frac = ''] = m;
  const extra = frac.slice(dp);
  if (/[1-9]/.test(extra)) return fail('BAD_QTY', `${what} ${text} has more than ${dp} decimal places`);
  const scaled = BigInt(whole) * 10n ** BigInt(dp) + BigInt((frac.slice(0, dp) || '0').padEnd(dp, '0'));
  return sign ? -scaled : scaled;
}

export function format(v: bigint, dp = QTY_DP): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(dp + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, -dp)}.${s.slice(-dp)}`;
}

// round(a * b / c), half away from zero — identical to NUMERIC rounding and to
// mulDiv in modules/ledger/ledger.mjs.
export function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  const n = a * b;
  let q = n / c;
  const r = n % c;
  const absR = r < 0n ? -r : r;
  const absC = c < 0n ? -c : c;
  if (2n * absR >= absC) q += (n < 0n) === (c < 0n) ? 1n : -1n;
  return q;
}

export const toNumber = (v: bigint, dp = QTY_DP) => Number(format(v, dp));
