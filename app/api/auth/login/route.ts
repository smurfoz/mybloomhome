import { NextResponse } from 'next/server';
import { api } from '../../../../lib/api.ts';
import { getPool } from '../../../../lib/db.ts';
import { login } from '../../../../lib/auth.ts';
import { SESSION_COOKIE, cookieOptions } from '../../../../lib/session.ts';

export const POST = api({ auth: false }, async (_u, body) => {
  const token = await login(getPool(), body?.email, body?.password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
});
