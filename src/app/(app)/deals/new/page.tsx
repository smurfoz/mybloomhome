import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { DealForm } from '../deal-form';
import { createDeal } from '../actions';

export default async function NewDealPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const [companies, contacts] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: 'asc' } }),
    params.companyId
      ? prisma.contact.findMany({ where: { companyId: params.companyId } })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title="New Deal" description="Add a sales opportunity to your pipeline." />
      <Card className="max-w-2xl p-6">
        <DealForm action={createDeal} companies={companies} contacts={contacts} defaultCompanyId={params.companyId} cancelHref="/deals" />
      </Card>
    </div>
  );
}
