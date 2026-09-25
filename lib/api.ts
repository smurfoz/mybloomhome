// Route-handler wrapper: session (SEC-1), roles (SEC-3), same-origin JSON for
// anything that changes data (SEC-5), and AppError → JSON.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getPool } from './db.ts';
import { sessionFromToken, requireRole, type SessionUser } from './auth.ts';
import { AppError } from './errors.ts';
import type { Role } from './ledger-db.ts';
import { SESSION_COOKIE } from './session.ts';

type Params = Record<string, string>;
type Handler<T> = (user: SessionUser, body: any, req: Request, params: Params) => Promise<T>;

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export function api<T>(opts: { roles?: Role[]; mutate?: boolean; auth?: boolean }, fn: Handler<T>) {
  return async (req: Request, context: { params?: Promise<Params> }) => {
    try {
      let body: unknown = undefined;
      if (opts.mutate !== false && req.method !== 'GET') {
        if (!sameOrigin(req)) throw new AppError('CROSS_ORIGIN', 'request must come from this site', 403);
        if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) {
          throw new AppError('BAD_INPUT', 'send JSON', 415);
        }
        body = await req.json().catch(() => { throw new AppError('BAD_INPUT', 'invalid JSON', 400); });
      }
      let user = null as unknown as SessionUser;
      if (opts.auth !== false) {
        const found = await sessionFromToken(getPool(), (await cookies()).get(SESSION_COOKIE)?.value);
        if (!found) throw new AppError('UNAUTHENTICATED', 'please sign in', 401);
        user = found;
        if (opts.roles) requireRole(user, opts.roles);
      }
      const result = await fn(user, body, req, (await context?.params) ?? {});
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'INTERNAL', message: 'something went wrong' }, { status: 500 });
    }
  };
}
