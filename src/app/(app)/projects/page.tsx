import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, EmptyState, Select } from '@/components/ui';
import { projectStatusTone } from '@/lib/tone';
import { formatCurrency, titleCase } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string; type?: string }> }) {
  const params = await searchParams;
  const where: Prisma.ProjectWhereInput = {};
  if (params.status) where.status = params.status as any;
  if (params.type) where.type = params.type as any;

  const projects = await prisma.project.findMany({
    where,
    include: { company: true, _count: { select: { inspections: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Construction projects tracked for quality inspections and cost savings."
        action={<LinkButton href="/projects/new">+ New Project</LinkButton>}
      />

      <form className="mb-4 flex flex-wrap gap-3">
        <Select name="status" defaultValue={params.status ?? ''} className="max-w-[180px]">
          <option value="">All statuses</option>
          {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={params.type ?? ''} className="max-w-[200px]">
          <option value="">All types</option>
          {['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INFRASTRUCTURE'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-concrete-300 bg-white px-4 py-2 text-sm font-medium hover:bg-concrete-50">
          Filter
        </button>
      </form>

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" description="Projects usually start from a won deal, or add one directly." action={<LinkButton href="/projects/new">+ New Project</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-concrete-200 bg-concrete-50 text-xs uppercase text-concrete-500">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Cost Saved</th>
                <th className="px-4 py-3">Inspections</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-concrete-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-navy-950 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/companies/${p.companyId}`} className="text-navy-700 hover:underline">
                      {p.company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{titleCase(p.type)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={projectStatusTone(p.status)}>{titleCase(p.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{formatCurrency(p.budget)}</td>
                  <td className="px-4 py-3 font-medium text-green-700">{formatCurrency(p.costSaved)}</td>
                  <td className="px-4 py-3 text-concrete-600">{p._count.inspections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
