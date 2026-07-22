# Sample output — opscale-release

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

> Note: `membresia` does not yet ship `.github/workflows/` — the YAML
> excerpt below is the canonical workflow emitted by opscale-release;
> the composer + sonar excerpts come from the project as-is.

---

## 1. `.github/workflows/auto-check.yml` (excerpt)

```yaml
name: Auto Check

on:
  pull_request:
    branches: [develop]

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: bcmath, ctype, fileinfo, json, mbstring, openssl, pdo, pdo_mysql, tokenizer, xml, zip
          coverage: xdebug

      - name: Install PHP dependencies
        run: composer install --no-progress --no-interaction --optimize-autoloader
        env:
          COMPOSER_AUTH: '{"http-basic": {"nova.laravel.com": {"username": "${{ secrets.NOVA_USERNAME }}", "password": "${{ secrets.NOVA_LICENSE_KEY }}"}}}'

      - name: Gate 1 - Duster
        run: npm run lint

      - name: Gate 2 - Larastan
        run: composer analyse

      - name: Gate 3 - Pest (Unit + Feature)
        run: composer test
```

## 2. `composer.json` — `scripts` block

```json
"scripts": {
    "lint":            "./vendor/bin/duster lint --dirty",
    "fix":             "./vendor/bin/duster fix --dirty",
    "refactor":        "./vendor/bin/rector process",
    "analyse":         "./vendor/bin/phpstan analyse --memory-limit=512M",
    "test":            "./vendor/bin/pest --testsuite=Unit,Feature",
    "test:browser":    "DUSK_HEADLESS=true DUSK_PAUSE_MS=0 ./vendor/bin/pest -c phpunit.dusk.xml ...",
    "showcase": [
        "@composer build",
        "DUSK_HEADLESS=false DUSK_PAUSE_MS=3000 ./vendor/bin/pest tests/Browser/LoansShowcaseTest.php -c phpunit.dusk.xml"
    ],
    "check": ["@fix", "@refactor", "@lint", "@analyse", "@test"]
}
```

## 3. `sonar-project.properties` (placeholders filled)

```properties
sonar.projectKey=acme_loans
sonar.projectName=Acme Loans
sonar.projectVersion=1.0

sonar.sources=src
sonar.tests=tests
sonar.language=php

sonar.php.coverage.reportPaths=coverage.xml
sonar.php.phpstan.reportPaths=phpstan-report.json

sonar.coverage.exclusions=\
    **/tests/**,\
    **/database/migrations/**,\
    **/Nova/**

sonar.cpd.exclusions=\
    **/Nova/**,\
    **/database/migrations/**
```
