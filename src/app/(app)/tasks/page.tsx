import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PageHeader, LinkButton, Card, Badge, EmptyState, Select } from '@/components/ui';
import { taskPriorityTone, taskStatusTone } from '@/lib/tone';
import { formatDate, titleCase } from '@/lib/utils';
import { TaskCheckbox } from './task-checkbox';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; assigneeId?: string }>;
}) {
  const params = await searchParams;
  const where: Prisma.TaskWhereInput = {};
  if (params.status) where.status = params.status as any;
  if (params.priority) where.priority = params.priority as any;
  if (params.assigneeId) where.assigneeId = params.assigneeId;

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where,
      include: { assignee: true, deal: true, project: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    }),
    prisma.user.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Follow-ups, punch items, and reminders across deals and projects."
        action={<LinkButton href="/tasks/new">+ New Task</LinkButton>}
      />

      <form className="mb-4 flex flex-wrap gap-3">
        <Select name="status" defaultValue={params.status ?? ''} className="max-w-[180px]">
          <option value="">All statuses</option>
          {['OPEN', 'IN_PROGRESS', 'DONE'].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select name="priority" defaultValue={params.priority ?? ''} className="max-w-[160px]">
          <option value="">All priorities</option>
          {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select name="assigneeId" defaultValue={params.assigneeId ?? ''} className="max-w-[200px]">
          <option value="">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <button type="submit" className="rounded-md border border-concrete-300 bg-white px-4 py-2 text-sm font-medium hover:bg-concrete-50">
          Filter
        </button>
      </form>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks found" description="Create a task to track follow-ups and punch items." action={<LinkButton href="/tasks/new">+ New Task</LinkButton>} />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-concrete-200 bg-concrete-50 text-xs uppercase text-concrete-500">
              <tr>
                <th className="px-4 py-3">Done</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Related to</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-concrete-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-concrete-50">
                  <td className="px-4 py-3">
                    <TaskCheckbox taskId={t.id} done={t.status === 'DONE'} />
                  </td>
                  <td className={`px-4 py-3 font-medium ${t.status === 'DONE' ? 'text-concrete-400 line-through' : 'text-navy-950'}`}>
                    {t.title}
                  </td>
                  <td className="px-4 py-3 text-concrete-600">
                    {t.deal && (
                      <Link href={`/deals/${t.deal.id}`} className="hover:underline">
                        {t.deal.title}
                      </Link>
                    )}
                    {t.project && (
                      <Link href={`/projects/${t.project.id}`} className="hover:underline">
                        {t.project.name}
                      </Link>
                    )}
                    {!t.deal && !t.project && '—'}
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{t.assignee?.name ?? 'Unassigned'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={taskPriorityTone(t.priority)}>{t.priority}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={taskStatusTone(t.status)}>{titleCase(t.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-concrete-600">{formatDate(t.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
