#!/usr/bin/env node
// validate-sipoc.mjs — verifies SIPOC files are 1:1 with BPMN businessRuleTasks.
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

function globFirstDir(root, pattern) {
  const segs = pattern.split('/').filter(Boolean);
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

function main() {
  const args = parseArgs(process.argv);
  let sipocDir = args['sipoc-dir'];
  if (!sipocDir) {
    sipocDir = globFirstDir('.', '.specify/specs/*/final/actions');
  }
  const errors = [];
  const passes = [];
  const warnings = [];

  if (!sipocDir || !fs.existsSync(sipocDir)) {
    console.log(`FAIL — sipoc directory not found → ${sipocDir || '(no .specify/specs/*/final/actions/ match)'}`);
    process.exit(1);
  }
  passes.push(`sipoc dir at ${sipocDir}`);

  const files = fs.readdirSync(sipocDir).filter((f) => f.endsWith('.sipoc.md'));
  if (files.length === 0) {
    errors.push(`no .sipoc.md files in ${sipocDir}`);
  }

  const requiredSections = [
    /^#\s+\S/m, // identifier header
    /^##\s+Suppliers\b/m,
    /^##\s+Inputs\b/m,
    /^##\s+Process\b/m,
    /^##\s+Outputs\b/m,
    /^##\s+Customers\b/m,
    /^##\s+Business Rules enforced\b/m,
  ];
  const sectionNames = ['Identifier (top-level # heading)', '## Suppliers', '## Inputs', '## Process', '## Outputs', '## Customers', '## Business Rules enforced'];

  for (const f of files) {
    const p = path.join(sipocDir, f);
    const text = fs.readFileSync(p, 'utf8');
    let allOk = true;
    for (let i = 0; i < requiredSections.length; i++) {
      if (!requiredSections[i].test(text)) {
        errors.push(`${f} missing section "${sectionNames[i]}" → ${p}`);
        allOk = false;
      }
    }
    // Inputs table has "How obtained" or "Cómo se obtiene" column header
    const inputsMatch = text.match(/^##\s+Inputs[\s\S]*?(?=^##\s|\Z)/m);
    if (inputsMatch) {
      const headerLine = inputsMatch[0].split('\n').find((l) => /^\s*\|/.test(l));
      if (!headerLine || !/(How obtained|Cómo se obtiene)/i.test(headerLine)) {
        errors.push(`${f} Inputs table missing "How obtained" / "Cómo se obtiene" column → ${p}`);
        allOk = false;
      }
    } else {
      // already counted as missing section above
    }
    if (allOk) passes.push(`${f} has all sections + Inputs column`);
  }

  // 1:1 with BPMN if process.bpmn exists
  const bpmnPath = path.join(path.dirname(sipocDir), 'process.bpmn');
  if (fs.existsSync(bpmnPath)) {
    const bpmnText = fs.readFileSync(bpmnPath, 'utf8');
    const ids = new Set();
    // Match each businessRuleTask block and pull logic.id from its <bpmn:documentation> JSON.
    // Filename === logic.id per skill spec ("Filename = identifier = logic.id"), NOT the BPMN element id.
    const taskBlockRe = /<(?:bpmn:)?businessRuleTask\b[\s\S]*?<\/(?:bpmn:)?businessRuleTask>/g;
    const logicIdRe = /<(?:bpmn:)?documentation>\s*\{[^}]*?"id"\s*:\s*"([^"]+)"/;
    let m;
    while ((m = taskBlockRe.exec(bpmnText)) !== null) {
      const docMatch = m[0].match(logicIdRe);
      if (docMatch) ids.add(docMatch[1]);
    }
    const sipocIds = new Set(files.map((f) => f.replace(/\.sipoc\.md$/, '')));
    for (const id of ids) {
      if (!sipocIds.has(id)) {
        errors.push(`BPMN businessRuleTask "${id}" has no matching ${id}.sipoc.md → ${sipocDir}`);
      }
    }
    for (const id of sipocIds) {
      if (!ids.has(id)) {
        errors.push(`${id}.sipoc.md has no matching BPMN businessRuleTask → ${bpmnPath}`);
      }
    }
    if (ids.size === sipocIds.size && [...ids].every((i) => sipocIds.has(i))) {
      passes.push(`1:1 SIPOC ↔ businessRuleTask (${ids.size} tasks)`);
    }
  } else {
    warnings.push(`no process.bpmn at ${bpmnPath} — skipped 1:1 cross-check`);
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
