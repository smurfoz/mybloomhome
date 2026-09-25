import { requireUser } from '../../lib/session.ts';
import { itemCode, storesWithLocations, suppliers } from '../../lib/queries.ts';
import { CAN } from '../../lib/auth.ts';
import { PageTitle } from '../../components/ui.tsx';
import { DocForm } from '../../components/DocForm.tsx';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ item?: string }> }) {
  const u = await requireUser('/receive');
  const { item } = await searchParams;
  if (!(CAN.post as string[]).includes(u.role)) {
    return <><PageTitle title="Receive delivery" /><p className="card text-muted">Your role ({u.role}) can view stock but not post documents.</p></>;
  }
  const stores = (await storesWithLocations(u)).filter((s) => s.canPost);
  return (
    <>
      <PageTitle title="Receive delivery" sub="Goods Received Note — only accepted quantity (received − rejected) enters stock." />
      <DocForm type="GRN" stores={stores} suppliers={await suppliers(u)} preselect={item ? (await itemCode(u, Number(item))) ?? undefined : undefined} />
    </>
  );
}
