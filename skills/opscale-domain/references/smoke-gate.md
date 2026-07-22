# Phase 10 — Smoke gate (MANDATORY before marking the skill complete)

The auto-reported checkboxes in the completeness gate are not enough — too many
template bugs (empty `$casts`, sibling-FK collisions, unused imports, missing
notes) only surface when PHP actually parses and Laravel actually loads the
classes. Run these three checks in order; any failure means the skill is NOT
done:

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
