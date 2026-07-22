#!/usr/bin/env python3
"""per_file.py — generic grader: run a command over every file matching globs.

Usage:
    python3 tools/graders/per_file.py <output_dir> --cmd "php -l" \
        --glob "src/**/*.php" --glob "database/migrations/*.php" [--min N]

The command receives each file path as its last argument and must exit 0.
--min (default 1) fails the grader when fewer than N files matched — a
command that ran on nothing proves nothing.
"""
import argparse
import fnmatch
import glob
import os
import shlex
import subprocess
import sys


def collect_files(output_dir, globs, manifest):
    """Manifest mode: assert over what the agent generated, filtered by globs.
    Glob mode: fixed patterns (only for asserting a promised layout)."""
    if manifest:
        with open(manifest, encoding="utf-8") as fh:
            rels = [l.strip() for l in fh if l.strip()]
        if globs:
            rels = [r for r in rels if any(fnmatch.fnmatch(r, g) for g in globs)]
        files = [os.path.join(output_dir, r) for r in rels]
    else:
        files = []
        for pattern in globs:
            files += glob.glob(os.path.join(output_dir, pattern), recursive=True)
    return sorted({f for f in files if os.path.isfile(f)})


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("output_dir")
    ap.add_argument("--cmd", required=True)
    ap.add_argument("--glob", action="append", default=[], dest="globs")
    ap.add_argument("--from-manifest", default=None,
                    help="take files from this list (one rel path per line); "
                         "--glob then act as fnmatch filters over it")
    ap.add_argument("--min", type=int, default=1)
    args = ap.parse_args(argv)

    files = collect_files(args.output_dir, args.globs, args.from_manifest)
    if len(files) < args.min:
        print(f"FAIL: only {len(files)} file(s) matched (min {args.min})")
        return 1

    failures = 0
    for path in files:
        proc = subprocess.run(shlex.split(args.cmd) + [path],
                              capture_output=True, text=True, timeout=60)
        rel = os.path.relpath(path, args.output_dir)
        if proc.returncode != 0:
            failures += 1
            tail = (proc.stderr.strip() or proc.stdout.strip()).splitlines()
            print(f"FAIL {rel}: {tail[-1] if tail else proc.returncode}")
    print(f"{len(files) - failures}/{len(files)} files pass `{args.cmd}`")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
