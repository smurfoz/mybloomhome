import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { InspectionForm } from '../inspection-form';
import { createInspection } from '../actions';

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const params = await searchParams;
  const projects = await prisma.project.findMany({ include: { company: true }, orderBy: { name: 'asc' } });

  return (
    <div>
      <PageHeader title="Schedule Inspection" description="Create a quality inspection for a construction project." />
      <Card className="max-w-2xl p-6">
        <InspectionForm action={createInspection} projects={projects} defaultProjectId={params.projectId} cancelHref="/inspections" />
      </Card>
    </div>
  );
}
