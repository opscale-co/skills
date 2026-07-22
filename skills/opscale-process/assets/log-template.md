# Template — logs/{skill}.md (phase-by-phase Q/A record)

Shared skeleton for every Plan-phase skill's `logs/<skill>.md`. Render in the
user's language. One section per phase the skill ran; one **Question / Answer /
Decision** triplet per material exchange within that phase. The log is replaced
on each re-run (not append-across-runs). Within a single run, phases are
appended in order. Replace every `[...]`.

---

# [Skill name] — Phase Log
Module: [NNN-module-name]
Generated: [YYYY-MM-DDTHH:MM:SSZ]

## Phase [N] — [Phase title]
**Question:** [the prompt as posed to the user]
**Answer:** [the user's response, verbatim]
**Decision:** [one-line resolution recorded into the final artifact]

**Question:** [next prompt in the same phase]
**Answer:** [...]
**Decision:** [...]

## Phase [N+1] — [Phase title]
**Question:** [...]
**Answer:** [...]
**Decision:** [...]

---

## Example — Phase 2.5 Q/A block (opscale-process specific)

Use this shape between the Phase 1 (entity normalization) block and the
Phase 2a (subprocess proposal) block:

## Phase 2.5 — Lifecycle modeling

**Question:** Which entities have a lifecycle (change stage over time) and which are just supporting data?
**Answer:** [user's response — list of entities with lifecycles]
**Decision:** Model a lifecycle for: [Entity A], [Entity B].

**Question:** For [Entity A], what are the stages of its lifecycle, in order?
**Answer:** [e.g. Draft → In review → Approved → Cancelled]
**Decision:** Stages confirmed: [Draft, In review, Approved, Cancelled].

**Question:** The flow "[verb+noun]" doesn't end at any stage — which stage does it end at, or should it merge into another flow?
**Answer:** [user's response]
**Decision:** [terminal stage assigned OR flow merged into X].
