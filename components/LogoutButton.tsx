'use client';
import { postJson } from '../lib/client.ts';

export function LogoutButton() {
  return (
    <button className="text-sm font-medium text-muted hover:text-ink" onClick={async () => {
      await postJson('/api/auth/logout', {});
      window.location.href = '/login';
    }}>Sign out</button>
  );
}
