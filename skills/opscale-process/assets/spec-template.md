# Template — spec.md (module macro-process)

This template is in English; at generation translate the titles and prose to the
user's language. Use **readable canonical entity names** (natural words, not
snake_case, no DDD jargon). The emoji is the only step marker — never write the
type word. Replace every `[...]`. **Three sections**, plain titles, no rationale:
Normalización de nombres, Flujo ordenado, Relaciones.

---

# Módulo: [Name]

## Normalización de nombres
[Canonical name]   ← [alias, alias]
[Canonical name]   ← [alias, alias]

## Flujo ordenado

> Subprocesses are bounded by a wait (`⏳`). Notifications (`📩`) and file
> deliveries (`📄`) are internal steps; they only close a subprocess when a
> `⏳` immediately follows them. One step per line. Numbering is sequential
> across the whole module — it does NOT restart per subprocess. Branches
> reference destinations by step number. Yes/No labels use the user's language
> (`Sí`, `No`, `True`, `False`, ...).

### Subproceso 1: [Subprocess name]
*Trigger:* [what starts the module]
1) 📝 [plain step]
2) ⚙️ [plain step]
3) 🔀 [question?] — Sí → 4 · No → 5
4) ✅ [plain step] → 6
5) 📩 [notify someone — internal step]
6) ⏳ [wait for X — boundary; ends Subproceso 1]

### Subproceso 2: [Subprocess name]
*Trigger:* the wait from Subproceso 1 resolved ([X arrived])
7) 📝 [plain step]
8) ⚙️ [plain step]
9) 📄 [deliver file — internal step]
10) ⏳ [wait for Y — boundary; ends Subproceso 2]

### Subproceso 3: [Subprocess name]
*Trigger:* the wait from Subproceso 2 resolved
11) 📝 [plain step]
12) 📩 [notify someone — internal step; final subprocess, no closing wait]

## Relaciones
- [Canonical] [relates to] [Canonical] [and …]
- [Canonical] [relates to] [Canonical]
