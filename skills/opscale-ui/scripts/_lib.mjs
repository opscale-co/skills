// Shared helpers for Opscale deterministic generators.
//
// Inlined per skill (one copy in each opscale-* skill) so each skill remains
// portable when symlinked into ~/.claude/skills/.
//
// Exports:
//   render(template, context)   - mini-mustache template renderer
//   writeOrConflict(path, body) - conflict-aware file write
//   readJsonInput(argv)         - load input JSON from --input <path>, stdin, or env
//   resultLine(key, value)      - format a RESULT line for the skill to parse

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// --- Template renderer ----------------------------------------------------
//
// Grammar:
//   {{path.to.value}}                literal substitution (no escaping)
//   {{#if expr}}...{{/if}}           render body when expr is truthy
//   {{#if expr}}...{{else}}...{{/if}}
//   {{#unless expr}}...{{/unless}}   render body when expr is falsy
//   {{#each list}}...{{/each}}       iterate; inside the block, item fields are
//                                    resolved directly and helpers are available:
//                                      {{@index}}  zero-based index
//                                      {{@first}}  true on first iteration
//                                      {{@last}}   true on last iteration
//                                      {{.}}       the item itself (when scalar)
//
// Truthiness mirrors JS, except: empty arrays are falsy.
// Lines that contain ONLY a control tag are trimmed (no leftover blank line).

export function render(template, context) {
  const tokens = tokenize(template);
  const ast = parse(tokens);
  return renderNodes(ast, [context]);
}

function tokenize(src) {
  const tokens = [];
  const re = /\{\{\s*([#\/])?\s*([^}]+?)\s*\}\}/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > lastIndex) tokens.push({ type: 'text', value: src.slice(lastIndex, m.index) });
    const [whole, ctrl, expr] = m;
    if (ctrl === '#') {
      const [head, ...rest] = expr.split(/\s+/);
      tokens.push({ type: 'open', kind: head, expr: rest.join(' '), raw: whole });
    } else if (ctrl === '/') {
      tokens.push({ type: 'close', kind: expr, raw: whole });
    } else if (expr === 'else') {
      tokens.push({ type: 'else', raw: whole });
    } else {
      tokens.push({ type: 'var', expr, raw: whole });
    }
    lastIndex = m.index + whole.length;
  }
  if (lastIndex < src.length) tokens.push({ type: 'text', value: src.slice(lastIndex) });
  return stripStandaloneLines(tokens);
}

function stripStandaloneLines(tokens) {
  // For each control token (open/close/else), if it sits alone on its line
  // (only whitespace before on the same line of the previous text token and
  // only whitespace+newline after on the next text token), trim that line.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'open' && t.type !== 'close' && t.type !== 'else') continue;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const prevOk = !prev || (prev.type === 'text' && /(^|\n)[ \t]*$/.test(prev.value));
    const nextOk = !next || (next.type === 'text' && /^[ \t]*(\r?\n|$)/.test(next.value));
    if (prevOk && nextOk) {
      if (prev && prev.type === 'text') prev.value = prev.value.replace(/[ \t]*$/, '');
      if (next && next.type === 'text') next.value = next.value.replace(/^[ \t]*\r?\n?/, '');
    }
  }
  return tokens;
}

function parse(tokens) {
  let i = 0;
  function walk(stopKind) {
    const nodes = [];
    while (i < tokens.length) {
      const t = tokens[i];
      if (t.type === 'close' && t.kind === stopKind) { i++; return nodes; }
      if (t.type === 'else' && stopKind === 'if') return nodes;
      if (t.type === 'text') { nodes.push(t); i++; continue; }
      if (t.type === 'var')  { nodes.push(t); i++; continue; }
      if (t.type === 'open') {
        const open = t; i++;
        if (open.kind === 'if') {
          const consequent = walk('if');
          let alternate = [];
          if (tokens[i] && tokens[i].type === 'else') {
            i++;
            alternate = walk('if');
          }
          nodes.push({ type: 'if', expr: open.expr, consequent, alternate });
        } else if (open.kind === 'unless') {
          const body = walk('unless');
          nodes.push({ type: 'unless', expr: open.expr, body });
        } else if (open.kind === 'each') {
          const body = walk('each');
          nodes.push({ type: 'each', expr: open.expr, body });
        } else {
          throw new Error(`Unknown block: {{#${open.kind}}}`);
        }
        continue;
      }
      i++;
    }
    if (stopKind) throw new Error(`Unclosed {{#${stopKind}}}`);
    return nodes;
  }
  return walk(null);
}

function renderNodes(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') { out += n.value; continue; }
    if (n.type === 'var')  { out += stringify(resolve(n.expr, scopes)); continue; }
    if (n.type === 'if') {
      const val = resolve(n.expr, scopes);
      out += truthy(val) ? renderNodes(n.consequent, scopes) : renderNodes(n.alternate, scopes);
      continue;
    }
    if (n.type === 'unless') {
      const val = resolve(n.expr, scopes);
      if (!truthy(val)) out += renderNodes(n.body, scopes);
      continue;
    }
    if (n.type === 'each') {
      const list = resolve(n.expr, scopes);
      if (!Array.isArray(list)) continue;
      list.forEach((item, idx) => {
        const itemScope = typeof item === 'object' && item !== null
          ? { ...item, '.': item, '@index': idx, '@first': idx === 0, '@last': idx === list.length - 1 }
          : { '.': item, '@index': idx, '@first': idx === 0, '@last': idx === list.length - 1 };
        out += renderNodes(n.body, [itemScope, ...scopes]);
      });
      continue;
    }
  }
  return out;
}

function resolve(path, scopes) {
  if (path === '.') {
    for (const s of scopes) if (s && Object.prototype.hasOwnProperty.call(s, '.')) return s['.'];
    return scopes[0];
  }
  if (path === '@index' || path === '@first' || path === '@last') {
    for (const s of scopes) if (s && Object.prototype.hasOwnProperty.call(s, path)) return s[path];
    return undefined;
  }
  const segs = path.split('.');
  for (const s of scopes) {
    if (s == null) continue;
    if (Object.prototype.hasOwnProperty.call(s, segs[0])) {
      let cur = s[segs[0]];
      for (let i = 1; i < segs.length; i++) {
        if (cur == null) return undefined;
        cur = cur[segs[i]];
      }
      return cur;
    }
  }
  return undefined;
}

function truthy(v) {
  if (v === undefined || v === null || v === false || v === '' || v === 0) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

function stringify(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

// --- Conflict-aware file writer ------------------------------------------
//
// Strategy (deterministic — no auto-merge):
//   target missing                  → WRITE
//   target exists & identical       → SKIP
//   target exists & differs         → CONFLICT: write a sidecar at
//                                     `${target}.opscale-preview` with the
//                                     generated content and refuse to touch
//                                     the real file. The parent skill is
//                                     expected to surface the diff.
//
// Returns: { status: 'WRITTEN'|'SKIPPED'|'CONFLICT', path, preview? }

export function writeOrConflict(targetPath, content) {
  if (!existsSync(targetPath)) {
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
    return { status: 'WRITTEN', path: targetPath };
  }
  const existing = readFileSync(targetPath, 'utf8');
  if (normalize(existing) === normalize(content)) {
    return { status: 'SKIPPED', path: targetPath };
  }
  const preview = `${targetPath}.opscale-preview`;
  writeFileSync(preview, content);
  return { status: 'CONFLICT', path: targetPath, preview };
}

function normalize(s) { return s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trimEnd() + '\n'; }

// --- Input loader --------------------------------------------------------
//
// Resolution order:
//   1. --input <path>          read JSON from file
//   2. OPSCALE_INPUT env var   read JSON from file at that path
//   3. stdin                   read JSON from stdin (when piped)
// Throws if none provided.

export function readJsonInput(argv = process.argv.slice(2)) {
  const idx = argv.indexOf('--input');
  if (idx !== -1 && argv[idx + 1]) {
    return JSON.parse(readFileSync(argv[idx + 1], 'utf8'));
  }
  if (process.env.OPSCALE_INPUT) {
    return JSON.parse(readFileSync(process.env.OPSCALE_INPUT, 'utf8'));
  }
  if (!process.stdin.isTTY) {
    const buf = readFileSync(0, 'utf8');
    if (buf.trim()) return JSON.parse(buf);
  }
  throw new Error('No input provided. Use --input <path>, OPSCALE_INPUT=<path>, or pipe JSON to stdin.');
}

// --- Result reporting ----------------------------------------------------

export function resultLine(key, value) { return `${key}: ${value}`; }

export function loadTemplate(templatePath) {
  return readFileSync(templatePath, 'utf8');
}

// --- Translation seeding -------------------------------------------------
//
// Append translation keys to `{langDir}/{locale}.json` without clobbering
// existing translations. Creates the file (and parent directories) as `{}`
// if missing; skips keys already present (idempotent across reruns).
//
// `entries` is an iterable of strings (the key IS the placeholder value) or
// of `[key, value]` pairs.
//
// Returns: { path, added: string[], skipped: string[] }

import { join } from 'node:path';

// --- Nova field-block renderer -------------------------------------------
//
// Shared by generate-resource.mjs and generate-repeatable.mjs so a business
// field renders identically wherever it appears. A field descriptor looks like:
//
//   {
//     "field":     "Text" | "Textarea" | "Select" | "BelongsTo" | ...,
//     "label":     "Code",            // EN — required
//     "attribute": "code",
//     "enum_class":       "OrderType",           // Select only
//     "related_resource": "Customer",            // BelongsTo/MorphTo only
//     "contract_class":   "CounterpartyContract",// VirtualSelect only
//     "modifiers": [ "sortable", { "rules": "code" }, "hideWhenCreating" ]
//   }
//
// String modifiers pass straight through as `->name()`, so every Nova
// hide/show helper (onlyOnForms, hideWhenCreating, hideWhenUpdating,
// showOnCreating, showOnUpdating, exceptOnForms, hideFromIndex, onlyOnDetail,
// onlyOnIndex, showOnIndex, sortable, filterable, searchable,
// displayUsingLabels) works without any special-casing here.

export const FIELD_NAMESPACE = {
  Text:          'Laravel\\Nova\\Fields\\Text',
  Textarea:      'Laravel\\Nova\\Fields\\Textarea',
  Trix:          'Laravel\\Nova\\Fields\\Trix',
  Number:        'Laravel\\Nova\\Fields\\Number',
  Boolean:       'Laravel\\Nova\\Fields\\Boolean',
  Select:        'Laravel\\Nova\\Fields\\Select',
  // VirtualSelect is a cross-subdomain logical-ref Select (see
  // references/virtual-relations.md). It renders Nova's Select with options
  // sourced from a contract registered in the host app — never Text + help.
  VirtualSelect: 'Laravel\\Nova\\Fields\\Select',
  BelongsTo:     'Laravel\\Nova\\Fields\\BelongsTo',
  MorphTo:       'Laravel\\Nova\\Fields\\MorphTo',
  Date:          'Laravel\\Nova\\Fields\\Date',
  DateTime:      'Laravel\\Nova\\Fields\\DateTime',
  Currency:      'Laravel\\Nova\\Fields\\Currency',
  Email:         'Laravel\\Nova\\Fields\\Email',
  Password:      'Laravel\\Nova\\Fields\\Password',
  File:          'Laravel\\Nova\\Fields\\File',
  Image:         'Laravel\\Nova\\Fields\\Image',
  Slug:          'Laravel\\Nova\\Fields\\Slug',
};

// Relationship-typed fields must never appear in fieldsForIndex() — Nova would
// resolve each row's relation and produce N+1 queries on the index.
export const RELATION_FIELDS = new Set(['BelongsTo', 'MorphTo', 'HasOne', 'HasMany', 'VirtualSelect']);

// `contIndent` aligns any multi-line head continuation (Select's ->options
// block) with the chained modifiers that renderFieldBlock appends after it.
export function fieldHead(f, contIndent = '                ') {
  const c = contIndent;
  switch (f.field) {
    case 'BelongsTo':
      return `BelongsTo::make(__('${f.label}'), '${f.attribute}', ${f.related_resource}::class)`;
    case 'MorphTo':
      return `MorphTo::make(__('${f.label}'), '${f.attribute}')`;
    case 'Select':
      return `Select::make(__('${f.label}'), '${f.attribute}')\n`
        + `${c}->options(\n`
        + `${c}    collect(${f.enum_class}::cases())\n`
        + `${c}        ->mapWithKeys(fn ($case) => [$case->value => __($case->name)])\n`
        + `${c}        ->all()\n`
        + `${c})`;
    case 'VirtualSelect':
      // Cross-subdomain logical ref. The Select pulls its options from a
      // contract bound by the host application — the contract MUST expose
      // forSelect(): array.
      return `Select::make(__('${f.label}'), '${f.attribute}')\n`
        + `${c}->options(fn () => app(${f.contract_class}::class)->forSelect())`;
    default:
      return `${f.field}::make(__('${f.label}'), '${f.attribute}')`;
  }
}

export function renderModifiers(modifiers, modelName) {
  return (modifiers || []).map(m => {
    if (typeof m === 'string') return `->${m}()`;
    if (m.rules)               return `->rules(...${modelName}Model::$validationRules['${m.rules}'])`;
    if (m.help)                return `->help(__('${m.help}'))`;
    if (m.default !== undefined) {
      const v = typeof m.default === 'string' ? `'${m.default}'` : m.default;
      return `->default(${v})`;
    }
    if (m.min !== undefined)   return `->min(${m.min})`;
    if (m.max !== undefined)   return `->max(${m.max})`;
    // Valueless flag objects, e.g. { "hideFromIndex": true } — treat as ->key().
    const keys = Object.keys(m);
    if (keys.length === 1 && m[keys[0]] === true) return `->${keys[0]}()`;
    throw new Error(`Unknown modifier: ${JSON.stringify(m)}`);
  });
}

// `contIndent` is the whitespace prepended to each continuation line (chained
// modifiers / multi-line option blocks). The head line is emitted bare — the
// caller/template supplies its base indent. Standard Nova style puts
// continuations 4 spaces deeper than the head, so pass head-indent + 4.
export function renderFieldBlock(f, modelName, contIndent = '                ') {
  if (!FIELD_NAMESPACE[f.field]) throw new Error(`Unknown Nova field: ${f.field}`);
  const head = fieldHead(f, contIndent);
  const mods = renderModifiers(f.modifiers, modelName);
  if (mods.length === 0) return head;
  return [head, ...mods].join('\n' + contIndent);
}

export function seedTranslations(langDir, locale, entries) {
  const filePath = join(langDir, `${locale}.json`);
  let json = {};
  if (existsSync(filePath)) {
    try { json = JSON.parse(readFileSync(filePath, 'utf8')); }
    catch (_) { json = {}; }
  } else {
    mkdirSync(langDir, { recursive: true });
  }
  const added = [];
  const skipped = [];
  for (const entry of entries) {
    const [key, value] = Array.isArray(entry) ? entry : [entry, entry];
    if (key == null || key === '') continue;
    if (Object.prototype.hasOwnProperty.call(json, key)) {
      skipped.push(key);
      continue;
    }
    json[key] = value;
    added.push(key);
  }
  if (added.length > 0 || !existsSync(filePath)) {
    writeFileSync(filePath, JSON.stringify(json, null, 4) + '\n');
  }
  return { path: filePath, added, skipped };
}
