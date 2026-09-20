import { Field, Input, Select, Button, LinkButton } from '@/components/ui';
import type { Contact, Company } from '@prisma/client';

export function ContactForm({
  action,
  contact,
  companies,
  defaultCompanyId,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  contact?: Contact;
  companies?: Company[];
  defaultCompanyId?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name">
          <Input name="firstName" required defaultValue={contact?.firstName} />
        </Field>
        <Field label="Last name">
          <Input name="lastName" required defaultValue={contact?.lastName} />
        </Field>
        <Field label="Title">
          <Input name="title" defaultValue={contact?.title ?? ''} placeholder="e.g. Project Executive" />
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
        <Field label="Email">
          <Input name="email" type="email" defaultValue={contact?.email ?? ''} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={contact?.phone ?? ''} />
        </Field>
      </div>
      <div className="flex gap-3">
        <Button type="submit">{contact ? 'Save changes' : 'Create contact'}</Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
