#!/usr/bin/env python3
"""pipeline_config.py — loader for skills.config.yml and skill discovery.

The config file is the ONLY coupling point between the generic pipeline in
tools/ and any concrete stack (language, framework, toolchain). Nothing in
tools/ may special-case a language; if you need a language-specific behavior,
express it here (compilers map, per-skill verify commands, graders).

Uses PyYAML when available; otherwise falls back to a strict subset parser
that covers everything skills.config.yml needs: nested mappings, lists of
scalars, block lists of mappings, inline flow ([a, b] / {k: v}), quoted
strings, ints, floats, booleans and # comments. Anything outside that subset
raises instead of guessing.
"""
from __future__ import annotations

import os
import re
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CONFIG_PATH = os.path.join(REPO_ROOT, "skills.config.yml")
SKILLS_DIR = os.path.join(REPO_ROOT, "skills")


# ---------------------------------------------------------------------------
# Minimal YAML subset parser (fallback when PyYAML is absent)
# ---------------------------------------------------------------------------

class YamlSubsetError(ValueError):
    pass


def _strip_comment(line: str) -> str:
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _split_flow(s: str) -> list[str]:
    """Split a flow body on top-level commas, respecting quotes/brackets."""
    parts, depth, quote, cur = [], 0, None, []
    for ch in s:
        if quote:
            cur.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            cur.append(ch)
        elif ch in "[{":
            depth += 1
            cur.append(ch)
        elif ch in "]}":
            depth -= 1
            cur.append(ch)
        elif ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if cur:
        parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def _parse_scalar(s: str):
    s = s.strip()
    if s == "":
        return None
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    if s.startswith("["):
        if not s.endswith("]"):
            raise YamlSubsetError(f"unterminated inline list: {s!r}")
        return [_parse_scalar(p) for p in _split_flow(s[1:-1])]
    if s.startswith("{"):
        if not s.endswith("}"):
            raise YamlSubsetError(f"unterminated inline mapping: {s!r}")
        out = {}
        for part in _split_flow(s[1:-1]):
            key, sep, val = part.partition(":")
            if not sep:
                raise YamlSubsetError(f"bad inline mapping entry: {part!r}")
            out[key.strip().strip("\"'")] = _parse_scalar(val)
        return out
    low = s.lower()
    if low in ("true", "yes"):
        return True
    if low in ("false", "no"):
        return False
    if low in ("null", "~"):
        return None
    for cast in (int, float):
        try:
            return cast(s)
        except ValueError:
            pass
    return s


def _parse_block(lines: list[tuple[int, str]], start: int, indent: int):
    """Parse the block of lines at exactly `indent`; returns (value, next_index)."""
    if start >= len(lines) or lines[start][0] < indent:
        return None, start
    is_list = lines[start][1].startswith("- ") or lines[start][1] == "-"
    return (_parse_list if is_list else _parse_map)(lines, start, indent)


def _parse_map(lines, start, indent):
    out = {}
    i = start
    while i < len(lines):
        ind, content = lines[i]
        if ind < indent:
            break
        if ind > indent:
            raise YamlSubsetError(f"unexpected indent at line: {content!r}")
        m = re.match(r"^([^:]+):(.*)$", content)
        if not m:
            raise YamlSubsetError(f"expected 'key: value', got: {content!r}")
        key = m.group(1).strip().strip("\"'")
        rest = m.group(2).strip()
        if rest in ("|", ">", "|-", ">-", "|+", ">+"):
            text, i = _parse_block_scalar(lines, i + 1, indent, folded=rest[0] == ">")
            out[key] = text
        elif rest:
            out[key] = _parse_scalar(rest)
            i += 1
        else:
            child, i = _parse_block(lines, i + 1, _next_indent(lines, i + 1, indent))
            out[key] = child if child is not None else {}
    return out, i


def _parse_block_scalar(lines, i, parent_indent, folded):
    """Consume the more-indented lines of a `|`/`>` block scalar.

    Works on the pre-stripped line list, so blank lines and exact indentation
    inside the scalar are not preserved — good enough for frontmatter prose,
    documented as a subset limitation.
    """
    parts = []
    while i < len(lines) and lines[i][0] > parent_indent:
        parts.append(lines[i][1])
        i += 1
    return (" " if folded else "\n").join(parts), i


def _parse_list(lines, start, indent):
    out = []
    i = start
    while i < len(lines):
        ind, content = lines[i]
        if ind < indent:
            break
        if ind > indent or not (content.startswith("- ") or content == "-"):
            raise YamlSubsetError(f"expected list item, got: {content!r}")
        rest = content[2:].strip() if content.startswith("- ") else ""
        item_indent = ind + 2
        is_map_item = bool(
            rest
            and not rest.startswith(("[", "{", "\"", "'"))
            and re.match(r"^[^:]+:(\s.*)?$", rest)
        )
        if is_map_item:
            # `- key: value` opens a mapping item; fold this line into the child block
            sub = [(item_indent, rest)]
            i += 1
            while i < len(lines) and lines[i][0] >= item_indent:
                sub.append(lines[i])
                i += 1
            val, _ = _parse_map(sub, 0, item_indent)
            out.append(val)
        elif rest:
            out.append(_parse_scalar(rest))
            i += 1
        else:
            child, i = _parse_block(lines, i + 1, _next_indent(lines, i + 1, indent))
            out.append(child)
    return out, i


def _next_indent(lines, i, parent_indent):
    if i < len(lines) and lines[i][0] > parent_indent:
        return lines[i][0]
    return parent_indent + 1  # empty block; _parse_block returns None


def parse_yaml_subset(text: str):
    lines = []
    for raw in text.splitlines():
        line = _strip_comment(raw).rstrip()
        if not line.strip() or line.strip() == "---":
            continue
        if "\t" in line[: len(line) - len(line.lstrip())]:
            raise YamlSubsetError("tabs are not allowed for indentation")
        lines.append((len(line) - len(line.lstrip()), line.strip()))
    if not lines:
        return {}
    value, consumed = _parse_block(lines, 0, lines[0][0])
    if consumed != len(lines):
        raise YamlSubsetError(f"trailing content not parsed: {lines[consumed][1]!r}")
    return value


def parse_yaml(text: str):
    try:
        import yaml  # type: ignore
        return yaml.safe_load(text)
    except ImportError:
        return parse_yaml_subset(text)


# ---------------------------------------------------------------------------
# Config access
# ---------------------------------------------------------------------------

DEFAULTS = {
    "runs": 3,
    "threshold": 0.8,
    "max_iter": 5,
    "token_budget": 2_000_000,
}


def load_config(path: str | None = None) -> dict:
    path = path or DEFAULT_CONFIG_PATH
    if not os.path.isfile(path):
        return {"defaults": dict(DEFAULTS), "compilers": {}, "skills": {}}
    data = parse_yaml(open(path, encoding="utf-8").read()) or {}
    defaults = dict(DEFAULTS)
    defaults.update(data.get("defaults") or {})
    return {
        "defaults": defaults,
        "compilers": data.get("compilers") or {},
        "skills": data.get("skills") or {},
        "lint": data.get("lint") or {},
        "budgets": data.get("budgets") or {},
    }


def skill_settings(config: dict, skill_name: str) -> dict:
    """Effective settings for one skill: defaults overlaid with its entry."""
    merged = dict(config["defaults"])
    merged.update(config["skills"].get(skill_name) or {})
    return merged


def discover_skills(skills_dir: str | None = None) -> list[str]:
    """Every directory under skills/ that contains a SKILL.md."""
    skills_dir = skills_dir or SKILLS_DIR
    if not os.path.isdir(skills_dir):
        return []
    return sorted(
        os.path.join(skills_dir, d)
        for d in os.listdir(skills_dir)
        if os.path.isfile(os.path.join(skills_dir, d, "SKILL.md"))
    )


if __name__ == "__main__":
    import json
    cfg = load_config(sys.argv[1] if len(sys.argv) > 1 else None)
    print(json.dumps(cfg, indent=2))
    print("\nDiscovered skills:", file=sys.stderr)
    for s in discover_skills():
        print(f"  {os.path.basename(s)}", file=sys.stderr)
