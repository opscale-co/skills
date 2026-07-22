#!/usr/bin/env node
// validate-installer.mjs — verifies a generated installer skill markdown file.
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

function findFirstInstaller() {
  const dir = path.resolve('.claude/skills');
  if (!fs.existsSync(dir)) return null;
  const matches = fs.readdirSync(dir).filter((f) => f.endsWith('-setup.md'));
  if (matches.length === 0) return null;
  return path.join(dir, matches[0]);
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

function main() {
  const args = parseArgs(process.argv);
  const file = args['installer-file'] || findFirstInstaller();
  const errors = [];
  const passes = [];

  if (!file || !fs.existsSync(file)) {
    console.error(`FAIL — installer file not found → ${file || '(no match in .claude/skills/*-setup.md)'}`);
    process.exit(1);
  }

  const text = fs.readFileSync(file, 'utf8');

  // Frontmatter check
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    errors.push(`missing YAML frontmatter → ${file}:1`);
  } else {
    const fm = fmMatch[1];
    if (!/^name:\s*\S/m.test(fm)) errors.push(`frontmatter missing "name" → ${file}:1`);
    else passes.push('frontmatter has name');
    if (!/^description:\s*\S/m.test(fm)) errors.push(`frontmatter missing "description" → ${file}:1`);
    else passes.push('frontmatter has description');
  }

  const body = fmMatch ? text.slice(fmMatch[0].length) : text;
  const bodyOffset = fmMatch ? fmMatch[0].length : 0;

  // Bash block with install commands
  const bashBlocks = [...body.matchAll(/```bash\n([\s\S]*?)```/g)];
  const installRe = /(composer\s+require|npm\s+install|php\s+artisan)/;
  const hasInstallBlock = bashBlocks.some((b) => installRe.test(b[1]));
  if (!hasInstallBlock) {
    errors.push(`no fenced bash block with install commands → ${file}:?`);
  } else {
    passes.push('found bash block with install command');
  }

  // Verification heading or step
  if (!/(^|\n)#+\s*(verification|verify)\b/i.test(body) && !/\bverif(y|ication)\b/i.test(body)) {
    errors.push(`no "verification" heading or step → ${file}:?`);
  } else {
    passes.push('has verification step');
  }

  // At least 3 numbered phases / steps
  const numbered = [...body.matchAll(/^\s*(\d+)\.\s+\S/gm)];
  const uniqueNums = new Set(numbered.map((m) => m[1]));
  if (uniqueNums.size < 3 && numbered.length < 3) {
    errors.push(`fewer than 3 numbered phases/steps (found ${numbered.length}) → ${file}:?`);
  } else {
    passes.push(`has ${numbered.length} numbered steps`);
  }

  if (errors.length) {
    for (const e of errors) console.log(`FAIL — ${e}`);
    process.exit(1);
  }
  for (const p of passes) console.log(`PASS — ${p}`);
  process.exit(0);
}

main();
