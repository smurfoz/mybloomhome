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

export async function createInspection(formData: FormData) {
  const session = await requireSession();
  const projectId = str(formData, 'projectId');
  if (!projectId) throw new Error('projectId is required');

  const inspection = await prisma.inspection.create({
    data: {
      projectId,
      title: str(formData, 'title') ?? 'Untitled Inspection',
      trade: (str(formData, 'trade') as any) ?? 'OTHER',
      status: 'SCHEDULED',
      scheduledDate: date(formData, 'scheduledDate'),
      inspectorId: str(formData, 'inspectorId') ?? session.userId,
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/inspections');
  revalidatePath(`/projects/${projectId}`);
  redirect(`/inspections/${inspection.id}`);
}

export async function updateInspectionStatus(inspectionId: string, formData: FormData) {
  await requireSession();
  const status = str(formData, 'status') as any;
  const inspection = await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      status,
      defectsFound: num(formData, 'defectsFound') ?? undefined,
      costImpact: num(formData, 'costImpact') ?? undefined,
      notes: str(formData, 'notes'),
      completedDate: status === 'SCHEDULED' ? null : new Date(),
    },
  });
  revalidatePath('/inspections');
  revalidatePath(`/inspections/${inspectionId}`);
  revalidatePath(`/projects/${inspection.projectId}`);
}

export async function updateInspection(inspectionId: string, formData: FormData) {
  await requireSession();
  const inspection = await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      title: str(formData, 'title') ?? undefined,
      trade: (str(formData, 'trade') as any) ?? undefined,
      scheduledDate: date(formData, 'scheduledDate'),
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/inspections');
  revalidatePath(`/inspections/${inspectionId}`);
  redirect(`/inspections/${inspectionId}`);
}

export async function uploadInspectionDocument(inspectionId: string, projectId: string, formData: FormData) {
  await requireSession();
  const file = formData.get('file') as File | null;
  const type = (str(formData, 'type') as any) ?? 'PHOTO';
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
      inspectionId,
      projectId,
    },
  });
  revalidatePath(`/inspections/${inspectionId}`);
}
