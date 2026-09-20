import { Field, Input, Select, Textarea, Button, LinkButton } from '@/components/ui';
import type { Inspection, Project } from '@prisma/client';
import { formatDateInput } from '@/lib/utils';

const TRADES = ['SITEWORK', 'FOUNDATION', 'FRAMING', 'ROOFING', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'DRYWALL', 'FINISHES', 'FIRE_SAFETY', 'OTHER'];

export function InspectionForm({
  action,
  inspection,
  projects,
  defaultProjectId,
  cancelHref,
}: {
  action: (formData: FormData) => void;
  inspection?: Inspection;
  projects?: (Project & { company: { name: string } })[];
  defaultProjectId?: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Inspection title">
          <Input name="title" required defaultValue={inspection?.title} placeholder="e.g. Framing — Building B" />
        </Field>
        {projects && (
          <Field label="Project">
            <Select name="projectId" required defaultValue={defaultProjectId ?? ''}>
              <option value="" disabled>
                Select a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company.name} — {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Trade">
          <Select name="trade" defaultValue={inspection?.trade ?? 'OTHER'}>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scheduled date">
          <Input name="scheduledDate" type="date" defaultValue={formatDateInput(inspection?.scheduledDate)} />
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={inspection?.notes ?? ''} />
      </Field>
      <div className="flex gap-3">
        <Button type="submit">{inspection ? 'Save changes' : 'Schedule inspection'}</Button>
        <LinkButton href={cancelHref} variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
