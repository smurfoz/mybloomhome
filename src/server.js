import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createInventory, InventoryError } from './inventory.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) throw new InventoryError('Request body too large', 413);
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new InventoryError('Invalid JSON body');
  }
}

export function createApp(inv, { apiKey = process.env.INVENTORY_API_KEY } = {}) {
  // [method, pattern, handler(params, body, query)]
  const routes = [
    ['GET', '/api/dashboard', () => inv.dashboard()],

    ['GET', '/api/items', () => inv.listItems()],
    ['POST', '/api/items', (_, b) => inv.createItemTx(b)],
    ['GET', '/api/items/lookup', (_, __, qs) => inv.lookupItem(qs.get('code') || '')],
    ['GET', '/api/items/:id', (p) => inv.getItem(p.id) ?? Promise.reject(new InventoryError('Item not found', 404))],
    ['PUT', '/api/items/:id', (p, b) => inv.updateItem(p.id, b)],

    ['GET', '/api/suppliers', () => inv.listSuppliers()],
    ['POST', '/api/suppliers', (_, b) => inv.addSupplier(b)],

    ['GET', '/api/installers', () => inv.listInstallers()],
    ['POST', '/api/installers', (_, b) => inv.addInstaller(b)],
    ['GET', '/api/installers/:id/custody', (p) => inv.installerCustody(p.id)],
    ['POST', '/api/installers/:id/active', (p, b) => (inv.setInstallerActive(p.id, b.active), { ok: true })],

    ['GET', '/api/projects', () => inv.listProjects()],
    ['POST', '/api/projects', (_, b) => inv.addProject(b)],
    ['POST', '/api/projects/:id/active', (p, b) => (inv.setProjectActive(p.id, b.active), { ok: true })],

    // The four stock events. Each one is recorded automatically as a document + ledger lines.
    ['POST', '/api/deliveries', (_, b) => inv.receiveDelivery(b)],
    ['POST', '/api/issues', (_, b) => inv.issueToInstaller(b)],
    ['POST', '/api/returns', (_, b) => inv.returnFromInstaller(b)],
    ['POST', '/api/adjustments', (_, b) => inv.adjustStock(b)],

    ['GET', '/api/documents', (_, __, qs) => inv.listDocuments(Object.fromEntries(qs))],
    ['GET', '/api/documents/:ref', (p) => inv.getDocument(p.ref)],
    ['GET', '/api/movements', (_, __, qs) => inv.listMovements(Object.fromEntries(qs))],
  ].map(([method, path, handler]) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    return { method, re, keys, handler };
  });

  async function handleApi(req, res, url) {
    if (url.pathname === '/api/movements.csv') {
      const csv = toCsv(inv.listMovements(Object.fromEntries(url.searchParams)));
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="stock-movements.csv"',
      });
      return res.end(csv);
    }
    if (apiKey && req.method !== 'GET' && req.headers['x-api-key'] !== apiKey) {
      throw new InventoryError('Missing or invalid x-api-key header', 401);
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'GET' ? {} : await readJson(req);
      const result = await r.handler(params, body, url.searchParams);
      const status = req.method === 'POST' && !result?.duplicate && !result?.ok ? 201 : 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(result));
    }
    throw new InventoryError('Not found', 404);
  }

  async function serveStatic(res, pathname) {
    const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
    const file = join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR)) throw new InventoryError('Not found', 404);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      throw new InventoryError('Not found', 404);
    }
  }

  return async function app(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(res, url.pathname);
    } catch (err) {
      const status = err instanceof InventoryError ? err.status : 500;
      if (status === 500) console.error(err);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: status === 500 ? 'Internal server error' : err.message }));
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT) || 3000;
  const inv = createInventory(openDatabase());
  createServer(createApp(inv)).listen(port, () => {
    console.log(`Construction inventory running on http://localhost:${port}`);
  });
}
