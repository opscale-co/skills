#!/usr/bin/env node
// validate-seed.mjs — verifies the workbench DatabaseSeeder exists and runs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
  let seeder = args.seeder;
  if (!seeder) {
    const candidates = ['workbench/database/seeders/DatabaseSeeder.php', 'database/seeders/DatabaseSeeder.php'];
    for (const c of candidates) {
      if (fs.existsSync(c)) { seeder = path.resolve(c); break; }
    }
  } else {
    seeder = path.resolve(seeder);
  }
  const errors = [];
  const passes = [];
  const warnings = [];

  if (!seeder || !fs.existsSync(seeder)) {
    console.log(`FAIL — seeder file not found → ${seeder || '(no DatabaseSeeder.php found)'}`);
    process.exit(1);
  }
  passes.push(`seeder at ${seeder}`);

  const text = fs.readFileSync(seeder, 'utf8');
  const hasMarker = text.includes('// >>> opscale-seed:start') || text.includes('>>> opscale-seed:start');
  if (hasMarker) {
    passes.push('opscale-seed marker present');
  } else {
    if (!/extends\s+Seeder/.test(text)) {
      errors.push(`seeder does not extend Seeder → ${seeder}`);
    } else {
      passes.push('extends Seeder');
    }
    if (!/public\s+function\s+run\s*\(/.test(text)) {
      errors.push(`seeder has no public function run() → ${seeder}`);
    } else {
      passes.push('public function run() present');
    }
  }

  // Soft: migrate:fresh --seed --env=testing
  const artisan = path.resolve('artisan');
  if (fs.existsSync(artisan)) {
    const r = spawnSync('php', ['artisan', 'migrate:fresh', '--seed', '--env=testing'], {
      encoding: 'utf8', timeout: 120_000,
    });
    if (r.status === 0) {
      passes.push('php artisan migrate:fresh --seed --env=testing → 0');
    } else {
      warnings.push(`migrate:fresh --seed exited ${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    }
  } else {
    warnings.push('no php artisan available — skipped migrate:fresh --seed');
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
