import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PageHeader, Card } from '@/components/ui';
import { ProjectForm } from '../../project-form';
import { updateProject } from '../../actions';

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id: id } });
  if (!project) notFound();

  const action = updateProject.bind(null, project.id);

  return (
    <div>
      <PageHeader title={`Edit ${project.name}`} />
      <Card className="max-w-2xl p-6">
        <ProjectForm action={action} project={project} cancelHref={`/projects/${project.id}`} />
      </Card>
    </div>
  );
}
