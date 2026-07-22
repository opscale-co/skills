#!/usr/bin/env node
// validate-release.mjs — verifies CI release/deploy workflows and SonarQube config.
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
  const root = path.resolve(args['project-root'] || '.');
  const errors = [];
  const passes = [];
  const warnings = [];

  const autoCheck = path.join(root, '.github/workflows/auto-check.yml');
  if (!fs.existsSync(autoCheck)) {
    errors.push(`.github/workflows/auto-check.yml missing → ${autoCheck}`);
  } else {
    passes.push('auto-check.yml exists');
  }

  const publishPkg = path.join(root, '.github/workflows/publish-package.yml');
  const deployApp = path.join(root, '.github/workflows/deploy-app.yml');
  const hasPub = fs.existsSync(publishPkg);
  const hasDep = fs.existsSync(deployApp);
  if (hasPub && hasDep) {
    errors.push(`both publish-package.yml and deploy-app.yml present (mutually exclusive) → ${root}/.github/workflows/`);
  } else if (!hasPub && !hasDep) {
    errors.push(`neither publish-package.yml nor deploy-app.yml present → ${root}/.github/workflows/`);
  } else {
    passes.push(`release workflow present: ${hasPub ? 'publish-package.yml' : 'deploy-app.yml'}`);
  }

  const sonar = path.join(root, 'sonar-project.properties');
  if (!fs.existsSync(sonar)) {
    errors.push(`sonar-project.properties missing → ${sonar}`);
  } else {
    const t = fs.readFileSync(sonar, 'utf8');
    const placeholders = ['[package-name]', '[Package Display Name]'];
    let hadPlaceholder = false;
    for (const ph of placeholders) {
      const idx = t.indexOf(ph);
      if (idx !== -1) {
        hadPlaceholder = true;
        const line = t.slice(0, idx).split('\n').length;
        errors.push(`sonar-project.properties still contains "${ph}" → ${sonar}:${line}`);
      }
    }
    if (!hadPlaceholder) {
      passes.push('sonar-project.properties has no leftover placeholders');
    }
  }

  // semantic-release dry-run (soft)
  const npx = spawnSync('npx', ['--version'], { cwd: root, encoding: 'utf8' });
  if (npx.status === 0) {
    const r = spawnSync('npx', ['semantic-release', '--dry-run', '--no-ci'], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
    });
    if (r.status === 0) {
      passes.push('semantic-release --dry-run → 0');
    } else {
      warnings.push(`semantic-release --dry-run exited ${r.status} (possibly offline or unconfigured)`);
    }
  } else {
    warnings.push('npx not available — skipped semantic-release dry-run');
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
