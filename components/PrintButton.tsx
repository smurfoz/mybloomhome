'use client';
export function PrintButton({ label = 'Print' }: { label?: string }) {
  return <button className="btn-secondary" onClick={() => window.print()}>{label}</button>;
}
