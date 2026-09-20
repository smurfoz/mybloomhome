'use server';

import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/session';

const VALID_ROLES = ['ADMIN', 'SALES', 'INSPECTOR'] as const;
type Role = (typeof VALID_ROLES)[number];

function asRole(role: string): Role {
  return (VALID_ROLES as readonly string[]).includes(role) ? (role as Role) : 'ADMIN';
}

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const next = String(formData.get('next') || '/dashboard');

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { error: 'Invalid email or password.' };
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return { error: 'Invalid email or password.' };
  }

  await createSession({ userId: user.id, name: user.name, email: user.email, role: asRole(user.role) });
  redirect(next.startsWith('/') ? next : '/dashboard');
}
