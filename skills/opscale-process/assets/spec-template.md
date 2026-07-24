# Template — final/process.md (module macro-process)

Section headings and structural keywords (`Stages:`, `Flows:`, "ends at") stay
in English exactly as written here — validators and downstream skills parse
them literally. The prose, step lines, and entity names are written in the
user's language. Use **readable canonical entity names** (natural words, not
snake_case, no DDD jargon). The emoji is the only step marker — never write the
type word. Replace every `[...]`. **Five sections**, plain titles, no rationale:
Name normalization, Lifecycle, Ordered flow, Relations, Narrative.

---

# Module: [Name]

## Name normalization

| Canónico | ← alias |
|---|---|
| [Canonical name] | [alias, alias] |
| [Canonical name] | [alias, alias] |

## Lifecycle

> One sub-block per lifecycle entity (typically every aggregate root). Stages
> are plain words in the user's language and flow left-to-right. Every flow is
> a verb+noun phrase and MUST terminate at a stage transition — no orphan
> flows. Drives Phase 4: each flow becomes a candidate subprocess.

### [Entity]
**Stages:** [Stage1] → [Stage2] → [Stage3] → [FinalStage]
**Flows:**
- [Verb + noun] — ends at `[Stage]`
- [Verb + noun] — ends at `[Stage]`

### [Another Entity]
**Stages:** [Stage1] → [Stage2] → [FinalStage]
**Flows:**
- [Verb + noun] — ends at `[Stage]`

## Ordered flow

> Subprocesses are bounded by a wait (`⏳`). Notifications (`📩`) and file
> deliveries (`📄`) are internal steps; they only close a subprocess when a
> `⏳` immediately follows them. One step per line. Numbering is sequential
> across the whole module — it does NOT restart per subprocess. Branches
> reference destinations by step number. Yes/No labels use the user's language
> (`Sí`, `No`, `True`, `False`, ...).

### Subprocess 1: [Subprocess name]
*Trigger:* [what starts the module]
1) 📝 [plain step]
2) ⚙️ [plain step]
3) 🔀 [question?] — Yes → 4 · No → 5
4) ✅ [plain step] → 6
5) 📩 [notify someone — internal step]
6) ⏳ [wait for X — boundary; ends Subprocess 1]

### Subprocess 2: [Subprocess name]
*Trigger:* the wait from Subprocess 1 resolved ([X arrived])
7) 📝 [plain step]
8) ⚙️ [plain step]
9) 📄 [deliver file — internal step]
10) ⏳ [wait for Y — boundary; ends Subprocess 2]

### Subprocess 3: [Subprocess name]
*Trigger:* the wait from Subprocess 2 resolved
11) 📝 [plain step]
12) 📩 [notify someone — internal step; final subprocess, no closing wait]

## Relations
- [Canonical] [relates to] [Canonical] [and …]
- [Canonical] [relates to] [Canonical]

## Narrative

[2–3 lines: what the module does overall.]

[One short paragraph per subprocess of the flow, in order — naming the same
entities the normalization list uses, mentioning each decision and the wait
(`⏳`) that closes the subprocess (or noting that it's the final subprocess
with no closing wait). Notifications and file deliveries are mentioned where
they happen inside the subprocess, not as boundaries. No detail that isn't
in the flow.]
