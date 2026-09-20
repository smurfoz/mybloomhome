import { Field, Input, Select, Textarea, Button, LinkButton } from '@/components/ui';
import type { Deal, Company, Contact } from '@prisma/client';
import { formatDateInput } from '@/lib/utils';

const STAGES = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

export function DealForm({
  action,
  deal,
  companies,
  contacts,
  defaultCompanyId,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  deal?: Deal;
  companies?: Company[];
  contacts?: Contact[];
  defaultCompanyId?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Deal title">
          <Input name="title" required defaultValue={deal?.title} placeholder="e.g. Riverside Lofts QA Program" />
        </Field>
        {companies && (
          <Field label="Company">
            <Select name="companyId" required defaultValue={defaultCompanyId ?? ''}>
              <option value="" disabled>
                Select a company
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {contacts && (
          <Field label="Primary contact (optional)">
            <Select name="contactId" defaultValue={deal?.contactId ?? ''}>
              <option value="">None</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!deal && (
          <Field label="Stage">
            <Select name="stage" defaultValue="LEAD">
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Value ($)">
          <Input name="value" type="number" min="0" step="500" defaultValue={deal?.value ?? 0} />
        </Field>
        <Field label="Probability (%)">
          <Input name="probability" type="number" min="0" max="100" defaultValue={deal?.probability ?? 20} />
        </Field>
        <Field label="Expected close">
          <Input name="expectedClose" type="date" defaultValue={formatDateInput(deal?.expectedClose)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={deal?.notes ?? ''} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit">{deal ? 'Save changes' : 'Create deal'}</Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
