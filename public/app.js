const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtQty = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
const fmtTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, kind = 'ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = ''), 4000);
}

function table(cols, rows, empty = 'Nothing here yet.') {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows
    .map((r) => `<tr ${r._attrs || ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(r[c.key])}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const TYPE_LABEL = { DELIVERY: 'Delivery', ISSUE: 'Issued', RETURN: 'Returned', ADJUSTMENT: 'Adjustment' };
const badge = (type) => `<span class="badge ${type.toLowerCase()}">${TYPE_LABEL[type] || type}</span>`;

// ---------- "recorded by" is remembered per device ----------
const who = $('#recordedBy');
try { who.value = localStorage.getItem('recordedBy') || ''; } catch {}
who.addEventListener('change', () => { try { localStorage.setItem('recordedBy', who.value.trim()); } catch {} });

// ---------- reference data ----------
const state = { items: [], installers: [], projects: [], suppliers: [] };

async function loadRefData() {
  [state.items, state.installers, state.projects, state.suppliers] = await Promise.all([
    api('/api/items'), api('/api/installers'), api('/api/projects'), api('/api/suppliers'),
  ]);
  fillSelects();
}

function fillSelects() {
  const inFilter = (sel) => !!sel.closest('#logFilter');
  for (const sel of $$('select[data-installers]')) {
    const keep = sel.value;
    const active = state.installers.filter((i) => i.active || inFilter(sel));
    sel.innerHTML = `<option value="">${inFilter(sel) ? 'All installers' : 'Select installer…'}</option>` +
      active.map((i) => `<option value="${i.id}">${esc(i.name)}${i.company ? ' — ' + esc(i.company) : ''}</option>`).join('');
    sel.value = keep;
  }
  for (const sel of $$('select[data-projects]')) {
    const keep = sel.value;
    const list = state.projects.filter((p) => p.active || inFilter(sel));
    sel.innerHTML = `<option value="">${inFilter(sel) ? 'All projects' : '— none —'}</option>` +
      list.map((p) => `<option value="${p.id}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    sel.value = keep;
  }
  for (const sel of $$('select[data-items]')) {
    const keep = sel.value;
    sel.innerHTML = `<option value="">${inFilter(sel) ? 'All items' : 'Select item…'}</option>` +
      state.items.map((i) => `<option value="${i.id}">${esc(i.sku)} · ${esc(i.name)}</option>`).join('');
    sel.value = keep;
  }
  $('#supplierList').innerHTML = state.suppliers.map((s) => `<option value="${esc(s.name)}">`).join('');
}

// ---------- line editor (scan / type SKU, Enter to add) ----------
const editors = {};

function lineEditor(mode) {
  const root = $(`[data-lines="${mode}"]`);
  const lines = []; // { item, qty } or { newItem: {sku,name,unit}, qty }
  root.innerHTML = `
    <div class="scan">
      <input class="code" placeholder="Scan barcode or type SKU" autocomplete="off">
      <input class="qty" type="number" min="0" step="any" value="1" aria-label="Quantity">
      <button type="button" class="add">Add</button>
    </div>
    <div class="new-item" hidden>
      <span>New item <b class="new-sku"></b> — it will be added to the catalogue:</span>
      <input class="new-name" placeholder="Item name">
      <input class="new-unit" placeholder="Unit (pcs)">
      <button type="button" class="add-new">Add new item</button>
    </div>
    <div class="lines"></div>`;
  const code = $('.code', root), qty = $('.qty', root), newBox = $('.new-item', root);

  function available(item) {
    if (mode === 'issue') return item.on_hand;
    if (mode === 'return') return editors.returnHeld?.get(item.id) ?? 0;
    return null;
  }

  function render() {
    $('.lines', root).innerHTML = table(
      [
        { label: 'SKU', html: (l) => esc(l.item?.sku ?? l.newItem.sku) + (l.newItem ? ' <span class="badge new">new</span>' : '') },
        { label: 'Item', html: (l) => esc(l.item?.name ?? l.newItem.name) },
        { label: 'Qty', num: true, html: (l) => `<input class="line-qty" data-i="${lines.indexOf(l)}" type="number" min="0" step="any" value="${l.qty}">` },
        { label: 'Unit', html: (l) => esc(l.item?.unit ?? (l.newItem.unit || 'pcs')) },
        ...(mode === 'deliver' ? [] : [{
          label: mode === 'issue' ? 'On hand' : 'Held', num: true,
          html: (l) => {
            const a = available(l.item);
            return `<span class="${l.qty > a ? 'bad' : ''}">${fmtQty(a)}</span>`;
          },
        }]),
        { label: '', html: (l) => `<button type="button" class="link remove" data-i="${lines.indexOf(l)}">Remove</button>` },
      ],
      lines,
      'No lines yet — scan or type a SKU above.'
    );
  }

  function push(entry) {
    const key = entry.item?.id ?? `new:${entry.newItem.sku.toLowerCase()}`;
    const existing = lines.find((l) => (l.item?.id ?? `new:${l.newItem.sku.toLowerCase()}`) === key);
    if (existing) existing.qty += entry.qty; else lines.push(entry);
    code.value = ''; qty.value = 1; newBox.hidden = true;
    render();
    code.focus();
  }

  async function add() {
    const c = code.value.trim();
    const n = Number(qty.value);
    if (!c) return code.focus();
    if (!(n > 0)) return toast('Quantity must be more than zero', 'err');
    const local = state.items.find((i) => i.sku.toLowerCase() === c.toLowerCase() || i.barcode === c);
    if (local) return push({ item: local, qty: n });
    try {
      push({ item: await api(`/api/items/lookup?code=${encodeURIComponent(c)}`), qty: n });
    } catch {
      if (mode === 'deliver') {
        $('.new-sku', root).textContent = c;
        newBox.hidden = false;
        $('.new-name', root).focus();
      } else {
        toast(`No item with SKU or barcode "${c}"`, 'err');
        code.select();
      }
    }
  }

  $('.add', root).onclick = add;
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  qty.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  $('.add-new', root).onclick = () => {
    const name = $('.new-name', root).value.trim();
    if (!code.value.trim()) return code.focus();
    if (!name) return toast('Give the new item a name', 'err');
    push({ newItem: { sku: code.value.trim(), name, unit: $('.new-unit', root).value.trim() }, qty: Number(qty.value) || 1 });
    $('.new-name', root).value = ''; $('.new-unit', root).value = '';
  };
  root.addEventListener('click', (e) => {
    if (e.target.matches('.remove')) { lines.splice(Number(e.target.dataset.i), 1); render(); }
  });
  root.addEventListener('change', (e) => {
    // Re-render after the event finishes; replacing the input mid-blur throws.
    if (e.target.matches('.line-qty')) { lines[Number(e.target.dataset.i)].qty = Number(e.target.value); setTimeout(render); }
  });

  render();
  return {
    lines,
    render,
    clear() { lines.length = 0; render(); },
    payload: () => lines.map((l) => (l.item ? { item_id: l.item.id, qty: l.qty } : { ...l.newItem, qty: l.qty })),
  };
}

// ---------- submitting stock events ----------
const SUBMIT = {
  deliver: { form: '#deliverForm', url: '/api/deliveries', title: 'Delivery received' },
  issue: { form: '#issueForm', url: '/api/issues', title: 'Issued to installer' },
  return: { form: '#returnForm', url: '/api/returns', title: 'Returned to stock' },
};

async function submit(mode) {
  const cfg = SUBMIT[mode];
  const form = $(cfg.form);
  if (!form.reportValidity()) return;
  const editor = editors[mode];
  if (!editor.lines.length) return toast('Add at least one item', 'err');
  const body = Object.fromEntries(new FormData(form));
  body.recorded_by = who.value.trim() || null;
  body.lines = editor.payload();
  const btn = $(`[data-submit="${mode}"]`);
  btn.disabled = true;
  try {
    const doc = await api(cfg.url, { method: 'POST', body });
    showReceipt(doc, doc.duplicate ? 'Already recorded — this delivery note was booked earlier' : cfg.title);
    editor.clear();
    form.reset();
    await loadRefData();
    if (mode === 'return') loadReturnHeld();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
}

function showReceipt(doc, title) {
  const party = doc.supplier ? `Supplier: <b>${esc(doc.supplier)}</b>` : doc.installer ? `Installer: <b>${esc(doc.installer)}</b>` : '';
  $('#receiptBody').innerHTML = `
    <h2>${esc(title)}</h2>
    <p class="ref">${esc(doc.ref)}</p>
    <p>${fmtTime(doc.created_at)}${doc.recorded_by ? ` · recorded by ${esc(doc.recorded_by)}` : ''}</p>
    <p>${party}${doc.project_code ? ` · Project: <b>${esc(doc.project_code)}</b>` : ''}${doc.external_ref ? ` · Ref: ${esc(doc.external_ref)}` : ''}</p>
    ${table([
      { label: 'SKU', key: 'sku' }, { label: 'Item', key: 'name' },
      { label: 'Qty', num: true, html: (l) => fmtQty(l.qty) }, { label: 'Unit', key: 'unit' },
    ], doc.lines)}
    ${doc.notes ? `<p class="muted">${esc(doc.notes)}</p>` : ''}
    ${doc.installer && doc.type === 'ISSUE' ? '<div class="sign">Received by (installer signature): ______________________</div>' : ''}`;
  $('#receipt').showModal();
}

// ---------- views ----------
async function renderDashboard() {
  const d = await api('/api/dashboard');
  const t = d.totals;
  $('#tiles').innerHTML = [
    ['Deliveries today', t.deliveries_today], ['Issues today', t.issues_today],
    ['Returns today', t.returns_today], ['Low-stock items', d.low_stock.length], ['Items tracked', t.items],
  ].map(([label, n]) => `<div class="tile"><div class="n">${n}</div><div class="l">${label}</div></div>`).join('');
  $('#lowStock').innerHTML = table(
    [{ label: 'SKU', key: 'sku' }, { label: 'Item', key: 'name' },
     { label: 'On hand', num: true, html: (i) => `<span class="bad">${fmtQty(i.on_hand)}</span>` },
     { label: 'Reorder at', num: true, html: (i) => fmtQty(i.reorder_level) }],
    d.low_stock, 'All items are above their reorder level.'
  );
  $('#recent').innerHTML = docTable(d.recent);
}

function docTable(docs) {
  return table(
    [{ label: 'When', html: (d) => fmtTime(d.created_at) }, { label: 'Type', html: (d) => badge(d.type) },
     { label: 'Ref', html: (d) => `<button class="link" data-doc="${esc(d.ref)}">${esc(d.ref)}</button>` },
     { label: 'Who', html: (d) => esc(d.installer || d.supplier || d.notes || '') },
     { label: 'Project', key: 'project_code' }, { label: 'Lines', num: true, key: 'line_count' }],
    docs, 'Nothing recorded yet.'
  );
}

document.addEventListener('click', async (e) => {
  const ref = e.target.dataset?.doc;
  if (!ref) return;
  const doc = await api(`/api/documents/${encodeURIComponent(ref)}`);
  showReceipt(doc, `${TYPE_LABEL[doc.type]} record`);
});

function renderStock() {
  const f = $('#stockFilter').value.trim().toLowerCase();
  const rows = state.items.filter((i) => !f || `${i.sku} ${i.name} ${i.category || ''}`.toLowerCase().includes(f));
  $('#stockTable').innerHTML = table(
    [{ label: 'SKU', key: 'sku' }, { label: 'Item', key: 'name' }, { label: 'Category', key: 'category' },
     { label: 'On hand', num: true, html: (i) => `<span class="${i.reorder_level > 0 && i.on_hand <= i.reorder_level ? 'bad' : ''}">${fmtQty(i.on_hand)}</span>` },
     { label: 'With installers', num: true, html: (i) => fmtQty(i.with_installers) },
     { label: 'Unit', key: 'unit' }, { label: 'Reorder at', num: true, html: (i) => fmtQty(i.reorder_level) }],
    rows, 'No items yet — add one below, or receive a delivery with new SKUs.'
  );
}

function renderInstallers() {
  $('#installerTable').innerHTML = table(
    [{ label: 'Name', html: (i) => `<button class="link" data-custody="${i.id}">${esc(i.name)}</button>` },
     { label: 'Company', key: 'company' }, { label: 'Phone', key: 'phone' },
     { label: 'Units held', num: true, html: (i) => fmtQty(i.units_held) },
     { label: '', html: (i) => `<button class="link" data-toggle-installer="${i.id}" data-active="${i.active ? 0 : 1}">${i.active ? 'Deactivate' : 'Reactivate'}</button>` }],
    state.installers.map((i) => ({ ...i, _attrs: i.active ? '' : 'class="inactive"' })), 'No installers yet.'
  );
}

async function showCustody(id) {
  const { installer, items } = await api(`/api/installers/${id}/custody`);
  $('#custodyTitle').textContent = `Material held by ${installer.name}`;
  $('#custody').innerHTML = table(
    [{ label: 'SKU', key: 'sku' }, { label: 'Item', key: 'name' },
     { label: 'Issued', num: true, html: (r) => fmtQty(r.issued) }, { label: 'Returned', num: true, html: (r) => fmtQty(r.returned) },
     { label: 'Holding', num: true, html: (r) => `<b>${fmtQty(r.held)}</b> ${esc(r.unit)}` },
     { label: 'Last movement', html: (r) => fmtTime(r.last_movement) }],
    items, 'Nothing issued to this installer yet.'
  );
}

function renderProjects() {
  $('#projectTable').innerHTML = table(
    [{ label: 'Code', key: 'code' }, { label: 'Name', key: 'name' }, { label: 'Address', key: 'address' },
     { label: '', html: (p) => `<button class="link" data-toggle-project="${p.id}" data-active="${p.active ? 0 : 1}">${p.active ? 'Close' : 'Reopen'}</button>` }],
    state.projects.map((p) => ({ ...p, _attrs: p.active ? '' : 'class="inactive"' })), 'No projects yet.'
  );
}

document.addEventListener('click', async (e) => {
  const t = e.target.dataset || {};
  try {
    if (t.custody) await showCustody(t.custody);
    if (t.toggleInstaller) {
      await api(`/api/installers/${t.toggleInstaller}/active`, { method: 'POST', body: { active: t.active === '1' } });
      await loadRefData(); renderInstallers();
    }
    if (t.toggleProject) {
      await api(`/api/projects/${t.toggleProject}/active`, { method: 'POST', body: { active: t.active === '1' } });
      await loadRefData(); renderProjects();
    }
  } catch (err) { toast(err.message, 'err'); }
});

function logQuery() {
  const params = new URLSearchParams();
  for (const [k, v] of new FormData($('#logFilter'))) {
    if (!v) continue;
    if (k === 'from') params.set(k, new Date(`${v}T00:00`).toISOString());
    else if (k === 'to') { const d = new Date(`${v}T00:00`); d.setDate(d.getDate() + 1); params.set(k, d.toISOString()); }
    else params.set(k, v);
  }
  return params.toString();
}

async function renderLog() {
  const qs = logQuery();
  $('#csvLink').href = `/api/movements.csv${qs ? '?' + qs : ''}`;
  const rows = await api(`/api/movements?${qs}&limit=500`);
  $('#logTable').innerHTML = table(
    [{ label: 'When', html: (m) => fmtTime(m.created_at) }, { label: 'Type', html: (m) => badge(m.type) },
     { label: 'Ref', html: (m) => `<button class="link" data-doc="${esc(m.ref)}">${esc(m.ref)}</button>` },
     { label: 'SKU', key: 'sku' }, { label: 'Item', key: 'item' },
     { label: 'Qty', num: true, html: (m) => `<span class="${m.qty_change < 0 ? 'out' : 'in'}">${m.qty_change > 0 ? '+' : ''}${fmtQty(m.qty_change)}</span> ${esc(m.unit)}` },
     { label: 'Supplier / installer', html: (m) => esc(m.supplier || m.installer || '') },
     { label: 'Project', key: 'project' }, { label: 'Recorded by', key: 'recorded_by' }],
    rows, 'No movements match these filters.'
  );
}

// Return view: show what the chosen installer currently holds.
async function loadReturnHeld() {
  const id = $('#returnForm [name=installer_id]').value;
  editors.returnHeld = new Map();
  if (!id) { $('#returnHeld').innerHTML = ''; editors.return.render(); return; }
  const { items } = await api(`/api/installers/${id}/custody`);
  const held = items.filter((i) => i.held > 0);
  held.forEach((i) => editors.returnHeld.set(i.item_id, i.held));
  $('#returnHeld').innerHTML = held.length
    ? `<span class="muted">Currently holding:</span> ` + held.map((i) => `<span class="chip">${esc(i.sku)} · ${fmtQty(i.held)} ${esc(i.unit)}</span>`).join(' ')
    : '<span class="muted">This installer holds nothing to return.</span>';
  editors.return.render();
}

const VIEWS = {
  dashboard: renderDashboard,
  stock: renderStock,
  installers: renderInstallers,
  projects: renderProjects,
  log: renderLog,
  issue: () => editors.issue.render(),
};

async function show(view) {
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  try { localStorage.setItem('view', view); } catch {}
  try { await loadRefData(); await VIEWS[view]?.(); } catch (err) { toast(err.message, 'err'); }
  $(`[data-lines="${view}"] .code`)?.focus();
}

// ---------- wiring ----------
for (const mode of ['deliver', 'issue', 'return']) editors[mode] = lineEditor(mode);
$$('[data-submit]').forEach((b) => (b.onclick = () => submit(b.dataset.submit)));
$('#tabs').addEventListener('click', (e) => e.target.dataset.view && show(e.target.dataset.view));
$('#returnForm [name=installer_id]').addEventListener('change', loadReturnHeld);
$('#stockFilter').addEventListener('input', renderStock);
$('#logFilter').addEventListener('change', renderLog);

function simpleForm(sel, url, after) {
  $(sel).addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const payload = after.transform ? after.transform(body) : body;
      await api(url, { method: 'POST', body: payload });
      e.target.reset();
      toast(after.msg);
      await loadRefData();
      after.render?.();
    } catch (err) { toast(err.message, 'err'); }
  });
}
simpleForm('#itemForm', '/api/items', { msg: 'Item added', render: renderStock });
simpleForm('#installerForm', '/api/installers', { msg: 'Installer added', render: renderInstallers });
simpleForm('#projectForm', '/api/projects', { msg: 'Project added', render: renderProjects });
simpleForm('#adjustForm', '/api/adjustments', {
  msg: 'Adjustment recorded',
  render: renderStock,
  transform: (b) => ({ notes: b.notes, recorded_by: who.value.trim() || null, lines: [{ item_id: b.item_id, qty: b.qty }] }),
});

let initial = 'dashboard';
try { initial = localStorage.getItem('view') || initial; } catch {}
show($(`#view-${initial}`) ? initial : 'dashboard');
