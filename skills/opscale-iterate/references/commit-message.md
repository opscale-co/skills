# Step 8 — Compose the Conventional Commits message

### Step 8 — Compose the Conventional Commits message

Build the message from the change type, scope, and brief collected in Step 1.
Format must follow [Conventional Commits 1.0](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body — what changed and why, derived from spec.md "Why" section>

[optional footer(s)]
```

**Rules:**

- `<type>` — from the table in Step 1 (`feat`, `fix`, `perf`, `refactor`, etc.)
- `<scope>` — the module/aggregate touched, kebab-case (e.g. `customers`,
  `loans`, `kyc`). Single scope only. Omit `<scope>` entirely if the change
  spans the project root (config, tooling, multi-module refactor).
- `<subject>` — imperative mood, lowercase first letter, no trailing period,
  ≤ 72 chars. "add priority field to Customer", not "Added priority field."
- **Body** — wrap at 100 chars. Reference the spec folder (e.g. `Refs
  .specify/specs/014-customer-priority/spec.md`).
- **BREAKING CHANGE footer** — only if the user flagged the change as breaking
  in Step 1:
  ```
  BREAKING CHANGE: <description of the break and required migration>
  ```
  This is what causes semantic-release to issue a major version bump.
- Trailers — keep the standard Claude Code attribution:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

**Examples:**

```
feat(customers): add priority field to Customer

Adds a `priority` enum column (low|normal|high) to the customers aggregate so
support agents can triage incoming tickets. Spec: actor "Support Lead",
trigger "ticket assignment". Default value `normal` to preserve existing
records.

Refs .specify/specs/014-customer-priority/spec.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
fix(loans): correct interest accrual rounding on grace period

Loans entering grace period were rounding accrued interest with bankers'
rounding instead of half-up, producing a 1-cent discrepancy in the published
statement. Aligns calculation with finance team's reference spreadsheet.

Refs .specify/specs/021-loan-grace-rounding/spec.md
Fixes #4827

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

```
feat(api)!: replace v1 token endpoint with /oauth/token

BREAKING CHANGE: clients calling POST /api/v1/token must migrate to
POST /oauth/token. The legacy endpoint returned a flat string token; the new
endpoint returns the OAuth 2.0 access_token response envelope. Migration
guide in docs/migrations/oauth-v2.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Validate the message against commitlint** before committing (if a
`commitlint.config.js` exists from `opscale-release`):

```bash
echo "<message>" | npx commitlint
```

If it fails, fix the message — do not commit a non-conforming message.

---
