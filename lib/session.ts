// Next.js glue for SEC-1: the session cookie.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPool } from './db.ts';
import { SESSION_HOURS, sessionFromToken, type SessionUser } from './auth.ts';

export const SESSION_COOKIE = 'sid';

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_HOURS * 3600,
};

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionFromToken(getPool(), token);
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  return user;
}
