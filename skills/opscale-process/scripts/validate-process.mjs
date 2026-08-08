#!/usr/bin/env node
// validate-process.mjs — verifies docs/plan/process.txt + docs/plan/context/names.md.
//
// process.txt: one block per subprocess (blocks separated by blank lines).
// Each block: id+name line (`SP-XX {name}`, SP ids sequential from SP-01),
// `Trigger:` line, `Ends with:` line, then locally numbered `YY)` step lines
// (two digits, restarting at 01 in every subprocess — the step's ontology id
// is SP-XX-YY). Branch destinations are local to the block. Only the final
// block may have `Ends with: —`. Steps carry no type markers.
//
// names.md: a title line and the normalization table (| Canónico | ← alias |)
// with ≥2 data rows and NO id column — it is input for opscale-dbml, where
// the final entities receive their kebab-case ids.
//
// process.mmd (--mmd=…): Mermaid flowchart of the same flow — structural checks
// only (never label text): flowchart header, %% module metadata, one spXX
// subgraph per block, one sXX_YY node per step, an edge per branch
// destination, a wXX wait node between consecutive subprocesses.
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

// ── Mermaid syntax linter — flowchart ───────────────────────────────────────
// Self-contained (Node stdlib only): checks the diagram is valid Mermaid so it
// actually renders, independent of the semantic cross-checks below. Catches the
// breakage a structural check misses: bad header, unbalanced quotes/brackets,
// unclosed subgraphs, illegal node ids, unknown arrow operators.
const FLOW_ARROWS = /(<-->|-->|---|-\.->|-\.-|==>|===|--x|--o|o--o|x--x)/;
function lintMermaidFlowchart(mmd) {
  const errs = [];
  const lines = mmd.split('\n');
  const firstReal = lines.find((l) => l.trim() && !l.trim().startsWith('%%'));
  if (!firstReal || !/^\s*flowchart\s+(TD|TB|BT|RL|LR)\s*$/.test(firstReal))
    errs.push(`first statement must be a "flowchart TD" header (found "${(firstReal || '').trim().slice(0, 30)}")`);

  const validId = (tok) => /^[A-Za-z][A-Za-z0-9_]*$/.test(tok);
  // strip trailing shape delimiters to expose the node id: id["…"], id(["…"]),
  // id{"…"}, id("…") → id
  const idOf = (ref) => ref.replace(/(\(\[.*\]\)|\[.*\]|\{.*\}|\(.*\))$/s, '').trim();

  let depth = 0;
  lines.forEach((line, i) => {
    const ln = i + 1;
    const t = line.trim();
    if (!t || t.startsWith('%%') || /^flowchart\s/.test(t)) return;

    // balanced double-quotes
    if (((t.match(/"/g) || []).length) % 2 !== 0)
      errs.push(`line ${ln}: unbalanced double-quote — "${t.slice(0, 40)}"`);
    // balanced brackets, ignoring anything inside quotes
    const outside = t.replace(/"[^"]*"/g, '');
    for (const [o, c, name] of [['[', ']', 'square'], ['{', '}', 'curly'], ['(', ')', 'round']]) {
      if ((outside.split(o).length - 1) !== (outside.split(c).length - 1))
        errs.push(`line ${ln}: unbalanced ${name} bracket — "${t.slice(0, 40)}"`);
    }

    if (/^subgraph\b/.test(t)) {
      depth++;
      if (!/^subgraph\s+[A-Za-z][A-Za-z0-9_]*(\s+\[".*"\])?\s*$/.test(t))
        errs.push(`line ${ln}: subgraph header must be \`subgraph {id} ["title"]\` — "${t.slice(0, 40)}"`);
      return;
    }
    if (t === 'end') { depth--; if (depth < 0) errs.push(`line ${ln}: "end" without an open subgraph`); return; }

    // edge or node statement — mask quoted labels, then normalise edge labels
    // to bare arrows so only node refs remain: `A -- txt --> B` and
    // `A -->|txt| B` both become `A --> B`.
    const masked = t.replace(/"[^"]*"/g, '"L"')
      .replace(/--\s+[^|>][^\n]*?\s+(-->|---|-\.->|==>)/g, ' $1 ')
      .replace(/(-->|---|-\.->|==>|--x|--o)\s*\|[^|]*\|/g, '$1 ');
    if (FLOW_ARROWS.test(masked)) {
      // split on arrows; every endpoint's leading id must be a valid identifier
      const endpoints = masked
        .split(FLOW_ARROWS)
        .filter((seg) => !FLOW_ARROWS.test(seg) && seg.trim())
        .map((seg) => seg.trim())
        .filter(Boolean);
      for (const ep of endpoints) {
        const id = idOf(ep);
        if (!validId(id)) errs.push(`line ${ln}: "${id}" is not a valid node id (letters, digits, underscore; start with a letter) — "${t.slice(0, 40)}"`);
      }
    } else {
      // pure node definition
      const id = idOf(masked);
      if (!validId(id)) errs.push(`line ${ln}: node id "${id}" is invalid, or the statement is not a node/edge — "${t.slice(0, 40)}"`);
    }
  });
  if (depth > 0) errs.push(`${depth} subgraph(s) not closed with "end"`);
  return errs;
}

function main() {
  const args = parseArgs(process.argv);
  const processFile = args['process-txt'] || 'docs/plan/process.txt';
  const namesFile = args['names-file'] || 'docs/plan/context/names.md';
  const errors = [];
  const passes = [];

  // ── process.txt ───────────────────────────────────────────────────────────
  if (!fs.existsSync(processFile)) {
    console.log(`FAIL — process flow not found → ${processFile} (pass --process-txt=...)`);
    process.exit(1);
  }
  passes.push(`flow file at ${processFile}`);
  const text = fs.readFileSync(processFile, 'utf8');

  // Legacy step-type emojis — steps are untyped; events live on Trigger/Ends with.
  const legacyEmojis = ['📝', '⚙️', '✅', '🔀', '⏳', '📩', '📄'];
  for (const emoji of legacyEmojis) {
    const idx = text.indexOf(emoji);
    if (idx !== -1) {
      const line = text.slice(0, idx).split('\n').length;
      errors.push(`legacy step-type emoji "${emoji}" (steps are untyped; events live on Trigger:/Ends with: lines) → ${processFile}:${line}`);
    }
  }
  if (legacyEmojis.every((e) => !text.includes(e))) passes.push('no legacy step-type emojis');

  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  // stepsBySp[XX] = count of steps in subprocess XX (1-based) — reused by --mmd.
  const stepsBySp = [];
  if (blocks.length === 0) {
    errors.push(`no subprocess blocks found (blank-line separated) → ${processFile}`);
  } else {
    passes.push(`${blocks.length} subprocess block(s)`);
    let totalSteps = 0;
    blocks.forEach((block, i) => {
      const lines = block.split('\n').map((l) => l.trim());
      const header = lines[0] || `(block ${i + 1})`;
      const isLast = i === blocks.length - 1;

      // `SP-XX {name}` — sequential ids from SP-01.
      const spMatch = header.match(/^SP-(\d{2,})\s+\S/);
      const expectedSp = String(i + 1).padStart(2, '0');
      if (!spMatch) {
        errors.push(`block ${i + 1} must open with "SP-${expectedSp} {name}" (found "${header.slice(0, 40)}") → ${processFile}`);
      } else if (spMatch[1] !== expectedSp) {
        errors.push(`block ${i + 1} has id SP-${spMatch[1]} — subprocess ids are sequential (expected SP-${expectedSp}) → ${processFile}`);
      }
      const name = header;

      const trigger = lines.find((l) => l.startsWith('Trigger:'));
      if (!trigger || !trigger.slice('Trigger:'.length).trim()) {
        errors.push(`subprocess "${name}" has no Trigger: line with content → ${processFile}`);
      }
      const ends = lines.find((l) => l.startsWith('Ends with:'));
      const endsValue = ends ? ends.slice('Ends with:'.length).trim() : null;
      if (endsValue === null) {
        errors.push(`subprocess "${name}" has no Ends with: line → ${processFile}`);
      } else if (!isLast && (endsValue === '' || endsValue === '—')) {
        errors.push(`subprocess "${name}" is not the last but its Ends with: names no wait event → ${processFile}`);
      } else if (isLast && endsValue !== '—') {
        errors.push(`final subprocess "${name}" must close with "Ends with: —" (no further wait) → ${processFile}`);
      }

      // Local numbering: two-digit `YY)`, restarting at 01 per block.
      const steps = lines.filter((l) => /^\d+\)/.test(l));
      if (steps.length === 0) {
        errors.push(`subprocess "${name}" has no numbered steps ("YY) ...") → ${processFile}`);
      }
      let expectedStep = 1;
      for (const s of steps) {
        const raw = s.match(/^(\d+)\)/)[1];
        if (raw.length !== 2) {
          errors.push(`step "${s.slice(0, 40)}" — local step numbers are two digits (01), 02), …) → ${processFile}`);
        }
        if (Number(raw) !== expectedStep) {
          errors.push(`step numbering breaks at "${s.slice(0, 40)}" in "${name}" — expected ${String(expectedStep).padStart(2, '0')}) (local, restarts per subprocess) → ${processFile}`);
        }
        expectedStep = Number(raw) + 1;
      }
      stepsBySp.push(steps.length);
      totalSteps += steps.length;

      // Branch destinations are local: every `→ YY` must exist in THIS block.
      for (const s of steps) {
        for (const m of s.matchAll(/→\s*(\d+)/g)) {
          const target = Number(m[1]);
          if (target < 1 || target > steps.length) {
            errors.push(`branch destination → ${m[1]} in "${name}" does not exist (local steps run 01..${String(steps.length).padStart(2, '0')}) → ${processFile}`);
          }
        }
      }

      // Every non-empty line is the header, Trigger, Ends with, or a step.
      for (const l of lines.slice(1)) {
        if (!l.startsWith('Trigger:') && !l.startsWith('Ends with:') && !/^\d+\)/.test(l)) {
          errors.push(`unrecognized line in subprocess "${name}": "${l.slice(0, 50)}" (expected Trigger:, Ends with:, or "YY) step") → ${processFile}`);
        }
      }
    });

    if (!errors.some((e) => e.includes('numbering') || e.includes('destination') || e.includes('SP-'))) {
      passes.push(`${totalSteps} steps, local numbering per subprocess, branch destinations valid`);
    }
  }

  // ── context/names.md ──────────────────────────────────────────────────────
  if (!fs.existsSync(namesFile)) {
    errors.push(`names file not found → ${namesFile} (pass --names-file=...)`);
  } else {
    passes.push(`names file at ${namesFile}`);
    const names = fs.readFileSync(namesFile, 'utf8');
    const rows = names.split('\n').filter((l) => /^\s*\|/.test(l));
    const dataRows = rows.filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    // header + ≥2 data rows
    if (dataRows.length < 3) {
      errors.push(`normalization table has fewer than 2 data rows (found ${Math.max(0, dataRows.length - 1)}) → ${namesFile}`);
    } else {
      passes.push(`normalization table has ${dataRows.length - 1} data rows`);
    }
    // No id column: names.md is input only — entity ids are assigned by
    // opscale-dbml (kebab-case) on the FINAL entities.
    for (const row of dataRows) {
      const firstCol = row.split('|')[1]?.trim() ?? '';
      if (/^(E-\d+|ID)$/i.test(firstCol)) {
        errors.push(`row "${row.trim().slice(0, 50)}" carries an id column — names.md has none (entity ids are assigned by opscale-dbml on the final entities) → ${namesFile}`);
      }
    }
    const snakes = [...names.matchAll(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g)];
    for (const sm of snakes.slice(0, 5)) {
      errors.push(`snake_case name "${sm[0]}" in names.md — canonical names are readable words in the user's language → ${namesFile}`);
    }
  }

  // ── process.mmd (optional --mmd=…) ───────────────────────────────────────
  const mmdFile = args['mmd'];
  if (mmdFile) {
    if (!fs.existsSync(mmdFile)) {
      errors.push(`flowchart not found → ${mmdFile} (pass --mmd=...)`);
    } else {
      const mmd = fs.readFileSync(mmdFile, 'utf8');

      // Mermaid syntax lint first — a diagram that will not render is a hard
      // fail regardless of whether the structure matches process.txt.
      const mermaidErrs = lintMermaidFlowchart(mmd);
      for (const e of mermaidErrs) errors.push(`mermaid: ${e} → ${mmdFile}`);
      if (mermaidErrs.length === 0) passes.push('process.mmd is valid Mermaid (flowchart)');

      if (!/^%% module:\s*\S/m.test(mmd)) {
        errors.push(`missing "%% module: {name}" metadata line — the diagram is self-contained → ${mmdFile}`);
      }

      const subgraphs = [...mmd.matchAll(/^\s*subgraph\s+sp(\d{2,})\b/gm)].map((m) => m[1]);
      if (subgraphs.length !== blocks.length) {
        errors.push(`flowchart has ${subgraphs.length} subgraphs, process.txt has ${blocks.length} subprocess blocks — one spXX per block → ${mmdFile}`);
      }

      // one sXX_YY node definition per local step
      const nodeDefs = new Set([...mmd.matchAll(/\bs(\d{2,})_(\d{2,})\s*[\[{(]/g)].map((m) => `${m[1]}_${m[2]}`));
      stepsBySp.forEach((count, i) => {
        const xx = String(i + 1).padStart(2, '0');
        for (let yy = 1; yy <= count; yy++) {
          const key = `${xx}_${String(yy).padStart(2, '0')}`;
          if (!nodeDefs.has(key)) errors.push(`step SP-${xx}-${String(yy).padStart(2, '0')} has no s${key} node in the flowchart → ${mmdFile}`);
        }
      });

      // every branch destination has an edge sXX_YY … sXX_ZZ (same subgraph)
      blocks.forEach((block, i) => {
        const xx = String(i + 1).padStart(2, '0');
        for (const line of block.split('\n')) {
          const src = line.trim().match(/^(\d{2,})\)/);
          if (!src) continue;
          for (const dst of line.matchAll(/→\s*(\d{2,})/g)) {
            const a = `s${xx}_${src[1]}`;
            const b = `s${xx}_${dst[1]}`;
            if (!new RegExp(`\\b${a}\\b[^\\n]*-->\\s*${b}\\b`).test(mmd)) {
              errors.push(`branch ${src[1]} → ${dst[1]} in SP-${xx} has no edge ${a} --> ${b} → ${mmdFile}`);
            }
          }
        }
      });

      // one wait node between consecutive subprocesses
      const waitDefs = new Set([...mmd.matchAll(/\bw(\d{2,})\s*\(/g)].map((m) => m[1]));
      for (let k = 1; k < blocks.length; k++) {
        const xx = String(k).padStart(2, '0');
        if (!waitDefs.has(xx)) errors.push(`missing wait node w${xx} (closing wait of SP-${xx}) → ${mmdFile}`);
      }

      if (errors.every((e) => !e.includes(mmdFile))) {
        passes.push(`flowchart matches: ${subgraphs.length} subgraphs, ${nodeDefs.size} step nodes, ${waitDefs.size} waits`);
      }
    }
  }

  for (const p of passes) console.log(`PASS — ${p}`);
  if (errors.length) {
    for (const e of errors) console.log(`FAIL — ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
