import { Field, Input, Select, Button, LinkButton } from '@/components/ui';
import type { Project, Company } from '@prisma/client';
import { formatDateInput } from '@/lib/utils';

const TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'INFRASTRUCTURE'];
const STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

export function ProjectForm({
  action,
  project,
  companies,
  defaultCompanyId,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  project?: Project;
  companies?: Company[];
  defaultCompanyId?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <Input name="name" required defaultValue={project?.name} placeholder="e.g. Riverside Lofts" />
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
        <Field label="Type">
          <Select name="type" defaultValue={project?.type ?? 'COMMERCIAL'}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={project?.status ?? 'PLANNING'}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Budget ($)">
          <Input name="budget" type="number" min="0" step="1000" defaultValue={project?.budget ?? ''} />
        </Field>
        {project && (
          <Field label="Cost saved to date ($)">
            <Input name="costSaved" type="number" min="0" step="100" defaultValue={project?.costSaved ?? 0} />
          </Field>
        )}
        <Field label="Start date">
          <Input name="startDate" type="date" defaultValue={formatDateInput(project?.startDate)} />
        </Field>
        <Field label="End date">
          <Input name="endDate" type="date" defaultValue={formatDateInput(project?.endDate)} />
        </Field>
      </div>
      <Field label="Address">
        <Input name="address" defaultValue={project?.address ?? ''} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit">{project ? 'Save changes' : 'Create project'}</Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
