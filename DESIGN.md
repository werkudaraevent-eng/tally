# PRIMA Executive Gathering 2026 — UI Design System

## Product character

Operational tool for a live executive event. UI must help booth staff and cashiers act quickly while standing, while the projected display must remain legible from distance.

Design keywords: precise, calm, high-contrast, warm hospitality, operational clarity.

Avoid: decorative landing-page patterns, excessive gradients, neon glow, emoji icons, dense card stacks, hidden status, and motion that competes with transaction reading.

## Surfaces and tokens

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#F5F4F0` | App canvas, warm neutral |
| `--surface` | `#FFFFFF` | Form and content surfaces |
| `--surface-muted` | `#EDECE6` | Secondary panels and disabled surfaces |
| `--ink` | `#17211D` | Primary text |
| `--ink-muted` | `#66736C` | Supporting text |
| `--line` | `#D9DDD7` | Dividers and field borders |
| `--brand` | `#176B54` | Primary action and event identity |
| `--brand-strong` | `#0D4B3A` | Pressed/strong brand state |
| `--success` | `#237A52` | Available, paid, complete |
| `--warning` | `#A66616` | Pending and attention |
| `--danger` | `#B13A35` | Offline, invalid, void |
| `--unavailable` | `#37413D` | Discount already taken/disabled |
| `--display-bg` | `#101613` | Projector canvas |
| `--display-ink` | `#F7F5ED` | Projector primary text |

Use semantic classes/tokens. Never communicate state with color alone: pair color with text and an icon.

## Typography

- Primary: Geist or system sans stack, optimized for quick scanning.
- Numeric: tabular numerals for rupiah and leaderboard values.
- Booth/Cashier body minimum: `16px`.
- Primary actions: `18–22px`, semibold.
- Live Display rank and total: oversized, high contrast, no thin weights.
- Avoid serif and decorative display fonts in operational screens.

## Component rules

- Primary touch targets: minimum `64px` height.
- All interactive targets: minimum `48px`.
- Focus ring: `2px` brand ring with visible offset.
- Labels sit above inputs. Error text sits below inputs.
- Use one clear primary action per operational screen.
- Use borders and spacing before shadows. Radius stays moderate and consistent.
- Icons use `@phosphor-icons/react`, consistent stroke weight. No emoji in UI.
- Money displays use `font-variant-numeric: tabular-nums`.

## Status semantics

| State | Visual treatment | Required text/icon |
| --- | --- | --- |
| Available | Green surface, dark green ink | Check icon + `ITEM DISKON TERSEDIA` |
| Taken | Dark charcoal surface, white ink | X icon + `SUDAH DIAMBIL` |
| Pending | Amber accent, neutral surface | Clock icon + `BELUM LUNAS` |
| Paid | Green accent | Check icon + `LUNAS` |
| Offline | Red persistent banner | Warning icon + `OFFLINE — JANGAN BUAT ORDER` |
| Void | Red/neutral | X icon + `VOID` |

## Screen profiles

### Booth

Mobile portrait. Keep participant identity, discount status, order form, progress, and primary action in a single scan path. Status block minimum height `100px`. Header always shows booth, staff, and pickup mode chip. Success screen uses full green field and large sticker code.

### Cashier

Tablet portrait/landscape. Make selected orders and grand total dominant. Total must remain visible while entering approval code. Checkbox state, payment method, and disabled approval state must be unambiguous.

### Admin

Responsive table-first layout. Desktop uses a persistent navigation rail/header and dense filters. Mobile collapses filters into a drawer. Use empty, loading, and error states; preserve table readability without placing every row inside its own card.

### Live Display

Landscape 1920×1080. Dark canvas, bright text, large numerals, strong left/right hierarchy. Animation is limited to rank changes and ticker movement. Respect `leaderboard_enabled` and fullscreen query parameter.

## Motion

- Use short transform/opacity transitions for feedback.
- Use `layout` animation only for leaderboard reordering.
- Never animate `top`, `left`, `width`, or `height`.
- Respect `prefers-reduced-motion: reduce`.
- No perpetual decorative motion in Booth, Cashier, or Admin.

## Responsive checkpoints

Validate at `375px`, `768px`, `1024px`, `1440px`, and `1920×1080`. Test portrait and landscape, safe areas, zoom/largest text, keyboard focus, and dark projector contrast.

## Required states

Every important flow needs loading skeleton, empty state, inline error, offline state, permission denied state, disabled state, success state, and retry behavior where network calls exist.
