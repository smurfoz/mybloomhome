export type Defaults = { baseUom: string; altUoms: string[]; kind: 'consumable' | 'asset'; returnable: boolean;
  hazardous: boolean; restricted: boolean; issueToPerson: boolean };
export type Classification = {
  input: string; normalized: string; category: string | null; categoryName: string | null;
  status: 'auto' | 'confirm' | 'unknown'; confidence: number; reasons: string[];
  attributes: Record<string, string | number>; defaults: Defaults | null; missing: string[];
  alternatives: { category: string; score: number }[];
};
export function classify(name: string, opts?: { overrides?: Record<string, string>; taxonomy?: unknown }): Classification;
export function normalize(name: string): string;
export function extractAttributes(text: string): Record<string, string | number>;
