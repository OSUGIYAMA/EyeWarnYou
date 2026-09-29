# Kanmon interface design

Design is how it works. Every screen answers one question, shows the answer first, and makes the next action obvious. The look follows Apple's platform conventions so that it feels familiar, calm and trustworthy — a tool for people who read regulations all day, not a dashboard.

## Principles

1. **Start from the question the user came with.** "Can this shipment go?", "Is this company restricted?", "What is changing that affects me?" The home screen offers these as doors; every page title is phrased around its question.
2. **Answer first, reasons on demand.** The verdict is the largest thing on a case page. Findings, citations and passed checks sit beneath it and expand when asked.
3. **One next step.** Wherever work is unfinished, show a single primary action that says exactly what to do ("Answer 2 questions", "Review 1 possible match"). Never two blue buttons on one screen.
4. **Colour means something.** The interface is near-monochrome. Colour appears only on the symbol that carries a status (red = prohibited / blocked, orange = licence required / warning, yellow = exception, green = clear) and on the single accent used for interaction (blue). Text stays in ink.
5. **Typography and lines, not boxes.** Hierarchy comes from size and weight; the screen is divided by hairlines into full-width bands and rows. No floating cards, no shadows, no card inside a card. Rounding is reserved for things you can press (buttons, fields, segmented controls, chips) and for overlays.
6. **Plain words.** Sentence case everywhere. No uppercase eyebrow labels, no marketing tone, no emoji. Legal terms (ECCN, 項番, 外為法) appear exactly as the law writes them, explained once, in place.
7. **Progressive disclosure.** Show what most people need; tuck the rest behind a disclosure, a sheet or a tooltip.

## Layout

- White canvas `bg-bg`; the sidebar is the only tinted surface (`bg-sidebar`, #f5f5f7). Content groups (`Card`/`Group`) are bands bounded by top and bottom hairlines — no radius, no shadow.
- Page container: `Page` (max 1080 px, `wide` 1400 px) with 40 px top padding.
- Page title: `PageHeader` — 30 px bold, optional one-sentence description in 15 px secondary ink.
- Sections: `Section` — 17 px semibold title *above* the group, optional description; actions on the right.
- Lists: rows inside a group, separated by inset hairlines (`k-list` class on the container). Rows are 44 px minimum, text 14 px, secondary line 12.5–13 px in `text-fg-2`.
- Spacing: 8-pt grid. Groups are separated by 32 px (`space-y-8`) between sections.

## Type scale (system font, SF Pro on Apple platforms)

| Role | Class |
|---|---|
| Large title | `text-[30px] font-bold tracking-[-0.022em]` |
| Title | `text-[22px] font-semibold tracking-tight` |
| Section heading | `text-[17px] font-semibold tracking-tight` |
| Body | `text-[14px]` |
| Secondary | `text-[13px] text-fg-2` |
| Footnote / caption | `text-[12px] text-fg-3` |

Monospace (`font-mono`) only for identifiers that are read character by character: ECCNs, HS codes, CFR paragraph references.

## Colour tokens

Ink: `text-fg`, `text-fg-2`, `text-fg-3`. Surfaces: `bg-bg` and `bg-panel` (both white), `bg-panel-2` (small inset wells), `bg-fill` / `bg-fill-2` (translucent control fills). Lines: `border-line` (hairline), `border-line-strong`. Accent: `bg-accent`, `text-accent-text`. Status: `red`, `orange`, `amber`, `green` with `-soft` and `-text` variants — for symbols and very small tags only.

## Components (src/web/components/ui)

- `Button` — pill. `primary` (blue, one per view), `secondary` (grey fill), `ghost` (blue text; for inline actions), `danger`.
- `Segmented` and `Tabs` — iOS segmented control; use for switching views within a page.
- `AnswerToggle` — No / Yes segmented control; unanswered shows neither selected.
- `OutcomePill` — coloured dot + label in ink. `OutcomeIcon` — large filled glyph for a verdict. `StatusDot` — per-finding glyph (✕, ⚠, ○, ✓, ⓘ).
- `Badge` — small tinted tag; use sparingly (list names, counts), never several per row.
- `Input`, `Select`, `Textarea` — filled fields that turn white with a blue focus ring.
- `Dialog` (centred sheet), `Sheet` (side panel), `Tooltip`, `Empty` (large thin icon, 17 px title, one sentence, one action).

## Voice

Write the way a senior compliance officer would explain it to a colleague: short, specific, calm. Prefer verbs ("Screen parties", "Answer questions") over nouns ("Screening", "Questionnaire"). Numbers are exact. Never say "AI-powered"; say what the model does ("Drafts a classification from the datasheet") and that a person decides.
