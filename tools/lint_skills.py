#!/usr/bin/env python3
"""lint_skills.py — layer-1 static linter for every skill under skills/.

Deterministic, no LLM, runs in seconds. Discovers skills by walking skills/
(any directory with a SKILL.md). Language-agnostic by design: syntax checking
for scripts/ is dispatched through the `compilers` map in skills.config.yml,
never hardcoded here.

Errors (exit code 1):
  - frontmatter: valid YAML with `name` and `description`
  - `name` kebab-case and equal to the directory name
  - `description` between 50 and 500 characters
  - every bundle path referenced in SKILL.md exists
  - scripts/ files compile (via the config `compilers` map)
  - no embedded secrets (API keys, tokens, passwords, private keys)

Warnings (never break the build):
  - SKILL.md over 500 lines (move content to references/)
  - more than 5 uppercase ALWAYS/NEVER/MUST (rules instead of reasons)
  - references/*.md over 300 lines without a table of contents
  - script extension with no registered compiler
  - possible eval overfitting: identifiers shared by evals/ and SKILL.md

Usage:
    python3 tools/lint_skills.py                 # all skills
    python3 tools/lint_skills.py skills/foo ...  # specific skills
    python3 tools/lint_skills.py --json          # machine-readable, for CI
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pipeline_config import (  # noqa: E402
    YamlSubsetError,
    discover_skills,
    load_config,
    parse_yaml,
)

SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".pytest_cache", "vendor"}
TEXT_EXTS = {
    ".md", ".txt", ".json", ".yml", ".yaml", ".py", ".sh", ".php", ".js",
    ".mjs", ".cjs", ".ts", ".tmpl", ".xml", ".sql", ".env", ".ini", ".toml",
}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
DESCRIPTION_MIN, DESCRIPTION_MAX = 50, 500
SKILL_MD_MAX_LINES = 500
REFERENCE_MAX_LINES = 300
IMPERATIVE_MAX = 5


def _read(path, errors="strict"):
    with open(path, encoding="utf-8", errors=errors) as fh:
        return fh.read()


def finding(level, check, message, file=None, line=None):
    return {"level": level, "check": check, "message": message,
            "file": file, "line": line}


# ---------------------------------------------------------------------------
# Frontmatter
# ---------------------------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.S)


def parse_frontmatter(text):
    """Returns (frontmatter_dict | None, body, error_message | None)."""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return None, text, "no YAML frontmatter block (--- ... ---) at top of SKILL.md"
    try:
        fm = parse_yaml(m.group(1))
    except (YamlSubsetError, Exception) as e:  # PyYAML errors too
        return None, text[m.end():], f"frontmatter is not valid YAML: {e}"
    if not isinstance(fm, dict):
        return None, text[m.end():], "frontmatter must be a YAML mapping"
    return fm, text[m.end():], None


def check_frontmatter(skill_dir, fm, fm_error, description_max=DESCRIPTION_MAX):
    out = []
    if fm_error:
        out.append(finding("error", "frontmatter", fm_error, "SKILL.md", 1))
        return out
    name = fm.get("name")
    desc = fm.get("description")
    if not isinstance(name, str) or not name.strip():
        out.append(finding("error", "frontmatter", "missing `name` in frontmatter", "SKILL.md", 1))
    else:
        name = name.strip()
        if not NAME_RE.match(name):
            out.append(finding("error", "name", f"name '{name}' is not kebab-case", "SKILL.md", 1))
        dirname = os.path.basename(os.path.normpath(skill_dir))
        if name != dirname:
            out.append(finding("error", "name",
                               f"name '{name}' != directory name '{dirname}'", "SKILL.md", 1))
    if not isinstance(desc, str) or not desc.strip():
        out.append(finding("error", "frontmatter", "missing `description` in frontmatter", "SKILL.md", 1))
    else:
        n = len(desc.strip())
        if not (DESCRIPTION_MIN <= n <= description_max):
            out.append(finding("error", "description",
                               f"description is {n} chars; must be {DESCRIPTION_MIN}-{description_max}",
                               "SKILL.md", 1))
    return out


# ---------------------------------------------------------------------------
# Referenced paths exist
# ---------------------------------------------------------------------------

PATH_REF_RE = re.compile(
    r"(?:[A-Za-z0-9_.{}<>*\-]+/)*(?:scripts|references|assets|templates|evals)/[A-Za-z0-9_.{}<>*\-/]+"
)


def check_referenced_paths(skill_dir, skill_md_text, repo_root=None):
    from pipeline_config import REPO_ROOT
    repo_root = repo_root or REPO_ROOT
    out = []
    seen = set()
    for m in PATH_REF_RE.finditer(skill_md_text):
        ref = m.group(0).rstrip(".,;:)]}\"'")
        if ref in seen or any(c in ref for c in "{<*"):
            continue  # placeholder or glob, not a literal path
        seen.add(ref)
        line = skill_md_text.count("\n", 0, m.start()) + 1
        if os.path.exists(os.path.join(skill_dir, ref)):
            continue
        if os.path.exists(os.path.join(repo_root, ref)):
            # Resolves from the monorepo root but not from the bundle: works
            # in-repo, breaks the moment the skill is packaged standalone.
            out.append(finding("warning", "cross-bundle-path",
                               f"SKILL.md references '{ref}' — outside this bundle "
                               "(resolves in the monorepo, breaks standalone packaging)",
                               "SKILL.md", line))
        else:
            out.append(finding("error", "missing-path",
                               f"SKILL.md references '{ref}' but it does not exist in the bundle",
                               "SKILL.md", line))
    return out


# ---------------------------------------------------------------------------
# Scripts compile (dispatched via config `compilers`)
# ---------------------------------------------------------------------------

def iter_bundle_files(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if not fn.startswith("."):
                yield os.path.join(dirpath, fn)


def check_scripts_compile(skill_dir, compilers):
    out = []
    scripts_dir = os.path.join(skill_dir, "scripts")
    if not os.path.isdir(scripts_dir):
        return out
    warned_exts = set()
    missing_bins = set()
    for path in sorted(iter_bundle_files(scripts_dir)):
        rel = os.path.relpath(path, skill_dir)
        ext = os.path.splitext(path)[1].lower()
        cmd = compilers.get(ext)
        if not cmd:
            if ext and ext not in warned_exts:
                warned_exts.add(ext)
                out.append(finding("warning", "compile",
                                   f"no compiler registered for '{ext}' (add it to skills.config.yml compilers)",
                                   rel))
            continue
        argv = shlex.split(cmd) + [path]
        if argv[0] in missing_bins:
            continue
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=60)
        except FileNotFoundError:
            missing_bins.add(argv[0])
            out.append(finding("warning", "compile",
                               f"compiler '{argv[0]}' not found on this host; skipping '{ext}' files"))
            continue
        except subprocess.TimeoutExpired:
            out.append(finding("error", "compile", f"compiler timed out on {rel}", rel))
            continue
        if proc.returncode != 0:
            detail = (proc.stderr.strip() or proc.stdout.strip()).splitlines()
            detail = detail[-1] if detail else f"exit {proc.returncode}"
            out.append(finding("error", "compile", f"does not compile: {detail}", rel))
    return out


# ---------------------------------------------------------------------------
# Secrets
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("github-token", re.compile(r"\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9][A-Za-z0-9-]{10,}\b")),
    ("api-key", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}\b")),
    ("credential-assignment",
     re.compile(r"(?i)\b(api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['\"]([^'\"\s]{12,})['\"]")),
]
PLACEHOLDER_RE = re.compile(
    r"(?i)xxx|\.\.\.|<|\{|\$|your|example|placeholder|dummy|changeme|redacted"
    r"|\\\\|::|->"  # class paths / code references, not credential values
)


def check_secrets(skill_dir):
    out = []
    for path in sorted(iter_bundle_files(skill_dir)):
        if os.path.splitext(path)[1].lower() not in TEXT_EXTS:
            continue
        rel = os.path.relpath(path, skill_dir)
        try:
            text = _read(path, errors="ignore")
        except OSError:
            continue
        for label, pattern in SECRET_PATTERNS:
            for m in pattern.finditer(text):
                value = m.group(2) if label == "credential-assignment" and m.lastindex else m.group(0)
                if label == "credential-assignment" and PLACEHOLDER_RE.search(value):
                    continue
                line = text.count("\n", 0, m.start()) + 1
                out.append(finding("error", "secret",
                                   f"possible embedded secret ({label})", rel, line))
    return out


# ---------------------------------------------------------------------------
# Warnings: size, imperatives, reference TOCs
# ---------------------------------------------------------------------------

def check_skill_md_size(skill_md_text):
    lines = skill_md_text.count("\n") + 1
    if lines > SKILL_MD_MAX_LINES:
        return [finding("warning", "size",
                        f"SKILL.md is {lines} lines (>{SKILL_MD_MAX_LINES}) — move detail to references/",
                        "SKILL.md")]
    return []


def check_imperative_density(body):
    body_no_code = re.sub(r"```.*?```", "", body, flags=re.S)
    hits = re.findall(r"\b(?:ALWAYS|NEVER|MUST)\b", body_no_code)
    if len(hits) > IMPERATIVE_MAX:
        return [finding("warning", "imperatives",
                        f"{len(hits)} uppercase ALWAYS/NEVER/MUST (>{IMPERATIVE_MAX}) — "
                        "explain the why instead of stacking rigid rules", "SKILL.md")]
    return []


def check_reference_tocs(skill_dir):
    out = []
    refs_dir = os.path.join(skill_dir, "references")
    if not os.path.isdir(refs_dir):
        return out
    for path in sorted(iter_bundle_files(refs_dir)):
        if not path.endswith(".md"):
            continue
        try:
            text = _read(path)
        except OSError:
            continue
        lines = text.splitlines()
        if len(lines) <= REFERENCE_MAX_LINES:
            continue
        head = "\n".join(lines[:60])
        has_toc = bool(re.search(r"(?im)^#{1,3}\s+(table of contents|contents)\b", head)) \
            or head.count("\n- [") >= 3
        if not has_toc:
            rel = os.path.relpath(path, skill_dir)
            out.append(finding("warning", "reference-toc",
                               f"{rel} is {len(lines)} lines (>{REFERENCE_MAX_LINES}) without a TOC",
                               rel))
    return out


# ---------------------------------------------------------------------------
# Overfitting: identifiers shared by evals/ and SKILL.md
# ---------------------------------------------------------------------------

IDENT_RE = re.compile(
    r"\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b"      # CamelCase
    r"|\b[a-z][a-z0-9]*_[a-z0-9_]{2,}\b"          # snake_case
    r"|\b[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]{3,}\b"   # path-like
)
# Vocabulary that legitimately appears on both sides of the eval boundary.
IDENT_STOPLIST = {
    "skill_name", "should_trigger", "output_dir", "expected_output",
    "evals/trigger.json", "evals/functional.json", "evals/fixtures",
    "skill.md", "readme.md",
}
OVERFIT_REPORT_CAP = 10


def _ident_stoplist_for(skill_dir):
    stop = {s.lower() for s in IDENT_STOPLIST}
    name = os.path.basename(os.path.normpath(skill_dir))
    stop.add(name.lower())
    stop.update(part.lower() for part in name.split("-"))
    return stop


def check_overfitting(skill_dir, skill_md_text):
    evals_dir = os.path.join(skill_dir, "evals")
    if not os.path.isdir(evals_dir):
        return []
    stop = _ident_stoplist_for(skill_dir)
    # identifier -> first (file, line) seen in evals/
    candidates = {}
    for path in sorted(iter_bundle_files(evals_dir)):
        if os.path.splitext(path)[1].lower() not in TEXT_EXTS:
            continue
        rel = os.path.relpath(path, skill_dir)
        try:
            text = _read(path, errors="ignore")
        except OSError:
            continue
        for m in IDENT_RE.finditer(text):
            token = m.group(0)
            if token.lower() in stop or token.lower().startswith(("evals/", "fixtures/")):
                continue
            candidates.setdefault(token, (rel, text.count("\n", 0, m.start()) + 1))

    out = []
    for token, (eval_file, eval_line) in sorted(candidates.items()):
        m = re.search(re.escape(token), skill_md_text)
        if not m:
            continue
        md_line = skill_md_text.count("\n", 0, m.start()) + 1
        out.append(finding("warning", "overfit",
                           f"'{token}' appears in {eval_file}:{eval_line} and SKILL.md:{md_line} — "
                           "the skill may be tuned to its own eval",
                           eval_file, eval_line))
        if len(out) >= OVERFIT_REPORT_CAP:
            out.append(finding("warning", "overfit",
                               f"more shared identifiers omitted (cap {OVERFIT_REPORT_CAP})"))
            break
    return out


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def lint_skill(skill_dir, compilers, lint_policy=None):
    lint_policy = lint_policy or {}
    skill_md = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(skill_md):
        return [finding("error", "structure", "no SKILL.md in skill directory")]
    text = _read(skill_md)
    fm, body, fm_error = parse_frontmatter(text)

    findings = []
    findings += check_frontmatter(skill_dir, fm or {}, fm_error,
                              lint_policy.get("description_max", DESCRIPTION_MAX))
    findings += check_referenced_paths(skill_dir, text)
    findings += check_scripts_compile(skill_dir, compilers)
    findings += check_secrets(skill_dir)
    findings += check_skill_md_size(text)
    findings += check_imperative_density(body)
    findings += check_reference_tocs(skill_dir)
    findings += check_overfitting(skill_dir, text)
    return findings


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skills", nargs="*", help="skill directories (default: discover all under skills/)")
    ap.add_argument("--config", default=None, help="path to skills.config.yml")
    ap.add_argument("--json", action="store_true", help="machine-readable output for CI")
    args = ap.parse_args(argv)

    config = load_config(args.config)
    targets = args.skills or discover_skills()
    if not targets:
        print("no skills found", file=sys.stderr)
        return 2

    report = {}
    for skill_dir in targets:
        name = os.path.basename(os.path.normpath(skill_dir))
        report[name] = lint_skill(skill_dir, config["compilers"], config.get("lint"))

    errors = sum(1 for fs in report.values() for f in fs if f["level"] == "error")
    warnings = sum(1 for fs in report.values() for f in fs if f["level"] == "warning")

    if args.json:
        print(json.dumps({
            "skills": report,
            "summary": {"skills": len(report), "errors": errors, "warnings": warnings},
        }, indent=2))
    else:
        for name, fs in report.items():
            errs = [f for f in fs if f["level"] == "error"]
            warns = [f for f in fs if f["level"] == "warning"]
            status = "FAIL" if errs else ("WARN" if warns else "PASS")
            print(f"{status:5} {name}")
            for f in errs + warns:
                mark = "✗" if f["level"] == "error" else "·"
                loc = f":{f['line']}" if f.get("line") else ""
                src = f" [{f['file']}{loc}]" if f.get("file") else ""
                print(f"      {mark} {f['check']}: {f['message']}{src}")
        print(f"\n{len(report)} skills — {errors} errors, {warnings} warnings")

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
