#!/usr/bin/env node
// validate-process.mjs — verifies the structure of a process.md spec.
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function globFirst(root, pattern) {
  // Supports the form ".specify/specs/*/final/process.md"
  const segs = pattern.split('/');
  let dirs = [root];
  for (const seg of segs) {
    const next = [];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      if (seg.includes('*')) {
        const re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        for (const e of entries) if (re.test(e.name)) next.push(path.join(d, e.name));
      } else {
        const c = path.join(d, seg);
        if (fs.existsSync(c)) next.push(c);
      }
    }
    dirs = next;
  }
  return dirs[0] || null;
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

function stripCodeAndTables(text) {
  // Remove fenced code blocks
  let t = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
  // Remove table rows (lines starting with |)
  t = t.split('\n').map((l) => (/^\s*\|/.test(l) ? l.replace(/[^\n]/g, ' ') : l)).join('\n');
  return t;
}

function main() {
  const args = parseArgs(process.argv);
  const file = args['process-file'] || globFirst('.', '.specify/specs/*/final/process.md');
  const errors = [];
  const passes = [];
  const warnings = [];

  if (!file || !fs.existsSync(file)) {
    console.log(`FAIL — process file not found → ${file || '(no .specify/specs/*/final/process.md match)'}`);
    process.exit(1);
  }
  passes.push(`process file at ${file}`);

  const text = fs.readFileSync(file, 'utf8');

  // Required sections
  const required = [
    { label: 'Name normalization', re: /^##\s+(Name normalization|Normalización)\b/m },
    { label: 'Lifecycle', re: /^##\s+(Lifecycle|Ciclo de vida)\b/m },
    { label: 'Ordered flow', re: /^##\s+(Ordered flow|Flujo ordenado)\b/m },
  ];
  for (const r of required) {
    const m = text.match(r.re);
    if (!m) {
      errors.push(`missing required section "${r.label}" → ${file}`);
    } else {
      passes.push(`section "${r.label}" present (line ${lineOf(text, m.index)})`);
    }
  }

  // Within Lifecycle, at least one entity with both Stages and Flows
  const stagesRe = /\*\*(Stages|Etapas):\*\*/;
  const flowsRe = /\*\*(Flows|Flujos):\*\*/;
  const cdvMatch = text.match(/^##\s+(Lifecycle|Ciclo de vida)[\s\S]*?(?=^##\s|\Z)/m);
  if (cdvMatch) {
    const section = cdvMatch[0];
    // Look for entity blocks: any block containing both **Stages:** and **Flows:**
    const entityBlocks = section.split(/^###\s+/m).slice(1);
    let found = false;
    for (const b of entityBlocks) {
      if (stagesRe.test(b) && flowsRe.test(b)) {
        found = true;
        break;
      }
    }
    if (!found && stagesRe.test(section) && flowsRe.test(section)) {
      found = true;
    }
    if (!found) {
      errors.push(`Lifecycle has no entity with both **Stages:** and **Flows:** → ${file}`);
    } else {
      passes.push('Lifecycle has entity with Stages + Flows');
    }

    // Flow lines: "- {verb} — ends at `{stage}`" (legacy: "termina en")
    const flowLineRe = /^\s*-\s+([^\n—]+?)(?:\s+—\s+(?:ends at|termina en)\s+`([^`]+)`)?\s*$/gm;
    let fm;
    let totalFlowLines = 0;
    const orphans = [];
    // Only check lines inside Flows blocks
    const flujosBlocks = section.match(/\*\*(Flows|Flujos):\*\*[\s\S]*?(?=\n\s*\n|\Z)/g) || [];
    for (const fb of flujosBlocks) {
      const lines = fb.split('\n').slice(1);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('-')) continue;
        totalFlowLines++;
        if (!/—\s+(?:ends at|termina en)\s+`[^`]+`/.test(line)) {
          orphans.push(line.trim());
        }
      }
    }
    if (orphans.length) {
      for (const o of orphans) errors.push(`orphan flow line (no terminal stage) → ${file}: "${o}"`);
    } else if (totalFlowLines > 0) {
      passes.push(`${totalFlowLines} flow lines all have terminal stage`);
    }
  }

  // snake_case identifiers in narrative
  const narrative = stripCodeAndTables(text);
  const snakeRe = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g;
  const snakeMatches = [...narrative.matchAll(snakeRe)];
  for (const sm of snakeMatches.slice(0, 10)) {
    warnings.push(`snake_case identifier in narrative "${sm[0]}" → ${file}:${lineOf(narrative, sm.index)}`);
  }
  if (snakeMatches.length > 10) {
    warnings.push(`(+${snakeMatches.length - 10} more snake_case occurrences)`);
  }

  // Normalization table ≥2 rows
  const normMatch = text.match(/^##\s+(Normalización|Name normalization)[\s\S]*?(?=^##\s|\Z)/m);
  if (normMatch) {
    const section = normMatch[0];
    const rows = section.split('\n').filter((l) => /^\s*\|/.test(l));
    // header + separator + ≥2 data rows = ≥4 lines
    const dataRows = rows.filter((l) => !/^\s*\|[\s|:-]+\|\s*$/.test(l));
    if (dataRows.length < 3) {
      errors.push(`normalization table has fewer than 2 data rows (header + ${dataRows.length - 1}) → ${file}`);
    } else {
      passes.push(`normalization table has ${dataRows.length - 1} data rows`);
    }
  }

  for (const p of passes) console.log(`PASS — ${p}`);
  for (const w of warnings) console.log(`WARN — ${w}`);
  if (errors.length) {
    for (const e of errors) console.log(`FAIL — ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
