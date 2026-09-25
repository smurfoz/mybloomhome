import { api } from '../../../lib/api.ts';
import { CAN } from '../../../lib/auth.ts';
import { getPool } from '../../../lib/db.ts';
import { createItem } from '../../../lib/items.ts';

export const POST = api({ roles: CAN.manage }, async (u, body) => createItem(getPool(), u, body));
