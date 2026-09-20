'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export async function createCompany(formData: FormData) {
  await requireSession();
  const company = await prisma.company.create({
    data: {
      name: str(formData, 'name') ?? 'Untitled Company',
      type: (str(formData, 'type') as any) ?? 'GENERAL_CONTRACTOR',
      status: (str(formData, 'status') as any) ?? 'LEAD',
      website: str(formData, 'website'),
      phone: str(formData, 'phone'),
      email: str(formData, 'email'),
      address: str(formData, 'address'),
      city: str(formData, 'city'),
      state: str(formData, 'state'),
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/companies');
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(companyId: string, formData: FormData) {
  await requireSession();
  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: str(formData, 'name') ?? undefined,
      type: (str(formData, 'type') as any) ?? undefined,
      status: (str(formData, 'status') as any) ?? undefined,
      website: str(formData, 'website'),
      phone: str(formData, 'phone'),
      email: str(formData, 'email'),
      address: str(formData, 'address'),
      city: str(formData, 'city'),
      state: str(formData, 'state'),
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/companies');
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}`);
}

export async function deleteCompany(companyId: string) {
  await requireSession();
  await prisma.company.delete({ where: { id: companyId } });
  revalidatePath('/companies');
  redirect('/companies');
}

export async function addCompanyActivity(companyId: string, formData: FormData) {
  const session = await requireSession();
  const content = str(formData, 'content');
  if (!content) return;
  await prisma.activity.create({
    data: {
      type: (str(formData, 'type') as any) ?? 'NOTE',
      content,
      userId: session.userId,
      companyId,
    },
  });
  revalidatePath(`/companies/${companyId}`);
}
