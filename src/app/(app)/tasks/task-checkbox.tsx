'use client';

import { useTransition } from 'react';
import { setTaskStatus } from './actions';
import { cn } from '@/lib/utils';

export function TaskCheckbox({ taskId, done }: { taskId: string; done: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={done}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.checked ? 'DONE' : 'OPEN';
        startTransition(() => {
          setTaskStatus(taskId, next);
        });
      }}
      className={cn('h-4 w-4 rounded border-concrete-300 text-navy-700 focus:ring-navy-500', isPending && 'opacity-50')}
    />
  );
}
