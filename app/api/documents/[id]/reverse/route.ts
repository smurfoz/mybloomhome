import { api } from '../../../../../lib/api.ts';
import { CAN } from '../../../../../lib/auth.ts';
import { getPool } from '../../../../../lib/db.ts';
import { reverseDocument } from '../../../../../lib/ledger-db.ts';

export const POST = api({ roles: CAN.reverse }, async (u, body, _req, params) =>
  reverseDocument(getPool(), u, { key: body?.key, documentId: Number(params.id), note: body?.note }));
