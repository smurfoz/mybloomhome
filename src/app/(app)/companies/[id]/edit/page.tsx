import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { CompanyForm } from '../../company-form';
import { updateCompany } from '../../actions';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await prisma.company.findUnique({ where: { id: id } });
  if (!company) notFound();

  const action = updateCompany.bind(null, company.id);

  return (
    <div>
      <PageHeader title={`Edit ${company.name}`} />
      <Card className="max-w-2xl p-6">
        <CompanyForm action={action} company={company} cancelHref={`/companies/${company.id}`} />
      </Card>
    </div>
  );
}
