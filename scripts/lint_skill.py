#!/usr/bin/env python3
"""lint_skill.py — checklist linter for Opscale SKILL.md files.

Runs the deterministic hard limits from quick_validate.py and adds the soft
checks from the skill best-practices checklist (sections 1-6). Hard-limit
failures exit 1; soft issues print as warnings and only fail when --strict.

Checks added on top of quick_validate:

  §1 frontmatter / triggering
      - description framed around *when* to use (not *how* to execute)
      - "pushy" closure phrase ("use it whenever ...")
      - explicit scope-limit phrase ("Not for ...")

  §2 structure / progressive disclosure
      - exactly one SKILL.md per skill (no SKILL.md inside subdirs)
      - large references (>300 lines) have a table of contents
      - body delegates to scripts/ when scripts/ exists

  §3 writing style
      - imperative form (flags "the user should", "you should probably", ...)
      - MUST density not a wall of rules
      - at least one example / fenced code block

  language
      - skills are authored in English — Spanish prose in frontmatter or body
        is a hard error (proper-noun labels inside **bold** / "quotes" / code
        are allowed since they reference user-domain artifact section names)

Usage:
    python scripts/lint_skill.py /path/to/skill [...]
    python scripts/lint_skill.py --all          # every skill under skills/
    python scripts/lint_skill.py --strict       # warnings become failures
"""
import os
import re
import sys
import glob
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import quick_validate  # noqa: E402


# ---------------------------------------------------------------------------
# §1 — description quality
# ---------------------------------------------------------------------------

PUSHY_PATTERNS = [
    r"use it whenever",
    r"use it any time",
    r"trigger\s*:",
    r"trigger when",
    r"even if (just|loosely|phrased|the user|they)",
    r"even loosely",
]
SCOPE_LIMIT_PATTERNS = [
    r"\bnot for\b",
    r"\bskip\b",
    r"\bdo not use\b",
    r"\bdon't use\b",
]
WHEN_PATTERNS = [
    r"\bwhen\b",
    r"\btrigger\b",
    r"\buse it\b",
    r"\buse this\b",
]


def check_description(desc):
    soft = []
    low = desc.lower()
    if not any(re.search(p, low) for p in WHEN_PATTERNS):
        soft.append("description: no *when-to-use* framing — say WHEN to trigger, not HOW to run")
    if not any(re.search(p, low) for p in PUSHY_PATTERNS):
        soft.append("description: missing pushy closure (e.g. \"use it whenever ...\")")
    if not any(re.search(p, low) for p in SCOPE_LIMIT_PATTERNS):
        soft.append("description: missing scope limit (e.g. \"Not for X — that's Y\")")
    return soft


# ---------------------------------------------------------------------------
# §2 — structure / progressive disclosure
# ---------------------------------------------------------------------------

def check_extra_skill_md(skill_dir):
    soft = []
    for root, _, files in os.walk(skill_dir):
        if root == skill_dir:
            continue
        if "SKILL.md" in files:
            rel = os.path.relpath(os.path.join(root, "SKILL.md"), skill_dir)
            soft.append(f"structure: extra SKILL.md at {rel} — only one SKILL.md per skill (move to references/)")
    return soft


def check_reference_tocs(skill_dir):
    soft = []
    refs_dir = os.path.join(skill_dir, "references")
    if not os.path.isdir(refs_dir):
        return soft
    for name in sorted(os.listdir(refs_dir)):
        path = os.path.join(refs_dir, name)
        if not (os.path.isfile(path) and name.endswith(".md")):
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except OSError:
            continue
        lines = text.splitlines()
        if len(lines) <= 300:
            continue
        head = "\n".join(lines[:60])
        has_toc = bool(re.search(r"(?im)^#{1,3}\s+(table of contents|índice|indice|contenido|contents)\b", head)) \
            or head.count("\n- [") >= 3
        if not has_toc:
            soft.append(f"structure: references/{name} is {len(lines)} lines (>300) — add a TOC in the first 60 lines")
    return soft


def check_scripts_delegation(skill_dir, body):
    soft = []
    scripts_dir = os.path.join(skill_dir, "scripts")
    if not os.path.isdir(scripts_dir):
        return soft
    scripts = [
        f for f in os.listdir(scripts_dir)
        if os.path.isfile(os.path.join(scripts_dir, f)) and not f.startswith(".")
    ]
    if not scripts:
        return soft
    body_low = body.lower()
    unused = [s for s in scripts if s.lower() not in body_low]
    if unused:
        soft.append(f"structure: scripts/ present but body never points to: {', '.join(unused)}")
    return soft


# ---------------------------------------------------------------------------
# §3 — writing style
# ---------------------------------------------------------------------------

NON_IMPERATIVE_PATTERNS = [
    r"\bthe user should\b",
    r"\bthe user must\b",
    r"\byou should probably\b",
]


def check_imperative(body):
    soft = []
    low = body.lower()
    hits = []
    for pat in NON_IMPERATIVE_PATTERNS:
        for m in re.finditer(pat, low):
            line = low.count("\n", 0, m.start()) + 1
            hits.append((line, m.group(0)))
    if hits:
        shown = ", ".join(f"L{ln}:'{txt}'" for ln, txt in hits[:3])
        more = f" (+{len(hits) - 3} more)" if len(hits) > 3 else ""
        soft.append(f"style: non-imperative phrasing — {shown}{more}")
    return soft


# ---------------------------------------------------------------------------
# language — skills must be authored in English
# ---------------------------------------------------------------------------

# Spanish-only markers: characters that are extremely unlikely in English prose
# plus a small list of common Spanish words we'd never write in English.
SPANISH_CHAR_RE = re.compile(r"[ñÑ¿¡]")
SPANISH_WORD_RE = re.compile(
    r"\b("
    r"para|pero|porque|cuando|cómo|como|donde|dónde|"
    r"siempre|nunca|también|tambien|aunque|"
    r"debe|debes|deber[áa]|deber[íi]a|tiene que|"
    r"usuario|usuaria|"
    r"úsala|úsalo|usala|usalo|"
    r"este|esta|estos|estas|"
    r"acción|accion|acciones|"
    r"módulo|modulo|módulos|modulos|"
    r"flujo|flujos|paso|pasos|proyecto|proyectos"
    r")\b",
    re.IGNORECASE,
)


def _strip_code(text):
    # Drop content where Spanish tokens are legitimate references (not prose):
    #   - fenced and inline code (PHP/JSON identifiers, file paths)
    #   - markdown emphasis (**...**, *...*) — used for proper-noun labels like
    #     **Flujo relacionado** that name sections of user-domain artifacts
    #   - quoted strings ("...") — same reason
    # We preserve newlines so line numbers reported back stay correct.
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    text = re.sub(r"```.*?```", blank, text, flags=re.S)
    text = re.sub(r"`[^`]*`", blank, text)
    text = re.sub(r"\*\*[^*\n]+\*\*", blank, text)
    text = re.sub(r"(?<!\*)\*[^*\n]+\*(?!\*)", blank, text)
    text = re.sub(r"\"[^\"\n]+\"", blank, text)
    return text


def _spanish_hits(text):
    text = _strip_code(text)
    hits = []
    for m in SPANISH_CHAR_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        hits.append((line, m.group(0)))
    for m in SPANISH_WORD_RE.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        hits.append((line, m.group(0)))
    return hits


def check_english_only(fm, body):
    """Hard error: skills must be authored in English."""
    errors = []
    fm_hits = _spanish_hits(fm or "")
    if fm_hits:
        shown = ", ".join(f"'{t}'" for _, t in fm_hits[:3])
        more = f" (+{len(fm_hits) - 3} more)" if len(fm_hits) > 3 else ""
        errors.append(f"language: frontmatter contains non-English content — {shown}{more}")
    body_hits = _spanish_hits(body or "")
    if body_hits:
        shown = ", ".join(f"L{ln}:'{t}'" for ln, t in body_hits[:3])
        more = f" (+{len(body_hits) - 3} more)" if len(body_hits) > 3 else ""
        errors.append(f"language: body contains non-English content — {shown}{more}")
    return errors


def check_must_density(body):
    soft = []
    body_no_code = re.sub(r"```.*?```", "", body, flags=re.S)
    lines = body_no_code.count("\n") + 1
    must = len(re.findall(r"\b(MUST|SHOULD|REQUIRED|MANDATORY)\b", body_no_code))
    if lines and must / max(lines / 100, 1) > 8:
        soft.append(f"style: {must} MUST/SHOULD across {lines} lines — wall of rules, prefer principles + why")
    return soft


def check_examples(body):
    soft = []
    body_no_fm = body
    has_fenced = "```" in body_no_fm
    has_example_heading = bool(re.search(r"(?im)^#{1,4}\s+(example|ejemplo|examples|ejemplos)\b", body_no_fm))
    if not (has_fenced or has_example_heading):
        soft.append("style: no examples or fenced code blocks — add at least one Input/Output anchor")
    return soft


# ---------------------------------------------------------------------------
# orchestrator
# ---------------------------------------------------------------------------

def lint(skill_dir):
    hard_errs, hard_warns = quick_validate.validate(skill_dir)
    soft = []

    path = os.path.join(skill_dir, "SKILL.md")
    if not os.path.isfile(path):
        return hard_errs, hard_warns, soft
    text = open(path, encoding="utf-8").read()
    fm, body = quick_validate.parse_frontmatter(text)
    if fm is None:
        return hard_errs, hard_warns, soft

    # English-only is a hard requirement — surfaces as errors, blocks the commit.
    hard_errs.extend(check_english_only(fm, body))

    desc = quick_validate.get_scalar(fm, "description") or ""
    if desc:
        soft.extend(check_description(desc))

    soft.extend(check_extra_skill_md(skill_dir))
    soft.extend(check_reference_tocs(skill_dir))
    soft.extend(check_scripts_delegation(skill_dir, body))
    soft.extend(check_imperative(body))
    soft.extend(check_must_density(body))
    soft.extend(check_examples(body))

    return hard_errs, hard_warns, soft


def discover_all():
    repo_root = os.path.dirname(HERE)
    return sorted(
        d for d in glob.glob(os.path.join(repo_root, "skills", "*"))
        if os.path.isdir(d) and os.path.isfile(os.path.join(d, "SKILL.md"))
    )


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skills", nargs="*", help="skill directories to lint")
    ap.add_argument("--all", action="store_true", help="lint every skill under skills/")
    ap.add_argument("--strict", action="store_true", help="treat soft warnings as failures")
    args = ap.parse_args(argv)

    targets = discover_all() if args.all else args.skills
    if not targets:
        ap.print_help()
        return 2

    hard_failed = False
    soft_failed = False
    for d in targets:
        name = os.path.basename(os.path.normpath(d))
        hard_errs, hard_warns, soft = lint(d)
        status = "FAIL" if hard_errs else ("WARN" if (hard_warns or soft) else "PASS")
        print(f"{status:5} {name}")
        for e in hard_errs:
            hard_failed = True
            print(f"      ✗ {e}")
        for w in hard_warns:
            print(f"      ! {w}")
        for s in soft:
            soft_failed = True
            print(f"      · {s}")

    if hard_failed:
        return 1
    if args.strict and soft_failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
