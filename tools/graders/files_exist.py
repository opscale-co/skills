#!/usr/bin/env python3
"""files_exist.py — generic grader: assert glob patterns match in the output dir.

With --none the assertion inverts: every glob must match NOTHING (use to
assert the agent did not generate something).

Usage:
    python3 tools/graders/files_exist.py <output_dir> <glob> [<glob> ...]

Exit 0 when every glob matches at least one file; prints what matched/missed.
Language-agnostic on purpose: WHAT must exist is an argument from the eval,
never knowledge baked into the grader.
"""
import glob
import os
import sys


def main(argv):
    none_mode = "--none" in argv
    argv = [a for a in argv if a != "--none"]
    if len(argv) < 2:
        print("usage: files_exist.py <output_dir> [--none] <glob> [...]")
        return 2
    output_dir = argv[0]
    failed = []
    for pattern in argv[1:]:
        hits = glob.glob(os.path.join(output_dir, pattern), recursive=True)
        if none_mode:
            if hits:
                failed.append(pattern)
                print(f"UNEXPECTED: {pattern} -> {os.path.relpath(hits[0], output_dir)}")
            else:
                print(f"ok: {pattern} matches nothing (as required)")
        elif hits:
            print(f"ok: {pattern} -> {len(hits)} file(s), e.g. {os.path.relpath(hits[0], output_dir)}")
        else:
            failed.append(pattern)
            print(f"MISSING: {pattern}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
