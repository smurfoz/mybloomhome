import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '../../../lib/session.ts';
import { documentDetail } from '../../../lib/queries.ts';
import { CAN } from '../../../lib/auth.ts';
import { fmtDate, fmtMoney, fmtQty } from '../../../lib/format.ts';
import { Badge, PageTitle, docTone } from '../../../components/ui.tsx';
import { ReverseButton } from '../../../components/ReverseButton.tsx';
import { PrintButton } from '../../../components/PrintButton.tsx';

export const dynamic = 'force-dynamic';

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser(`/documents/${id}`);
  const d = await documentDetail(u, Number(id));
  if (!d) notFound();
  const { doc, lines, entries } = d;
  const canReverse = (CAN.reverse as string[]).includes(u.role) && doc.type !== 'REVERSAL' && !doc.reversed_by;
  const isGrn = doc.type === 'GRN';
  return (
    <>
      <PageTitle title={doc.doc_no} sub={<><Badge tone={docTone(doc.type)}>{doc.type}</Badge> {doc.store_name} · {fmtDate(doc.posted_at)} · {doc.by}</>}
        action={<div className="no-print flex gap-2"><PrintButton />{canReverse && <ReverseButton documentId={doc.id} docNo={doc.doc_no} />}</div>} />
      {doc.reversed_by && <p className="card mb-4 border-warn/40 text-warn">Reversed by <Link className="underline" href={`/documents/${doc.reversed_by_id}`}>{doc.reversed_by}</Link>.</p>}
      {doc.reverses && <p className="card mb-4">This reverses <b>{doc.reverses}</b>. Stock leaving the store was valued at the average cost at the time; any difference is shown as variance.</p>}
      <section className="card mb-4 grid gap-2 text-sm sm:grid-cols-3">
        {isGrn && <><div><span className="text-muted">Supplier:</span> {doc.supplier ?? '—'}</div><div><span className="text-muted">Delivery note / invoice:</span> {doc.supplier_ref ?? '—'}</div><div><span className="text-muted">Vehicle:</span> {doc.vehicle ?? '—'}</div></>}
        {doc.type === 'ISSUE' && <><div><span className="text-muted">Issued to:</span> {doc.receiver_name}</div><div><span className="text-muted">Work area:</span> {doc.work_area ?? '—'}</div></>}
        {doc.note && <div className="sm:col-span-3"><span className="text-muted">Note:</span> {doc.note}</div>}
      </section>
      {lines.length > 0 && (
        <section className="card mb-4 overflow-x-auto">
          <h2 className="mb-2 font-semibold">Lines</h2>
          <table className="table"><thead><tr><th>#</th><th>Item</th><th>Location</th><th className="num">{isGrn ? 'Received' : 'Qty'}</th>{isGrn && <><th className="num">Rejected</th><th className="num">Accepted</th><th className="num">Unit cost</th></>}</tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.line_no}><td>{l.line_no}</td>
                <td><Link className="font-medium hover:underline" href={`/items/${l.item_id}`}>{l.code}</Link><div className="text-muted">{l.name}</div></td>
                <td>{l.location}</td>
                <td className="num">{fmtQty(l.qty)} {l.uom}</td>
                {isGrn && <><td className="num">{fmtQty(l.rejected)}{l.reject_reason && <div className="text-xs text-muted">{l.reject_reason}</div>}</td>
                  <td className="num font-semibold">{fmtQty((Number(l.qty) - Number(l.rejected)).toFixed(4))} {l.uom}</td>
                  <td className="num">{fmtMoney(l.unit_cost)}</td></>}
              </tr>))}</tbody></table>
        </section>
      )}
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Stock movements</h2>
        <table className="table"><thead><tr><th>Item</th><th>Location</th><th className="num">Qty (base unit)</th><th className="num">Value</th><th className="num">Price variance</th></tr></thead>
          <tbody>{entries.map((e, i) => (
            <tr key={i}><td>{e.code}</td><td>{e.location}</td>
              <td className={`num font-semibold ${Number(e.qty) < 0 ? 'text-bad' : 'text-ok'}`}>{fmtQty(e.qty)} {e.base_uom}</td>
              <td className="num">{fmtMoney(e.value)}</td><td className="num">{e.price_variance ? fmtMoney(e.price_variance) : '—'}</td></tr>))}</tbody></table>
      </section>
    </>
  );
}
