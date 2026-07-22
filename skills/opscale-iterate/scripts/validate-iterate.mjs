#!/usr/bin/env node
// validate-iterate.mjs — verifies an iteration commit and its log.
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

function globSync(root, pattern) {
  // Very minimal glob: supports a single * segment.
  const segs = pattern.split('/');
  let dirs = [root];
  for (const seg of segs) {
    const next = [];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      let entries;
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      if (seg === '*' || seg.includes('*')) {
        const re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        for (const e of entries) {
          if (re.test(e.name)) next.push(path.join(d, e.name));
        }
      } else {
        const candidate = path.join(d, seg);
        if (fs.existsSync(candidate)) next.push(candidate);
      }
    }
    dirs = next;
  }
  return dirs;
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args['project-root'] || '.');
  const commit = args.commit || 'HEAD';
  const errors = [];
  const passes = [];
  const warnings = [];

  // Commit message matches conventional commits
  const cm = spawnSync('git', ['log', '-1', '--pretty=%s', commit], { cwd: root, encoding: 'utf8' });
  if (cm.status !== 0) {
    errors.push(`git log failed for ${commit} → ${root}`);
  } else {
    const subject = cm.stdout.trim();
    const cc = /^(feat|fix|chore|refactor|test|docs|style|perf|ci|build|revert)(\([^)]+\))?!?:\s+.+/;
    if (cc.test(subject)) {
      passes.push(`commit subject conventional: "${subject}"`);
    } else {
      errors.push(`commit subject not conventional → "${subject}"`);
    }
  }

  // composer check
  const composer = spawnSync('composer', ['--version'], { cwd: root, encoding: 'utf8' });
  if (composer.status === 0) {
    const r = spawnSync('composer', ['check'], { cwd: root, encoding: 'utf8' });
    if (r.status === 0) {
      passes.push('composer check → 0');
    } else {
      errors.push(`composer check failed (exit ${r.status}) → ${root}`);
    }
  } else {
    warnings.push('composer not available — skipped composer check');
  }

  // iterate log exists
  const logs = globSync(root, '.specify/specs/*/logs');
  let logFound = false;
  for (const logsDir of logs) {
    if (!fs.existsSync(logsDir)) continue;
    const entries = fs.readdirSync(logsDir);
    if (entries.some((f) => /^iterate-.+\.md$/.test(f))) {
      logFound = true;
      passes.push(`iterate log found in ${path.relative(root, logsDir)}`);
      break;
    }
  }
  if (!logFound) {
    errors.push(`no .specify/specs/*/logs/iterate-*.md found → ${root}`);
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
