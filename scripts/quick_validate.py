#!/usr/bin/env python3
"""quick_validate.py — hard-limit validator for an Opscale skill.

Checks the cheap, deterministic rules from the skill checklist so they don't
have to live as prose the model must remember:

  - name: kebab-case, <= 64 chars, no leading/trailing/double hyphen
  - description: present, <= 1024 chars, no angle brackets (< >)
  - compatibility: <= 500 chars (if present)
  - frontmatter: only allowed properties
  - referenced references/ assets/ scripts/ paths that the body points to exist

Usage:
    python scripts/quick_validate.py /path/to/skill [/path/to/another ...]

Exit code 0 if every skill passes, 1 otherwise. Errors fail; warnings don't.
"""
import sys, os, re

ALLOWED = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def parse_frontmatter(text):
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return None, None
    fm = m.group(1)
    body = text[m.end():]
    return fm, body


def get_scalar(fm, key):
    # folded/literal block:  key: >\n  line\n  line   OR  key: value
    m = re.search(rf"^{key}:\s*[>|]\s*\n((?:[ \t]+.*\n?)+)", fm, re.M)
    if m:
        return " ".join(l.strip() for l in m.group(1).splitlines()).strip()
    m = re.search(rf"^{key}:\s*(.+)$", fm, re.M)
    if m:
        return m.group(1).strip().strip('"\'')
    return None


def top_level_keys(fm):
    return re.findall(r"^([A-Za-z][A-Za-z0-9_-]*):", fm, re.M)


def validate(skill_dir):
    errors, warnings = [], []
    path = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(path):
        return [f"no SKILL.md in {skill_dir}"], []
    text = open(path, encoding="utf-8").read()
    fm, body = parse_frontmatter(text)
    if fm is None:
        return ["SKILL.md has no YAML frontmatter (--- ... ---)"], []

    keys = top_level_keys(fm)
    for k in keys:
        if k not in ALLOWED:
            errors.append(f"disallowed frontmatter property: {k}")

    name = get_scalar(fm, "name")
    if not name:
        errors.append("missing name")
    else:
        if len(name) > 64:
            errors.append(f"name >64 chars ({len(name)})")
        if not NAME_RE.match(name):
            errors.append(f"name not clean kebab-case: {name!r}")
        if name != os.path.basename(os.path.normpath(skill_dir)):
            warnings.append(f"name {name!r} != directory {os.path.basename(os.path.normpath(skill_dir))!r}")

    desc = get_scalar(fm, "description")
    if not desc:
        errors.append("missing description")
    else:
        if len(desc) > 1024:
            errors.append(f"description >1024 chars ({len(desc)})")
        if "<" in desc or ">" in desc:
            errors.append("description contains angle brackets (< or >)")

    compat = get_scalar(fm, "compatibility")
    if compat and len(compat) > 500:
        errors.append(f"compatibility >500 chars ({len(compat)})")

    # referenced resource paths in the body must exist
    for rel in set(re.findall(r"`((?:references|assets|scripts|templates)/[^`]+?)`", body)):
        if "*" in rel:
            continue
        if not os.path.exists(os.path.join(skill_dir, rel)):
            errors.append(f"body points to missing resource: {rel}")

    body_lines = body.count("\n") + 1
    if body_lines > 500:
        warnings.append(f"SKILL.md body is {body_lines} lines (>500 tripwire — consider refactoring)")

    return errors, warnings


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    failed = False
    for d in argv:
        errs, warns = validate(d)
        name = os.path.basename(os.path.normpath(d))
        if errs:
            failed = True
            print(f"FAIL  {name}")
            for e in errs:
                print(f"      ✗ {e}")
        else:
            print(f"PASS  {name}")
        for w in warns:
            print(f"      ! {w}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
