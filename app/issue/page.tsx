import { requireUser } from '../../lib/session.ts';
import { itemCode, storesWithLocations, suppliers } from '../../lib/queries.ts';
import { CAN } from '../../lib/auth.ts';
import { PageTitle } from '../../components/ui.tsx';
import { DocForm } from '../../components/DocForm.tsx';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const u = await requireUser('/issue');
  const { item } = await searchParams;
  if (!(CAN.post as string[]).includes(u.role)) {
    return <><PageTitle title="Issue material" /><p className="card text-muted">Your role ({u.role}) can view stock but not post documents.</p></>;
  }
  const stores = (await storesWithLocations(u)).filter((s) => s.canPost);
  return (
    <>
      <PageTitle title="Issue material" sub="Stock leaves at the current average cost." />
      <DocForm type="ISSUE" stores={stores} suppliers={await suppliers(u)} preselect={item ? (await itemCode(u, Number(item))) ?? undefined : undefined} />
    </>
  );
}
