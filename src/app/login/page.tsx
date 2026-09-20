'use client';

import { Suspense, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { login, type LoginState } from './actions';
import { useSearchParams } from 'next/navigation';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-amber-500 px-4 py-2.5 font-semibold text-navy-950 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}

function LoginForm() {
  const [state, formAction] = useActionState(login, initialState);
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/dashboard';

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-navy-800 bg-navy-900 p-6 shadow-xl">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-concrete-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue="admin@olumbaquality.com"
          className="w-full rounded-md border border-navy-700 bg-navy-800 px-3 py-2 text-white placeholder-concrete-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          placeholder="you@olumbaquality.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-concrete-300">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          defaultValue="olumba2026"
          className="w-full rounded-md border border-navy-700 bg-navy-800 px-3 py-2 text-white placeholder-concrete-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          placeholder="••••••••"
        />
      </div>

      {state?.error && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">{state.error}</p>}

      <SubmitButton />

      <p className="pt-2 text-center text-xs text-concrete-500">
        Demo accounts: admin / priya (sales) / marcus (inspector) @olumbaquality.com — password{' '}
        <span className="font-mono">olumba2026</span>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500 text-lg font-bold text-navy-950">
            OQ
          </div>
          <h1 className="text-xl font-semibold text-white">Olumba Quality</h1>
          <p className="mt-1 text-sm text-concrete-400">Construction Consultancy CRM</p>
        </div>

        <Suspense fallback={<div className="h-64 rounded-xl border border-navy-800 bg-navy-900" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
