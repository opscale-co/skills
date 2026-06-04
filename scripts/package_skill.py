#!/usr/bin/env python3
"""package_skill.py — validate then zip a skill for distribution.

Runs quick_validate.py first; refuses to package if validation fails. Produces
<skill-name>.zip in the chosen output directory, excluding junk (node_modules,
.DS_Store, .git, __pycache__).

Usage:
    python scripts/package_skill.py /path/to/skill [-o OUTPUT_DIR] [--skip-validate]
"""
import sys, os, argparse, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
EXCLUDE_DIRS = {"node_modules", ".git", "__pycache__", ".pytest_cache"}
EXCLUDE_FILES = {".DS_Store"}


def package(skill_dir, out_dir):
    skill_dir = os.path.normpath(skill_dir)
    name = os.path.basename(skill_dir)
    os.makedirs(out_dir, exist_ok=True)
    zip_path = os.path.join(out_dir, f"{name}.zip")
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(skill_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for fn in files:
                if fn in EXCLUDE_FILES:
                    continue
                full = os.path.join(root, fn)
                arc = os.path.join(name, os.path.relpath(full, skill_dir))
                z.write(full, arc)
                count += 1
    return zip_path, count


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("skill_dir")
    ap.add_argument("-o", "--output", default=os.getcwd())
    ap.add_argument("--skip-validate", action="store_true")
    args = ap.parse_args(argv)

    if not args.skip_validate:
        sys.path.insert(0, HERE)
        import quick_validate
        errs, _ = quick_validate.validate(args.skill_dir)
        if errs:
            print(f"Refusing to package — {len(errs)} validation error(s):")
            for e in errs:
                print(f"  ✗ {e}")
            return 1

    zip_path, count = package(args.skill_dir, args.output)
    print(f"Packaged {count} files -> {zip_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
