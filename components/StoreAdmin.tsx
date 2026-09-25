'use client';
import { useState } from 'react';
import { postJson } from '../lib/client.ts';

function MiniForm({ title, fields, url, extra }: { title: string; url: string; extra?: Record<string, unknown>;
  fields: { name: string; label: string; options?: { value: number; label: string }[] }[] }) {
  const [msg, setMsg] = useState('');
  return (
    <form className="card space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = Object.fromEntries(new FormData(form));
      const body: Record<string, unknown> = { ...extra };
      for (const fd of fields) body[fd.name] = fd.options ? Number(f[fd.name]) : f[fd.name];
      const r = await postJson(url, body);
      if (r.ok) window.location.reload(); else setMsg(r.message);
    }}>
      <h3 className="font-semibold">{title}</h3>
      {fields.map((fd) => (
        <div key={fd.name}><label className="label" htmlFor={`${title}-${fd.name}`}>{fd.label}</label>
          {fd.options ? <select id={`${title}-${fd.name}`} name={fd.name} className="input">{fd.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <input id={`${title}-${fd.name}`} name={fd.name} className="input" required />}</div>))}
      {msg && <p role="alert" className="text-sm text-bad">{msg}</p>}
      <button className="btn-secondary">Add</button>
    </form>
  );
}

export function StoreAdmin({ isAdmin, projects, stores }: { isAdmin: boolean; projects: { id: number; name: string }[]; stores: { id: number; code: string }[] }) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {stores.length > 0 && <MiniForm title="New location" url="/api/locations" fields={[
        { name: 'storeId', label: 'Store', options: stores.map((s) => ({ value: s.id, label: s.code })) },
        { name: 'code', label: 'Code (e.g. RACK-A1, YARD)' }, { name: 'name', label: 'Description' }]} />}
      <MiniForm title="New supplier" url="/api/suppliers" fields={[{ name: 'name', label: 'Supplier name' }]} />
      {isAdmin && projects.length > 0 && <MiniForm title="New store" url="/api/stores" fields={[
        { name: 'projectId', label: 'Project', options: projects.map((p) => ({ value: p.id, label: p.name })) },
        { name: 'code', label: 'Store code' }, { name: 'name', label: 'Store name' }]} />}
    </div>
  );
}
