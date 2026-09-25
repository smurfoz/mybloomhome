import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '../../../lib/session.ts';
import { itemDetail } from '../../../lib/queries.ts';
import { fmtDate, fmtMoney, fmtQty } from '../../../lib/format.ts';
import { qrSvg, qrUrl } from '../../../lib/qr.ts';
import { baseUrl } from '../../../lib/base-url.ts';
import { Badge, PageTitle, docTone } from '../../../components/ui.tsx';

export const dynamic = 'force-dynamic';

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ learned?: string }> }) {
  const { id } = await params;
  const u = await requireUser(`/items/${id}`);
  const d = await itemDetail(u, Number(id));
  if (!d) notFound();
  const { item, uoms, stock, moves } = d;
  const { learned } = await searchParams;
  const svg = item.qr ? await qrSvg(qrUrl(baseUrl(await headers()), item.qr)) : '';
  const onHand = stock.filter((s) => !s.system).reduce((t, s) => t + Number(s.qty), 0);
  const attrs = Object.entries(item.attributes as Record<string, unknown>);
  const flags = [item.kind === 'asset' && 'Tool', item.returnable && 'Returnable', item.hazardous && 'Hazardous',
                 item.restricted && 'Needs approval', item.issue_to_person && 'Issue to person'].filter(Boolean) as string[];
  return (
    <>
      <PageTitle title={item.code} sub={item.name}
        action={<div className="flex gap-2">
          <Link href={`/receive?item=${item.id}`} className="btn-primary">Receive</Link>
          <Link href={`/issue?item=${item.id}`} className="btn-secondary">Issue</Link>
          <Link href={`/labels?items=${item.id}`} className="btn-secondary">Label</Link>
        </div>} />
      {learned && <p className="card mb-4 border-brand/40 text-brand-ink">Category correction saved — Smart Category will suggest <b>{item.category}</b> for this name from now on.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          <section className="card">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <div><div className="text-sm text-muted">On hand</div><div className="text-3xl font-bold tabular-nums" data-testid="on-hand">{fmtQty(onHand)} <span className="text-lg font-medium">{item.base_uom}</span></div></div>
              <div><div className="text-sm text-muted">Category</div><div className="font-semibold">{item.category}</div></div>
              <div><div className="text-sm text-muted">Reorder level</div><div className="font-semibold">{fmtQty(item.reorder_level)}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">{flags.map((f) => <Badge key={f} tone="brand">{f}</Badge>)}</div>
            {attrs.length > 0 && <p className="mt-3 text-sm text-muted">{attrs.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
            <p className="mt-2 text-sm text-muted">Units: {uoms.map((x) => x.uom === item.base_uom ? x.uom : `${x.uom} (= ${fmtQty(x.factor)} ${item.base_uom})`).join(', ')}</p>
          </section>
          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">Stock by location</h2>
            {stock.length === 0 ? <p className="text-muted">No stock yet.</p> : (
              <table className="table"><thead><tr><th>Store</th><th>Location</th><th className="num">Qty</th><th className="num">Value</th></tr></thead>
                <tbody>{stock.map((s, i) => (
                  <tr key={i}><td>{s.store}</td><td>{s.location}{s.system && <span className="text-muted"> (system)</span>}</td>
                    <td className="num">{fmtQty(s.qty)}</td><td className="num">{fmtMoney(s.value)}</td></tr>))}</tbody></table>
            )}
          </section>
          <section className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">Movements</h2>
            {moves.length === 0 ? <p className="text-muted">No movements yet.</p> : (
              <table className="table"><thead><tr><th>When</th><th>Document</th><th>Where</th><th className="num">Qty ({item.base_uom})</th><th className="num">Value</th></tr></thead>
                <tbody>{moves.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDate(m.created_at)}</td>
                    <td><Link href={`/documents/${m.doc_id}`} className="font-medium hover:underline">{m.doc_no}</Link> <Badge tone={docTone(m.type)}>{m.type}</Badge></td>
                    <td>{m.store}/{m.location}</td>
                    <td className={`num font-semibold ${Number(m.qty) < 0 ? 'text-bad' : 'text-ok'}`}>{Number(m.qty) > 0 ? '+' : ''}{fmtQty(m.qty)}</td>
                    <td className="num">{fmtMoney(m.value)}{m.price_variance && <div className="text-xs text-warn">variance {fmtMoney(m.price_variance)}</div>}</td>
                  </tr>))}</tbody></table>
            )}
          </section>
        </div>
        <aside className="card h-fit text-center">
          <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-2 font-mono text-sm text-muted">{item.qr}</p>
        </aside>
      </div>
    </>
  );
}
