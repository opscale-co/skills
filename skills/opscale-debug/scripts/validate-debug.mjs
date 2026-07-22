#!/usr/bin/env node
// validate-debug.mjs — verifies debug tooling configuration.
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

function readScalar(text, key) {
  const m = text.match(new RegExp(`^\\s*[-*]?\\s*\\*?\\*?${key}\\*?\\*?\\s*[:=]\\s*['"\`]?([A-Za-z0-9_.-]+)['"\`]?`, 'mi'));
  return m ? m[1] : null;
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args['project-root'] || '.');
  const errors = [];
  const passes = [];
  const warnings = [];

  // Constitution
  const constitution = path.join(root, '.specify/memory/constitution.md');
  if (!fs.existsSync(constitution)) {
    errors.push(`constitution missing → ${constitution}:1`);
  } else {
    passes.push('constitution exists');
  }

  let workbenchLocale = 'es';
  let appLocale = null;
  if (fs.existsSync(constitution)) {
    const ct = fs.readFileSync(constitution, 'utf8');
    workbenchLocale = readScalar(ct, 'WORKBENCH_LOCALE') || 'es';
    appLocale = readScalar(ct, 'APP_LOCALE');
  }

  // Expected locale (workbench takes precedence for workbench/.env)
  const workbenchEnv = path.join(root, 'workbench/.env');
  const appEnv = path.join(root, '.env');
  let envPath = null;
  let expectedLocale = null;
  if (fs.existsSync(workbenchEnv)) {
    envPath = workbenchEnv;
    expectedLocale = workbenchLocale;
  } else if (fs.existsSync(appEnv)) {
    envPath = appEnv;
    expectedLocale = appLocale || workbenchLocale;
  } else {
    errors.push(`no workbench/.env or .env found → ${root}:?`);
  }

  if (envPath) {
    const envText = fs.readFileSync(envPath, 'utf8');
    const m = envText.match(/^APP_LOCALE=(.+)$/m);
    if (!m) {
      errors.push(`APP_LOCALE not set in env → ${envPath}:1`);
    } else if (expectedLocale && m[1].trim().replace(/['"]/g, '') !== expectedLocale) {
      errors.push(`APP_LOCALE mismatch (got ${m[1].trim()}, expected ${expectedLocale}) → ${envPath}:${envText.slice(0, m.index).split('\n').length}`);
    } else {
      passes.push(`APP_LOCALE=${m[1].trim()} in ${path.relative(root, envPath)}`);
    }
  }

  // Telescope: app provider OR workbench provider referencing Telescope::
  const appTelescope = path.join(root, 'app/Providers/TelescopeServiceProvider.php');
  const workbenchProvider = path.join(root, 'workbench/app/Providers/WorkbenchServiceProvider.php');
  let telescopeFound = false;
  if (fs.existsSync(appTelescope)) {
    telescopeFound = true;
    passes.push('TelescopeServiceProvider.php exists');
  } else if (fs.existsSync(workbenchProvider)) {
    const t = fs.readFileSync(workbenchProvider, 'utf8');
    if (/Telescope::/.test(t)) {
      telescopeFound = true;
      passes.push('WorkbenchServiceProvider registers Telescope');
    }
  }
  if (!telescopeFound) {
    errors.push(`no Telescope provider registration → ${appTelescope} or ${workbenchProvider}`);
  }

  // Xdebug ini
  const xdebugPaths = [
    path.join(root, 'php.ini'),
    path.join(root, 'conf.d/xdebug.ini'),
    path.join(root, '.docker/php/conf.d/xdebug.ini'),
    path.join(root, 'docker/php/conf.d/xdebug.ini'),
  ];
  let xdebugOk = false;
  for (const p of xdebugPaths) {
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8');
      if (/xdebug\.mode\s*=\s*debug/.test(t)) {
        xdebugOk = true;
        passes.push(`xdebug.mode=debug in ${path.relative(root, p)}`);
        break;
      }
    }
  }
  if (!xdebugOk) {
    errors.push(`xdebug ini with mode=debug not found → ${root}:?`);
  }

  // Optional: telescope:install --pretend
  const artisan = path.join(root, 'artisan');
  if (fs.existsSync(artisan)) {
    const r = spawnSync('php', ['artisan', 'telescope:install', '--pretend'], { cwd: root, encoding: 'utf8' });
    if (r.status === 0) {
      passes.push('php artisan telescope:install --pretend → 0');
    } else {
      warnings.push(`telescope:install --pretend exited ${r.status}`);
    }
  } else {
    warnings.push('no php artisan available — skipped telescope:install --pretend');
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
