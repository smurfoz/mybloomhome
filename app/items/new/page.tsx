import { requireUser } from '../../../lib/session.ts';
import { PageTitle } from '../../../components/ui.tsx';
import { ItemForm } from '../../../components/ItemForm.tsx';
import { TAXONOMY } from '../../../modules/smart-category/taxonomy.mjs';

export default async function NewItem() {
  await requireUser('/items/new');
  const categories = TAXONOMY.map((c) => ({ code: c.code, name: c.name, baseUom: c.baseUom }));
  return (
    <>
      <PageTitle title="New item" sub="Type the name as it appears on the invoice — Smart Category fills in the rest." />
      <ItemForm categories={categories} />
    </>
  );
}
