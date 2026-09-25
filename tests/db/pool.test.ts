import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { freshDb } from './helpers.ts';
import { createPool } from '../../lib/db.ts';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
let env: Awaited<ReturnType<typeof freshDb>>;
let uncaught: Error[] = [];
const onUncaught = (e: Error) => { uncaught.push(e); };
before(async () => { env = await freshDb(); process.on('uncaughtException', onUncaught); });
after(async () => { process.off('uncaughtException', onUncaught); await env?.drop(); });

test('DB-9 connections killed by the server (idle, or while the pool is closing) never crash the process', async () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  const dbName = new URL(env.url).pathname.slice(1);

  // 1. Idle pooled connections terminated by an admin: the next query still works.
  const pool = createPool(env.url, 5);
  const origLog = console.error;
  console.error = () => {};
  try {
    await Promise.all(Array.from({ length: 5 }, () => pool.query('SELECT 1')));
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [dbName]);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await pool.query('SELECT 41 + 1 AS n')).rows[0].n, 42, 'pool recovered');
    await pool.end();

    // 2. The CI race: pool.end() resolves before sockets close; kill them mid-close.
    for (let i = 0; i < 20; i++) {
      const name = `${dbName}_r${i}`;
      await admin.query(`CREATE DATABASE ${name}`);
      const p = createPool(env.url.replace(/\/[^/]+$/, `/${name}`), 8);
      await Promise.all(Array.from({ length: 8 }, () => p.query('SELECT 1')));
      await p.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    }
    await new Promise((r) => setTimeout(r, 300));
  } finally {
    console.error = origLog;
    await admin.end();
  }
  assert.deepEqual(uncaught.map((e) => e.message), [], 'no uncaught errors');
});
