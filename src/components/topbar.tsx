import { initials } from '@/lib/utils';
import type { SessionPayload } from '@/lib/session';

export function Topbar({ session }: { session: SessionPayload }) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-end gap-4 border-b border-concrete-200 bg-white/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium text-navy-950">{session.name}</p>
          <p className="text-xs capitalize text-concrete-500">{session.role.toLowerCase()}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
          {initials(session.name)}
        </div>
        <form action="/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-concrete-300 px-3 py-1.5 text-xs font-medium text-concrete-600 hover:bg-concrete-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
