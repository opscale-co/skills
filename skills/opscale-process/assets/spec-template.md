# Templates — docs/plan/context/names.md + docs/plan/process.json

The structural keywords (`Trigger:`, `Ends with:`) stay in English exactly as
written here — validators and downstream skills parse them literally. Step
lines and entity names are written in the user's language, as **readable
canonical names** (natural words, not snake_case, no DDD jargon). Steps carry
no type marker — no emoji, no type word; each line is just the business
activity. Replace every `[...]`.

---

## docs/plan/context/names.md

```markdown
# Names — [Module]

| Canónico | ← alias |
|---|---|
| [Canonical name] | [alias, alias] |
| [Canonical name] | [alias, alias] |
```

---

## docs/plan/process.json

Plain text — no markdown, no emojis. One block per subprocess, blocks
separated by exactly one blank line. Each block: the subprocess name line,
its `Trigger:` line, its `Ends with:` line (`—` only for the final
subprocess), then its numbered steps. Numbering is sequential across the
whole module — it does NOT restart per subprocess. Branches reference
destinations by step number; Yes/No labels use the user's language
(`Sí`, `No`, `True`, `False`, ...).

```
[Subprocess 1 name]
Trigger: [what starts the module]
Ends with: [wait for X — the event that opens Subprocess 2]
1) [plain step]
2) [question?] — Yes → 3 · No → 4
3) [plain step] → 5
4) [notify someone — internal step]
5) [last internal step before the wait]

[Subprocess 2 name]
Trigger: the wait from [Subprocess 1 name] resolved ([X arrived])
Ends with: [wait for Y]
6) [plain step]
7) [deliver file — internal step]

[Subprocess 3 name]
Trigger: the wait from [Subprocess 2 name] resolved
Ends with: —
8) [plain step]
9) [notify someone — internal step; final subprocess, no closing wait]
```
