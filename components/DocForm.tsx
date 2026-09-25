'use client';
// Receive (GRN) and Issue. The idempotency key is created when the form opens
// and kept until the post succeeds, so a retry after a dropped connection can
// never post twice (DB-4).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Scanner } from './Scanner.tsx';
import { getJson, newKey, postJson } from '../lib/client.ts';
import { fmtQty } from '../lib/format.ts';

type Store = { id: number; code: string; name: string; locations: { id: number; code: string; system: boolean }[] };
type ScanItem = { id: number; code: string; name: string; base_uom: string; onHand: string | null; uoms: { uom: string; factor: string }[] };
type Line = { item: ScanItem; uom: string; qty: string; rejected: string; rejectReason: string; unitCost: string; locationId: string };

export function DocForm({ type, stores, suppliers, preselect }:
  { type: 'GRN' | 'ISSUE'; stores: Store[]; suppliers: { id: number; name: string }[]; preselect?: string }) {
  const isGrn = type === 'GRN';
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [lines, setLines] = useState<Line[]>([]);
  const [header, setHeader] = useState({ supplierId: '', supplierRef: '', vehicle: '', receiverName: '', workArea: '', note: '' });
  const [key, setKey] = useState(newKey);
  const [msg, setMsg] = useState<{ tone: 'bad' | 'ok' | 'warn'; text: string; link?: { href: string; label: string } } | null>(null);
  const [busy, setBusy] = useState(false);
  const store = stores.find((s) => s.id === storeId);

  const add = useCallback(async (q: string) => {
    const r = await getJson<ScanItem>(`/api/scan?q=${encodeURIComponent(q)}&store=${storeId}`);
    if (!r.ok) { setMsg({ tone: 'bad', text: r.message }); return false; }
    let dup = false;
    setLines((ls) => {
      if (ls.some((l) => l.item.id === r.data.id)) { dup = true; return ls; }
      return [...ls, { item: r.data, uom: r.data.base_uom, qty: '', rejected: '', rejectReason: '', unitCost: '', locationId: '' }];
    });
    setMsg(dup ? { tone: 'warn', text: `${r.data.code} is already on this ${isGrn ? 'receipt' : 'issue'} — change its quantity instead.` } : null);
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-line="${r.data.id}"]`)?.focus(), 50);
    return !dup;
  }, [storeId, isGrn]);

  useEffect(() => { if (preselect) add(preselect); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Stock figures belong to a store; re-read them when the store changes.
  const linesRef = useRef(lines);
  linesRef.current = lines;
  useEffect(() => {
    for (const l of linesRef.current) {
      getJson<ScanItem>(`/api/scan?q=${encodeURIComponent(l.item.code)}&store=${storeId}`).then((r) => r.ok &&
        setLines((cur) => cur.map((c) => (c.item.id === r.data.id ? { ...c, item: { ...c.item, onHand: r.data.onHand } } : c))));
    }
  }, [storeId]);

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    setBusy(true); setMsg(null);
    const body = {
      key, type, storeId,
      ...(isGrn ? { supplierId: header.supplierId ? Number(header.supplierId) : undefined, supplierRef: header.supplierRef || undefined, vehicle: header.vehicle || undefined }
                : { receiverName: header.receiverName, workArea: header.workArea || undefined }),
      note: header.note || undefined,
      lines: lines.map((l) => ({
        itemId: l.item.id, uom: l.uom, locationId: l.locationId ? Number(l.locationId) : undefined,
        ...(isGrn ? { received: l.qty, rejected: l.rejected || undefined, rejectReason: l.rejectReason || undefined, unitCost: l.unitCost }
                  : { qty: l.qty }) })),
    };
    const r = await postJson<{ id: number; docNo: string; duplicate: boolean }>('/api/documents', body);
    setBusy(false);
    if (r.ok) {
      setMsg({ tone: 'ok', text: `${r.data.duplicate ? 'Already posted' : 'Posted'} ${r.data.docNo}.`, link: { href: `/documents/${r.data.id}`, label: 'View' } });
      setLines([]); setKey(newKey());
      setHeader((h) => ({ ...h, supplierRef: '', vehicle: '', note: '' }));
    } else if (r.code === 'KEY_REUSED') {
      // An earlier attempt whose reply was lost did post. Don't post again.
      setKey(newKey());
      setMsg({ tone: 'warn', text: 'An earlier attempt of this document was already posted — check it before posting again.',
               link: { href: '/documents', label: 'Open documents' } });
    } else {
      // Network error: keep the key, so tapping again can never post twice.
      // Refusal: nothing was posted and the server released the key.
      setMsg({ tone: r.network ? 'warn' : 'bad', text: r.message });
    }
  };

  if (!stores.length) return <p className="card text-muted">You are not assigned to any store. Ask an admin.</p>;
  const userLocations = store?.locations.filter((l) => !l.system) ?? [];
  return (
    <div className="space-y-4">
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor="store">Store</label>
          <select id="store" className="input" value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </select>
        </div>
        {isGrn ? (<>
          <div>
            <label className="label" htmlFor="supplier">Supplier</label>
            <select id="supplier" className="input" value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}>
              <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="ref">Delivery note / invoice no.</label>
            <input id="ref" className="input" value={header.supplierRef} onChange={(e) => setHeader({ ...header, supplierRef: e.target.value })} /></div>
          <div><label className="label" htmlFor="vehicle">Vehicle no.</label>
            <input id="vehicle" className="input" value={header.vehicle} onChange={(e) => setHeader({ ...header, vehicle: e.target.value })} /></div>
        </>) : (<>
          <div><label className="label" htmlFor="receiver">Issued to (name)</label>
            <input id="receiver" className="input" value={header.receiverName} required onChange={(e) => setHeader({ ...header, receiverName: e.target.value })} /></div>
          <div className="lg:col-span-2"><label className="label" htmlFor="area">Work area / activity</label>
            <input id="area" className="input" placeholder="e.g. Block B / L3 / slab casting" value={header.workArea} onChange={(e) => setHeader({ ...header, workArea: e.target.value })} /></div>
        </>)}
      </div>

      <div className="card space-y-3">
        <Scanner onScan={add} />
        {lines.length === 0 && <p className="text-muted">Scan a QR label or type an item code, then press Enter.</p>}
        <ul className="space-y-3">{lines.map((l, i) => {
          const issueOver = !isGrn && l.item.onHand !== null && l.uom === l.item.base_uom && Number(l.qty) > Number(l.item.onHand);
          return (
            <li key={l.item.id} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div><div className="font-semibold">{l.item.code}</div><div className="text-sm text-muted">{l.item.name}</div>
                  {!isGrn && l.item.onHand !== null && <div className="text-sm">Available here: <b>{fmtQty(l.item.onHand)} {l.item.base_uom}</b></div>}</div>
                <button type="button" className="btn-secondary px-3" aria-label={`remove ${l.item.code}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div><label className="label" htmlFor={`qty-${l.item.id}`}>{isGrn ? 'Received' : 'Quantity'}</label>
                  <input id={`qty-${l.item.id}`} data-line={l.item.id} className="input" inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} aria-label={`${l.item.code} quantity`} /></div>
                <div><label className="label" htmlFor={`uom-${l.item.id}`}>Unit</label>
                  <select id={`uom-${l.item.id}`} className="input" value={l.uom} onChange={(e) => set(i, { uom: e.target.value })} aria-label={`${l.item.code} unit`}>
                    {l.item.uoms.map((u) => <option key={u.uom} value={u.uom}>{u.uom}</option>)}</select></div>
                {isGrn && <>
                  <div><label className="label" htmlFor={`cost-${l.item.id}`}>Unit cost (per {l.uom})</label>
                    <input id={`cost-${l.item.id}`} className="input" inputMode="decimal" value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} aria-label={`${l.item.code} unit cost`} /></div>
                  <div><label className="label" htmlFor={`rej-${l.item.id}`}>Rejected</label>
                    <input id={`rej-${l.item.id}`} className="input" inputMode="decimal" placeholder="0" value={l.rejected} onChange={(e) => set(i, { rejected: e.target.value })} aria-label={`${l.item.code} rejected`} /></div>
                  {Number(l.rejected) > 0 && <div className="col-span-2 sm:col-span-4"><label className="label" htmlFor={`reason-${l.item.id}`}>Reason for rejection</label>
                    <input id={`reason-${l.item.id}`} className="input" value={l.rejectReason} placeholder="damaged / wrong spec / short supply" onChange={(e) => set(i, { rejectReason: e.target.value })} /></div>}
                </>}
                {userLocations.length > 1 && <div><label className="label" htmlFor={`loc-${l.item.id}`}>Location</label>
                  <select id={`loc-${l.item.id}`} className="input" value={l.locationId} onChange={(e) => set(i, { locationId: e.target.value })}>
                    <option value="">MAIN</option>{userLocations.filter((x) => x.code !== 'MAIN').map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</select></div>}
              </div>
              {issueOver && <p className="mt-2 text-sm font-medium text-bad">More than is available in this store.</p>}
            </li>);
        })}</ul>
      </div>

      <div className="card space-y-3">
        <div><label className="label" htmlFor="note">Note</label>
          <input id="note" className="input" value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} /></div>
        {msg && <p role="status" className={`font-medium ${msg.tone === 'ok' ? 'text-ok' : msg.tone === 'warn' ? 'text-warn' : 'text-bad'}`}>
          {msg.text} {msg.link && <Link className="underline" href={msg.link.href}>{msg.link.label}</Link>}</p>}
        <button className="btn-primary h-14 w-full text-lg sm:w-auto" disabled={busy || lines.length === 0 || (!isGrn && !header.receiverName.trim())} onClick={submit}>
          {busy ? 'Posting…' : isGrn ? `Post receipt (${lines.length})` : `Post issue (${lines.length})`}
        </button>
      </div>
    </div>
  );
}
