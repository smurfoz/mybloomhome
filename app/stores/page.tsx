import Link from 'next/link';
import { requireUser } from '../../lib/session.ts';
import { projects, storesWithLocations, suppliers } from '../../lib/queries.ts';
import { CAN } from '../../lib/auth.ts';
import { PageTitle, Badge } from '../../components/ui.tsx';
import { StoreAdmin } from '../../components/StoreAdmin.tsx';

export const dynamic = 'force-dynamic';

export default async function Stores() {
  const u = await requireUser('/stores');
  const [stores, projs, sups] = await Promise.all([storesWithLocations(u), projects(u), suppliers(u)]);
  const canManage = (CAN.manage as string[]).includes(u.role);
  return (
    <>
      <PageTitle title="Stores & suppliers" />
      <div className="grid gap-4 lg:grid-cols-2">
        {stores.map((s) => (
          <section key={s.id} className="card">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div><h2 className="font-semibold">{s.code} — {s.name}</h2><p className="text-sm text-muted">{s.project}</p></div>
              {!s.canPost && <Badge>view only</Badge>}
            </div>
            <ul className="divide-y divide-line">{s.locations.map((l) => (
              <li key={l.id} id={`location-${l.id}`} className="flex items-center justify-between py-2 target:bg-brand/10">
                <span><b>{l.code}</b> <span className="text-muted">{l.name}</span> {l.system && <Badge>system</Badge>}</span>
                {!l.system && <Link className="text-sm font-medium text-brand-ink hover:underline" href={`/labels?locations=${l.id}`}>Label</Link>}
              </li>))}</ul>
          </section>
        ))}
      </div>
      <section className="card mt-4">
        <h2 className="mb-2 font-semibold">Suppliers</h2>
        <p className="text-muted">{sups.map((x) => x.name).join(' · ') || 'None yet.'}</p>
      </section>
      {canManage && <StoreAdmin isAdmin={u.role === 'admin'} projects={projs}
        stores={stores.filter((s) => s.canPost).map((s) => ({ id: s.id, code: s.code }))} />}
    </>
  );
}
