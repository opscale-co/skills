---
name: valid-skill
description: Formats quarterly revenue reports from raw CSV exports. Use when a finance CSV needs the standard quarterly layout.
---

# Valid Skill

Run scripts/format.py against the export, then check references/layout.md
for the column order.

```bash
python3 scripts/format.py input.csv
```
