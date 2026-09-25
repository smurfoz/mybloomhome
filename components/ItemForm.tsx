'use client';
import { useEffect, useMemo, useState } from 'react';
import { classify } from '../modules/smart-category/classify.mjs';
import { suggestConversions } from '../lib/units.ts';
import { getJson, postJson } from '../lib/client.ts';
import { Badge } from './ui.tsx';

type Cat = { code: string; name: string; baseUom: string };
type Conv = { uom: string; factor: string };

const FLAG_LABELS: Record<string, string> = {
  returnable: 'Returnable', hazardous: 'Hazardous', restricted: 'Needs approval to issue', issueToPerson: 'Issue to a person',
};

export function ItemForm({ categories }: { categories: Cat[] }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [category, setCategory] = useState('');
  const [baseUom, setBaseUom] = useState('');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [reorder, setReorder] = useState('');
  const [touched, setTouched] = useState({ category: false, baseUom: false, convs: false, code: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getJson<Record<string, string>>('/api/overrides').then((r) => r.ok && setOverrides(r.data)); }, []);

  // APP-1: runs in the browser on every keystroke — works offline.
  const s = useMemo(() => classify(name, { overrides }), [name, overrides]);

  useEffect(() => {
    if (!touched.category) setCategory(s.category ?? '');
    const cat = categories.find((c) => c.code === (touched.category ? category : s.category));
    if (!touched.baseUom) setBaseUom(cat?.baseUom ?? '');
    if (!touched.convs) setConvs(s.category && (!touched.category || category === s.category)
      ? suggestConversions(s).map((c) => ({ uom: c.uom, factor: String(c.factor) })) : []);
    if (!touched.code && cat) setCode((prev) => (prev === '' || /^[A-Z]{3}-$/.test(prev) ? `${cat.code}-` : prev));
  }, [s, category, touched, categories]);

  const pick = (c: string) => {
    setTouched((t) => ({ ...t, category: true, baseUom: false, convs: false }));
    setCategory(c);
    const cat = categories.find((x) => x.code === c);
    setBaseUom(cat?.baseUom ?? '');
  };

  const statusTone = s.status === 'auto' ? 'ok' : s.status === 'confirm' ? 'warn' : 'neutral';
  const chosenDiffers = !!category && !!s.category && category !== s.category;

  return (
    <form className="grid gap-4 lg:grid-cols-[1fr_22rem]" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError('');
      const r = await postJson<{ id: number; learned: boolean }>('/api/items', {
        code, name, category, baseUom, reorderLevel: reorder || undefined,
        conversions: convs.filter((c) => c.uom && c.factor), attributes: s.attributes });
      setBusy(false);
      if (r.ok) window.location.href = `/items/${r.data.id}${r.data.learned ? '?learned=1' : ''}`;
      else setError(r.message);
    }}>
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">Item name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 12mm TMT Fe500D" autoFocus required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" className="input" value={category} required onChange={(e) => pick(e.target.value)}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="code">Item code</label>
            <input id="code" className="input uppercase" value={code} required
              onChange={(e) => { setTouched((t) => ({ ...t, code: true })); setCode(e.target.value.toUpperCase()); }} />
          </div>
          <div>
            <label className="label" htmlFor="baseUom">Base unit (stock is counted in this)</label>
            <input id="baseUom" className="input" value={baseUom} required
              onChange={(e) => { setTouched((t) => ({ ...t, baseUom: true })); setBaseUom(e.target.value); }} />
          </div>
          <div>
            <label className="label" htmlFor="reorder">Reorder level ({baseUom || 'base unit'})</label>
            <input id="reorder" className="input" inputMode="decimal" value={reorder} onChange={(e) => setReorder(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div>
          <div className="label">Other units</div>
          <div className="space-y-2">
            {convs.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-muted">1</span>
                <input aria-label="unit" className="input w-24" value={c.uom}
                  onChange={(e) => { setTouched((t) => ({ ...t, convs: true })); setConvs(convs.map((x, j) => j === i ? { ...x, uom: e.target.value } : x)); }} />
                <span className="text-sm text-muted">=</span>
                <input aria-label="factor" className="input w-32" inputMode="decimal" value={c.factor}
                  onChange={(e) => { setTouched((t) => ({ ...t, convs: true })); setConvs(convs.map((x, j) => j === i ? { ...x, factor: e.target.value } : x)); }} />
                <span className="text-sm text-muted">{baseUom}</span>
                <button type="button" className="btn-secondary px-3" aria-label="remove unit"
                  onClick={() => { setTouched((t) => ({ ...t, convs: true })); setConvs(convs.filter((_, j) => j !== i)); }}>×</button>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => { setTouched((t) => ({ ...t, convs: true })); setConvs([...convs, { uom: '', factor: '' }]); }}>Add unit</button>
          </div>
        </div>
        {error && <p role="alert" className="font-medium text-bad">{error}</p>}
        <button className="btn-primary w-full sm:w-auto" disabled={busy}>{busy ? 'Saving…' : 'Create item'}</button>
      </div>

      <aside className="card space-y-3" aria-live="polite" data-testid="suggestion">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Smart Category</h2>
          <Badge tone={statusTone}>{s.status === 'auto' ? 'Confident' : s.status === 'confirm' ? 'Please confirm' : 'No match'}</Badge>
        </div>
        {s.category ? (
          <>
            <p className="text-lg font-semibold">{s.categoryName}</p>
            <p className="text-sm text-muted">Because: {s.reasons.join(', ')}</p>
            {Object.keys(s.attributes).length > 0 && (
              <dl className="space-y-1 text-sm">
                {Object.entries(s.attributes).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="font-medium">{String(v)}</dd></div>))}
              </dl>
            )}
            {s.missing.length > 0 && <p className="text-sm font-medium text-warn">Missing from name: {s.missing.join(', ')}</p>}
            <div className="flex flex-wrap gap-1">
              {s.defaults && Object.entries(FLAG_LABELS).filter(([k]) => (s.defaults as Record<string, unknown>)[k]).map(([k, l]) => <Badge key={k} tone="brand">{l}</Badge>)}
              {s.defaults?.kind === 'asset' && <Badge tone="brand">Tracked as a tool</Badge>}
            </div>
            {s.alternatives.length > 0 && (
              <div className="text-sm"><span className="text-muted">Or: </span>
                {s.alternatives.map((a) => <button type="button" key={a.category} className="mr-2 font-medium text-brand-ink underline"
                  onClick={() => pick(a.category)}>{categories.find((c) => c.code === a.category)?.name}</button>)}
              </div>
            )}
          </>
        ) : <p className="text-muted">{name ? 'No match — pick the category yourself. Your choice is remembered for this name.' : 'Start typing the item name.'}</p>}
        {chosenDiffers && <p className="text-sm font-medium text-brand-ink">Your choice differs — it will be remembered for “{name}”.</p>}
      </aside>
    </form>
  );
}
