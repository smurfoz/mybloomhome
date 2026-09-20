import { prisma } from '@/lib/prisma';
import { PageHeader, Card, Field, Input, Select, Textarea, Button, LinkButton } from '@/components/ui';
import { createTask } from '../actions';

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ dealId?: string; projectId?: string }>;
}) {
  const params = await searchParams;
  const [users, deals, projects] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
    prisma.deal.findMany({ orderBy: { title: 'asc' } }),
    prisma.project.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div>
      <PageHeader title="New Task" description="Create a follow-up, punch item, or reminder." />
      <Card className="max-w-2xl p-6">
        <form action={createTask} className="space-y-5">
          <Field label="Title">
            <Input name="title" required placeholder="e.g. Re-inspect rough electrical" />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM">
                {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input name="dueDate" type="date" />
            </Field>
            <Field label="Assignee">
              <Select name="assigneeId" defaultValue="">
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Related deal (optional)">
              <Select name="dealId" defaultValue={params.dealId ?? ''}>
                <option value="">None</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Related project (optional)">
              <Select name="projectId" defaultValue={params.projectId ?? ''}>
                <option value="">None</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Textarea name="description" rows={3} />
          </Field>
          <div className="flex gap-3">
            <Button type="submit">Create task</Button>
            <LinkButton href="/tasks" variant="secondary">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
