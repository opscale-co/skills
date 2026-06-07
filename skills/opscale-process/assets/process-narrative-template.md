# Template — docs/process.md (plain narrative, derived from the flow)

Write this after the connected flow is final. It is the same flow in plain
prose for humans to read first; downstream skills parse `spec.md`. Keep it in
the user's language and use the canonical entity names from the normalization
list. Replace every `[...]`.

---

```markdown
# [Module Name]

[2–3 lines: what the module does overall.]

[One short paragraph per subprocess of the flow, in order — naming the same
entities the normalization list uses, mentioning each decision and the wait
(`⏳`) that closes the subprocess (or noting that it's the final subprocess
with no closing wait). Notifications and file deliveries are mentioned where
they happen inside the subprocess, not as boundaries. No detail that isn't
in the flow.]
```
