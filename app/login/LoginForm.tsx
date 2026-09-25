'use client';
import { useState } from 'react';
import { postJson } from '../../lib/client.ts';

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="card space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const f = new FormData(e.currentTarget);
      const r = await postJson('/api/auth/login', { email: f.get('email'), password: f.get('password') });
      setBusy(false);
      if (r.ok) window.location.href = next; else setError(r.message);
    }}>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-bad">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
