#!/usr/bin/env python3
"""improve_loop.py — layer-4 closed loop: revise a skill until its functional
evals converge, with hold-out control against overfitting.

    split evals 60% train / 40% test — the reviser NEVER sees the test set
    best = snapshot(skill)
    for i in 1..max_iter:
        score_train, score_test = run_evals(train), run_evals(test)
        if both >= threshold: stop("converged")
        if score_test <= best.score_test: strikes += 1; 2 strikes -> rollback+stop
        else: best = snapshot; strikes = 0
        revise(skill, failing_cases(train))     # generalize, don't patch

Hard cut conditions (none optional): threshold convergence, max_iter,
2-strike test-score stagnation (with rollback to best), and token_budget —
exceeded means abort and report. The winner is chosen by TEST score.

Every iteration snapshots the full skill bundle to
<skill>-workspace/improve/<ts>/iteration-N/ for comparison and rollback.

Usage:
    python3 tools/improve_loop.py skills/opscale-domain \
        [--runs N] [--max-iter N] [--threshold X] [--token-budget N] \
        [--holdout 0.4] [--model M] [--timeout S] [--seed 42]
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import random
import shutil
import sys
import time
from types import SimpleNamespace

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pipeline_config import REPO_ROOT, load_config, skill_settings  # noqa: E402
import run_functional_evals as rfe  # noqa: E402


def split_evals(evals, holdout, seed):
    """Deterministic train/test split; test gets ceil(len*holdout), min 1 each."""
    rng = random.Random(seed)
    shuffled = evals[:]
    rng.shuffle(shuffled)
    n_test = max(1, round(len(shuffled) * holdout))
    if n_test >= len(shuffled):
        n_test = len(shuffled) - 1 or 1
    return shuffled[n_test:], shuffled[:n_test]


def run_suite(evals, skill_dir, settings, runs, out_dir, args):
    """Run a set of evals with the skill installed; returns (mean_pass_rate,
    tokens_spent, failing_cases). failing_cases carries the evidence the
    reviser needs to generalize from."""
    rates, tokens, failures = [], 0, []
    ns = SimpleNamespace(model=args.model, timeout=args.timeout)
    for idx, ev in enumerate(evals, start=1):
        for run_no in range(1, runs + 1):
            run_dir = os.path.join(out_dir, f"eval-{idx}", "with_skill", f"run-{run_no}")
            r = rfe.execute_run(run_dir, ev, True, skill_dir, settings, ns)
            rates.append(r["pass_rate"])
            tokens += r["tokens"]
            grading = json.load(open(os.path.join(run_dir, "grading.json")))
            for exp in grading["expectations"]:
                if not exp["passed"]:
                    failures.append({"eval": ev["id"], "run": run_no,
                                     "assertion": exp["text"],
                                     "evidence": exp["evidence"][:400]})
    mean = sum(rates) / len(rates) if rates else 0.0
    return mean, tokens, failures


REVISE_PROMPT = """You are revising the Claude Code skill in this directory \
(SKILL.md plus references/ and scripts/) because some functional evals failed.

Failing cases (assertion + evidence):
{failures}

Revise the skill so an agent following it stops failing cases LIKE these.
Generalize from the failures: fix the underlying gap in the instructions \
(a missing convention, an unstated output path, an ambiguous step), never \
hardcode the specific eval's entities, paths or values. When you add or \
change an instruction, state the reason it exists instead of stacking \
uppercase imperatives (no ALWAYS/NEVER/MUST walls). Keep the frontmatter \
description under 500 characters. Edit the files in place; do not create \
eval-specific content."""


def revise(skill_copy, failures, model, timeout):
    prompt = REVISE_PROMPT.format(failures=json.dumps(failures[:12], indent=2))
    result = rfe.run_agent(prompt, skill_copy, model=model, timeout=timeout)
    return result


def snapshot(skill_copy, dest):
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(skill_copy, dest)


def restore(snapshot_dir, skill_copy):
    shutil.rmtree(skill_copy)
    shutil.copytree(snapshot_dir, skill_copy)


def read_skill_md(path):
    p = os.path.join(path, "SKILL.md")
    return open(p, encoding="utf-8").read() if os.path.isfile(p) else ""


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("skill")
    ap.add_argument("--runs", type=int, default=None)
    ap.add_argument("--max-iter", type=int, default=None)
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--token-budget", type=int, default=None)
    ap.add_argument("--holdout", type=float, default=0.4)
    ap.add_argument("--model", default=None)
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--config", default=None)
    ap.add_argument("--apply", action="store_true",
                    help="copy the winning version back over the real skill")
    args = ap.parse_args(argv)

    skill_dir = os.path.abspath(args.skill)
    skill_name = os.path.basename(os.path.normpath(skill_dir))
    config = load_config(args.config)
    settings = skill_settings(config, skill_name)
    runs = args.runs or settings.get("runs", 3)
    max_iter = args.max_iter or settings.get("max_iter", 5)
    threshold = args.threshold or settings.get("threshold", 0.8)
    token_budget = args.token_budget or settings.get("token_budget")

    spec = json.load(open(os.path.join(skill_dir, "evals", "functional.json")))
    train, test = split_evals(spec["evals"], args.holdout, args.seed)
    print(f"split: {len(train)} train / {len(test)} test — "
          f"the reviser only ever sees train failures; test stays hidden",
          file=sys.stderr)

    ws = os.path.join(REPO_ROOT, f"{skill_name}-workspace", "improve",
                      time.strftime("%Y-%m-%dT%H-%M-%S"))
    skill_copy = os.path.join(ws, "current")
    os.makedirs(ws, exist_ok=True)
    shutil.copytree(skill_dir, skill_copy,
                    ignore=shutil.ignore_patterns(".git", "__pycache__"))
    initial_md = read_skill_md(skill_copy)

    best = {"iteration": 0, "score_test": -1.0,
            "snapshot": os.path.join(ws, "iteration-0")}
    snapshot(skill_copy, best["snapshot"])

    spent = 0
    strikes = 0
    history = []
    exit_reason = None

    for i in range(1, max_iter + 1):
        it_dir = os.path.join(ws, f"iteration-{i}")
        os.makedirs(it_dir, exist_ok=True)
        print(f"\n== iteration {i}/{max_iter}", file=sys.stderr)

        score_train, tok_a, failures = run_suite(
            train, skill_copy, settings, runs, os.path.join(it_dir, "train"), args)
        score_test, tok_b, _ = run_suite(
            test, skill_copy, settings, runs, os.path.join(it_dir, "test"), args)
        spent += tok_a + tok_b
        snapshot(skill_copy, os.path.join(it_dir, "skill"))

        entry = {"iteration": i, "score_train": round(score_train, 4),
                 "score_test": round(score_test, 4), "tokens_spent_total": spent,
                 "failing_cases": len(failures), "revised": False}
        history.append(entry)
        print(f"   train={score_train:.2f} test={score_test:.2f} "
              f"tokens={spent}", file=sys.stderr)

        if score_train >= threshold and score_test >= threshold:
            exit_reason = f"converged (iteration {i})"
            if score_test > best["score_test"]:
                best = {"iteration": i, "score_test": score_test,
                        "snapshot": os.path.join(it_dir, "skill")}
            break

        if score_test <= best["score_test"]:
            strikes += 1
            if strikes >= 2:
                restore(best["snapshot"], skill_copy)
                exit_reason = (f"stagnated: test score never beat "
                               f"{best['score_test']:.2f} twice in a row — "
                               f"rolled back to iteration {best['iteration']}")
                break
        else:
            best = {"iteration": i, "score_test": score_test,
                    "snapshot": os.path.join(it_dir, "skill")}
            strikes = 0

        if token_budget and spent >= token_budget:
            restore(best["snapshot"], skill_copy)
            exit_reason = f"token budget exceeded: {spent} >= {token_budget}"
            break

        if i == max_iter:
            restore(best["snapshot"], skill_copy)
            exit_reason = f"max_iter reached ({max_iter})"
            break

        rev = revise(skill_copy, failures, args.model, args.timeout)
        spent += rev["tokens"]
        entry["revised"] = rev["ok"]
        entry["revision_summary"] = (rev.get("transcript") or "")[:300]
        if token_budget and spent >= token_budget:
            restore(best["snapshot"], skill_copy)
            exit_reason = f"token budget exceeded after revision: {spent} >= {token_budget}"
            break

    final_md = read_skill_md(skill_copy)
    diff = "".join(difflib.unified_diff(
        initial_md.splitlines(keepends=True), final_md.splitlines(keepends=True),
        fromfile="SKILL.md (initial)", tofile="SKILL.md (winner)"))

    report = {
        "skill": skill_name,
        "exit_reason": exit_reason,
        "winner_iteration": best["iteration"],
        "winner_score_test": best["score_test"],
        "threshold": threshold,
        "runs_per_eval": runs,
        "tokens_spent": spent,
        "token_budget": token_budget,
        "train_size": len(train), "test_size": len(test),
        "train_ids": [e["id"] for e in train], "test_ids": [e["id"] for e in test],
        "history": history,
        "skill_md_diff": diff,
        "workspace": ws,
    }
    with open(os.path.join(ws, "report.json"), "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nexit: {exit_reason}", file=sys.stderr)
    print(f"winner: iteration {best['iteration']} "
          f"(test={best['score_test']:.2f}); report at {ws}/report.json", file=sys.stderr)
    if args.apply and best["iteration"] > 0:
        for entry in os.listdir(skill_copy):
            src, dst = os.path.join(skill_copy, entry), os.path.join(skill_dir, entry)
            if os.path.isdir(src):
                shutil.rmtree(dst, ignore_errors=True)
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        print(f"applied winner back to {skill_dir}", file=sys.stderr)
    print(json.dumps({k: v for k, v in report.items() if k != "skill_md_diff"}, indent=2))
    return 0 if exit_reason and exit_reason.startswith("converged") else 4


if __name__ == "__main__":
    sys.exit(main())
