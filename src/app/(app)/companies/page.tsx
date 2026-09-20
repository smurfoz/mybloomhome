import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, EmptyState, Select, Input } from '@/components/ui';
import { companyStatusTone } from '@/lib/tone';
import { titleCase } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}) {
  const params = await searchParams;
  const where: Prisma.CompanyWhereInput = {};
  if (params.status) where.status = params.status as any;
  if (params.type) where.type = params.type as any;
  if (params.q) where.name = { contains: params.q };

  const companies = await prisma.company.findMany({
    where,
    include: { _count: { select: { deals: true, projects: true, contacts: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Contractors, developers, and owners in your pipeline."
        action={<LinkButton href="/companies/new">+ New Company</LinkButton>}
      />

      <form className="mb-4 flex flex-wrap gap-3">
        <Input name="q" placeholder="Search by name…" defaultValue={params.q} className="max-w-xs" />
        <Select name="status" defaultValue={params.status ?? ''} className="max-w-[180px]">
          <option value="">All statuses</option>
          {['LEAD', 'PROSPECT', 'CLIENT', 'INACTIVE'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={params.type ?? ''} className="max-w-[220px]">
          <option value="">All types</option>
          {['GENERAL_CONTRACTOR', 'SUBCONTRACTOR', 'DEVELOPER', 'ARCHITECT', 'OWNER'].map((t) => (
            <option key={t} value={t}>
              {t.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-concrete-300 bg-white px-4 py-2 text-sm font-medium hover:bg-concrete-50">
          Filter
        </button>
      </form>

      {companies.length === 0 ? (
        <EmptyState title="No companies yet" description="Add your first client or prospect to get started." action={<LinkButton href="/companies/new">+ New Company</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-concrete-200 bg-concrete-50 text-xs uppercase text-concrete-500">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Deals</th>
                <th className="px-4 py-3">Projects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete-100">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-concrete-50">
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.id}`} className="font-medium text-navy-950 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{titleCase(c.type)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={companyStatusTone(c.status)}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-concrete-600">{c._count.contacts}</td>
                  <td className="px-4 py-3 text-concrete-600">{c._count.deals}</td>
                  <td className="px-4 py-3 text-concrete-600">{c._count.projects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
