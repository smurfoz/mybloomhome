import Link from 'next/link';
import { requireUser } from '../../lib/session.ts';
import { itemsList } from '../../lib/queries.ts';
import { fmtMoney, fmtQty } from '../../lib/format.ts';
import { PageTitle } from '../../components/ui.tsx';

export const dynamic = 'force-dynamic';

export default async function Items({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser('/items');
  const { q = '' } = await searchParams;
  const items = await itemsList(u, q);
  return (
    <>
      <PageTitle title="Items" sub={`${items.length} item${items.length === 1 ? '' : 's'}`}
        action={<Link href="/items/new" className="btn-primary">New item</Link>} />
      <form className="mb-4 flex gap-2">
        <input className="input" name="q" defaultValue={q} placeholder="Search code or name" aria-label="Search items" />
        <button className="btn-secondary">Search</button>
      </form>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="table">
          <thead><tr><th className="pl-4">Code</th><th>Name</th><th>Category</th><th className="num">On hand</th><th className="num pr-4">Value</th></tr></thead>
          <tbody>{items.map((i) => {
            const low = Number(i.reorder_level) > 0 && Number(i.on_hand) < Number(i.reorder_level);
            return (
              <tr key={i.id}>
                <td className="pl-4"><Link href={`/items/${i.id}`} className="font-medium hover:underline">{i.code}</Link></td>
                <td>{i.name}</td>
                <td className="text-muted">{i.category}</td>
                <td className={`num ${low ? 'font-semibold text-bad' : ''}`}>{fmtQty(i.on_hand)} {i.base_uom}</td>
                <td className="num pr-4">{fmtMoney(i.value)}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
    </>
  );
}
