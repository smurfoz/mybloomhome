export const TRANSIT: string;
export const QUARANTINE: string;
export function mulDiv(a: number, b: number, c: number): number;
export class LedgerError extends Error { code: string }
export class Ledger {
  constructor(opts?: { allowNegative?: boolean });
  balances: Map<string, { qty: number; value: number }>;
  entries: { qty: number; value: number; priceVariance?: number }[];
  defineItem(code: string, def: { baseUom: string; conversions?: Record<string, number>; kind?: string }): void;
  post(doc: unknown): { id: string; entries: unknown[]; duplicate?: boolean };
  reverse(key: string, docId: string): { id: string; entries: unknown[]; duplicate?: boolean };
  onHand(store: unknown, item: string, location?: string): number;
}
