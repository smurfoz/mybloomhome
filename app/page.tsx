import Link from 'next/link';
import { requireUser } from '../lib/session.ts';
import { dashboard } from '../lib/queries.ts';
import { fmtDate, fmtMoney, fmtQty } from '../lib/format.ts';
import { Badge, PageTitle, Stat, docTone } from '../components/ui.tsx';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const u = await requireUser('/');
  const d = await dashboard(u);
  return (
    <>
      <PageTitle title="Dashboard" sub={u.companyName} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/receive" className="btn-primary h-14 text-base">＋ Receive</Link>
        <Link href="/issue" className="btn-primary h-14 text-base">− Issue</Link>
        <Link href="/items/new" className="btn-secondary h-14">New item</Link>
        <Link href="/labels" className="btn-secondary h-14">Print labels</Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stock value" value={fmtMoney(d.value)} href="/items" />
        <Stat label="Receipts today" value={d.receiptsToday} href="/documents" />
        <Stat label="Issues today" value={d.issuesToday} href="/documents" />
        <Stat label="Below reorder level" value={d.lowStockCount} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Low stock{d.lowStockCount > d.lowStock.length && <span className="font-normal text-muted"> — lowest {d.lowStock.length} of {d.lowStockCount}</span>}</h2>
          {d.lowStock.length === 0 ? <p className="text-muted">Nothing below its reorder level.</p> : (
            <table className="table">
              <thead><tr><th>Item</th><th className="num">On hand</th><th className="num">Reorder at</th></tr></thead>
              <tbody>{d.lowStock.map((i) => (
                <tr key={i.id}>
                  <td><Link className="font-medium hover:underline" href={`/items/${i.id}`}>{i.code}</Link><div className="text-muted">{i.name}</div></td>
                  <td className="num font-semibold text-bad">{fmtQty(i.on_hand)} {i.base_uom}</td>
                  <td className="num">{fmtQty(i.reorder_level)}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Recent documents</h2>
          {d.recent.length === 0 ? <p className="text-muted">No documents yet.</p> : (
            <ul className="divide-y divide-line">{d.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <Link href={`/documents/${r.id}`} className="font-medium hover:underline">{r.doc_no}</Link>
                  <div className="text-sm text-muted">{r.store} · {r.reverses ? `reverses ${r.reverses}` : `${r.lines} line${r.lines === 1 ? '' : 's'}`} · {r.by}</div>
                </div>
                <div className="text-right text-sm"><Badge tone={docTone(r.type)}>{r.type}</Badge><div className="mt-1 text-muted">{fmtDate(r.posted_at)}</div></div>
              </li>))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
