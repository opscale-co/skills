#!/usr/bin/env node
// validate-test.mjs — verifies the testing/quality stack is configured.
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

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args['project-root'] || '.');
  const errors = [];
  const passes = [];
  const warnings = [];

  const phpunit = path.join(root, 'phpunit.xml');
  if (!fs.existsSync(phpunit)) {
    errors.push(`phpunit.xml missing → ${phpunit}`);
  } else {
    passes.push('phpunit.xml exists');
  }

  const dusk = path.join(root, 'phpunit.dusk.xml');
  if (!fs.existsSync(dusk)) {
    errors.push(`phpunit.dusk.xml missing → ${dusk}`);
  } else {
    passes.push('phpunit.dusk.xml exists');
    const t = fs.readFileSync(dusk, 'utf8');
    const m = t.match(/<env\s+name="APP_LOCALE"\s+value="[^"]+"\s+force="true"\s*\/?>/);
    if (!m) {
      errors.push(`phpunit.dusk.xml missing <env name="APP_LOCALE" value="..." force="true"/> → ${dusk}`);
    } else {
      passes.push(`phpunit.dusk.xml enforces APP_LOCALE (line ${lineOf(t, m.index)})`);
    }
  }

  const testbench = path.join(root, 'testbench.yaml');
  if (!fs.existsSync(testbench)) {
    errors.push(`testbench.yaml missing → ${testbench}`);
  } else {
    const t = fs.readFileSync(testbench, 'utf8');
    // Must contain an env: block with APP_LOCALE inside it
    const envBlock = t.match(/^env:\s*$([\s\S]*?)(?=^\S|\Z)/m);
    let ok = false;
    if (envBlock && /APP_LOCALE\s*:/m.test(envBlock[1])) ok = true;
    // fallback: APP_LOCALE under env section but flexible
    if (!ok && /env:[\s\S]*?APP_LOCALE/m.test(t)) ok = true;
    if (!ok) {
      errors.push(`testbench.yaml env: block missing APP_LOCALE → ${testbench}`);
    } else {
      passes.push('testbench.yaml env sets APP_LOCALE');
    }
  }

  const composerJson = path.join(root, 'composer.json');
  if (!fs.existsSync(composerJson)) {
    errors.push(`composer.json missing → ${composerJson}`);
  } else {
    try {
      const c = JSON.parse(fs.readFileSync(composerJson, 'utf8'));
      const scripts = c.scripts || {};
      for (const k of ['test', 'test:browser', 'check']) {
        if (!(k in scripts)) {
          errors.push(`composer.json scripts missing "${k}" → ${composerJson}`);
        } else {
          passes.push(`composer.json scripts has "${k}"`);
        }
      }
    } catch (e) {
      errors.push(`could not parse composer.json: ${e.message} → ${composerJson}`);
    }
  }

  // Run composer test --no-interaction
  const composerBin = spawnSync('composer', ['--version'], { cwd: root, encoding: 'utf8' });
  if (composerBin.status === 0) {
    const r = spawnSync('composer', ['test', '--no-interaction'], {
      cwd: root, encoding: 'utf8', timeout: 300_000,
    });
    if (r.status === 0) {
      passes.push('composer test --no-interaction → 0');
    } else {
      warnings.push(`composer test exited ${r.status}`);
    }
  } else {
    warnings.push('composer not available — skipped composer test');
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
