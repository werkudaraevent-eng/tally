# Screen Inventory — PRIMA Executive Gathering 2026

## Booth

| Screen | Primary action | Required states |
| --- | --- | --- |
| Home | Scan QR | Online, offline, loading stats |
| Scanner | Detect QR | Camera permission, unsupported camera, cancel, scan feedback |
| Participant result | Create order | Discount available, taken, stock empty, pending pickup, paid pickup, validation error |
| Success | Continue/home | `after_payment`, `immediate`, auto-return |
| Manual search | Find participant | Empty results, loading, duplicate names |

## Cashier

| Screen | Primary action | Required states |
| --- | --- | --- |
| Scan | Find participant | Camera states, manual fallback, recent transactions |
| Bill | Select orders and settle | Partial selection, empty pending, EDC approval missing, cash, offline, invalid/void order |
| Success | Confirm settlement | One order, multiple orders, retry-safe feedback |

## Admin

| Screen | Primary action | Required states |
| --- | --- | --- |
| Overview | Monitor event | Loading stats, no activity, API error |
| Orders | Filter/search orders | Empty, loading, pagination, status filters |
| Pending orders | Chase unpaid orders | Empty, aging indicator, loading, error |
| Participants | Import/search participants | CSV validation errors, import success, no results |
| Booths | Edit booth config | Active/inactive, stock, validation |
| Users | Manage staff | Active/inactive, booth assignment, PIN provisioning |
| Settings | Save event settings | Preview, confirmation dialog, save success, conflict/error |
| Audit | Inspect changes | Empty, filters, loading |

## Papan peringkat

| Screen | Primary action | Required states |
| --- | --- | --- |
| Display | Read-only viewing | Loading, disabled leaderboard, no entries, refresh error, fullscreen |

## Global state matrix

- `online`: mutation controls enabled when role permits.
- `offline`: persistent red banner; create order, settlement, and hand-over disabled.
- `settings`: refresh every 30 seconds through global store.
- `leaderboard`: refresh every 5 seconds; response privacy applied server-side.
- `session`: persists for event duration; server validates every mutation.
- `reducedMotion`: disable nonessential transition and ticker motion.
