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
