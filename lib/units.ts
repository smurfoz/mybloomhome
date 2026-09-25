// Suggested unit conversions for a classified item. Pure; used by the item
// form (in the browser) and by the seed script. 1 <uom> = factor × base unit.
type Classification = { defaults: { baseUom: string; altUoms: string[] } | null; attributes: Record<string, unknown> };

export function suggestConversions(c: Classification): { uom: string; factor: number }[] {
  if (!c.defaults) return [];
  const { baseUom, altUoms } = c.defaults;
  const out: { uom: string; factor: number }[] = [];
  if (baseUom === 'kg' && altUoms.includes('t')) out.push({ uom: 't', factor: 1000 });
  const pack = Number(c.attributes.packKg);
  // A bag of N kg: offer kg and t only when the factor is exact at 6 decimals.
  if (baseUom === 'bag' && pack > 0 && Number.isInteger(1e6 / pack)) {
    out.push({ uom: 't', factor: 1000 / pack }, { uom: 'kg', factor: 1 / pack });
  }
  return out;
}
