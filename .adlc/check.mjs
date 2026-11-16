#!/usr/bin/env node
/* eslint-disable */ // Platform-owned file (ADLC kit): not part of the application code.
// ADLC knowledge-pack checker. No dependencies (Node.js 18+). Copied into each application as .adlc/check.mjs.
//
//   node .adlc/check.mjs            check the repository that contains this .adlc folder
//   node .adlc/check.mjs <repo>     check another repository
//   --strict                        also fail on problems in draft entries
//   --json                          machine-readable result (for AI tools and CI)
//
// It checks the pack against the CURRENT code: every rule must read its value from its source files, every edit
// and patch must match, every template must exist and render. Run it after every change to .adlc/, by hand or
// from an AI tool, and fix what it reports. Exit code 1 when a non-draft entry has an error.
//
// The ADLC support platform imports checkPack() to check entries as people review them (REQ-021).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES = ['rules', 'playbooks', 'runbooks', 'articles', 'scenarios'];
const ID = /^[A-Z][A-Z0-9-]{1,59}$/;

// ------------------------------------------------------------------ helpers (same rules as the platform)
const FILTERS = {
  money: (v) => `$${Number(v).toFixed(2)}`, plus1: (v) => Number(v) + 1, minus1: (v) => Number(v) - 1,
  minusCent: (v) => Math.round((Number(v) - 0.01 + Number.EPSILON) * 100) / 100,
  slug: (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  upper: (v) => String(v).toUpperCase(), lower: (v) => String(v).toLowerCase(), oneline: (v) => String(v).replace(/\r?\n/g, ' '),
};
const TOKEN = /\{\{\s*([A-Za-z_][\w.]*)\s*(?:\|\s*([a-zA-Z][a-zA-Z0-9]*)\s*)?\}\}/g;
function render(template, vars) {
  return String(template).replace(TOKEN, (_m, name, filter) => {
    if (!(name in vars)) throw new Error(`unknown template variable {{${name}}}`);
    if (filter && !FILTERS[filter]) throw new Error(`unknown filter "${filter}"`);
    return String(filter ? FILTERS[filter](vars[name]) : vars[name]);
  });
}
const ruleVar = (id) => id.replace(/[^A-Za-z0-9]/g, '_');
const getPath = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

/**
 * Checks `.adlc/` of the repository at `repo` against its current code. Returns { counts, findings }; each finding is
 * { level, where, message, draft, file, id } (file: the pack file name, e.g. "rules"; id: the entry id).
 * @param pack  entries to check instead of the pack files, by file name (e.g. { rules: [...] }); other files are read
 */
export function checkPack(repo, { pack: given = {} } = {}) {
  const adlc = path.join(repo, '.adlc');
  const KNOW = path.join(adlc, 'knowledge');
  const findings = [];
  const add = (level, where, message, draft = false) => {
    const [head, ...rest] = where.split(' ');
    findings.push({ level, where, message, draft: draft === true, file: head.endsWith('.json') ? head.slice(0, -5) : head, id: rest.join(' ') || null });
  };
  const err = (where, message, draft) => add('error', where, message, draft);
  const warn = (where, message, draft) => add('warning', where, message, draft);
  const readText = (rel) => {
    try { return fs.readFileSync(path.join(repo, rel), 'utf8'); } catch { return null; }
  };
  const regex = (src, flags, where, draft) => {
    try { return new RegExp(src, flags); } catch (e) { err(where, `invalid regex ${JSON.stringify(src)}: ${e.message}`, draft); return null; }
  };
  function readSource(s, where, draft) {
    const text = readText(s.file);
    if (text === null) { err(where, `source file not found: ${s.file}`, draft); return undefined; }
    let value;
    if (s.json) {
      try { value = getPath(JSON.parse(text), s.json); } catch (e) { err(where, `${s.file} is not valid JSON: ${e.message}`, draft); return undefined; }
    } else if (s.pattern) {
      const re = regex(s.pattern, '', where, draft);
      if (!re) return undefined;
      value = text.match(re)?.slice(1).find((g) => g !== undefined);
    } else { err(where, `source ${s.file} needs "json" or "pattern"`, draft); return undefined; }
    const n = Number(String(value ?? '').replace(/,/g, ''));
    if (value === undefined || !Number.isFinite(n)) { err(where, `no number found in ${s.file} with ${s.json ? `json "${s.json}"` : `pattern ${JSON.stringify(s.pattern)}`}`, draft); return undefined; }
    return n;
  }
  function loadFile(name) {
    if (Array.isArray(given[name])) return given[name];
    const file = path.join(KNOW, `${name}.json`);
    if (!fs.existsSync(file)) return [];
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { err(`${name}.json`, `not valid JSON: ${e.message}`); return []; }
    const entries = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : null;
    if (!entries) { err(`${name}.json`, 'must be an array, or an object with an "entries" array'); return []; }
    return entries;
  }
  function template(rel, where, vars, draft) {
    if (!rel) return;
    const file = path.resolve(KNOW, rel);
    if (!file.startsWith(path.resolve(KNOW))) return err(where, `template path leaves .adlc/knowledge: ${rel}`, draft);
    if (!fs.existsSync(file)) return err(where, `template not found: .adlc/knowledge/${rel}`, draft);
    const text = fs.readFileSync(file, 'utf8');
    try { render(text, vars); } catch (e) { err(where, `template ${rel}: ${e.message}`, draft); }
    if (!text.includes('{{ticketId}}')) warn(where, `template ${rel} does not mention {{ticketId}} (test names should carry the ticket id)`, draft);
  }

  // ------------------------------------------------------------------ manifest
  let manifest = {};
  const mfile = path.join(adlc, 'app.json');
  if (!fs.existsSync(mfile)) err('app.json', '.adlc/app.json not found');
  else {
    try { manifest = JSON.parse(fs.readFileSync(mfile, 'utf8')); } catch (e) { err('app.json', `not valid JSON: ${e.message}`); }
    if (manifest.schemaVersion !== 1) err('app.json', 'schemaVersion must be 1');
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(manifest.id ?? '')) err('app.json', 'id must be 2-40 lowercase letters, digits or dashes and match the id registered in the platform');
    if (!Array.isArray(manifest.services) || !manifest.services.length) err('app.json', 'services must list the areas users report on (e.g. ["Checkout", "Payments"])');
    if (/[<>]/.test(`${manifest.domain ?? ''}${manifest.owner ?? ''}`)) warn('app.json', 'domain / owner still contain <placeholders>');
    const t = manifest.tests ?? {};
    if (!/{(ticketId|TicketId|ticket_id)}/.test(t.regressionTest ?? '')) err('app.json', 'tests.regressionTest must contain {ticketId}, {TicketId} or {ticket_id}, e.g. test/regression/{ticketId}.test.js');
    if ((t.runner ?? 'command') === 'command' && (!t.command || /[<>]/.test(t.command))) err('app.json', 'tests.command must be the command that runs your tests ({files} = selected files)');
  }
  const services = new Set(manifest.services ?? []);
  const monitors = new Set((manifest.monitors ?? []).map((m) => m.id));

  // ------------------------------------------------------------------ entries
  const pack = Object.fromEntries(FILES.map((n) => [n, loadFile(n)]));
  const ids = new Map();
  for (const name of FILES) {
    for (const e of pack[name]) {
      if (!e?.id) continue;
      if (ids.has(e.id)) err(`${name}.json ${e.id}`, `id also used in ${ids.get(e.id)}.json`, e.draft);
      ids.set(e.id, name);
    }
  }
  const svc = (where, e) => { if (e.service && services.size && !services.has(e.service)) warn(where, `service "${e.service}" is not in app.json services`, e.draft); };

  const values = {};
  for (const r of pack.rules) {
    const where = `rules.json ${r.id ?? '(no id)'}`;
    const d = r.draft === true;
    if (!ID.test(r.id ?? '')) err(where, 'id must be upper case letters, digits and dashes, e.g. BL-02', d);
    if (!r.label) err(where, 'label is required', d);
    svc(where, r);
    if (!Array.isArray(r.sources) || !r.sources.length) { err(where, 'sources must list where the current value lives', d); continue; }
    const found = r.sources.map((s) => readSource(s, where, d)).filter((v) => v !== undefined);
    if (found.length > 1 && new Set(found).size > 1) warn(where, `sources disagree: ${found.join(' vs ')} (spec and code differ: a defect, or a source pointing at the wrong value)`, d);
    const current = found[0];
    if (current !== undefined) values[r.id] = current;
    const c = r.change;
    if (!c) continue;
    if (!Array.isArray(c.detect?.values) || !c.detect.values.length) err(where, 'change.detect.values needs at least one regex with one capture group', d);
    for (const v of c.detect?.values ?? []) regex(v, 'gi', where, d);
    if (c.detect?.when) regex(c.detect.when, 'i', where, d);
    if (c.detect?.intent) regex(c.detect.intent, 'i', where, d);
    const vars = { ...(c.vars ?? {}), from: current ?? 1, to: (current ?? 1) + 1, spec: c.spec ?? r.id, ruleId: r.id, ticketId: 'TKT-0000', title: 'check' };
    for (const k of ['slug', 'title', 'probableCause', 'commitSubject']) {
      try { if (c[k]) render(c[k], vars); } catch (e) { err(where, `change.${k}: ${e.message}`, d); }
    }
    if (!Array.isArray(c.edits) || !c.edits.length) err(where, 'change.edits must list every place the value changes', d);
    for (const e of c.edits ?? []) {
      const text = readText(e.file);
      if (text === null) { if (!e.optional) err(where, `edit file not found: ${e.file}`, d); continue; }
      let re;
      try { re = new RegExp(render(e.pattern, vars)); } catch (x) { err(where, `edit pattern for ${e.file}: ${x.message}`, d); continue; }
      if (!re.test(text) && !e.optional) err(where, `edit pattern does not match ${e.file}: ${JSON.stringify(e.pattern)}`, d);
      try { render(e.value ?? '', vars); } catch (x) { err(where, `edit value for ${e.file}: ${x.message}`, d); }
    }
    if (!c.regressionTest) err(where, 'change.regressionTest (template) is required', d);
    template(c.regressionTest, where, vars, d);
  }

  const ruleVars = Object.fromEntries(Object.entries(values).map(([id, v]) => [ruleVar(id), v]));
  for (const p of pack.playbooks) {
    const where = `playbooks.json ${p.id ?? '(no id)'}`;
    const d = p.draft === true;
    if (!ID.test(p.id ?? '')) err(where, 'id must be upper case letters, digits and dashes, e.g. FX-DISCOUNT', d);
    if (!/^[a-z0-9-]{2,60}$/.test(p.slug ?? '')) err(where, 'slug must be 2-60 lowercase letters, digits or dashes', d);
    if (!Array.isArray(p.keywords) || !p.keywords.length) err(where, 'keywords: the words users write when they hit this defect', d);
    svc(where, p);
    const vars = { spec: p.spec ?? '', ticketId: 'TKT-0000', title: 'check' };
    for (const id of p.uses ?? []) {
      if (values[id] === undefined) err(where, `uses rule ${id}, which is not in rules.json or whose value cannot be read`, d);
      else vars[ruleVar(id)] = values[id];
    }
    Object.assign(vars, ruleVars, vars);
    for (const k of ['title', 'probableCause', 'commitSubject']) {
      try { if (p[k]) render(p[k], vars); } catch (e) { err(where, `${k}: ${e.message}`, d); }
    }
    if (!Array.isArray(p.patches) || !p.patches.length) err(where, 'patches: the exact edits that fix the defect', d);
    for (const x of p.patches ?? []) {
      const text = readText(x.file);
      if (text === null) { err(where, `patch file not found: ${x.file}`, d); continue; }
      let find; let replace;
      try { find = x.find !== undefined ? render(x.find, vars) : undefined; replace = render(x.replace ?? '', vars); } catch (e) { err(where, `patch for ${x.file}: ${e.message}`, d); continue; }
      if (find !== undefined) {
        const count = text.split(find).length - 1;
        if (count === 0 && replace && text.includes(replace)) add('info', where, `${x.file}: already fixed in this code (the fix text is present); fine for a defect that may come back`, d);
        else if (count === 0) err(where, `${x.file}: "find" text not found (and the fix text is not there either)`, d);
        else if (count > 1) err(where, `${x.file}: "find" text occurs ${count} times; make it unique`, d);
      } else if (x.pattern) {
        let re;
        try { re = new RegExp(render(x.pattern, vars)); } catch (e) { err(where, `patch pattern for ${x.file}: ${e.message}`, d); continue; }
        if (!re.test(text) && !(replace && text.includes(replace))) err(where, `${x.file}: pattern does not match`, d);
      } else err(where, `patch for ${x.file} needs "find" or "pattern"`, d);
    }
    if (!p.regressionTest) err(where, 'regressionTest (template) is required: the test that proves the defect (red) and the fix (green)', d);
    template(p.regressionTest, where, vars, d);
  }

  for (const r of pack.runbooks) {
    const where = `runbooks.json ${r.id ?? '(no id)'}`;
    const d = r.draft === true;
    if (!ID.test(r.id ?? '')) err(where, 'id must be upper case letters, digits and dashes, e.g. RB-01', d);
    for (const k of ['title', 'owner', 'env', 'command']) if (!r[k]) err(where, `${k} is required`, d);
    if (typeof r.approved !== 'boolean') err(where, 'approved must be true or false (only approved runbooks run)', d);
    if (r.command && !r.command.includes('{action}')) err(where, 'command must take {action} (precheck | execute | postcheck | revert)', d);
    if (r.command) {
      const script = r.command.split(/\s+/).find((w) => /\.(m?js|cjs|py|sh|ps1|ts)$/.test(w));
      if (script && readText(script) === null) err(where, `script not found: ${script}`, d);
    }
    if (r.monitor && !monitors.has(r.monitor)) err(where, `monitor "${r.monitor}" is not declared in app.json monitors`, d);
    if (!Array.isArray(r.keywords) || !r.keywords.length) err(where, 'keywords: the words users write when they hit this error', d);
    svc(where, r);
  }

  for (const a of pack.articles) {
    const where = `articles.json ${a.id ?? '(no id)'}`;
    if (!ID.test(a.id ?? '')) err(where, 'id must be upper case letters, digits and dashes, e.g. KB-0001', a.draft);
    if (!a.title) err(where, 'title is required', a.draft);
    if (!['how-to', 'known-error', 'faq', 'procedure'].includes(a.kind)) err(where, 'kind must be how-to, known-error, faq or procedure', a.draft);
    if (a.doc && readText(a.doc.split('#')[0]) === null) warn(where, `doc not found: ${a.doc}`, a.draft);
    svc(where, a);
  }

  for (const s of pack.scenarios) {
    const where = `scenarios.json ${s.id ?? '(no id)'}`;
    if (!/^[a-z0-9-]{2,60}$/.test(s.id ?? '')) err(where, 'id must be 2-60 lowercase letters, digits or dashes', s.draft);
    if (!s.label) err(where, 'label is required', s.draft);
    if (!s.ticket?.title || s.ticket.title.length < 5) err(where, 'ticket.title of at least 5 characters is required', s.draft);
    if (s.ticket?.service && services.size && !services.has(s.ticket.service)) warn(where, `ticket.service "${s.ticket.service}" is not in app.json services`, s.draft);
  }

  const counts = Object.fromEntries(FILES.map((n) => [n, { total: pack[n].length, drafts: pack[n].filter((e) => e?.draft === true).length }]));
  return { counts, findings };
}

// ------------------------------------------------------------------ command line
const here = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const asJson = args.includes('--json');
  const dir = path.dirname(here);
  const repo = path.resolve(args.find((a) => !a.startsWith('--')) ?? (path.basename(dir) === '.adlc' ? path.dirname(dir) : process.cwd()));
  const { counts, findings } = checkPack(repo);
  const blocking = findings.filter((f) => f.level === 'error' && (strict || !f.draft));
  if (asJson) {
    console.log(JSON.stringify({ repo, ok: blocking.length === 0, counts, findings: findings.map(({ file, id, ...f }) => f) }, null, 2));
  } else {
    console.log(`ADLC knowledge-pack check: ${repo}`);
    console.log(`  ${FILES.map((n) => `${counts[n].total} ${n}${counts[n].drafts ? ` (${counts[n].drafts} draft)` : ''}`).join(', ')}`);
    const icon = { error: '✗', warning: '!', info: 'i' };
    for (const f of findings) console.log(`  ${icon[f.level]} ${f.where}${f.draft ? ' [draft]' : ''}: ${f.message}`);
    console.log(blocking.length ? `\n${blocking.length} error(s) to fix.` : `\nOK${findings.some((f) => f.level === 'error') ? ' (errors only in draft entries; --strict to fail on them)' : ''}.`);
  }
  process.exit(blocking.length ? 1 : 0);
}
