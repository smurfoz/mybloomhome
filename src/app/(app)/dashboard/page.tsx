import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, StatCard, Card, Badge } from '@/components/ui';
import { formatCurrency, formatDate, timeAgo, titleCase } from '@/lib/utils';
import { dealStageTone, inspectionStatusTone } from '@/lib/tone';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const weekFromNow = new Date();
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  const [openDeals, wonThisMonth, activeProjects, upcomingInspections, projects, openTasks, recentActivity, dealsByStage] =
    await Promise.all([
      prisma.deal.findMany({ where: { stage: { notIn: ['WON', 'LOST'] } } }),
      prisma.deal.aggregate({
        where: { stage: 'WON', updatedAt: { gte: startOfMonth } },
        _sum: { value: true },
        _count: true,
      }),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.inspection.findMany({
        where: { status: 'SCHEDULED', scheduledDate: { lte: weekFromNow } },
        include: { project: { include: { company: true } } },
        orderBy: { scheduledDate: 'asc' },
        take: 5,
      }),
      prisma.project.findMany({ select: { costSaved: true } }),
      prisma.task.count({ where: { status: { not: 'DONE' } } }),
      prisma.activity.findMany({
        include: { user: true, company: true, deal: true, project: true, contact: true },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      prisma.deal.groupBy({ by: ['stage'], _sum: { value: true }, _count: true }),
    ]);

  const pipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const totalCostSaved = projects.reduce((sum, p) => sum + p.costSaved, 0);
  const stageOrder = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
  const stageMap = new Map(dealsByStage.map((s) => [s.stage, s]));
  const maxStageValue = Math.max(1, ...dealsByStage.map((s) => s._sum.value ?? 0));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Sales pipeline and construction quality performance at a glance."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Pipeline" value={formatCurrency(pipelineValue)} hint={`${openDeals.length} open deals`} tone="navy" />
        <StatCard
          label="Won This Month"
          value={formatCurrency(wonThisMonth._sum.value ?? 0)}
          hint={`${wonThisMonth._count} deal${wonThisMonth._count === 1 ? '' : 's'}`}
          tone="green"
        />
        <StatCard label="Active Projects" value={String(activeProjects)} hint="in construction" tone="amber" />
        <StatCard label="Cost Saved to Date" value={formatCurrency(totalCostSaved)} hint="via early defect capture" tone="green" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-950">Pipeline by Stage</h2>
            <Link href="/deals" className="text-xs font-medium text-navy-700 hover:underline">
              View pipeline →
            </Link>
          </div>
          <div className="space-y-3">
            {stageOrder.map((stage) => {
              const entry = stageMap.get(stage as any);
              const value = entry?._sum.value ?? 0;
              const count = entry?._count ?? 0;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <div className="w-24 shrink-0">
                    <Badge tone={dealStageTone(stage)}>{titleCase(stage)}</Badge>
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-concrete-100">
                    <div
                      className="h-full rounded-full bg-navy-700"
                      style={{ width: `${Math.max(3, (value / maxStageValue) * 100)}%` }}
                    />
                  </div>
                  <div className="w-32 shrink-0 text-right text-xs text-concrete-600">
                    {formatCurrency(value)} · {count}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-950">Upcoming Inspections</h2>
            <Link href="/inspections" className="text-xs font-medium text-navy-700 hover:underline">
              View all →
            </Link>
          </div>
          {upcomingInspections.length === 0 ? (
            <p className="text-sm text-concrete-500">Nothing scheduled in the next 7 days.</p>
          ) : (
            <ul className="space-y-3">
              {upcomingInspections.map((i) => (
                <li key={i.id}>
                  <Link href={`/inspections/${i.id}`} className="block rounded-md p-2 -mx-2 hover:bg-concrete-50">
                    <p className="text-sm font-medium text-navy-950">{i.title}</p>
                    <p className="text-xs text-concrete-500">
                      {i.project.company.name} · {i.project.name}
                    </p>
                    <p className="mt-1 text-xs font-medium text-amber-600">{formatDate(i.scheduledDate)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-950">Recent Activity</h2>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-concrete-500">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-concrete-100">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <Badge tone={a.type === 'STAGE_CHANGE' ? 'green' : a.type === 'SYSTEM' ? 'slate' : 'blue'}>
                    {titleCase(a.type)}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-concrete-800">{a.content}</p>
                    <p className="mt-0.5 text-xs text-concrete-400">
                      {a.user ? `${a.user.name} · ` : ''}
                      {a.company?.name ?? a.project?.name ?? a.deal?.title ?? ''} · {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-navy-950">Open Tasks</h2>
          <p className="text-3xl font-semibold text-navy-950">{openTasks}</p>
          <p className="mt-1 text-sm text-concrete-500">across deals, projects, and inspections</p>
          <Link href="/tasks" className="mt-4 inline-block text-xs font-medium text-navy-700 hover:underline">
            Go to task board →
          </Link>
        </Card>
      </div>
    </div>
  );
}
