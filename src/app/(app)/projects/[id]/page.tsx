import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, StatCard, Select, Textarea, Button, Input } from '@/components/ui';
import { projectStatusTone, inspectionStatusTone, taskStatusTone } from '@/lib/tone';
import { formatCurrency, formatDate, timeAgo, titleCase } from '@/lib/utils';
import { addProjectActivity, uploadProjectDocument } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id: id },
    include: {
      company: true,
      inspections: { orderBy: { scheduledDate: 'asc' } },
      documents: { orderBy: { uploadedAt: 'desc' } },
      tasks: { orderBy: { createdAt: 'desc' } },
      activities: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 15 },
    },
  });
  if (!project) notFound();

  const addActivity = addProjectActivity.bind(null, project.id);
  const uploadDoc = uploadProjectDocument.bind(null, project.id);

  const totalDefects = project.inspections.reduce((s, i) => s + i.defectsFound, 0);
  const totalCostImpact = project.inspections.reduce((s, i) => s + i.costImpact, 0);
  const failedOrRework = project.inspections.filter((i) => i.status === 'FAILED' || i.status === 'NEEDS_REWORK').length;

  return (
    <div>
      <PageHeader
        title={project.name}
        description={`${project.company.name} · ${project.address ?? 'No address on file'}`}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/projects/${project.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            <LinkButton href={`/inspections/new?projectId=${project.id}`}>+ Inspection</LinkButton>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={projectStatusTone(project.status)}>{titleCase(project.status)}</Badge>
        <span className="text-sm text-concrete-500">{titleCase(project.type)}</span>
        <span className="text-sm text-concrete-500">
          {formatDate(project.startDate)} – {formatDate(project.endDate)}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Budget" value={formatCurrency(project.budget)} />
        <StatCard label="Cost Saved" value={formatCurrency(project.costSaved)} tone="green" hint="via early defect capture" />
        <StatCard label="Defects Found" value={String(totalDefects)} tone="amber" hint={`${failedOrRework} inspections flagged`} />
        <StatCard label="Cost Impact Avoided" value={formatCurrency(totalCostImpact)} tone="red" hint="from inspection findings" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy-950">Inspections ({project.inspections.length})</h2>
              <LinkButton href={`/inspections/new?projectId=${project.id}`} size="sm" variant="secondary">
                + Inspection
              </LinkButton>
            </div>
            {project.inspections.length === 0 ? (
              <p className="text-sm text-concrete-500">No inspections scheduled yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {project.inspections.map((i) => (
                  <li key={i.id}>
                    <Link href={`/inspections/${i.id}`} className="flex items-center justify-between rounded-md py-2 -mx-2 px-2 hover:bg-concrete-50">
                      <div>
                        <p className="text-sm font-medium text-navy-950">{i.title}</p>
                        <p className="text-xs text-concrete-500">
                          {titleCase(i.trade)} · {formatDate(i.scheduledDate)}
                        </p>
                      </div>
                      <Badge tone={inspectionStatusTone(i.status)}>{titleCase(i.status)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-navy-950">Documents ({project.documents.length})</h2>
            <form action={uploadDoc} className="mb-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <Input name="file" type="file" required />
              </div>
              <Select name="type" defaultValue="REPORT" className="max-w-[180px]">
                {['PHOTO', 'REPORT', 'PERMIT', 'PUNCH_LIST', 'COMPLIANCE_CERT', 'OTHER'].map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm">
                Upload
              </Button>
            </form>
            {project.documents.length === 0 ? (
              <p className="text-sm text-concrete-500">No documents uploaded yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {project.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-navy-700 hover:underline">
                      {d.name}
                    </a>
                    <span className="text-xs text-concrete-500">
                      {titleCase(d.type)} · {formatDate(d.uploadedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy-950">Tasks ({project.tasks.length})</h2>
              <LinkButton href={`/tasks/new?projectId=${project.id}`} size="sm" variant="secondary">
                + Task
              </LinkButton>
            </div>
            {project.tasks.length === 0 ? (
              <p className="text-sm text-concrete-500">No tasks yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {project.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-concrete-800">{t.title}</span>
                    <Badge tone={taskStatusTone(t.status)}>{titleCase(t.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
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
            <Textarea name="content" rows={2} placeholder="Log a site note or finding…" required />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
          <ul className="space-y-3">
            {project.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-concrete-800">{a.content}</p>
                <p className="mt-0.5 text-xs text-concrete-400">
                  {a.user?.name ?? 'System'} · {timeAgo(a.createdAt)}
                </p>
              </li>
            ))}
            {project.activities.length === 0 && <p className="text-sm text-concrete-500">No activity logged yet.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
