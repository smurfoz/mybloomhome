'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function date(formData: FormData, key: string) {
  const v = str(formData, key);
  return v ? new Date(v) : null;
}

export async function createTask(formData: FormData) {
  await requireSession();
  await prisma.task.create({
    data: {
      title: str(formData, 'title') ?? 'Untitled Task',
      description: str(formData, 'description'),
      priority: (str(formData, 'priority') as any) ?? 'MEDIUM',
      dueDate: date(formData, 'dueDate'),
      assigneeId: str(formData, 'assigneeId'),
      dealId: str(formData, 'dealId'),
      projectId: str(formData, 'projectId'),
    },
  });
  revalidatePath('/tasks');
  redirect('/tasks');
}

export async function setTaskStatus(taskId: string, status: string) {
  await requireSession();
  const task = await prisma.task.update({ where: { id: taskId }, data: { status: status as any } });
  revalidatePath('/tasks');
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  if (task.dealId) revalidatePath(`/deals/${task.dealId}`);
}
