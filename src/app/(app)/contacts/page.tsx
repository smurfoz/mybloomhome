import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    include: { company: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Everyone you work with across client and prospect companies."
        action={<LinkButton href="/contacts/new">+ New Contact</LinkButton>}
      />

      {contacts.length === 0 ? (
        <EmptyState title="No contacts yet" description="Add a contact to start tracking relationships." action={<LinkButton href="/contacts/new">+ New Contact</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-concrete-200 bg-concrete-50 text-xs uppercase text-concrete-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete-100">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-concrete-50">
                  <td className="px-4 py-3 font-medium text-navy-950">
                    {c.firstName} {c.lastName}
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{c.title ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/companies/${c.companyId}`} className="text-navy-700 hover:underline">
                      {c.company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-concrete-600">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/contacts/${c.id}/edit`} className="text-xs font-medium text-navy-700 hover:underline">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
