import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, Select, Textarea, Button } from '@/components/ui';
import { dealStageTone, taskStatusTone } from '@/lib/tone';
import { formatCurrency, formatDate, timeAgo, titleCase } from '@/lib/utils';
import { addDealActivity, createProjectFromDeal, updateDealStage } from '../actions';

export const dynamic = 'force-dynamic';

const STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id: id },
    include: {
      company: true,
      contact: true,
      owner: true,
      projects: true,
      tasks: { orderBy: { createdAt: 'desc' } },
      activities: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 15 },
    },
  });
  if (!deal) notFound();

  const addActivity = addDealActivity.bind(null, deal.id);
  const setStage = updateDealStage.bind(null, deal.id);
  const createProject = createProjectFromDeal.bind(null, deal.id);

  return (
    <div>
      <PageHeader
        title={deal.title}
        description={`${deal.company.name}${deal.contact ? ` · ${deal.contact.firstName} ${deal.contact.lastName}` : ''}`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/deals/${deal.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            {deal.stage === 'WON' && deal.projects.length === 0 && (
              <form action={createProject}>
                <Button type="submit">Create Project</Button>
              </form>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <Badge tone={dealStageTone(deal.stage)}>{titleCase(deal.stage)}</Badge>
              <span className="text-lg font-semibold text-navy-950">{formatCurrency(deal.value)}</span>
              <span className="text-sm text-concrete-500">{deal.probability}% probability</span>
              <span className="text-sm text-concrete-500">Expected close {formatDate(deal.expectedClose)}</span>
            </div>

            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-concrete-500">Move stage</div>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <form key={s} action={setStage.bind(null, s)}>
                  <button
                    type="submit"
                    disabled={deal.stage === s}
                    className="rounded-full border border-concrete-300 px-3 py-1 text-xs font-medium text-concrete-700 hover:bg-concrete-50 disabled:cursor-default disabled:border-navy-900 disabled:bg-navy-900 disabled:text-white"
                  >
                    {titleCase(s)}
                  </button>
                </form>
              ))}
            </div>

            {deal.notes && <p className="mt-4 rounded-md bg-concrete-50 p-3 text-sm text-concrete-700">{deal.notes}</p>}

            <div className="mt-4 flex items-center gap-2 text-xs text-concrete-500">
              <Link href={`/companies/${deal.companyId}`} className="text-navy-700 hover:underline">
                View company →
              </Link>
              {deal.owner && <span>Owned by {deal.owner.name}</span>}
            </div>
          </Card>

          {deal.projects.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-navy-950">Linked Projects</h2>
              <ul className="space-y-2">
                {deal.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="text-sm font-medium text-navy-700 hover:underline">
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-navy-950">Tasks ({deal.tasks.length})</h2>
            {deal.tasks.length === 0 ? (
              <p className="text-sm text-concrete-500">No tasks linked to this deal.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {deal.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-concrete-800">{t.title}</span>
                    <Badge tone={taskStatusTone(t.status)}>{titleCase(t.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <LinkButton href={`/tasks/new?dealId=${deal.id}`} size="sm" variant="secondary" className="mt-3">
              + Task
            </LinkButton>
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-navy-950">Activity</h2>
          <form action={addActivity} className="mb-4 space-y-2">
            <Select name="type" defaultValue="NOTE">
              {['NOTE', 'CALL', 'EMAIL', 'MEETING'].map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </Select>
            <Textarea name="content" rows={2} placeholder="Log a note, call, or meeting…" required />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
          <ul className="space-y-3">
            {deal.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-concrete-800">{a.content}</p>
                <p className="mt-0.5 text-xs text-concrete-400">
                  {a.user?.name ?? 'System'} · {timeAgo(a.createdAt)}
                </p>
              </li>
            ))}
            {deal.activities.length === 0 && <p className="text-sm text-concrete-500">No activity logged yet.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
