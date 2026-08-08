# Business types — language-agnostic registry

A **business type** is a technical type with the business logic already attached: what the value means, how it is stored, how it is validated, and what kind of UI control captures it. `email` is not just a string — declaring a column or an input as `email` implies email-format validation, a max length, and an email input control. Typing everything with business types keeps validation, storage, and UI consistent without each skill re-deciding them.

**This file is the canonical registry and it is deliberately language-agnostic** — the Plan phase (dbml, sipoc) describes the solution, not the implementation, so nothing here names a programming language, framework, or class. Each target stack provides an **implementation binding** that maps every slug to concrete framework pieces; the Laravel/Nova binding ships as `business-types.php` in this same directory (consumed only by Generate-phase skills: domain, ui, logic).

`opscale-init` copies this registry into the project as `docs/plan/context/business-types.md` (and the binding as `.specify/memory/business-types.php`), where the team may append project-specific types. Skills read the project copy first and fall back to the bundle copy. **Never invent a type slug inline** — if a concept has no type, add it to the project registry (and its binding) first; that is the whole point of a central registry. Every slug in a binding must exist here, and every slug here must exist in every binding — a mismatch fails the Generate gates.

## The registry

Validation semantics are written in neutral terms; UI intent describes the control, not a widget class. Storage is the DBML column type.

| Slug | Meaning | Storage (DBML) | Validation semantics | UI intent |
|---|---|---|---|---|
| `address` | Physical or mailing address for contact, shipping, or billing | `varchar(500)` | text, max 500 | single-line text |
| `area` | Circular coverage area: center point + radius in meters | `json` | optional; valid geo-JSON | map circle editor (default radius 500 m) |
| `audio` | Audio files: podcasts, voice recordings, sound assets | `varchar(2048)` | file of audio format (mp3/wav/ogg/m4a), max 20 MB | audio upload/player |
| `bpmn` | BPMN 2.0 process diagram | `varchar(2048)` | file, max 5 MB | interactive BPMN viewer |
| `city` | City name for location data and geographic segmentation | `varchar(100)` | text, max 100; value from options source | searchable select |
| `color` | Color value for branding, UI customization, product attributes | `varchar(7)` | hex color (`#RGB` or `#RRGGBB`) | color picker |
| `country` | Country for international operations and regional compliance | `varchar(2)` | ISO 3166-1 alpha-2 code | searchable country select |
| `date` | Calendar date: deadlines, events, milestones | `date` | valid date (no time component) | date picker (`YYYY-MM-DD`) |
| `dbml` | DBML data model source | `text` | text | interactive data-model diagram |
| `description` | Detailed descriptions, notes, additional information | `text` | text, max 5000 | multi-line text (≈5 rows) |
| `document` | Government-issued or official document identifier (National ID, Tax ID, Passport) | `varchar(50)` | max 50; letters, digits, `.-/` and spaces only | single-line text |
| `email` | Email address for communication, notifications, accounts | `varchar(255)` | valid email format (RFC, resolvable domain), max 255 | email input |
| `file` | General file upload: documents, attachments, imports | `varchar(2048)` | file, max 10 MB | file upload |
| `gender` | Gender identification for demographics and personalization | `varchar(50)` | value from options source | select |
| `geofence` | Closed polygon: delivery zone, service area, restricted region | `json` | optional; valid geo-JSON polygon | map polygon editor |
| `hash` | Cryptographic hash for verification, security, reference IDs | `varchar(128)` | hexadecimal string | read-only, copyable text |
| `identifier` | Unique record identity (primary and foreign keys) | `varchar(26)` | 26-char ULID format | read-only, copyable text |
| `image` | Images: product photos, avatars, logos, visual content | `varchar(2048)` | image file (jpeg/png/gif/svg/webp), max 5 MB | image upload with preview |
| `ip` | IP address for network config, security, access logs | `varchar(45)` | valid IPv4 or IPv6 | copyable text |
| `language` | Preferred language for localization | `varchar(10)` | max 10; value from options source | select |
| `location` | Single geographic point: venue, point of interest, asset | `json` | optional; valid geo-JSON point | map pin |
| `maritalStatus` | Marital status for demographic profiling and eligibility | `varchar(50)` | value from options source | select |
| `moment` | Timestamp: scheduling, logging, time-sensitive events | `timestamp` | valid date-time | date-time picker |
| `money` | Monetary amount: pricing, payments, budgets, transactions | `decimal(12,2)` | numeric, ≥ 0, ≤ 999,999,999.99; currency-aware | currency input |
| `multiOptions` | Configurable multi-select: several values from a configurable source | `json` | array; each value from options source | multi-select |
| `name` | Full names for identification and customer records | `varchar(255)` | text, max 255 | single-line text |
| `options` | Configurable dropdown for custom selections and categorization | `varchar(50)` | value from options source | searchable select |
| `password` | Secret for authentication and account protection | `varchar(255)` | min 8, confirmation required; stored hashed | masked password input |
| `pdf` | PDF documents: reports, contracts, invoices, official records | `varchar(2048)` | PDF file, max 10 MB | file upload (PDF only) |
| `phone` | Phone number for contact, verification, support | `varchar(20)` | digits and dashes only | phone input |
| `place` | Geocoded street address resolved to a map point | `json` | optional; valid geo-JSON | address search + map pin |
| `post` | Rich text: blog posts, articles, formatted messages | `text` | text | rich-text editor (with file embeds) |
| `postalCode` | Postal/ZIP code for shipping and address validation | `varchar(20)` | letters, digits, spaces, dashes | single-line text |
| `quantity` | Counts and stock amounts | `int` | integer, ≥ 0 | stepper (step 1) |
| `rating` | Score for reviews, quality assessment, feedback | `decimal(2,1)` | numeric 0–5 | rating input (step 0.5) |
| `region` | Geographic region or territory for sales/market analysis | `varchar(100)` | text, max 100 | single-line text |
| `route` | Multi-waypoint path: delivery routes, trips, itineraries | `json` | optional; valid geo-JSON line | map route editor |
| `slug` | URL-friendly identifier for SEO and routing | `varchar(255)` | lowercase kebab-case, max 255 | auto-generated from title |
| `snippet` | Code or technical content with syntax highlighting | `text` | text | code editor |
| `state` | State/province for regional data | `varchar(100)` | max 100; value from options source | searchable select |
| `title` | Titles or headings for content, pages, products | `varchar(255)` | text, max 255 | single-line text |
| `token` | API token, access key, security credential | `varchar(255)` | 32–255 chars | read-only, copyable text |
| `url` | Web link or external resource reference | `varchar(2048)` | valid URL, max 2048 | link input (renders as clickable host) |
| `username` | Unique login/user identifier | `varchar(30)` | 3–30 chars; letters, digits, underscore | single-line text |
| `uuid` | Universally unique identifier for distributed systems | `varchar(36)` | valid UUID format | copyable text |
| `video` | Video files: tutorials, marketing, media libraries | `varchar(2048)` | video file (mp4/avi/mov/wmv/webm), max 100 MB | video upload |
| `yesNo` | Binary choice: toggles, permissions, status flags | `boolean` | boolean | toggle/switch |

Types whose validation says "value from options source" (`city`, `state`, `gender`, `language`, `maritalStatus`, `options`, `multiOptions`) get their option list at runtime from a configurable source — they are open, configurable sets, which is exactly what distinguishes them from an Enum (closed, module-owned set fixed at design time).

### Relationships (UI intent only — not column types)

| Slug | Meaning | UI intent |
|---|---|---|
| `belongs_to` | Owns a single related record (FK lives on this side, typed `identifier`) | searchable relation picker with inline-create |
| `has_one` | Inverse single-record relation (FK on the other side) | embedded single related record |
| `has_many` | Collection of related records (FK on the other side) | collapsible related list |

## How each skill consumes the registry

| Skill | Phase | Reads | Contract |
|---|---|---|---|
| `opscale-dbml` | Plan | this registry | The slug IS the DBML column type; the Storage column here is what the Generate binding materializes it as |
| `opscale-sipoc` | Plan | this registry | The Inputs table's **Type** column is a type slug, an entity name, or a plain scalar — in that order of preference |
| `opscale-domain` | Generate | the binding | A column noted `type:{slug}` gets the binding's cast and validation rules |
| `opscale-ui` | Generate | the binding | A column noted `type:{slug}` renders as the binding's field with its config; the meaning becomes the help text |
| `opscale-logic` | Generate | the binding | Inputs typed with a slug resolve to the binding's validation rules in `parameters()` |

Plan artifacts (process.txt, dbml.dbml, operations.md, SIPOCs) may only ever reference **slugs** — never a class name, framework field, or language-specific rule string. That keeps every Plan artifact valid for any implementation stack; only the binding is stack-specific.

## Business type vs Enum vs external ref — pick one

- **Business type** (the column's declared type) — the value's *format and behavior* are universal (an email is an email in every module).
- **Enum block** — the value set is *closed and owned by this module* (an order status). Enums win over the `options` business type when the set is fixed at design time.
- **External ref** (`// external_ref:{slug}`) — the value is an *ID owned by another module*. Never combine with a business type note on the same column.

## Extending the registry

Add the type to the project registry (`docs/plan/context/business-types.md`) first — slug, meaning, storage, validation semantics, UI intent — then add its stack binding (`.specify/memory/business-types.php` for Laravel/Nova). A type used by two or more modules belongs here; a value set used by one module is probably an Enum instead.
