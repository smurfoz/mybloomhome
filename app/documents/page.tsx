import Link from 'next/link';
import { requireUser } from '../../lib/session.ts';
import { documentsList } from '../../lib/queries.ts';
import { fmtDate } from '../../lib/format.ts';
import { Badge, PageTitle, docTone } from '../../components/ui.tsx';

export const dynamic = 'force-dynamic';

export default async function Documents() {
  const u = await requireUser('/documents');
  const docs = await documentsList(u);
  return (
    <>
      <PageTitle title="Documents" sub="Posted documents are read-only. Mistakes are corrected by reversal." />
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th className="pl-4">Number</th><th>Type</th><th>Store</th><th>Party</th><th>Posted</th><th className="pr-4">Status</th></tr></thead>
          <tbody>{docs.map((d) => (
            <tr key={d.id}>
              <td className="pl-4"><Link href={`/documents/${d.id}`} className="font-medium hover:underline">{d.doc_no}</Link></td>
              <td><Badge tone={docTone(d.type)}>{d.type}</Badge></td>
              <td>{d.store}</td>
              <td className="text-muted">{d.type === 'GRN' ? [d.supplier, d.supplier_ref].filter(Boolean).join(' · ') : d.type === 'ISSUE' ? d.receiver_name : `reverses ${d.reverses}`}</td>
              <td className="whitespace-nowrap text-muted">{fmtDate(d.posted_at)} · {d.by}</td>
              <td className="pr-4">{d.reversed_by ? <Badge tone="warn">reversed by {d.reversed_by}</Badge> : <span className="text-muted">posted</span>}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </>
  );
}
