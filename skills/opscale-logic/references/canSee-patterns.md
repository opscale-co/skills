# `canSee` patterns for Nova action registration

`canSee(fn ($request) => …)` is the Resource-level visibility guard for
a Nova action. Wrap each action's registration with the pattern that
matches its SIPOC precondition. The generator emits the right wrapper
automatically based on the SIPOC's Business Rules / Process section;
this file documents every supported shape so the patterns stay
consistent across modules.

The action MUST still validate the precondition inside `handle()` — the
`canSee` is a UI affordance, not security. The handler is the
authoritative guard.

## 1. State-based visibility — single state

The action is only available when the entity is in one specific state.

```php
public function actions(NovaRequest $request): array
{
    return [
        ApproveApplication::make()
            ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::PendingReview)),
    ];
}
```

SIPOC trigger: a Business Rule of the form _"Only available when {entity}
is {State}"_ with one state listed.

## 2. State-based visibility — multiple states

The action is available in several states.

```php
ReassignTask::make()
    ->canSee(fn ($request) => in_array(
        $request->findModel()?->status,
        [TaskStatus::Open, TaskStatus::InProgress],
        strict: true,
    )),
```

SIPOC trigger: a Business Rule listing two or more states with
"or"/"either".

## 3. Role-based visibility — user has permission

The action is only available to users with a specific permission.

```php
ApproveApplication::make()
    ->canSee(fn ($request) => $request->user()?->can('credits.approve')),
```

SIPOC trigger: a 👤 Supplier that maps to a specific role, or a
Business Rule of the form _"Only the {Role} can perform this"_.

## 4. Combined state + role visibility

State precondition AND role precondition both required.

```php
ApproveApplication::make()
    ->canSee(fn ($request) =>
        $request->findModel()?->status?->is(ApplicationStatus::PendingReview)
        && $request->user()?->can('credits.approve')
    ),
```

SIPOC trigger: both a state precondition AND a role precondition in the
Business Rules.

## 5. Visibility on detail vs index views

The action makes sense only on a single record (detail), not on a list
selection (index). Combine `canSee` with `showOnIndex(false)` /
`onlyOnDetail()`.

```php
ApproveApplication::make()
    ->onlyOnDetail()
    ->canSee(fn ($request) => $request->findModel()?->status?->is(ApplicationStatus::PendingReview)),
```

For actions that act on a batch from the index, the same pattern in
reverse — `onlyOnIndex()` — and the `canSee` guard inspects
`$request->user()` rather than `$request->findModel()` (because the
model is per-row at execution time, not at visibility time).

SIPOC trigger: SIPOC's "Where invoked" line says "detail only" /
"index only".

## 6. Default — always visible (no `canSee` needed)

The action has no state or role precondition. Register without `canSee`:

```php
public function actions(NovaRequest $request): array
{
    return [
        ExportApplication::make(),
    ];
}
```

SIPOC trigger: no Business Rule mentions a state or role precondition.
This is the default the generator emits when SIPOC parsing finds no
match.

## Cheat sheet — SIPOC phrasing → pattern

| SIPOC phrase                                                       | Pattern |
|--------------------------------------------------------------------|---------|
| _"Only available when {entity} is {State}"_                        | 1       |
| _"Available when {entity} is {State} or {State}"_                  | 2       |
| _"Only {Role} can …"_ / _"Requires {permission}"_                  | 3       |
| _"Only {Role} can … when {entity} is {State}"_                     | 4       |
| _"Detail view only"_ / _"Single record"_                           | 5 (+ 1) |
| (no state / role precondition mentioned)                           | 6       |
