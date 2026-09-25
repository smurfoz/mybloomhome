import { headers } from 'next/headers';
import { requireUser } from '../../lib/session.ts';
import { itemsList, labelTargets, storesWithLocations } from '../../lib/queries.ts';
import { qrSvg, qrUrl } from '../../lib/qr.ts';
import { baseUrl } from '../../lib/base-url.ts';
import { PageTitle } from '../../components/ui.tsx';
import { PrintButton } from '../../components/PrintButton.tsx';

export const dynamic = 'force-dynamic';

const ids = (v?: string | string[]) => [...new Set([v ?? []].flat().flatMap((x) => x.split(',')).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];

// APP-3: A4 sheet (3 × 8, 70 × 37 mm) or one 50 × 25 mm thermal label per page.
export default async function Labels({ searchParams }: { searchParams: Promise<{ items?: string | string[]; locations?: string | string[]; format?: string }> }) {
  const u = await requireUser('/labels');
  const sp = await searchParams;
  const format = sp.format === 'thermal' ? 'thermal' : 'a4';
  const { items, locations } = await labelTargets(u, ids(sp.items), ids(sp.locations));
  const base = baseUrl(await headers());
  const labels = await Promise.all([
    ...items.map(async (i) => ({ key: `i${i.id}`, title: i.code, sub: i.name, code: i.qr, svg: await qrSvg(qrUrl(base, i.qr)) })),
    ...locations.map(async (l) => ({ key: `l${l.id}`, title: `${l.store} / ${l.code}`, sub: l.name, code: l.qr, svg: await qrSvg(qrUrl(base, l.qr)) })),
  ]);

  if (labels.length === 0) {
    const [all, stores] = await Promise.all([itemsList(u), storesWithLocations(u)]);
    return (
      <>
        <PageTitle title="Print labels" sub="Choose items and locations, then print. Labels use error correction level M and survive dust and scuffs." />
        <form className="space-y-4">
          <div className="card flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2"><input type="radio" name="format" value="a4" defaultChecked /> A4 sheet (24 per page)</label>
            <label className="flex items-center gap-2"><input type="radio" name="format" value="thermal" /> Thermal 50 × 25 mm</label>
            <button className="btn-primary ml-auto">Show labels</button>
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Locations</h2>
            <div className="grid gap-1 sm:grid-cols-3">{stores.flatMap((s) => s.locations.filter((l) => !l.system).map((l) => (
              <label key={l.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="locations" value={l.id} /> {s.code} / {l.code}</label>)))}</div>
          </div>
          <div className="card">
            <h2 className="mb-2 font-semibold">Items</h2>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{all.map((i) => (
              <label key={i.id} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="items" value={i.id} /> <span><b>{i.code}</b> <span className="text-muted">{i.name}</span></span></label>))}</div>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <style>{format === 'thermal'
        ? '@page { size: 50mm 25mm; margin: 0 } @media print { main { padding: 0 !important; max-width: none !important } }'
        : '@page { size: A4; margin: 10mm 0 } @media print { main { padding: 0 !important; max-width: none !important } }'}</style>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <PrintButton label={`Print ${labels.length} label${labels.length === 1 ? '' : 's'}`} />
        <a className="btn-secondary" href="/labels">Change selection</a>
        <span className="text-sm text-muted">Set the printer to 100% scale (no “fit to page”).</span>
      </div>
      {format === 'thermal' ? (
        <div className="flex flex-wrap gap-2 print:block">{labels.map((l) => (
          <div key={l.key} className="flex h-[25mm] w-[50mm] items-center gap-[1.5mm] overflow-hidden border border-line bg-white p-[1mm] print:break-after-page print:border-0">
            <div className="h-[23mm] w-[23mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.svg }} />
            <div className="min-w-0 leading-tight"><div className="truncate text-[9pt] font-bold">{l.title}</div>
              <div className="line-clamp-2 text-[6.5pt]">{l.sub}</div><div className="font-mono text-[6pt]">{l.code}</div></div>
          </div>))}</div>
      ) : (
        <div className="mx-auto grid w-[210mm] grid-cols-3 bg-white">{labels.map((l) => (
          <div key={l.key} className="flex h-[37mm] w-[70mm] items-center gap-[2mm] overflow-hidden border border-dashed border-line p-[2mm] print:border-transparent">
            <div className="h-[31mm] w-[31mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.svg }} />
            <div className="min-w-0 leading-tight"><div className="text-[11pt] font-bold">{l.title}</div>
              <div className="line-clamp-3 text-[8pt]">{l.sub}</div><div className="mt-1 font-mono text-[7pt]">{l.code}</div></div>
          </div>))}</div>
      )}
    </>
  );
}
