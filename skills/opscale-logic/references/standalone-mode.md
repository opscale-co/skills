# Standalone Workflow (package projects)

Use this variant when generating Action classes directly for a standalone
package with no BPMN/SIPOC source (see Mode Detection in the body). For the
BPMN-driven mode, stay in the SKILL body.

---

### Standalone Workflow

#### Phase 1 — Collect Action definitions

From the user request, build the generation plan:

```
Logic Actions to generate:

| # | Action name | identifier | Purpose |
|---|-------------|------------|---------|
| 1 | [name] | [kebab-id] | [one-line description] |
| 2 | [name] | [kebab-id] | [one-line description] |

Confirm before generating?
```

Wait for confirmation.

#### Phase 2 — Resolve dependency order

Same as BPMN-driven — if an Action composes others, generate leaves first.

#### Phase 3 — Drive spec-kit to plan + produce per-Action tasks

Standalone mode still uses spec-kit when the project has been initialized with
`opscale-init` (i.e. `.specify/` exists). The plan + tasks pair gives the rest
of the pipeline (especially `opscale-test`) something concrete to bind to.

If `.specify/` does NOT exist (rare — package was never run through
`opscale-init`), skip this phase and proceed to Phase 4 directly. Otherwise:

**3a. Build a synthetic spec folder for this Action batch.** Standalone mode
has no `process.md`, so create a minimal `.specify/specs/{NNN}-actions-{date}/`
folder and seed it with the Action definitions the user provided.

**3b. Run `/speckit.plan`** with the same payload structure as the BPMN-driven
mode (action list, dependency order, parameters, purpose).

**3c. Run `/speckit.tasks`** with the same contract: one task per Action,
each preceded by a corresponding `Test {ClassName}` task.

The verification checklist is identical to BPMN-driven Phase 3 — one task per
Action, dependency edges match, no merging.

#### Phase 4 — Generate Actions

For each task in `tasks.md` (or each action from the user's input if Phase 3
was skipped), in dependency order:

- **Class name**: PascalCase from action name
- **`identifier()`**: kebab-case from class name (e.g. `CalculateInterest` → `calculate-interest`)
- **`parameters()`**: from provided parameter definitions
- **`handle()` body**: implement the described logic

Same generator-vs-agents decision as BPMN-driven Phase 4: ≤ 10 actions → agents;
11+ → deterministic generator script. Same single-quote escape invariant
applies to every string that lands in a PHP single-quoted literal.

#### Phase 5 — Update plan.md (if specs exist)

If `.specify/specs/` exists, append the same Logic Layer table as in BPMN-driven
Phase 5 (including the `Task ID` column). Otherwise skip.

---
