import { api } from '../../../lib/api.ts';
import { CAN } from '../../../lib/auth.ts';
import { getPool } from '../../../lib/db.ts';
import { postDocument } from '../../../lib/ledger-db.ts';

export const POST = api({ roles: CAN.post }, async (u, body) => postDocument(getPool(), u, body));
