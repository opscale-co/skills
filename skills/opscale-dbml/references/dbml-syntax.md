# DBML Syntax Reference

Quick-lookup tables for the opscale-dbml skill. Read this when you need exact
DBML type names, constraint syntax, or naming conventions during Phases 4–6.

Contents: Data Types · Constraint Syntax · Naming Conventions

---

## Reference: Data Types

| Type | Use for | Example |
|------|---------|---------|
| `varchar(26)` | ULIDs, external IDs | `id varchar(26) [pk]` |
| `varchar(n)` | Short text with known max | `name varchar(200)` |
| `text` | Long text, no max | `description text` |
| `decimal(p,s)` | Money, precise numbers | `amount decimal(10,2)` |
| `boolean` | True/false flags | `is_active boolean` |
| `timestamp` | Date and time | `created_at timestamp` |
| `date` | Date only | `birth_date date` |
| `int` | Counts, quantities | `quantity int` |
| `[EnumName]` | Enum reference | `status OrderStatus` |

## Reference: Constraint Syntax

| Constraint | Syntax |
|------------|--------|
| Primary key | `[pk]` |
| Not null | `[not null]` |
| Nullable | `[null]` |
| Unique | `[unique]` |
| Default value | `[default: 'value']` |
| Default function | `` [default: `now()`] `` |
| FK one-to-many | `[ref: > OtherTable.id]` |
| FK one-to-one | `[ref: - OtherTable.id]` |
| Inline note | `[note: 'description']` |

## Reference: Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | plural snake_case | `loan_applications`, `payment_records` |
| Columns | snake_case | `created_at`, `total_amount` |
| Enums | PascalCase | `OrderStatus`, `PaymentMethod` |
| Enum values | snake_case | `in_progress`, `pending_payment` |
| Junction tables | [table_a]_[table_b] | `order_items_toppings` |
| Indexes | `idx_{table}_{column}` | `idx_orders_tenant` |
