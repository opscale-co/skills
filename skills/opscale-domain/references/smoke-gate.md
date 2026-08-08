# Phase 6 — Gate (MANDATORY before marking the skill complete)

This is the smoke portion (check 1) of the Phase 6 gate; checks 2–4
(business types, linters, Unit tests) follow at the bottom of this file.

The auto-reported checkboxes in the completeness gate are not enough — too many
template bugs (empty `$casts`, sibling-FK collisions, unused imports, missing
notes) only surface when PHP actually parses and Laravel actually loads the
classes. Run these three smoke checks in order; any failure means the skill is
NOT done:

```bash
# 1. Every generated PHP file parses (syntactic guarantee)
find src/Models database/migrations -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "❌ php -l failed"; exit 1; }

# 2. Composer autoload finds every class (autoload + namespace guarantee)
composer dump-autoload --no-scripts > /dev/null
php -r 'require "vendor/autoload.php";
  foreach (glob("src/Models/*.php") as $f) {
    $class = "[PackageNamespace]\\\\Models\\\\" . basename($f, ".php");
    if (! class_exists($class)) { fwrite(STDERR, "Missing: $class\n"); exit(1); }
  }
  echo "OK\n";'

# 3. Every migration applies to a fresh SQLite db (schema guarantee)
vendor/bin/testbench workbench:create-sqlite-db --ansi
vendor/bin/testbench migrate:fresh --ansi
```

If any of the three fails, fix the generator/template before declaring the
skill complete. Do NOT mark the gate `PASS` based on the file count alone —
auto-reporting was the #1 source of false-positive completions in earlier
runs.

## Checks 2–4 — business types, linters, Unit tests

```bash
# 2. Business types — every business-typed column resolved through the binding.
#    List the slugs the binding declares, then confirm no migration column used
#    a guessed physical type for a slug that maps elsewhere, and that each
#    model's $validationRules keys match its $fillable.
php -r 'require ".specify/memory/business-types.php" === false ?: 0;' 2>/dev/null
test -f .specify/memory/business-types.php || { echo "❌ missing business-types.php binding"; exit 1; }
#    (inspect migrations/models against the binding — a slug absent from the
#     binding is a hard fail, never a varchar fallback)

# 3. Linters (config installed by opscale-init)
composer lint     || { echo "❌ lint failed"; exit 1; }
composer analyse  || { echo "❌ analyse failed"; exit 1; }

# 4. Unit tests green — the domain suite generated in Phase 4
composer test --testsuite=Unit || { echo "❌ Unit suite red"; exit 1; }
```

The gate is `PASS` only when checks 1–4 all exit 0.
