import { api } from '../../../lib/api.ts';
import { getPool } from '../../../lib/db.ts';
import { createStore } from '../../../lib/stores.ts';

export const POST = api({ roles: ['admin'] }, async (u, body) => createStore(getPool(), u, body));
