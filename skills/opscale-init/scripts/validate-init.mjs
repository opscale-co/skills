#!/usr/bin/env node
// validate-init.mjs — verifies the opscale-init bootstrap output.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

  // Constitution
  const constitution = path.join(root, '.specify/memory/constitution.md');
  if (!fs.existsSync(constitution)) {
    errors.push(`constitution missing → ${constitution}:1`);
  } else {
    passes.push('constitution exists');
    const text = fs.readFileSync(constitution, 'utf8');
    const tokens = ['[PROJECT_NAME]', '[PROJECT_TYPE]', '[MODULE_PREFIX]', '[DATE]', '[APP_LOCALE]', '[WORKBENCH_LOCALE]'];
    for (const tok of tokens) {
      const idx = text.indexOf(tok);
      if (idx !== -1) {
        const line = text.slice(0, idx).split('\n').length;
        errors.push(`constitution still contains placeholder ${tok} → ${constitution}:${line}`);
      }
    }
    if (!tokens.some((t) => text.includes(t))) {
      passes.push('constitution has no leftover bracketed tokens');
    }
  }

  // Plan intake folder (docs/plan/)
  const planReadme = path.join(root, 'docs/plan/README.md');
  if (!fs.existsSync(planReadme)) {
    errors.push(`docs/plan/README.md (Plan manifest) missing → ${planReadme}:1`);
  } else {
    passes.push('docs/plan/README.md exists');
  }
  const planContextDir = path.join(root, 'docs/plan/context');
  if (!fs.existsSync(planContextDir)) {
    errors.push(`docs/plan/context/ missing → ${planContextDir}:1`);
  } else {
    passes.push('docs/plan/context/ exists');
    const registry = path.join(planContextDir, 'business-types.md');
    if (!fs.existsSync(registry)) {
      errors.push(`business-types registry missing → ${registry}:1`);
    } else {
      passes.push('docs/plan/context/business-types.md exists');
    }
  }

  // commit-msg husky hook
  const commitMsg = path.join(root, '.husky/commit-msg');
  if (!fs.existsSync(commitMsg)) {
    errors.push(`.husky/commit-msg missing → ${commitMsg}:1`);
  } else {
    const t = fs.readFileSync(commitMsg, 'utf8');
    if (!/commitlint/.test(t)) {
      errors.push(`.husky/commit-msg does not reference commitlint → ${commitMsg}:1`);
    } else {
      passes.push('.husky/commit-msg references commitlint');
    }
  }

  // commitlint config
  const commitlintCfg = path.join(root, 'commitlint.config.mjs');
  if (!fs.existsSync(commitlintCfg)) {
    errors.push(`commitlint.config.mjs missing → ${commitlintCfg}:1`);
  } else {
    passes.push('commitlint.config.mjs exists');
  }

  // releaserc
  const releaserc = path.join(root, '.releaserc.json');
  if (!fs.existsSync(releaserc)) {
    errors.push(`.releaserc.json missing → ${releaserc}:1`);
  } else {
    passes.push('.releaserc.json exists');
  }

  // duster
  const dusterBin = path.join(root, 'vendor/bin/duster');
  const composerJsonPath = path.join(root, 'composer.json');
  let dusterOk = fs.existsSync(dusterBin);
  if (!dusterOk && fs.existsSync(composerJsonPath)) {
    try {
      const c = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));
      const dev = c['require-dev'] || {};
      if (Object.keys(dev).some((k) => /duster/i.test(k))) {
        dusterOk = true;
        passes.push('duster listed in composer.json require-dev');
      }
    } catch (e) {
      warnings.push(`could not parse composer.json: ${e.message}`);
    }
  } else if (dusterOk) {
    passes.push('vendor/bin/duster exists');
  }
  if (!dusterOk) {
    errors.push(`duster not detectable → vendor/bin/duster or composer.json`);
  }

  // lint-staged
  const lintStagedBin = path.join(root, 'node_modules/.bin/lint-staged');
  const pkgJsonPath = path.join(root, 'package.json');
  let lintStagedOk = fs.existsSync(lintStagedBin);
  if (!lintStagedOk && fs.existsSync(pkgJsonPath)) {
    try {
      const p = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      const deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) };
      if (Object.keys(deps).some((k) => k === 'lint-staged')) {
        lintStagedOk = true;
        passes.push('lint-staged listed in package.json');
      }
    } catch (e) {
      warnings.push(`could not parse package.json: ${e.message}`);
    }
  } else if (lintStagedOk) {
    passes.push('node_modules/.bin/lint-staged exists');
  }
  if (!lintStagedOk) {
    errors.push(`lint-staged not detectable → node_modules/.bin/lint-staged or package.json`);
  }

  // Project type (from constitution) — gates the Nova/Dusk-specific checks below.
  let projectType = null;
  if (fs.existsSync(constitution)) {
    const ct = fs.readFileSync(constitution, 'utf8');
    const m = ct.match(/Project Type:\*{0,2}\s*`?([a-z]+)`?/i) || ct.match(/\bType:\s*([a-z]+)\b/i);
    if (m) projectType = m[1].toLowerCase();
  }
  const isLibrary = projectType === 'library';

  // Test harness config (Phase 4f) — libraries keep a lean stack (no Nova/Dusk).
  const phpunitXml = path.join(root, 'phpunit.xml');
  if (!fs.existsSync(phpunitXml)) {
    errors.push(`test harness: phpunit.xml missing → ${phpunitXml}:1`);
  } else {
    passes.push('phpunit.xml exists');
  }
  const testCase = path.join(root, 'tests/TestCase.php');
  if (!fs.existsSync(testCase)) {
    errors.push(`test harness: tests/TestCase.php missing → ${testCase}:1`);
  } else {
    passes.push('tests/TestCase.php exists');
  }
  if (!isLibrary) {
    const testbenchYaml = path.join(root, 'testbench.yaml');
    if (!fs.existsSync(testbenchYaml)) {
      errors.push(`test harness: testbench.yaml missing → ${testbenchYaml}:1`);
    } else {
      passes.push('testbench.yaml exists');
    }
    const duskTestCase = path.join(root, 'tests/DuskTestCase.php');
    if (!fs.existsSync(duskTestCase)) {
      errors.push(`test harness: tests/DuskTestCase.php missing → ${duskTestCase}:1`);
    } else {
      passes.push('tests/DuskTestCase.php exists');
    }
  } else {
    passes.push('library project — Nova/Dusk test harness skipped');
  }

  // Debug tooling (Phase 4e) — Telescope config or a provider that registers it.
  if (!isLibrary) {
    const telescopeCfg = path.join(root, 'config/telescope.php');
    const providerCandidates = [
      'app/Providers/AppServiceProvider.php',
      'app/Providers/TelescopeServiceProvider.php',
      'workbench/app/Providers/WorkbenchServiceProvider.php',
    ].map((p) => path.join(root, p));
    let telescopeOk = fs.existsSync(telescopeCfg);
    if (!telescopeOk) {
      telescopeOk = providerCandidates.some(
        (p) => fs.existsSync(p) && /Telescope/.test(fs.readFileSync(p, 'utf8')),
      );
    }
    if (!telescopeOk) {
      errors.push(`debug tooling: no config/telescope.php and no provider registers Telescope → ${telescopeCfg}:1`);
    } else {
      passes.push('Telescope debug config detected');
    }
  } else {
    passes.push('library project — debug tooling skipped');
  }

  // MVP feature (Phase 7) — /speckit.specify opened .specify/specs/001-mvp/
  const mvpDir = path.join(root, '.specify/specs/001-mvp');
  if (!fs.existsSync(mvpDir)) {
    errors.push(`MVP feature missing → ${mvpDir}:1 (run /speckit.specify to open 001-mvp)`);
  } else {
    passes.push('.specify/specs/001-mvp/ exists');
  }

  // MCP config (soft)
  const encoded = root.replace(/\//g, '-');
  const mcpPath = path.join(os.homedir(), '.claude', 'projects', encoded, 'settings.json');
  if (fs.existsSync(mcpPath)) {
    try {
      const m = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      if (m.mcpServers) {
        passes.push(`MCP config has mcpServers (${mcpPath})`);
      } else {
        warnings.push(`MCP config at ${mcpPath} has no mcpServers key`);
      }
    } catch (e) {
      warnings.push(`could not parse MCP config: ${e.message}`);
    }
  } else {
    warnings.push(`MCP config not found at ${mcpPath} (soft-warn)`);
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
