#!/usr/bin/env node
// Runs the Design → Isolate → Build → Prove gates from docs/PROTOCOL.md for
// every module in modules/. Exits non-zero if any gate fails.
//
//   node scripts/prove.mjs            all modules
//   node scripts/prove.mjs ledger     one module
//   node scripts/prove.mjs app        the Phase 1 app (needs PostgreSQL)

import { readdirSync, readFileSync, existsSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(root, 'modules');
const only = process.argv[2];
const REQUIRED_SECTIONS = ['## Problem', '## Interface', '## Rules', '## Not in scope'];
const MIN_MUTATIONS = 5;

const runTests = (dir) => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).map((f) => join(dir, f));
  const r = spawnSync(process.execPath, ['--test', ...files], { encoding: 'utf8' });
  const count = (k) => Number(r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? 0);
  return { ok: r.status === 0, pass: count('pass'), fail: count('fail'), out: r.stdout + r.stderr };
};

let failed = 0;
const report = [];

for (const name of readdirSync(modulesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && (!only || d.name === only)).map((d) => d.name)) {
  const dir = join(modulesDir, name);
  const files = readdirSync(dir);
  const src = files.filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
  const tests = files.filter((f) => f.endsWith('.test.mjs'));
  const gates = [];
  const gate = (stage, ok, detail) => { gates.push({ stage, ok, detail }); if (!ok) failed++; };

  // 1. DESIGN: a design doc with the required sections and numbered rules.
  const designPath = join(dir, 'DESIGN.md');
  const design = existsSync(designPath) ? readFileSync(designPath, 'utf8') : '';
  const missingSections = REQUIRED_SECTIONS.filter((s) => !design.includes(s));
  const rules = [...new Set([...design.matchAll(/\*\*([A-Z]{2,4}-\d+)\*\*/g)].map((m) => m[1]))];
  gate('Design', design && !missingSections.length && rules.length > 0,
       !design ? 'DESIGN.md missing'
       : missingSections.length ? `missing sections: ${missingSections.join(', ')}`
       : `${rules.length} rules`);

  // 2. ISOLATE: source files import only siblings — no npm packages, no
  //    node: built-ins (no I/O), no reaching into other modules.
  const leaks = [];
  for (const f of src) {
    const code = readFileSync(join(dir, f), 'utf8');
    // Static (`import x from`), side-effect (`import 'x'`), re-export and
    // dynamic imports. A dynamic import of a computed path is itself a leak.
    const specs = [
      ...[...code.matchAll(/(?:^|\n|;)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/(?:^|\n|;)\s*import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]),
      ...[...code.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)].map((m) => /^['"][^'"]+['"]$/.test(m[1].trim()) ? m[1].trim().slice(1, -1) : `<computed ${m[1].trim()}>`),
    ];
    for (const spec of specs) {
      if (!spec.startsWith('./') || spec.includes('..')) leaks.push(`${f} → ${spec}`);
    }
    if (/\b(?:process|require|fetch|localStorage|indexedDB|Date\.now|Math\.random)\b/.test(code)) {
      leaks.push(`${f} uses ambient I/O or nondeterminism`);
    }
  }
  gate('Isolate', leaks.length === 0, leaks.length ? leaks.join('; ') : `${src.length} files, sibling imports only`);

  // 3. BUILD: tests exist and pass.
  const t = runTests(dir);
  gate('Build', tests.length > 0 && t.ok, `${t.pass} passed, ${t.fail} failed`);
  if (!t.ok) console.error(t.out);

  // 4. PROVE (a): every rule has a test named after it, and no test cites an
  //    unknown rule.
  const titles = tests.flatMap((f) =>
    [...readFileSync(join(dir, f), 'utf8').matchAll(/\btest\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]));
  const cited = new Set(titles.flatMap((s) => s.match(/[A-Z]{2,4}-\d+/g) ?? []));
  const untested = rules.filter((r) => !cited.has(r));
  const unknown = [...cited].filter((r) => !rules.includes(r));
  gate('Prove: rules', !untested.length && !unknown.length,
       untested.length ? `untested: ${untested.join(', ')}`
       : unknown.length ? `tests cite unknown rules: ${unknown.join(', ')}`
       : `${rules.length}/${rules.length} rules tested`);

  // 4. PROVE (b): mutation check — break each rule on purpose; the tests must
  //    notice. A mutation whose target text no longer exists is stale = fail.
  const mutPath = join(dir, 'mutations.json');
  const mutations = existsSync(mutPath) ? JSON.parse(readFileSync(mutPath, 'utf8')) : [];
  const survivors = [];
  for (const m of mutations) {
    const tmp = mkdtempSync(join(tmpdir(), `prove-${name}-`));
    try {
      cpSync(dir, tmp, { recursive: true });
      const target = join(tmp, m.file);
      const code = readFileSync(target, 'utf8');
      if (!code.includes(m.find)) { survivors.push(`${m.rule} stale (text not found)`); continue; }
      writeFileSync(target, code.replace(m.find, m.replace));
      // A mutation that stops the module loading would "fail the tests" for the
      // wrong reason. It must still load, so a caught mutation means a test
      // noticed the changed behaviour.
      const loads = src.every((f) => spawnSync(process.execPath,
        ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(tmp, f)).href)})`]).status === 0);
      if (!loads) survivors.push(`${m.rule} invalid (module no longer loads): ${m.find}`);
      else if (runTests(tmp).ok) survivors.push(`${m.rule} survived: ${m.find}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  gate('Prove: mutations', mutations.length >= MIN_MUTATIONS && !survivors.length,
       mutations.length < MIN_MUTATIONS ? `only ${mutations.length} mutations (need ${MIN_MUTATIONS})`
       : survivors.length ? survivors.join('; ')
       : `${mutations.length}/${mutations.length} caught`);

  report.push({ name, gates });
}

// ---------------------------------------------------------------------------
// The Phase 1 app. It does I/O by nature, so "isolate" means: framework code
// stays out of lib/ (tests import lib/ directly), and every rule is proven
// against a real PostgreSQL. Mutations are applied in place and always restored.
if (!only || only === 'app') {
  const gates = [];
  const gate = (stage, ok, detail) => { gates.push({ stage, ok, detail }); if (!ok) failed++; };
  const design = readFileSync(join(root, 'docs/phase-1/DESIGN.md'), 'utf8');
  const missingSections = REQUIRED_SECTIONS.filter((s) => !design.includes(s));
  const rules = [...new Set([...design.matchAll(/\*\*([A-Z]{2,4}-\d+)\*\*/g)].map((m) => m[1]))];
  gate('Design', !missingSections.length && rules.length > 0,
       missingSections.length ? `missing sections: ${missingSections.join(', ')}` : `${rules.length} rules`);

  const FRAMEWORK_GLUE = new Set(['session.ts', 'api.ts']);
  const leaks = readdirSync(join(root, 'lib')).filter((f) => f.endsWith('.ts') && !FRAMEWORK_GLUE.has(f))
    .filter((f) => /from\s+['"]next(\/|['"])/.test(readFileSync(join(root, 'lib', f), 'utf8')));
  gate('Isolate', leaks.length === 0, leaks.length ? `next imported in ${leaks.join(', ')}` : 'lib/ is framework-free (except session.ts, api.ts)');

  const tsc = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', root], { encoding: 'utf8' });
  const dbFiles = readdirSync(join(root, 'tests/db')).filter((f) => f.endsWith('.test.ts')).map((f) => join(root, 'tests/db', f));
  const unitFiles = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts')).map((f) => join(root, 'tests', f));
  const runApp = () => {
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...dbFiles, ...unitFiles], { encoding: 'utf8', cwd: root });
    const count = (k) => Number(r.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? 0);
    return { ok: r.status === 0, pass: count('pass'), fail: count('fail'), out: r.stdout + r.stderr };
  };
  const t = runApp();
  gate('Build', tsc.status === 0 && t.ok,
       tsc.status !== 0 ? `typecheck failed: ${tsc.stdout.split('\n')[0]}`
       : t.ok ? `typecheck clean; ${t.pass} passed against PostgreSQL`
       : /ECONNREFUSED|password authentication/.test(t.out) ? 'no PostgreSQL reachable (set TEST_DATABASE_ADMIN_URL)'
       : `${t.pass} passed, ${t.fail} failed`);
  if (!t.ok) {
    // Keep the whole log and name the failing tests, so an intermittent
    // failure can be diagnosed after the fact instead of guessed at.
    mkdirSync(join(root, 'test-results'), { recursive: true });
    writeFileSync(join(root, 'test-results', 'prove-app.log'), t.out);
    const names = [...t.out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1]).filter((n) => !n.includes('/'));
    gates[gates.length - 1].detail += ` — failing: ${names.join('; ') || 'see log'} (full log: test-results/prove-app.log)`;
    console.error(t.out.slice(-3000));
  }

  const testSources = [...dbFiles, ...unitFiles,
    ...readdirSync(join(root, 'e2e')).filter((f) => f.endsWith('.spec.ts')).map((f) => join(root, 'e2e', f))];
  const titles = testSources.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\btest\(\s*[`'"]([^`'"]+)/g)].map((m) => m[1]));
  const cited = new Set(titles.flatMap((s) => s.match(/[A-Z]{2,4}-\d+/g) ?? []));
  const untested = rules.filter((r) => !cited.has(r));
  const unknown = [...cited].filter((r) => !rules.includes(r));
  gate('Prove: rules', !untested.length && !unknown.length,
       untested.length ? `untested: ${untested.join(', ')}` : unknown.length ? `unknown rules cited: ${unknown.join(', ')}`
       : `${rules.length}/${rules.length} rules tested (unit, PostgreSQL, browser)`);

  const mutations = JSON.parse(readFileSync(join(root, 'docs/phase-1/mutations.json'), 'utf8'));
  const survivors = [];
  if (t.ok) {
    for (const m of mutations) {
      const file = join(root, m.file);
      const original = readFileSync(file, 'utf8');
      if (!original.includes(m.find)) { survivors.push(`${m.rule} stale`); continue; }
      const restore = () => writeFileSync(file, original);
      process.once('SIGINT', () => { restore(); process.exit(130); });
      try {
        writeFileSync(file, original.replace(m.find, m.replace));
        const loads = !m.file.endsWith('.ts') || spawnSync(process.execPath,
          ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(file).href)})`]).status === 0;
        if (!loads) survivors.push(`${m.rule} invalid (no longer loads)`);
        else if (runApp().ok) survivors.push(`${m.rule} survived: ${m.find.slice(0, 60)}`);
      } finally {
        restore();
      }
    }
  }
  gate('Prove: mutations', t.ok && mutations.length >= MIN_MUTATIONS && !survivors.length,
       !t.ok ? 'not run (tests must pass first)' : survivors.length ? survivors.join('; ') : `${mutations.length}/${mutations.length} caught`);
  report.push({ name: 'app (Phase 1)', gates });
}

for (const { name, gates } of report) {
  console.log(`\n${name}`);
  for (const g of gates) console.log(`  ${g.ok ? '✔' : '✘'} ${g.stage.padEnd(18)} ${g.detail}`);
}
console.log(failed ? `\n✘ ${failed} gate(s) failed` : '\n✔ all gates passed');
process.exit(failed ? 1 : 0);
