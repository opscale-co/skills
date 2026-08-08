#!/usr/bin/env node
/**
 * opscale-showcase — Internal Presentation Validator
 *
 * INTERNAL SKILL TOOL — do not copy to projects.
 * Runs from the skill bundle directory during skill execution.
 *
 * The Presentation phase produces THREE artifacts; this validator checks that
 * all three are present and wired:
 *
 *   1. Seed      — workbench/database/seeders/DatabaseSeeder.php carries the
 *                  idempotent demo block (marker: >>> opscale-seed:start).
 *   2. Menu      — workbench/app/Providers/NovaServiceProvider.php carries the
 *                  Nova::mainMenu() block (marker: >>> opscale-menu:start).
 *   3. Walkthrough — tests/Browser/*ShowcaseTest.php exists and extends the
 *                  Dusk test case.
 *
 * The marker names keep the historical `opscale-seed` / `opscale-menu` prefixes
 * so re-runs replace the block in modules generated before the three skills
 * merged into opscale-showcase (idempotent, no duplicate blocks).
 *
 * Usage:
 *   node validate-showcase.mjs [--seeder=<path>] [--provider=<path>] [--test=<path>]
 *
 * Exit codes:
 *   0 — PASS: all three artifacts present.
 *   1 — FAIL: at least one artifact missing or malformed.
 *
 * The functional success gate remains `composer showcase` (the walkthrough must
 * actually run green in visible Chrome); this validator is the fast static
 * pre-check that the three artifacts exist before that expensive run.
 */

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

function firstExisting(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  return null;
}

function findShowcaseTest(explicit) {
  if (explicit) return fs.existsSync(explicit) ? path.resolve(explicit) : null;
  const dirs = ['tests/Browser', 'tests/browser'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/ShowcaseTest\.php$/.test(f)) return path.resolve(path.join(dir, f));
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);
  const passes = [];
  const errors = [];

  // --- 1. Seed: DatabaseSeeder.php with the demo block ---
  const seeder = args.seeder
    ? (fs.existsSync(args.seeder) ? path.resolve(args.seeder) : null)
    : firstExisting([
        'workbench/database/seeders/DatabaseSeeder.php',
        'database/seeders/DatabaseSeeder.php',
      ]);
  if (!seeder) {
    errors.push('DatabaseSeeder.php not found (run the Seed demo data phase)');
  } else {
    const text = fs.readFileSync(seeder, 'utf8');
    const hasMarker = text.includes('>>> opscale-seed:start')
      && text.includes('<<< opscale-seed:end');
    if (!hasMarker) {
      errors.push(`seeder is missing the demo block markers (>>> opscale-seed:start … <<< opscale-seed:end) → ${seeder}`);
    } else if (!/extends\s+Seeder/.test(text) || !/function\s+run\s*\(/.test(text)) {
      errors.push(`seeder does not extend Seeder / has no run() → ${seeder}`);
    } else {
      passes.push(`seed demo block present → ${seeder}`);
    }
  }

  // --- 2. Menu: NovaServiceProvider.php with the mainMenu() block ---
  const provider = args.provider
    ? (fs.existsSync(args.provider) ? path.resolve(args.provider) : null)
    : firstExisting([
        'workbench/app/Providers/NovaServiceProvider.php',
        'app/Providers/NovaServiceProvider.php',
      ]);
  if (!provider) {
    errors.push('NovaServiceProvider.php not found (run the Nova menu phase)');
  } else {
    const text = fs.readFileSync(provider, 'utf8');
    const hasMarker = text.includes('>>> opscale-menu:start')
      && text.includes('<<< opscale-menu:end');
    const hasMenu = /::mainMenu\s*\(/.test(text);
    if (!hasMarker) {
      errors.push(`provider is missing the menu block markers (>>> opscale-menu:start … <<< opscale-menu:end) → ${provider}`);
    } else if (!hasMenu) {
      errors.push(`provider marker block has no Nova::mainMenu() call → ${provider}`);
    } else {
      passes.push(`Nova menu block present → ${provider}`);
    }
  }

  // --- 3. Walkthrough: a *ShowcaseTest.php under tests/Browser ---
  const test = findShowcaseTest(args.test);
  if (!test) {
    errors.push('no tests/Browser/*ShowcaseTest.php found (run the Guided walkthrough phase)');
  } else {
    const text = fs.readFileSync(test, 'utf8');
    if (!/extends\s+DuskTestCase/.test(text)) {
      errors.push(`showcase test does not extend DuskTestCase → ${test}`);
    } else {
      passes.push(`guided walkthrough present → ${test}`);
    }
  }

  for (const p of passes) console.log(`PASS — ${p}`);
  if (errors.length) {
    for (const e of errors) console.log(`FAIL — ${e}`);
    process.exit(1);
  }
  console.log('PASS — all three Presentation artifacts present (seed, menu, walkthrough)');
  process.exit(0);
}

main();
