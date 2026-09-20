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

export async function createDeal(formData: FormData) {
  const session = await requireSession();
  const companyId = str(formData, 'companyId');
  if (!companyId) throw new Error('companyId is required');

  const deal = await prisma.deal.create({
    data: {
      title: str(formData, 'title') ?? 'Untitled Deal',
      companyId,
      contactId: str(formData, 'contactId'),
      stage: (str(formData, 'stage') as any) ?? 'LEAD',
      value: num(formData, 'value') ?? 0,
      probability: num(formData, 'probability') ?? 20,
      expectedClose: date(formData, 'expectedClose'),
      ownerId: session.userId,
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/deals');
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(dealId: string, formData: FormData) {
  await requireSession();
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      title: str(formData, 'title') ?? undefined,
      contactId: str(formData, 'contactId'),
      value: num(formData, 'value') ?? undefined,
      probability: num(formData, 'probability') ?? undefined,
      expectedClose: date(formData, 'expectedClose'),
      notes: str(formData, 'notes'),
    },
  });
  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

const STAGE_PROBABILITY: Record<string, number> = {
  LEAD: 15,
  QUALIFIED: 30,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  WON: 100,
  LOST: 0,
};

export async function updateDealStage(dealId: string, stage: string) {
  const session = await requireSession();
  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { stage: stage as any, probability: STAGE_PROBABILITY[stage] ?? undefined },
  });
  await prisma.activity.create({
    data: {
      type: 'STAGE_CHANGE',
      content: `Deal moved to ${stage.replaceAll('_', ' ')}.`,
      userId: session.userId,
      dealId: deal.id,
      companyId: deal.companyId,
    },
  });
  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}`);
}

export async function addDealActivity(dealId: string, formData: FormData) {
  const session = await requireSession();
  const content = str(formData, 'content');
  if (!content) return;
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  await prisma.activity.create({
    data: {
      type: (str(formData, 'type') as any) ?? 'NOTE',
      content,
      userId: session.userId,
      dealId,
      companyId: deal.companyId,
    },
  });
  revalidatePath(`/deals/${dealId}`);
}

export async function createProjectFromDeal(dealId: string) {
  await requireSession();
  const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const project = await prisma.project.create({
    data: {
      name: deal.title,
      companyId: deal.companyId,
      dealId: deal.id,
      status: 'PLANNING',
    },
  });
  revalidatePath(`/deals/${dealId}`);
  redirect(`/projects/${project.id}`);
}
