import { Field, Input, Select, Textarea, Button, LinkButton } from '@/components/ui';
import type { Company } from '@prisma/client';

const TYPES = ['GENERAL_CONTRACTOR', 'SUBCONTRACTOR', 'DEVELOPER', 'ARCHITECT', 'OWNER'];
const STATUSES = ['LEAD', 'PROSPECT', 'CLIENT', 'INACTIVE'];

export function CompanyForm({
  action,
  company,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  company?: Company;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Company name">
          <Input name="name" required defaultValue={company?.name} placeholder="e.g. Brightline Builders" />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={company?.type ?? 'GENERAL_CONTRACTOR'}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={company?.status ?? 'LEAD'}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={company?.website ?? ''} placeholder="https://" />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={company?.phone ?? ''} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={company?.email ?? ''} />
        </Field>
        <Field label="City">
          <Input name="city" defaultValue={company?.city ?? ''} />
        </Field>
        <Field label="State">
          <Input name="state" defaultValue={company?.state ?? ''} />
        </Field>
      </div>
      <Field label="Address">
        <Input name="address" defaultValue={company?.address ?? ''} />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={company?.notes ?? ''} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit">{company ? 'Save changes' : 'Create company'}</Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
