#!/usr/bin/env python3
"""package_skill.py — validate then zip a skill for distribution.

Runs quick_validate.py first; refuses to package if validation fails. Produces
<skill-name>.zip in the chosen output directory, excluding junk (node_modules,
.DS_Store, .git, __pycache__).

For the 5 Plan skills it also VENDORS shared/plan-contract/ (JSON Schemas +
renderers + runtime node_modules) into the bundle at <bundle-root>/plan-contract/
so the skill's contractLib() resolver finds it when packaged standalone. See
shared/plan-contract/README.md.

Usage:
    python scripts/package_skill.py /path/to/skill [-o OUTPUT_DIR] [--skip-validate]
"""
import sys, os, argparse, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
EXCLUDE_DIRS = {"node_modules", ".git", "__pycache__", ".pytest_cache"}
EXCLUDE_FILES = {".DS_Store"}
# evals/ (queries + fixtures) is validation material, never part of the
# distributed bundle — same rule as the vendored skill-creator packager.
ROOT_EXCLUDE_DIRS = {"evals"}

# The 5 Plan skills resolve the shared Plan contract (JSON Schemas + renderers +
# bundled node_modules) at runtime. In-repo their scripts find it at
# ../../../shared/plan-contract; packaged standalone there is no repo, so the
# contract must be VENDORED into the bundle at <bundle-root>/plan-contract/ —
# the resolver's `../plan-contract` fallback (see scripts/validate-*.mjs). The
# vendored skill-creator packager cannot do this (it strips node_modules and
# packages a single folder), so the step lives here. See
# shared/plan-contract/README.md.
PLAN_SKILLS = {
    "opscale-process", "opscale-dbml", "opscale-bpmn", "opscale-sipoc", "opscale-graph",
}
CONTRACT_DIR = os.path.join(REPO_ROOT, "shared", "plan-contract")
# node_modules is intentionally NOT excluded when vendoring the contract: the
# bundled runtime deps (ajv, @dbml/core, bpmn-moddle, bpmn-auto-layout) must
# travel with it. Only build junk is dropped.
CONTRACT_EXCLUDE_DIRS = {".git", "__pycache__", ".pytest_cache"}


def package(skill_dir, out_dir):
    skill_dir = os.path.normpath(skill_dir)
    name = os.path.basename(skill_dir)
    os.makedirs(out_dir, exist_ok=True)
    zip_path = os.path.join(out_dir, f"{name}.zip")
    count = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(skill_dir):
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS
                       and not (root == skill_dir and d in ROOT_EXCLUDE_DIRS)]
            for fn in files:
                if fn in EXCLUDE_FILES:
                    continue
                full = os.path.join(root, fn)
                arc = os.path.join(name, os.path.relpath(full, skill_dir))
                z.write(full, arc)
                count += 1

        # Vendor the shared Plan contract into Plan-skill bundles so the skill's
        # contractLib() resolver finds it at <bundle-root>/plan-contract/.
        if name in PLAN_SKILLS:
            if not os.path.isdir(CONTRACT_DIR):
                raise FileNotFoundError(
                    f"{name} is a Plan skill but the shared contract is missing: {CONTRACT_DIR}")
            for root, dirs, files in os.walk(CONTRACT_DIR):
                dirs[:] = [d for d in dirs if d not in CONTRACT_EXCLUDE_DIRS]
                for fn in files:
                    if fn in EXCLUDE_FILES:
                        continue
                    full = os.path.join(root, fn)
                    arc = os.path.join(
                        name, "plan-contract", os.path.relpath(full, CONTRACT_DIR))
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
