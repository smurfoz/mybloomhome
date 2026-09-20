'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

function str(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export async function createContact(formData: FormData) {
  await requireSession();
  const companyId = str(formData, 'companyId');
  if (!companyId) throw new Error('companyId is required');

  await prisma.contact.create({
    data: {
      firstName: str(formData, 'firstName') ?? 'Unknown',
      lastName: str(formData, 'lastName') ?? '',
      title: str(formData, 'title'),
      email: str(formData, 'email'),
      phone: str(formData, 'phone'),
      companyId,
    },
  });
  revalidatePath('/contacts');
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}`);
}

export async function updateContact(contactId: string, formData: FormData) {
  await requireSession();
  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: {
      firstName: str(formData, 'firstName') ?? undefined,
      lastName: str(formData, 'lastName') ?? undefined,
      title: str(formData, 'title'),
      email: str(formData, 'email'),
      phone: str(formData, 'phone'),
    },
  });
  revalidatePath('/contacts');
  revalidatePath(`/companies/${contact.companyId}`);
  redirect('/contacts');
}

export async function deleteContact(contactId: string) {
  await requireSession();
  const contact = await prisma.contact.delete({ where: { id: contactId } });
  revalidatePath('/contacts');
  revalidatePath(`/companies/${contact.companyId}`);
  redirect('/contacts');
}
