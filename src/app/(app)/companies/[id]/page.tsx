import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, Select, Textarea, Button } from '@/components/ui';
import { companyStatusTone, dealStageTone, projectStatusTone } from '@/lib/tone';
import { formatCurrency, formatDate, timeAgo, titleCase } from '@/lib/utils';
import { addCompanyActivity } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id: id },
    include: {
      contacts: { orderBy: { createdAt: 'desc' } },
      deals: { orderBy: { createdAt: 'desc' } },
      projects: { orderBy: { createdAt: 'desc' } },
      activities: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 15 },
    },
  });
  if (!company) notFound();

  const addActivity = addCompanyActivity.bind(null, company.id);

  return (
    <div>
      <PageHeader
        title={company.name}
        description={[titleCase(company.type), [company.city, company.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        action={
          <div className="flex gap-2">
            <LinkButton href={`/companies/${company.id}/edit`} variant="secondary">
              Edit
            </LinkButton>
            <LinkButton href={`/deals/new?companyId=${company.id}`}>+ New Deal</LinkButton>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={companyStatusTone(company.status)}>{company.status}</Badge>
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="text-sm text-navy-700 hover:underline">
            {company.website}
          </a>
        )}
        {company.phone && <span className="text-sm text-concrete-600">{company.phone}</span>}
        {company.email && <span className="text-sm text-concrete-600">{company.email}</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy-950">Contacts ({company.contacts.length})</h2>
              <LinkButton href={`/contacts/new?companyId=${company.id}`} size="sm" variant="secondary">
                + Contact
              </LinkButton>
            </div>
            {company.contacts.length === 0 ? (
              <p className="text-sm text-concrete-500">No contacts yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {company.contacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-navy-950">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="text-xs text-concrete-500">{c.title}</p>
                    </div>
                    <div className="text-right text-xs text-concrete-500">
                      <p>{c.email}</p>
                      <p>{c.phone}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-navy-950">Deals ({company.deals.length})</h2>
            {company.deals.length === 0 ? (
              <p className="text-sm text-concrete-500">No deals yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {company.deals.map((d) => (
                  <li key={d.id} className="py-2">
                    <Link href={`/deals/${d.id}`} className="flex items-center justify-between hover:bg-concrete-50 -mx-2 px-2 py-1 rounded-md">
                      <div>
                        <p className="text-sm font-medium text-navy-950">{d.title}</p>
                        <p className="text-xs text-concrete-500">Expected close {formatDate(d.expectedClose)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-concrete-700">{formatCurrency(d.value)}</span>
                        <Badge tone={dealStageTone(d.stage)}>{titleCase(d.stage)}</Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-navy-950">Projects ({company.projects.length})</h2>
            {company.projects.length === 0 ? (
              <p className="text-sm text-concrete-500">No projects yet.</p>
            ) : (
              <ul className="divide-y divide-concrete-100">
                {company.projects.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link href={`/projects/${p.id}`} className="flex items-center justify-between hover:bg-concrete-50 -mx-2 px-2 py-1 rounded-md">
                      <div>
                        <p className="text-sm font-medium text-navy-950">{p.name}</p>
                        <p className="text-xs text-concrete-500">{p.address}</p>
                      </div>
                      <Badge tone={projectStatusTone(p.status)}>{titleCase(p.status)}</Badge>
                    </Link>
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
            <Textarea name="content" rows={2} placeholder="Log a note, call, or meeting…" required />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
          {company.notes && (
            <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">{company.notes}</div>
          )}
          <ul className="space-y-3">
            {company.activities.map((a) => (
              <li key={a.id} className="text-sm">
                <p className="text-concrete-800">{a.content}</p>
                <p className="mt-0.5 text-xs text-concrete-400">
                  {a.user?.name ?? 'System'} · {timeAgo(a.createdAt)}
                </p>
              </li>
            ))}
            {company.activities.length === 0 && <p className="text-sm text-concrete-500">No activity logged yet.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
