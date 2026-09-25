import { api } from '../../../lib/api.ts';
import { getPool } from '../../../lib/db.ts';
import { getOverrides } from '../../../lib/items.ts';

export const GET = api({ mutate: false }, async (u) => getOverrides(getPool(), u.companyId));
