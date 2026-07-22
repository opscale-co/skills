#!/usr/bin/env python3
"""run_functional_evals.py — layer-3 functional evals for one skill.

Runs each eval from <skill>/evals/functional.json against a throwaway copy of
the skill's fixture project, `runs` times per configuration, always including
a baseline configuration WITHOUT the skill (same prompt), then aggregates
pass rates, tokens and duration into benchmark.json/md via the vendored
skill-creator aggregate_benchmark.py.

Everything stack-specific comes from skills.config.yml (fixture path, verify
commands) or from the eval file itself (grader commands, llm criteria) — this
runner knows no language.

Assertion types:
  verify  {"type": "verify", "ref": "<id>"}      run the config verify cmd with
                                                 that id inside the output dir
  script  {"type": "script", "cmd": "..."}       run a grader; {output_dir} is
                                                 substituted; exit 0 = pass
  llm     {"type": "llm", "text": "..."}         last resort — a claude -p
                                                 grader judges the criterion

Output layout (consumed by aggregate_benchmark.py):
  <out>/eval-N/{with_skill,without_skill}/run-M/{grading.json,timing.json,transcript.txt}

Usage:
    python3 tools/run_functional_evals.py skills/opscale-domain \
        [--runs N] [--no-baseline] [--only EVAL_ID] [--out DIR] [--model M] \
        [--timeout SECONDS] [--max-cost-usd X]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pipeline_config import REPO_ROOT, load_config, skill_settings  # noqa: E402

LINK_DIRS = {"vendor", "node_modules"}  # heavy dep dirs: symlink, don't copy
AGGREGATE_PATH = os.path.join(HERE, "vendor", "skill-creator", "scripts", "aggregate_benchmark.py")


# ---------------------------------------------------------------------------
# Fixture workspace
# ---------------------------------------------------------------------------

def make_workspace(fixture_root, overlay_dir=None):
    """Copy the fixture into a tmpdir; symlink heavy dep dirs; apply overlay."""
    tmp = tempfile.mkdtemp(prefix="skill-eval-")
    for entry in os.listdir(fixture_root):
        if entry in {".git"}:
            continue
        src = os.path.join(fixture_root, entry)
        dst = os.path.join(tmp, entry)
        if entry in LINK_DIRS and os.path.isdir(src):
            os.symlink(src, dst)
        elif os.path.isdir(src):
            shutil.copytree(src, dst, symlinks=True,
                            ignore=shutil.ignore_patterns(".git"))
        else:
            shutil.copy2(src, dst)
    if overlay_dir:
        for dirpath, _, filenames in os.walk(overlay_dir):
            for fn in filenames:
                src = os.path.join(dirpath, fn)
                rel = os.path.relpath(src, overlay_dir)
                dst = os.path.join(tmp, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)
    return tmp


def snapshot_files(workspace):
    """Map of rel-path -> (mtime_ns, size) for every regular file."""
    snap = {}
    for dirpath, dirnames, filenames in os.walk(workspace):
        dirnames[:] = [d for d in dirnames
                       if d not in {".git", ".claude"}
                       and not os.path.islink(os.path.join(dirpath, d))]
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, workspace)
            try:
                st = os.stat(path)
            except OSError:
                continue
            snap[rel] = (st.st_mtime_ns, st.st_size)
    return snap


def write_manifest(workspace, before):
    """Diff current tree vs `before`; write generated/modified file list.

    The manifest is what makes assertions target the code the agent actually
    produced instead of fixed paths — graders read it via {manifest}.
    """
    after = snapshot_files(workspace)
    changed = sorted(rel for rel, sig in after.items()
                     if before.get(rel) != sig and not rel.startswith(".eval"))
    manifest_path = os.path.join(workspace, ".eval-manifest.txt")
    with open(manifest_path, "w") as f:
        f.write("\n".join(changed) + ("\n" if changed else ""))
    return manifest_path, changed


def install_skill(workspace, skill_dir):
    """Make the skill discoverable by claude -p inside the workspace."""
    name = os.path.basename(os.path.normpath(skill_dir))
    dst = os.path.join(workspace, ".claude", "skills", name)
    shutil.copytree(
        skill_dir, dst,
        ignore=shutil.ignore_patterns("evals", ".git", "__pycache__", ".DS_Store"),
    )


# ---------------------------------------------------------------------------
# Agent execution
# ---------------------------------------------------------------------------

def run_agent(prompt, workspace, model=None, timeout=900, no_skills=False):
    """Run claude -p headless in the workspace. Returns a result dict.

    no_skills=True disables ALL skills (user-level included) — required for a
    valid baseline: a user-level copy of the skill under ~/.claude/skills
    would otherwise leak into the "without skill" configuration.
    """
    cmd = ["claude", "-p", prompt, "--output-format", "json",
           "--dangerously-skip-permissions"]
    if no_skills:
        cmd.append("--disable-slash-commands")
    if model:
        cmd += ["--model", model]
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              cwd=workspace, env=env, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"agent timed out after {timeout}s",
                "duration_s": time.time() - t0, "tokens": 0, "cost_usd": 0.0,
                "transcript": ""}
    duration = time.time() - t0
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"ok": False, "error": f"unparseable agent output (exit {proc.returncode}): "
                                      f"{(proc.stderr or proc.stdout)[:400]}",
                "duration_s": duration, "tokens": 0, "cost_usd": 0.0,
                "transcript": proc.stdout}
    usage = payload.get("usage", {})
    tokens = sum(usage.get(k, 0) for k in
                 ("input_tokens", "output_tokens", "cache_creation_input_tokens"))
    return {
        "ok": not payload.get("is_error", False),
        "error": None if not payload.get("is_error") else str(payload.get("result"))[:400],
        "duration_s": duration,
        "tokens": tokens,
        "cost_usd": payload.get("total_cost_usd", 0.0),
        "num_turns": payload.get("num_turns"),
        "transcript": str(payload.get("result", "")),
    }


# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

def run_assertion(assertion, workspace, verify_map, model, timeout=300):
    """Returns an expectation dict: {text, passed, evidence}."""
    kind = assertion.get("type")
    aid = assertion.get("id", kind)

    if kind == "verify":
        ref = assertion["ref"]
        cmd = verify_map.get(ref)
        if not cmd:
            return {"text": f"[{aid}] verify:{ref}", "passed": False,
                    "evidence": f"no verify command with id '{ref}' in skills.config.yml"}
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              cwd=workspace, timeout=timeout)
        tail = "\n".join(((proc.stdout or "") + (proc.stderr or "")).strip().splitlines()[-8:])
        return {"text": f"[{aid}] verify:{ref} — `{cmd}` exits 0",
                "passed": proc.returncode == 0,
                "evidence": tail or f"exit {proc.returncode}"}

    if kind == "script":
        cmd = assertion["cmd"].format(output_dir=workspace, repo_root=REPO_ROOT,
                                      manifest=os.path.join(workspace, ".eval-manifest.txt"))
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              cwd=REPO_ROOT, timeout=timeout)
        msg = (proc.stdout or proc.stderr or "").strip()
        return {"text": f"[{aid}] {assertion['cmd']}",
                "passed": proc.returncode == 0,
                "evidence": msg[:800] or f"exit {proc.returncode}"}

    if kind == "llm":
        criterion = assertion["text"]
        grader_prompt = (
            "You are grading the current project directory against one criterion. "
            "Inspect the files, then output ONLY a JSON object "
            '{"passed": true|false, "evidence": "<one sentence citing files>"} '
            f"and nothing else.\nCriterion: {criterion}"
        )
        result = run_agent(grader_prompt, workspace, model=model, timeout=timeout,
                           no_skills=True)
        try:
            text = result["transcript"]
            verdict = json.loads(text[text.index("{"):text.rindex("}") + 1])
            return {"text": f"[{aid}] {criterion}",
                    "passed": bool(verdict.get("passed")),
                    "evidence": str(verdict.get("evidence", ""))[:800]}
        except (ValueError, KeyError):
            return {"text": f"[{aid}] {criterion}", "passed": False,
                    "evidence": f"grader output unparseable: {result.get('transcript', '')[:200]}"}

    return {"text": f"[{aid}] unknown assertion type '{kind}'",
            "passed": False, "evidence": "unsupported type"}


# ---------------------------------------------------------------------------
# One run = agent + all assertions + grading.json/timing.json
# ---------------------------------------------------------------------------

def execute_run(run_dir, ev, with_skill, skill_dir, settings, args):
    fixture_root = os.path.normpath(os.path.join(REPO_ROOT, settings["fixture"]))
    overlay = None
    if ev.get("fixture"):
        overlay = os.path.join(skill_dir, "evals", "fixtures", ev["fixture"])
    workspace = make_workspace(fixture_root, overlay)
    try:
        if with_skill:
            install_skill(workspace, skill_dir)
        before = snapshot_files(workspace)
        agent = run_agent(ev["prompt"], workspace, model=args.model,
                          timeout=args.timeout, no_skills=not with_skill)
        _, generated = write_manifest(workspace, before)

        expectations = []
        if agent["ok"]:
            verify_map = {v["id"]: v["cmd"] for v in settings.get("verify", [])}
            for assertion in ev.get("assertions", []):
                expectations.append(run_assertion(assertion, workspace, verify_map, args.model))
        else:
            for assertion in ev.get("assertions", []):
                expectations.append({
                    "text": f"[{assertion.get('id', assertion.get('type'))}]",
                    "passed": False,
                    "evidence": f"agent run failed: {agent['error']}",
                })

        passed = sum(1 for e in expectations if e["passed"])
        total = len(expectations)
        os.makedirs(run_dir, exist_ok=True)
        with open(os.path.join(run_dir, "grading.json"), "w") as f:
            json.dump({
                "expectations": expectations,
                "summary": {"passed": passed, "failed": total - passed, "total": total,
                            "pass_rate": round(passed / total, 4) if total else 0.0},
            }, f, indent=2)
        with open(os.path.join(run_dir, "timing.json"), "w") as f:
            json.dump({"total_duration_seconds": round(agent["duration_s"], 1),
                       "total_tokens": agent["tokens"],
                       "cost_usd": agent["cost_usd"]}, f, indent=2)
        with open(os.path.join(run_dir, "transcript.txt"), "w") as f:
            f.write(agent.get("transcript") or "")
        with open(os.path.join(run_dir, "generated_files.txt"), "w") as f:
            f.write("\n".join(generated) + ("\n" if generated else ""))
        return {"pass_rate": passed / total if total else 0.0,
                "tokens": agent["tokens"], "cost_usd": agent["cost_usd"],
                "duration_s": agent["duration_s"], "agent_ok": agent["ok"]}
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load_aggregate_module():
    spec = importlib.util.spec_from_file_location("aggregate_benchmark", AGGREGATE_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skill", help="path to the skill directory")
    ap.add_argument("--runs", type=int, default=None, help="runs per configuration (default: config)")
    ap.add_argument("--no-baseline", action="store_true", help="skip the without-skill baseline")
    ap.add_argument("--baseline-only", action="store_true",
                    help="run only the without-skill configuration (e.g. to redo an invalid baseline)")
    ap.add_argument("--only", default=None, help="run a single eval id")
    ap.add_argument("--out", default=None, help="benchmark output dir")
    ap.add_argument("--model", default=None, help="model for claude -p")
    ap.add_argument("--timeout", type=int, default=900, help="seconds per agent run")
    ap.add_argument("--max-cost-usd", type=float, default=None,
                    help="abort when cumulative cost exceeds this (default: budgets.headless_daily_usd)")
    ap.add_argument("--config", default=None)
    args = ap.parse_args(argv)

    skill_dir = os.path.abspath(args.skill)
    skill_name = os.path.basename(os.path.normpath(skill_dir))
    config = load_config(args.config)
    settings = skill_settings(config, skill_name)
    if not settings.get("fixture"):
        print(f"error: no fixture configured for '{skill_name}' in skills.config.yml", file=sys.stderr)
        return 2

    eval_path = os.path.join(skill_dir, "evals", "functional.json")
    if not os.path.isfile(eval_path):
        print(f"error: {eval_path} not found", file=sys.stderr)
        return 2
    spec = json.load(open(eval_path))
    evals = spec.get("evals", [])
    if args.only:
        evals = [e for e in evals if e["id"] == args.only]
        if not evals:
            print(f"error: no eval with id '{args.only}'", file=sys.stderr)
            return 2

    runs = args.runs or settings.get("runs", 3)
    max_cost = args.max_cost_usd
    if max_cost is None:
        max_cost = config.get("budgets", {}).get("headless_daily_usd")

    out_dir = args.out or os.path.join(
        REPO_ROOT, f"{skill_name}-workspace", "benchmarks", time.strftime("%Y-%m-%dT%H-%M-%S"))
    os.makedirs(out_dir, exist_ok=True)

    if args.baseline_only:
        configs = ["without_skill"]
    else:
        configs = ["with_skill"] + ([] if args.no_baseline else ["without_skill"])
    total_cost = 0.0
    aborted = None

    for idx, ev in enumerate(evals, start=1):
        eval_dir = os.path.join(out_dir, f"eval-{idx}")
        os.makedirs(eval_dir, exist_ok=True)
        with open(os.path.join(eval_dir, "eval_metadata.json"), "w") as f:
            json.dump({"eval_id": ev["id"]}, f)
        for cfg in configs:
            for run_no in range(1, runs + 1):
                if max_cost is not None and total_cost >= max_cost:
                    aborted = (f"cost budget exhausted: {total_cost:.2f} USD >= "
                               f"{max_cost:.2f} USD (budgets.headless_daily_usd)")
                    break
                run_dir = os.path.join(eval_dir, cfg, f"run-{run_no}")
                print(f"[{ev['id']}] {cfg} run {run_no}/{runs} ...", file=sys.stderr, flush=True)
                r = execute_run(run_dir, ev, cfg == "with_skill", skill_dir, settings, args)
                total_cost += r["cost_usd"]
                print(f"    pass_rate={r['pass_rate']:.2f} tokens={r['tokens']} "
                      f"cost=${r['cost_usd']:.2f} time={r['duration_s']:.0f}s"
                      + ("" if r["agent_ok"] else " (agent FAILED)"),
                      file=sys.stderr, flush=True)
            if aborted:
                break
        if aborted:
            break

    agg = load_aggregate_module()
    benchmark = agg.generate_benchmark(__import__("pathlib").Path(out_dir),
                                       skill_name, os.path.relpath(skill_dir, REPO_ROOT))
    benchmark["metadata"]["runs_per_configuration"] = runs
    if aborted:
        benchmark["notes"].append(f"ABORTED: {aborted}")
    with open(os.path.join(out_dir, "benchmark.json"), "w") as f:
        json.dump(benchmark, f, indent=2)
    with open(os.path.join(out_dir, "benchmark.md"), "w") as f:
        f.write(agg.generate_markdown(benchmark))

    print(f"\nBenchmark written to {out_dir}/benchmark.json", file=sys.stderr)
    summary = benchmark["run_summary"]
    for cfg in configs:
        if cfg in summary:
            pr = summary[cfg]["pass_rate"]
            print(f"  {cfg}: {pr['mean']:.0%} ± {pr['stddev']:.0%}", file=sys.stderr)
    if "delta" in summary and not args.no_baseline:
        print(f"  delta (with - without): {summary['delta']['pass_rate']}", file=sys.stderr)
    if aborted:
        print(f"  {aborted}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
