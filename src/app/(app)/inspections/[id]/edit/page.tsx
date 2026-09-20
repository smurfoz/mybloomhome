import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { InspectionForm } from '../../inspection-form';
import { updateInspection } from '../../actions';

export default async function EditInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({ where: { id: id } });
  if (!inspection) notFound();

  const action = updateInspection.bind(null, inspection.id);

  return (
    <div>
      <PageHeader title={`Edit ${inspection.title}`} />
      <Card className="max-w-2xl p-6">
        <InspectionForm action={action} inspection={inspection} cancelHref={`/inspections/${inspection.id}`} />
      </Card>
    </div>
  );
}
