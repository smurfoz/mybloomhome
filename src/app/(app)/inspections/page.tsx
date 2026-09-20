import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, EmptyState, Select } from '@/components/ui';
import { inspectionStatusTone } from '@/lib/tone';
import { formatCurrency, formatDate, titleCase } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function InspectionsPage({ searchParams }: { searchParams: Promise<{ status?: string; trade?: string }> }) {
  const params = await searchParams;
  const where: Prisma.InspectionWhereInput = {};
  if (params.status) where.status = params.status as any;
  if (params.trade) where.trade = params.trade as any;

  const inspections = await prisma.inspection.findMany({
    where,
    include: { project: { include: { company: true } }, inspector: true },
    orderBy: { scheduledDate: 'asc' },
  });

  return (
    <div>
      <PageHeader
        title="Inspections"
        description="Quality inspections across all active construction projects."
        action={<LinkButton href="/inspections/new">+ Schedule Inspection</LinkButton>}
      />

      <form className="mb-4 flex flex-wrap gap-3">
        <Select name="status" defaultValue={params.status ?? ''} className="max-w-[180px]">
          <option value="">All statuses</option>
          {['SCHEDULED', 'PASSED', 'FAILED', 'NEEDS_REWORK'].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Select name="trade" defaultValue={params.trade ?? ''} className="max-w-[200px]">
          <option value="">All trades</option>
          {['SITEWORK', 'FOUNDATION', 'FRAMING', 'ROOFING', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'DRYWALL', 'FINISHES', 'FIRE_SAFETY', 'OTHER'].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-concrete-300 bg-white px-4 py-2 text-sm font-medium hover:bg-concrete-50">
          Filter
        </button>
      </form>

      {inspections.length === 0 ? (
        <EmptyState title="No inspections found" description="Schedule an inspection to start tracking quality on a project." action={<LinkButton href="/inspections/new">+ Schedule Inspection</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-concrete-200 bg-concrete-50 text-xs uppercase text-concrete-500">
              <tr>
                <th className="px-4 py-3">Inspection</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Defects</th>
                <th className="px-4 py-3">Cost Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete-100">
              {inspections.map((i) => (
                <tr key={i.id} className="hover:bg-concrete-50">
                  <td className="px-4 py-3">
                    <Link href={`/inspections/${i.id}`} className="font-medium text-navy-950 hover:underline">
                      {i.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">
                    <Link href={`/projects/${i.projectId}`} className="hover:underline">
                      {i.project.company.name} — {i.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{titleCase(i.trade)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={inspectionStatusTone(i.status)}>{titleCase(i.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{formatDate(i.scheduledDate)}</td>
                  <td className="px-4 py-3 text-concrete-600">{i.defectsFound}</td>
                  <td className="px-4 py-3 text-concrete-600">{formatCurrency(i.costImpact)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
