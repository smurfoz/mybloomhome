import { LoginForm } from './LoginForm.tsx';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, never an absolute URL (no open redirect).
  const safeNext = next && /^\/(?!\/)/.test(next) ? next : '/';
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-xl text-white" aria-hidden>▦</span>
        <div>
          <h1 className="text-xl font-bold">Site Store</h1>
          <p className="text-sm text-muted">Receive, issue and track materials</p>
        </div>
      </div>
      <LoginForm next={safeNext} />
    </div>
  );
}
