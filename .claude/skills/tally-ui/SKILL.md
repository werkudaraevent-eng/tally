---
name: tally-ui
description: Tally's UI/UX workflow. Use before designing, mocking up, building or reviewing any Tally screen (admin, event page, participant area, scanner, booth, stage screens) so the work follows DESIGN.md and gets judged on the real render.
---

# Tally UI

Tally is a product with a fixed design system, not a one-off website. Good UI
here means **the right thing in the right place, built from existing
primitives, measured on the real render**. It never means a new look per page.

`DESIGN.md` is the source of truth for palette, type (Inter, M3 type scale),
shape, motion tier and the calm/expressive split per screen. Where any general
design skill or habit (including antislop's "liveliness" dials) pulls another
way, `DESIGN.md` wins. Public event pages take their look from the theme the
organiser picks in the CMS, so do not invent palettes or fonts for them either.

## 1. Judge before building

Before a mockup or code, answer in a few lines:

- **Who sees it, where, doing what?** Use the screen profile in `DESIGN.md`
  (Admin, Halaman acara, Area peserta, Booth, Kasir, layar panggung).
- **Is this the right place?** Placement and information architecture first:
  does it belong on this page, in this section, for this audience? A setting
  lives where the organiser uses it.
- **Can the organiser run it from the CMS** for the next event without a coder?
  Prefer a rule derived from data they already enter (Logistics, Agenda,
  participant fields) over a hardcoded list or one-off placement. If not, say so.
- **Name one reference** that does this well (M3 guidelines, Airbnb,
  Booking.com, airline apps, Eventbrite/Whova, WCAG). Taste alone is not a reason.
- If the request is weak, say so and give ONE recommendation, with a mockup.

## 2. Build from what exists

- Read the matching parts of `DESIGN.md`: the screen profile, "Primitif",
  "Tipografi", the 4/8 grid and card rhythm (4/12/16 gaps).
- If a primitive exists (Button, TextField, SelectField, SelectMenu, Popover +
  POPOVER_ITEM, panels), use it. Do not hand-write classes, even when the
  surrounding old screen does.
- Type comes only from M3 role classes (`text-title-medium`, …), never raw
  Tailwind sizes. Admin controls 36 px; public, participant, booth and scanner
  tap targets at least 48 px.
- New options for existing events default to today's look (0 px change).
  Anything that sends a message is a per-event switch, default off.

## 3. Structure is information

Every border, divider, label, number and eyebrow must say something about the
content. Number items only when they really are a sequence. Do not add a label
above content that the heading already names. Do not chop content into
identical cards when a list reads faster. Spend emphasis in one place per
screen; keep the rest quiet. Expressive motion and big shapes belong only on the
expressive-layer screens `DESIGN.md` lists (lucky draw, leaderboard, voting,
stage).

## 4. Real content and every state

- Mock up with real-shaped content: long names, long venue lines, Bahasa
  Indonesia and English, 0, 1 and many items. Numbers must add up; never invent
  stats, testimonials or counts.
- Show the states `DESIGN.md` requires ("Keadaan yang wajib ada"): loading,
  empty, inline error, offline, permission denied, disabled, success, retry.
- Copy: say what happens ("Save dress code", not "Submit"), keep the same word
  through the flow (button "Publish" -> toast "Published"), errors say what went
  wrong and how to fix it, sentence case. Admin is en-GB; public and participant
  copy follows the event language.

## 5. Look at the render

- Mock up on the real app render (fake data, never real participants), not a
  drawing. Mas reads on a phone: full-page shots, published as an Artifact.
- Check 1280x588 and 390 wide, both themes where they apply, keyboard focus,
  and 0 px change on existing events for each preset that the change touches.
- Measure line gaps and sizes on the render against `DESIGN.md`; fix and look
  again before showing anyone.
- Run the antislop pass (see `CLAUDE.md`) as a filter for generic AI patterns.

## 6. Keep the taste

When Mas approves a visual rule that `DESIGN.md` does not state yet, write it
into `DESIGN.md` in the same PR and list the other screens that do not follow it
yet in `docs/STATUS.md` for a follow-up.

---

Sections 3 and 4 adapt ideas from Anthropic's `frontend-design` skill
(Apache-2.0) and the app-screen rules of `taste-skill` (MIT), narrowed to
Tally's design system.
