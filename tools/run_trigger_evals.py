#!/usr/bin/env python3
"""run_trigger_evals.py — layer-2 entry point: trigger evals for one skill.

Thin config-aware wrapper over the vendored skill-creator run_eval.py (the
eval engine is reused, not reimplemented): reads runs/threshold from
skills.config.yml, invokes the vendored script on <skill>/evals/trigger.json,
and turns the result into a pass/fail exit code for CI.

Usage:
    python3 tools/run_trigger_evals.py skills/opscale-dbml \
        [--runs N] [--threshold X] [--model M] [--num-workers N] [--json OUT]
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pipeline_config import REPO_ROOT, load_config, skill_settings  # noqa: E402

VENDOR = os.path.join(HERE, "vendor", "skill-creator")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skill")
    ap.add_argument("--runs", type=int, default=None, help="runs per query (default: config)")
    ap.add_argument("--threshold", type=float, default=None,
                    help="minimum fraction of queries that must pass (default: config)")
    ap.add_argument("--model", default=None)
    ap.add_argument("--num-workers", type=int, default=8)
    ap.add_argument("--timeout", type=int, default=45)
    ap.add_argument("--json", dest="json_out", default=None, help="write raw results here")
    args = ap.parse_args(argv)

    skill_dir = os.path.abspath(args.skill)
    skill_name = os.path.basename(os.path.normpath(skill_dir))
    eval_set = os.path.join(skill_dir, "evals", "trigger.json")
    if not os.path.isfile(eval_set):
        print(f"error: {eval_set} not found", file=sys.stderr)
        return 2

    config = load_config()
    settings = skill_settings(config, skill_name)
    runs = args.runs or settings.get("runs", 3)
    threshold = args.threshold or settings.get("threshold", 0.8)

    cmd = [sys.executable, "-m", "scripts.run_eval",
           "--eval-set", eval_set, "--skill-path", skill_dir,
           "--runs-per-query", str(runs), "--num-workers", str(args.num_workers),
           "--timeout", str(args.timeout), "--verbose"]
    if args.model:
        cmd += ["--model", args.model]

    env = dict(os.environ, PYTHONPATH=VENDOR)
    proc = subprocess.run(cmd, cwd=REPO_ROOT, env=env, capture_output=True, text=True)
    sys.stderr.write(proc.stderr)
    if proc.returncode != 0:
        print(f"error: vendored run_eval failed (exit {proc.returncode})", file=sys.stderr)
        return proc.returncode

    output = json.loads(proc.stdout)
    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(output, f, indent=2)

    summary = output["summary"]
    rate = summary["passed"] / summary["total"] if summary["total"] else 0.0
    verdict = "PASS" if rate >= threshold else "FAIL"
    print(f"{verdict} {skill_name}: {summary['passed']}/{summary['total']} queries "
          f"({rate:.0%}, threshold {threshold:.0%}, {runs} runs/query)")
    for r in output["results"]:
        if not r["pass"]:
            kind = "false-negative" if r["should_trigger"] else "false-positive"
            print(f"  ✗ {kind} ({r['triggers']}/{r['runs']}): {r['query'][:90]}")
    return 0 if rate >= threshold else 1


if __name__ == "__main__":
    sys.exit(main())
