'use client';
import { useState } from 'react';
import { newKey, postJson } from '../lib/client.ts';

export function ReverseButton({ documentId, docNo }: { documentId: number; docNo: string }) {
  const [key] = useState(newKey);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex flex-col items-end">
      <button className="btn-danger" disabled={busy} onClick={async () => {
        if (!confirm(`Reverse ${docNo}? This posts equal and opposite stock movements. It cannot be undone.`)) return;
        setBusy(true);
        const r = await postJson<{ id: number }>(`/api/documents/${documentId}/reverse`, { key });
        setBusy(false);
        if (r.ok) window.location.href = `/documents/${r.data.id}`; else setError(r.message);
      }}>{busy ? 'Reversing…' : 'Reverse'}</button>
      {error && <span role="alert" className="mt-1 text-sm text-bad">{error}</span>}
    </span>
  );
}
