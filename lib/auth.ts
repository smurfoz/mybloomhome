// SEC-1..SEC-4. Framework-free so tests can call it directly; the Next.js
// cookie glue lives in lib/session.ts.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Db } from './db.ts';
import { fail } from './errors.ts';
import type { Ctx, Role } from './ledger-db.ts';

export const SESSION_HOURS = 12;
const N = 16384, KEYLEN = 64;

const scryptAsync = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N }, (err, key) => (err ? reject(err) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 10) fail('WEAK_PASSWORD', 'password must be at least 10 characters');
  const salt = randomBytes(16);
  return `scrypt$${N}$${salt.toString('base64')}$${(await scryptAsync(password, salt)).toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, , salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(String(password), Buffer.from(salt, 'base64'));
  const expected = Buffer.from(hash, 'base64');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

// Same work whether or not the email exists, so response time does not reveal
// which accounts are real.
const DUMMY_HASH = `scrypt$${N}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEYLEN).toString('base64')}`;

export async function login(db: Db, email: string, password: string) {
  const user = (await db.query(
    'SELECT id, password_hash, active FROM users WHERE email = lower($1)', [String(email ?? '').trim()])).rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) fail('BAD_LOGIN', 'email or password is wrong', 401);
  const token = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_HOURS} hours')`,
    [tokenHash(token), user.id]);
  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  return token;
}

export async function logout(db: Db, token: string) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)]);
}

export type SessionUser = Ctx & { name: string; email: string; companyName: string };

export async function sessionFromToken(db: Db, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const u = (await db.query(
    `SELECT u.id, u.company_id, u.role, u.name, u.email, c.name AS company_name
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = u.company_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [tokenHash(token)])).rows[0];
  if (!u) return null;
  const storeIds = u.role === 'admin' ? 'all' as const
    : (await db.query('SELECT store_id FROM user_stores WHERE user_id = $1', [u.id])).rows.map((r) => r.store_id);
  return { userId: u.id, companyId: u.company_id, role: u.role, name: u.name, email: u.email,
           companyName: u.company_name, storeIds };
}

// SEC-3
export const CAN = {
  post: ['admin', 'storekeeper'],
  reverse: ['admin', 'pm'],
  manage: ['admin', 'storekeeper'],
} satisfies Record<string, Role[]>;

export function requireRole(ctx: Ctx, allowed: Role[]) {
  if (!allowed.includes(ctx.role)) fail('FORBIDDEN', `a ${ctx.role} cannot do this`, 403);
}
