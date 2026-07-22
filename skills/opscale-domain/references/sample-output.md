# Sample output — opscale-domain

Anonymized excerpt derived from a working Opscale module
(`Unicoop/membresia`). Shows the SHAPE of what the skill produces,
not the full output.

For the canonical specification of the format, see this skill's
`SKILL.md` body. The full original file lives in the source module.

---

## 1. Model — `src/Models/Application.php`

```php
namespace Acme\Loans\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Acme\Loans\Models\Enums\ApplicationStatus;
use Acme\Loans\Models\Repositories\ApplicationRepository;
use Opscale\Validations\Validatable;

class Application extends Model
{
    use ApplicationRepository;
    use HasUlids;
    use Validatable;

    public static $validationRules = [
        'code'      => ['required', 'string', 'max:20'],
        'party_id'  => ['required', 'string', 'ulid'],
        'policy_id' => ['required', 'string', 'ulid'],
    ];

    protected $fillable = ['code', 'status', 'party_id', 'policy_id', 'current_cycle'];

    protected $casts = [
        'status'        => ApplicationStatus::class,
        'current_cycle' => 'integer',
    ];

    public function policy(): BelongsTo
    {
        return $this->belongsTo(Policy::class);
    }
}
```

## 2. Enum — `src/Models/Enums/ApplicationStatus.php`

```php
enum ApplicationStatus: string
{
    case Pending   = 'Pending';
    case KycReady  = 'KYC Ready';
    case Qualified = 'Qualified';
    case Approved  = 'Approved';
    case Active    = 'Active';
    case Rejected  = 'Rejected';

    public function canTransitionTo(self $status): bool
    {
        return match ($this) {
            self::Pending   => $status === self::KycReady,
            self::KycReady  => in_array($status, [self::Qualified, self::Rejected], true),
            self::Qualified => in_array($status, [self::Approved, self::Rejected], true),
            self::Approved  => $status === self::Active,
            self::Active, self::Rejected => false,
        };
    }
}
```

## 3. Repository trait — `src/Models/Repositories/ApplicationRepository.php`

```php
trait ApplicationRepository
{
    public static function bootApplicationRepository(): void
    {
        static::creating(function ($model): void {
            if (empty($model->code)) {
                $year = (int) date('Y');
                $seq  = static::query()->where('code', 'like', "APP-{$year}-%")->count() + 1;
                $model->code = sprintf('APP-%d-%05d', $year, $seq);
            }
        });
    }
}
```

## 4. Migration — `database/migrations/2026_06_27_120004_create_applications_table.php`

```php
Schema::create('applications', function (Blueprint $table) {
    $table->ulid('id')->primary();
    $table->string('code', 20)->unique();
    $table->string('status')->default('Pending');
    $table->unsignedInteger('current_cycle')->default(1);

    $table->foreignUlid('policy_id')->constrained('policies');

    // Cross-subdomain logical references (no FK constraint)
    $table->ulid('party_id')->index();         // external_ref:parties
    $table->ulid('assigned_to')->nullable()->index();

    $table->timestamps();
    $table->index(['status'], 'idx_applications_status');
});
```
