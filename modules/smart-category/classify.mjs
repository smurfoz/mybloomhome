// Smart Category classifier. Rules SC-1..SC-9 are defined in ./DESIGN.md.
// Pure and dependency-free so it runs identically in the browser (offline) and
// on the server.

import { TAXONOMY } from './taxonomy.mjs';

const PHRASE_WEIGHT = [0, 1, 2.5, 4, 5]; // by word count (SC-2)
const STRONG_WEIGHT = 2.5; // unambiguous single trade terms (ISMB, MCB…)
const PATTERN_WEIGHT = 2;
const AUTO_MIN_SCORE = 2;
const AUTO_MIN_RATIO = 2;

// SC-1: one canonical spelling; idempotent. The steps can interact (one may
// expose a pattern an earlier step has already passed), so they are repeated
// until the text stops changing — which makes idempotence hold by construction.
export function normalize(name) {
  let prev;
  let text = String(name ?? '');
  for (let i = 0; i < 8 && text !== prev; i++) {
    prev = text;
    text = normalizeOnce(text);
  }
  return text;
}

function normalizeOnce(name) {
  return name
    .toLowerCase()
    .replace(/sq\.?\s*mm\b|sqmm\b|mm2\b|mm²/g, ' sq mm ')
    .replace(/(\d)\s*(mm|kg|m3|inch|in|ltr|l)\b/g, '$1 $2') // 12mm -> 12 mm
    .replace(/(\d)\s*"/g, '$1 inch')
    .replace(/(\d)\.(?!\d)/g, '$1')       // "12." -> "12"
    .replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ') // keep decimals like 2.5, drop other dots
    .replace(/[^a-z0-9.\/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = new WeakMap();

// All phrases from all categories, longest first, so matching is a single
// greedy longest-match pass over the name (SC-2).
function compile(taxonomy) {
  if (compiled.has(taxonomy)) return compiled.get(taxonomy);
  const phrases = taxonomy.flatMap((c) => [
    ...c.keywords.map((k) => [k, false]),
    ...(c.strong ?? []).map((k) => [k, true]),
  ].map(([k, strong]) => {
    const phrase = normalize(k);
    const words = phrase.split(' ').length;
    return { code: c.code, phrase, words,
             weight: strong ? Math.max(STRONG_WEIGHT, PHRASE_WEIGHT[Math.min(words, 4)])
                            : PHRASE_WEIGHT[Math.min(words, 4)],
             re: new RegExp(`(?<=^| )${escape(phrase)}(?= |$)`) };
  })).sort((a, b) => b.words - a.words || b.phrase.length - a.phrase.length);
  const out = { phrases, patterns: taxonomy.map((c) => [c.code, c.patterns ?? []]) };
  compiled.set(taxonomy, out);
  return out;
}

// SC-5: attributes come from the text, independent of category.
export function extractAttributes(text) {
  const a = {};
  let m;
  if ((m = text.match(/(?:^| )(\d+(?:\.\d+)?) mm(?= |$)/))) a.sizeMm = Number(m[1]);
  if ((m = text.match(/(?:^| )(\d+(?:\.\d+)?(?:\/\d+)?) inch(?= |$)/))) a.sizeInch = m[1];
  if ((m = text.match(/(\d+(?:\.\d+)?) sq mm/))) a.crossSectionSqMm = Number(m[1]);
  if ((m = text.match(/\bfe ?(\d{3})(?: ?(d))?\b/))) a.steelGrade = `Fe${m[1]}${(m[2] ?? '').toUpperCase()}`;
  // Type and grade are read independently: "OPC 53", "53 grade OPC", "OPC grade 43".
  if ((m = text.match(/\b(opc|ppc|psc)\b/))) a.cementType = m[1].toUpperCase();
  if ((m = text.match(/\b(?:opc|ppc|psc) (?:grade )?(33|43|53)\b|\b(33|43|53) grade\b/))) {
    a.cementGrade = Number(m[1] ?? m[2]);
  }
  if ((m = text.match(/\bm ?(7\.5|10|15|20|25|30|35|40|45|50|60)\b/))) a.concreteGrade = `M${m[1]}`;
  if ((m = text.match(/(?:^| )(\d+(?:\.\d+)?) kg(?= |$)/))) a.packKg = Number(m[1]);
  return a;
}

function defaultsOf(c) {
  const { baseUom, altUoms, kind, returnable, hazardous, restricted, issueToPerson } = c;
  return { baseUom, altUoms: [...altUoms], kind, returnable, hazardous, restricted, issueToPerson };
}

export function classify(name, { overrides = {}, taxonomy = TAXONOMY } = {}) {
  const normalized = normalize(name);
  const attributes = extractAttributes(normalized);
  const byCode = new Map(taxonomy.map((c) => [c.code, c]));
  const result = (cat, status, confidence, reasons, alternatives) => ({
    input: name, normalized, category: cat?.code ?? null, categoryName: cat?.name ?? null,
    status, confidence, reasons, attributes,
    defaults: cat ? defaultsOf(cat) : null,
    missing: cat ? cat.required.filter((k) => attributes[k] === undefined) : [],
    alternatives,
  });

  // SC-4: a saved correction beats scoring.
  const override = overrides[normalized];
  if (override && byCode.has(override)) {
    return result(byCode.get(override), 'auto', 1, ['override'], []);
  }

  // SC-2: a word claimed by a longer phrase (in any category) is not counted
  // again, so "binding wire" never scores for electrical "wire".
  const { phrases, patterns } = compile(taxonomy);
  const tally = new Map(taxonomy.map((c) => [c.code, { cat: c, score: 0, reasons: [] }]));
  let text = normalized;
  for (const p of phrases) {
    if (!p.re.test(text)) continue;
    const t = tally.get(p.code);
    t.score += p.weight;
    t.reasons.push(p.phrase);
    text = text.replace(p.re, '|');
  }
  for (const [code, list] of patterns) {
    for (const [label, re] of list) {
      if (re.test(normalized)) {
        const t = tally.get(code);
        t.score += PATTERN_WEIGHT;
        t.reasons.push(`pattern:${label}`);
      }
    }
  }
  const scored = [...tally.values()]
    .sort((a, b) => b.score - a.score || a.cat.code.localeCompare(b.cat.code));

  const [top, second] = scored;
  const alternatives = scored.slice(1, 4).filter((s) => s.score > 0)
    .map((s) => ({ category: s.cat.code, score: s.score }));

  // SC-3: confidence gate.
  if (!top || top.score === 0) return result(null, 'unknown', 0, [], []);
  const runnerUp = second?.score ?? 0;
  const confidence = Math.round(((top.score - runnerUp) / top.score) * Math.min(1, top.score / AUTO_MIN_SCORE) * 100) / 100;
  const status = top.score >= AUTO_MIN_SCORE && top.score >= AUTO_MIN_RATIO * runnerUp ? 'auto' : 'confirm';
  return result(top.cat, status, confidence, top.reasons, alternatives);
}
