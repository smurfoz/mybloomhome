import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, StatCard } from '@/components/ui';
import { KanbanBoard } from './kanban-board';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await prisma.deal.findMany({
    include: { company: true, owner: true },
    orderBy: { createdAt: 'desc' },
  });

  const open = deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const won = deals.filter((d) => d.stage === 'WON');
  const weighted = open.reduce((sum, d) => sum + (d.value * d.probability) / 100, 0);

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Drag cards between stages to update your pipeline."
        action={<LinkButton href="/deals/new">+ New Deal</LinkButton>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open Pipeline" value={formatCurrency(open.reduce((s, d) => s + d.value, 0))} hint={`${open.length} deals`} />
        <StatCard label="Weighted Pipeline" value={formatCurrency(weighted)} hint="value × probability" tone="amber" />
        <StatCard label="Won to Date" value={formatCurrency(won.reduce((s, d) => s + d.value, 0))} hint={`${won.length} deals`} tone="green" />
      </div>

      <KanbanBoard deals={deals} />
    </div>
  );
}
