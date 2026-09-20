import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { DealForm } from '../../deal-form';
import { updateDeal } from '../../actions';

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await prisma.deal.findUnique({ where: { id: id } });
  if (!deal) notFound();

  const contacts = await prisma.contact.findMany({ where: { companyId: deal.companyId } });
  const action = updateDeal.bind(null, deal.id);

  return (
    <div>
      <PageHeader title={`Edit ${deal.title}`} />
      <Card className="max-w-2xl p-6">
        <DealForm action={action} deal={deal} contacts={contacts} cancelHref={`/deals/${deal.id}`} />
      </Card>
    </div>
  );
}
