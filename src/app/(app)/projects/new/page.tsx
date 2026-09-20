import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { ProjectForm } from '../project-form';
import { createProject } from '../actions';

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const params = await searchParams;
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });

  return (
    <div>
      <PageHeader title="New Project" description="Track a construction project for quality inspections." />
      <Card className="max-w-2xl p-6">
        <ProjectForm action={createProject} companies={companies} defaultCompanyId={params.companyId} cancelHref="/projects" />
      </Card>
    </div>
  );
}
