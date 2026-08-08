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

function main() {
  const args = parseArgs(process.argv);
  const sipocDir = args['sipoc-dir'] || 'docs/plan/sipoc';
  const errors = [];
  const passes = [];
  const warnings = [];

  if (!sipocDir || !fs.existsSync(sipocDir)) {
    console.log(`FAIL — sipoc directory not found → ${sipocDir} (pass --sipoc-dir=… or create docs/plan/sipoc/)`);
    process.exit(1);
  }
  passes.push(`sipoc dir at ${sipocDir}`);

  const files = fs.readdirSync(sipocDir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    errors.push(`no SIPOC .md files in ${sipocDir}`);
  }

  const requiredSections = [
    /^#\s+\S/m, // identifier header
    /^##\s+SIPOC\s*$/m, // one-glance summary table
    /^##\s+Suppliers\b/m,
    /^##\s+Inputs\b/m,
    /^##\s+Process\b/m,
    /^##\s+Outputs\b/m,
    /^##\s+Customers\b/m,
    /^##\s+Business Rules enforced\b/m,
  ];
  const sectionNames = ['Identifier (top-level # heading)', '## SIPOC (summary table)', '## Suppliers', '## Inputs', '## Process', '## Outputs', '## Customers', '## Business Rules enforced'];

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

    // Type cells use business types: a registry slug, a DBML entity, or a DBML
    // Enum — never free scalars/objects. Only `success: bool` is exempt.
    const FORBIDDEN_TYPES = /^(object|array|mixed|string|int|integer|float|double|json|bool|boolean|number|any)\b/i;
    const typeCell = (row, idx) => (row.split('|')[idx] ?? '').trim();
    const checkTypeCells = (sectionRe, idx, section) => {
      const m2 = text.match(sectionRe);
      if (!m2) return;
      const rows = m2[0].split('\n').filter((l) => /^\s*\|/.test(l)).slice(2); // skip header + separator
      for (const row of rows) {
        const t = typeCell(row, idx);
        if (!t) continue;
        const key = typeCell(row, 1);
        if (section === 'Outputs' && key === 'success' && /^bool/.test(t)) continue;
        if (FORBIDDEN_TYPES.test(t)) {
          errors.push(`${f} ${section} type "${t}" is a free scalar/object — use a business-type slug, a DBML entity, or a DBML Enum (extend the registry if nothing fits) → ${p}`);
          allOk = false;
        }
      }
    };
    checkTypeCells(/^##\s+Inputs[\s\S]*?(?=^##\s|\Z)/m, 4, 'Inputs');
    checkTypeCells(/^##\s+Outputs[\s\S]*?(?=^##\s|\Z)/m, 2, 'Outputs');

    // The `## SIPOC` summary table's Process column (3rd column) lists this
    // Logic's operations — every non-empty cell is prefixed crud:/logic:/output:.
    const sipocTable = text.match(/^##\s+SIPOC\s*$[\s\S]*?(?=^##\s|\Z)/m);
    if (sipocTable) {
      const rows = sipocTable[0].split('\n').filter((l) => /^\s*\|/.test(l)).slice(2); // skip header + separator
      let sawProcessOp = false;
      for (const row of rows) {
        const proc = (row.split('|')[3] ?? '').trim();
        if (!proc) continue;
        if (!/^(crud|logic|output):\s+\S/.test(proc)) {
          errors.push(`${f} ## SIPOC table Process cell "${proc.slice(0, 40)}" must be an operation prefixed crud: / logic: / output: → ${p}`);
          allOk = false;
        } else sawProcessOp = true;
      }
      if (!sawProcessOp) {
        errors.push(`${f} ## SIPOC table has no operation in its Process column (crud:/logic:/output:) → ${p}`);
        allOk = false;
      }
    }

    if (allOk) passes.push(`${f} has all sections + SIPOC table + business-typed Inputs/Outputs`);
  }

  // 1:1 with BPMN if bpmn.bpmn exists
  const bpmnPath = path.join(path.dirname(sipocDir), 'bpmn.bpmn');
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
    const sipocIds = new Set(files.map((f) => f.replace(/\.md$/, '')));
    for (const id of ids) {
      if (!sipocIds.has(id)) {
        errors.push(`BPMN businessRuleTask "${id}" has no matching ${id}.md → ${sipocDir}`);
      }
    }
    for (const id of sipocIds) {
      if (!ids.has(id)) {
        errors.push(`${id}.md has no matching BPMN businessRuleTask → ${bpmnPath}`);
      }
    }
    if (ids.size === sipocIds.size && [...ids].every((i) => sipocIds.has(i))) {
      passes.push(`1:1 SIPOC ↔ businessRuleTask (${ids.size} tasks)`);
    }
  } else {
    warnings.push(`no bpmn.bpmn at ${bpmnPath} — skipped 1:1 cross-check`);
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
