import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { ContactForm } from '../contact-form';
import { createContact } from '../actions';

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div>
      <PageHeader title="New Contact" description="Add a person at a client or prospect company." />
      <Card className="max-w-2xl p-6">
        <ContactForm action={createContact} companies={companies} defaultCompanyId={params.companyId} cancelHref="/contacts" />
      </Card>
    </div>
  );
}
