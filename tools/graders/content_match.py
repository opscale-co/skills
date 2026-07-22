#!/usr/bin/env python3
"""content_match.py — generic grader: every matched file contains a regex.

Usage:
    python3 tools/graders/content_match.py <output_dir> \
        --glob "src/Models/*.php" --pattern "protected \\$table = 'billing_" \
        [--min-files N] [--invert]

Exit 0 when every matched file contains the pattern (or none do, with
--invert). --min-files (default 1) guards against vacuous passes.
"""
import argparse
import glob
import os
import re
import sys


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("output_dir")
    ap.add_argument("--glob", action="append", default=[], dest="globs")
    ap.add_argument("--from-manifest", default=None,
                    help="take files from this list; --glob filter it")
    ap.add_argument("--pattern", required=True)
    ap.add_argument("--min-files", type=int, default=1)
    ap.add_argument("--invert", action="store_true",
                    help="pass when NO matched file contains the pattern")
    args = ap.parse_args(argv)

    rx = re.compile(args.pattern)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from per_file import collect_files
    files = collect_files(args.output_dir, args.globs, args.from_manifest)
    if len(files) < args.min_files:
        print(f"FAIL: only {len(files)} file(s) matched (min {args.min_files})")
        return 1

    offenders = []
    for path in files:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            has = bool(rx.search(fh.read()))
        if has == args.invert:
            offenders.append(os.path.relpath(path, args.output_dir))

    verb = "contains" if args.invert else "lacks"
    for rel in offenders:
        print(f"FAIL {rel}: {verb} /{args.pattern}/")
    print(f"{len(files) - len(offenders)}/{len(files)} files ok for /{args.pattern}/")
    return 1 if offenders else 0


if __name__ == "__main__":
    sys.exit(main())
