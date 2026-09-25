import { notFound, redirect } from 'next/navigation';
import { requireUser } from '../../../lib/session.ts';
import { resolveQr } from '../../../lib/queries.ts';

// APP-2: a label's URL opens the right page — only inside the viewer's company.
export default async function Resolve({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = await requireUser(`/q/${code}`);
  const hit = await resolveQr(u, code);
  if (!hit) notFound();
  if (hit.entity_type === 'item') redirect(`/items/${hit.entity_id}`);
  if (hit.entity_type === 'document') redirect(`/documents/${hit.entity_id}`);
  redirect(`/stores#location-${hit.entity_id}`);
}
