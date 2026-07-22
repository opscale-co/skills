#!/usr/bin/env node
// validate-menu.mjs — verifies the Nova menu block aligns with displayInNavigation.
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

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

function findProvider() {
  const candidates = [
    'app/Providers/NovaServiceProvider.php',
    'workbench/app/Providers/WorkbenchServiceProvider.php',
    'workbench/app/Providers/NovaServiceProvider.php',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  return null;
}

// Look up a Resource class file in standard locations and check displayInNavigation.
function getDisplayInNavigation(className) {
  const candidates = [
    `app/Nova/${className}.php`,
    `workbench/app/Nova/${className}.php`,
    `src/Nova/${className}.php`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const t = fs.readFileSync(c, 'utf8');
      const m = t.match(/\$displayInNavigation\s*=\s*(true|false)/);
      if (!m) return { found: true, value: true, file: c }; // absent → defaults to true
      return { found: true, value: m[1] === 'true', file: c };
    }
  }
  return { found: false, value: null, file: null };
}

function main() {
  const args = parseArgs(process.argv);
  const provider = args.provider ? path.resolve(args.provider) : findProvider();
  const errors = [];
  const passes = [];
  const warnings = [];

  if (!provider || !fs.existsSync(provider)) {
    console.log(`FAIL — Nova provider not found → ${provider || '(no candidate exists)'}`);
    process.exit(1);
  }

  const text = fs.readFileSync(provider, 'utf8');
  const startIdx = text.indexOf('>>> opscale-menu:start');
  const endIdx = text.indexOf('<<< opscale-menu:end');
  if (startIdx === -1) {
    errors.push(`missing marker ">>> opscale-menu:start" → ${provider}:1`);
  }
  if (endIdx === -1) {
    errors.push(`missing marker "<<< opscale-menu:end" → ${provider}:1`);
  }
  if (startIdx === -1 || endIdx === -1) {
    for (const e of errors) console.log(`FAIL — ${e}`);
    process.exit(1);
  }
  passes.push('opscale-menu markers present');

  const block = text.slice(startIdx, endIdx);
  const blockStartLine = lineOf(text, startIdx);

  // Resources referenced inside menu block
  const menuRefs = new Set();
  const menuRefRe = /MenuItem::resource\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*::\s*class\s*\)/g;
  let m;
  while ((m = menuRefRe.exec(block)) !== null) {
    menuRefs.add(m[1]);
  }

  if (menuRefs.size === 0) {
    warnings.push('no MenuItem::resource(...) references inside menu block');
  }

  // For each, check displayInNavigation !== false
  for (const cls of menuRefs) {
    const info = getDisplayInNavigation(cls);
    if (!info.found) {
      warnings.push(`could not locate Resource class file for ${cls}`);
      continue;
    }
    if (info.value === false) {
      errors.push(`menu references ${cls} but its $displayInNavigation = false → ${info.file}`);
    } else {
      passes.push(`${cls} displayInNavigation OK`);
    }
  }

  // Find resources project-wide with displayInNavigation = false and ensure they are NOT in menu
  const novaDirs = ['app/Nova', 'workbench/app/Nova', 'src/Nova'];
  for (const dir of novaDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.php')) continue;
      const p = path.join(dir, f);
      const t = fs.readFileSync(p, 'utf8');
      const mm = t.match(/\$displayInNavigation\s*=\s*false/);
      if (mm) {
        const cls = path.basename(f, '.php');
        if (menuRefs.has(cls)) {
          errors.push(`hidden resource ${cls} appears in menu block → ${p}`);
        } else {
          passes.push(`hidden resource ${cls} correctly absent from menu`);
        }
      }
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
