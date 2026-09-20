'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
function num(formData: FormData, key: string) {
  const v = str(formData, key);
  return v ? Number(v) : null;
}
function date(formData: FormData, key: string) {
  const v = str(formData, key);
  return v ? new Date(v) : null;
}

export async function createProject(formData: FormData) {
  await requireSession();
  const companyId = str(formData, 'companyId');
  if (!companyId) throw new Error('companyId is required');

  const project = await prisma.project.create({
    data: {
      name: str(formData, 'name') ?? 'Untitled Project',
      companyId,
      type: (str(formData, 'type') as any) ?? 'COMMERCIAL',
      status: (str(formData, 'status') as any) ?? 'PLANNING',
      address: str(formData, 'address'),
      budget: num(formData, 'budget'),
      startDate: date(formData, 'startDate'),
      endDate: date(formData, 'endDate'),
    },
  });
  revalidatePath('/projects');
  redirect(`/projects/${project.id}`);
}

export async function updateProject(projectId: string, formData: FormData) {
  await requireSession();
  await prisma.project.update({
    where: { id: projectId },
    data: {
      name: str(formData, 'name') ?? undefined,
      type: (str(formData, 'type') as any) ?? undefined,
      status: (str(formData, 'status') as any) ?? undefined,
      address: str(formData, 'address'),
      budget: num(formData, 'budget'),
      costSaved: num(formData, 'costSaved') ?? undefined,
      startDate: date(formData, 'startDate'),
      endDate: date(formData, 'endDate'),
    },
  });
  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function addProjectActivity(projectId: string, formData: FormData) {
  const session = await requireSession();
  const content = str(formData, 'content');
  if (!content) return;
  await prisma.activity.create({
    data: {
      type: (str(formData, 'type') as any) ?? 'NOTE',
      content,
      userId: session.userId,
      projectId,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function uploadProjectDocument(projectId: string, formData: FormData) {
  await requireSession();
  const file = formData.get('file') as File | null;
  const type = (str(formData, 'type') as any) ?? 'OTHER';
  if (!file || file.size === 0) return;

  const fs = await import('fs/promises');
  const path = await import('path');
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const fileName = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(uploadsDir, fileName), buffer);

  await prisma.document.create({
    data: {
      name: file.name,
      type,
      fileUrl: `/uploads/${fileName}`,
      projectId,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}
