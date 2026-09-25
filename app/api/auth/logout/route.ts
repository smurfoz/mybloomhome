import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { api } from '../../../../lib/api.ts';
import { getPool } from '../../../../lib/db.ts';
import { logout } from '../../../../lib/auth.ts';
import { SESSION_COOKIE } from '../../../../lib/session.ts';

export const POST = api({ auth: false }, async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await logout(getPool(), token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
