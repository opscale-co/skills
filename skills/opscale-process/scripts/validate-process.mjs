#!/usr/bin/env node
// validate-process.mjs — verifies docs/plan/process.txt + docs/plan/context/names.md.
//
// process.txt: one block per subprocess (blocks separated by blank lines).
// Each block: name line, `Trigger:` line, `Ends with:` line, then numbered
// `N)` step lines. Only the final block may have `Ends with: —`. Steps carry
// no type markers (legacy emojis are an error). Numbering is sequential
// across the whole module.
//
// names.md: a title line and the normalization table with ≥2 data rows.
import fs from 'node:fs';

function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
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
  if (blocks.length === 0) {
    errors.push(`no subprocess blocks found (blank-line separated) → ${processFile}`);
  } else {
    passes.push(`${blocks.length} subprocess block(s)`);
    let expectedStep = 1;
    blocks.forEach((block, i) => {
      const lines = block.split('\n').map((l) => l.trim());
      const name = lines[0] || `(block ${i + 1})`;
      const isLast = i === blocks.length - 1;

      if (/^(Trigger:|Ends with:|\d+\))/.test(name)) {
        errors.push(`block ${i + 1} has no subprocess name line (starts with "${name.slice(0, 30)}") → ${processFile}`);
      }
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

      const steps = lines.filter((l) => /^\d+\)/.test(l));
      if (steps.length === 0) {
        errors.push(`subprocess "${name}" has no numbered steps ("N) ...") → ${processFile}`);
      }
      for (const s of steps) {
        const n = Number(s.match(/^(\d+)\)/)[1]);
        if (n !== expectedStep) {
          errors.push(`step numbering breaks at "${s.slice(0, 40)}" — expected ${expectedStep}) (sequential across the whole module) → ${processFile}`);
        }
        expectedStep = n + 1;
      }

      // Every non-empty line is name, Trigger, Ends with, or a numbered step.
      for (const l of lines.slice(1)) {
        if (!l.startsWith('Trigger:') && !l.startsWith('Ends with:') && !/^\d+\)/.test(l)) {
          errors.push(`unrecognized line in subprocess "${name}": "${l.slice(0, 50)}" (expected Trigger:, Ends with:, or "N) step") → ${processFile}`);
        }
      }
    });

    // Branch destinations must reference existing step numbers.
    const totalSteps = expectedStep - 1;
    for (const m of text.matchAll(/→\s*(\d+)/g)) {
      const target = Number(m[1]);
      if (target < 1 || target > totalSteps) {
        errors.push(`branch destination → ${target} does not exist (steps run 1..${totalSteps}) → ${processFile}`);
      }
    }
    if (!errors.some((e) => e.includes('numbering') || e.includes('destination'))) {
      passes.push(`${totalSteps} steps, sequential numbering, branch destinations valid`);
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
    const snakes = [...names.matchAll(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/g)];
    for (const sm of snakes.slice(0, 5)) {
      errors.push(`snake_case name "${sm[0]}" in names.md — canonical names are readable words in the user's language → ${namesFile}`);
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
