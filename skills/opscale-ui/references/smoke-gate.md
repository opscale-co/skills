# Smoke gate — MANDATORY before marking the skill complete

Resource templates that compile fine often fail at runtime — missing imports,
wrong namespace for a referenced HasMany child, `__()` on a non-string, enum
referenced before existing. The auto-reported checkboxes don't catch any of
this. Run these checks; any failure means the skill is NOT done:

```bash
# 1. Every generated PHP file parses
find src/Nova -name '*.php' -print0 \
  | xargs -0 -n1 php -l > /dev/null \
  || { echo "❌ php -l failed"; exit 1; }

# 2. Every Resource class loads via reflection (catches missing imports,
#    bad namespaces, references to non-existent enums/models)
composer dump-autoload --no-scripts > /dev/null
php -r 'require "vendor/autoload.php";
  $bad = [];
  foreach (glob("src/Nova/*.php") as $f) {
    $class = "[PackageNamespace]\\\\Nova\\\\" . basename($f, ".php");
    try { new ReflectionClass($class); }
    catch (Throwable $e) { $bad[$class] = $e->getMessage(); }
  }
  if ($bad) { foreach ($bad as $c => $m) fwrite(STDERR, "$c: $m\n"); exit(1); }
  echo "OK ".count(glob("src/Nova/*.php"))." resources loaded\n";'

# 3. The workbench actually boots with Nova mounted (catches Resource
#    constructor errors, NovaServiceProvider issues, missing menu entries)
vendor/bin/testbench workbench:build --ansi > /dev/null
```

Do NOT mark the gate `PASS` based on file count or "Resources generated"
messages — reflection-load is the cheapest way to catch the bugs that hide
behind syntactically valid PHP.
