# Linting & Code-Quality Configs — verbatim reference

These are the canonical configuration blocks that `opscale-init` Step 4d copies
into a freshly bootstrapped project. They are the source of truth — never edit
them inline in the project; if a rule needs to change, change it here first.

Six files in total:

1. `duster.json` — Duster (PHP + JS) runner
2. `pint.json` — Pint PHP style preset
3. `rector.php` — Rector modernization
4. `phpstan.neon` — Larastan / PHPStan level 8 baseline
5. `lint-staged.config.mjs` — pre-commit fix hook
6. `.eslintrc.cjs` — ESLint for Vue / JS projects (Nova frontend)

---

## Install commands

**Install PHP tooling** (all project types):

```bash
composer require --dev tightenco/duster larastan/larastan rector/rector rector/rector-laravel laravel/pint pestphp/pest
```

**Install JS tooling** (only for `app` / `module` / `package` with a Nova frontend — skip for `library`):

```bash
npm install --save-dev lint-staged eslint @eslint/js eslint-plugin-vue prettier
```

**Wire the pre-commit hook** that runs `lint-staged`:

```bash
printf '#!/bin/sh\nnpx lint-staged\n' > .husky/pre-commit
chmod +x .husky/pre-commit
```

**Copy the canonical config blocks** below into the project root. For convenience, `duster.json`, `pint.json`, `rector.php`, and `lint-staged.config.mjs` also exist as standalone copies in `references/` — you may `cp` them directly. `phpstan.neon` and `.eslintrc.cjs` only live inside this file.

`.eslintrc.cjs` is only needed for projects with a JS frontend (skip for `library` and headless `package`).

---

### duster.json

```json
{
    "include": [
        "src",
        "tests",
        "workbench/app"
    ],
    "exclude": [
        "tests/fixtures"
    ],
    "scripts": {
        "lint": {
            "phpstan": false
        },
        "fix": {
            "phpstan": false
        }
    },
    "processTimeout": 120
}
```

### pint.json

```json
{
    "preset": "laravel",
    "rules": {
        "declare_strict_types": true,
        "ordered_imports": {
            "sort_algorithm": "alpha"
        },
        "no_unused_imports": true,
        "single_quote": true
    }
}
```

### rector.php

```php
<?php

declare(strict_types=1);

use Rector\Caching\ValueObject\Storage\FileCacheStorage;
use Rector\Config\RectorConfig;
use Rector\PHPUnit\Set\PHPUnitSetList;
use Rector\Set\ValueObject\SetList;
use Rector\ValueObject\PhpVersion;
use RectorLaravel\Set\LaravelSetList;

function laravelSetup(): array
{
    return [
        'paths' => [
            __DIR__ . '/src',
            __DIR__ . '/tests',
        ],
        'sets' => [
            SetList::PHP_83,
            SetList::CODE_QUALITY,
            SetList::CODING_STYLE,
            SetList::DEAD_CODE,
            SetList::NAMING,
            SetList::PRIVATIZATION,
            SetList::TYPE_DECLARATION,
            SetList::EARLY_RETURN,
            PHPUnitSetList::PHPUNIT_110,
            PHPUnitSetList::PHPUNIT_CODE_QUALITY,
            PHPUnitSetList::ANNOTATIONS_TO_ATTRIBUTES,
            LaravelSetList::LARAVEL_110,
            LaravelSetList::LARAVEL_CODE_QUALITY,
            LaravelSetList::LARAVEL_COLLECTION,
            LaravelSetList::LARAVEL_ELOQUENT_MAGIC_METHOD_TO_QUERY_BUILDER,
        ],
        'skip' => [
            __DIR__ . '/tests/fixtures',
            Rector\CodeQuality\Rector\If_\SimplifyIfReturnBoolRector::class,
        ],
    ];
}

return static function (RectorConfig $rectorConfig): void {
    $rectorConfig->cacheDirectory('/tmp/rector-cache');
    $rectorConfig->cacheClass(FileCacheStorage::class);
    $rectorConfig->phpVersion(PhpVersion::PHP_83);

    $config = laravelSetup();
    $rectorConfig->paths($config['paths']);
    $rectorConfig->sets($config['sets']);
    $rectorConfig->skip($config['skip']);
};
```

### phpstan.neon

```neon
includes:
    - vendor/larastan/larastan/extension.neon

parameters:
    level: 8
    paths:
        - src
        - tests
    excludePaths:
        - tests/fixtures/*
    checkMissingIterableValueType: false
    checkGenericClassInNonGenericObjectType: false
    reportUnmatchedIgnoredErrors: true
    treatPhpDocTypesAsCertain: false
```

### lint-staged.config.mjs

```js
export default {
    '*.php': ['./vendor/bin/duster fix'],
    '*.{js,vue,ts}': ['./vendor/bin/duster fix'],
};
```

### .eslintrc.cjs

```js
module.exports = {
    root: true,
    env: {
        browser: true,
        node: true,
        es2022: true,
    },
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
    },
    extends: [
        'eslint:recommended',
        'plugin:vue/vue3-recommended',
    ],
    rules: {
        'vue/multi-word-component-names': 'off',
        'vue/no-v-html': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    ignorePatterns: [
        'node_modules/',
        'vendor/',
        'public/',
        'dist/',
        'coverage/',
    ],
};
```
