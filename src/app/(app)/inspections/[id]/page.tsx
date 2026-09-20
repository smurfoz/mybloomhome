import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, Field, Input, Select, Textarea, Button } from '@/components/ui';
import { inspectionStatusTone } from '@/lib/tone';
import { formatCurrency, formatDate, titleCase } from '@/lib/utils';
import { updateInspectionStatus, uploadInspectionDocument } from '../actions';

export const dynamic = 'force-dynamic';

const STATUSES = ['SCHEDULED', 'PASSED', 'FAILED', 'NEEDS_REWORK'];

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id: id },
    include: { project: { include: { company: true } }, inspector: true, documents: true },
  });
  if (!inspection) notFound();

  const setStatus = updateInspectionStatus.bind(null, inspection.id);
  const uploadDoc = uploadInspectionDocument.bind(null, inspection.id, inspection.projectId);

  return (
    <div>
      <PageHeader
        title={inspection.title}
        description={`${inspection.project.company.name} — ${inspection.project.name} · ${titleCase(inspection.trade)}`}
        action={
          <LinkButton href={`/inspections/${inspection.id}/edit`} variant="secondary">
            Edit
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <Badge tone={inspectionStatusTone(inspection.status)}>{titleCase(inspection.status)}</Badge>
              <span className="text-sm text-concrete-500">Scheduled {formatDate(inspection.scheduledDate)}</span>
              {inspection.completedDate && <span className="text-sm text-concrete-500">Completed {formatDate(inspection.completedDate)}</span>}
              {inspection.inspector && <span className="text-sm text-concrete-500">Inspector: {inspection.inspector.name}</span>}
            </div>

            <form action={setStatus} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Select name="status" defaultValue={inspection.status}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Defects found">
                <Input name="defectsFound" type="number" min="0" defaultValue={inspection.defectsFound} />
              </Field>
              <Field label="Cost impact ($)">
                <Input name="costImpact" type="number" min="0" step="50" defaultValue={inspection.costImpact} />
              </Field>
              <div className="sm:col-span-3">
                <Field label="Findings / notes">
                  <Textarea name="notes" rows={3} defaultValue={inspection.notes ?? ''} placeholder="Document defects, photo references, and rework required…" />
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit">Update Inspection</Button>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-navy-950">Documentation ({inspection.documents.length})</h2>
            <form action={uploadDoc} className="mb-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <Input name="file" type="file" required />
              </div>
              <Select name="type" defaultValue="PHOTO" className="max-w-[180px]">
                {['PHOTO', 'REPORT', 'PUNCH_LIST', 'COMPLIANCE_CERT', 'OTHER'].map((t) => (
                  <option key={t} value={t}>
                    {titleCase(t)}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm">
                Upload
              </Button>
            </form>
            {inspection.documents.length === 0 ? (
              <p className="text-sm text-concrete-500">No photos or reports attached yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {inspection.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-navy-700 hover:underline">
                      {d.name}
                    </a>
                    <span className="text-xs text-concrete-500">{titleCase(d.type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-navy-950">Project</h2>
          <Link href={`/projects/${inspection.projectId}`} className="text-sm font-medium text-navy-700 hover:underline">
            {inspection.project.name} →
          </Link>
          <p className="mt-1 text-xs text-concrete-500">{inspection.project.address}</p>

          <div className="mt-4 space-y-2 border-t border-concrete-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-concrete-500">Defects found</span>
              <span className="font-medium text-navy-950">{inspection.defectsFound}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-concrete-500">Cost impact avoided</span>
              <span className="font-medium text-navy-950">{formatCurrency(inspection.costImpact)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
