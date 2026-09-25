import { api } from '../../../lib/api.ts';
import { CAN } from '../../../lib/auth.ts';
import { getPool } from '../../../lib/db.ts';
import { assertStoreAccess } from '../../../lib/ledger-db.ts';
import { createLocation } from '../../../lib/stores.ts';

export const POST = api({ roles: CAN.manage }, async (u, body) => {
  assertStoreAccess(u, Number(body?.storeId));
  return createLocation(getPool(), u, body);
});
