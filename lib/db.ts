import pg from 'pg';

// bigint ids fit comfortably in a JS number; NUMERIC stays a string (DB-5).
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Client = pg.PoolClient;

let pool: pg.Pool | undefined;

// DB-9: a connection the server drops (restart, failover, admin terminate)
// must never crash the process. Without these handlers pg emits an 'error'
// nobody listens to, which Node turns into an uncaught exception. The pool
// discards the broken client and opens a new one on the next query.
function resilient(p: pg.Pool): pg.Pool {
  const log = (err: Error) => { if (!p.ending) console.error(`[db] connection lost: ${err.message}`); };
  p.on('error', log);
  p.on('connect', (client) => client.on('error', log));
  return p;
}

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = resilient(new pg.Pool({ connectionString, max: 10 }));
  }
  return pool;
}

export function createPool(connectionString: string, max = 10): pg.Pool {
  return resilient(new pg.Pool({ connectionString, max }));
}

const RETRYABLE = new Set(['40P01', '40001']); // deadlock, serialization failure

// Run fn in a transaction. Deadlocks cannot happen with the ledger's lock
// ordering, but a retry keeps a rare one from ever reaching the user.
export async function tx<T>(db: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      if (attempt < 3 && RETRYABLE.has((e as { code?: string }).code ?? '')) continue;
      throw e;
    } finally {
      c.release();
    }
  }
}
