---
name: whats-new
description: Author and ship a What's New entry for BranDoIt — the user-facing release surface that drives the header bell dropdown, the spotlight modal, the discovery page, and per-release detail guides. Use when adding a user-visible feature, bumping the minor or major version, or when `npm run build` fails the `whats-new:check` prebuild gate. The companion script `scripts/whats-new.mjs` does the heavy lifting; this skill explains the conventions, fields, image rules, and verify checklist around it so the result lands consistently.
---

# Skill: Author a What's New entry

BranDoIt surfaces every user-facing release through a single curated content
file. There are four surfaces, but only one source of truth — get the entry
right and every surface updates correctly.

## When to use this skill

Open this skill when ANY of these is true:

- You're shipping a user-visible feature, behavior change, or UX polish that
  a returning user would want to know about.
- You're about to bump `package.json` from a `.0` patch to a new minor or
  major (e.g. `0.15.x` → `0.16.0`).
- `npm run build` failed with `[whats-new] No entry found for vX.Y.x` — that's
  the deploy gate kicking in.
- Someone asked "how do I add a What's New entry" or "where does the bell
  content come from".

**Do not** use this skill for engineering-only changes (refactors, dependency
bumps, internal renames). Those belong in `CHANGELOG.md` only.

## How the surface works

| Surface | File | When it shows up |
|---|---|---|
| Header bell dropdown | `components/WhatsNewBell.tsx` | Always available; red badge when newer than last seen |
| Spotlight modal | `components/WhatsNewSpotlight.tsx` | Auto-opens once per user when the newest `featured: true` entry hasn't been dismissed |
| Discovery + detail page | `components/WhatsNewPage.tsx` | Opens when the user clicks any row, "View all updates," or visits `?whatsnew=<id>` |
| Source of truth | `data/whatsNew.ts` | One array, newest first; the file the script edits |

State persistence: `lastSeenWhatsNewId` and `dismissedSpotlightIds` live in
`UserPreferences` for signed-in users and `localStorage` for guests, wired
through `hooks/useWhatsNew.ts`.

## Authoring workflow (preferred path: the script)

From the repo root:

```bash
npm run whats-new
```

The interactive prompt asks for version, title, summary, blurb, image path,
featured flag, and (optionally) instructional sections with steps. It
appends a properly formatted entry to the top of `data/whatsNew.ts`. The
script aborts if an entry already exists for that version, so re-runs are
safe.

After running:

1. Drop the hero image at the path the script printed (default
   `public/whats-new/whatsnew-v<version>.png`).
2. `npm run build` to confirm the prebuild gate passes and the bundle is
   clean.
3. Update `CHANGELOG.md` with the same release — keep CHANGELOG as the
   engineering voice; `whatsNew.ts` is the user voice.

## Authoring workflow (fallback: by hand)

If the script isn't an option, append to the **top** of the `WHATS_NEW`
array in `data/whatsNew.ts` (entries are newest-first). Use this shape:

```ts
{
  id: 'v0.17.0-some-slug',                       // unique, kebab-case, version-prefixed
  title: 'Concise sentence-case headline',        // 1 line, no trailing period
  summary: 'One short sentence shown in the bell.', // ~70 chars; the bell line-clamps to 2 lines
  blurb:
    'One paragraph that stands on its own. Used in the spotlight modal and the discovery grid cards, so it should make sense without any of the sections below.',
  publishedAt: Date.parse('2026-05-15T22:00:00Z'),
  version: '0.17.0',                              // must match the package.json bump
  image: '/whats-new/whatsnew-v0.17.0.png',       // 16:9, see image rules below
  featured: true,                                 // omit unless this is a headline release
  sections: [
    {
      heading: 'Headline for this chunk of instructions',
      body: 'Context paragraph for the section. Keep it human.',
      steps: [
        { text: 'A concrete action with a verb.', icon: 'Bell' },
        { text: 'Step that mentions a keyboard shortcut.', kbd: 'Cmd+K' },
        { text: 'Step without any chrome.' },
      ],
    },
  ],
},
```

### Field rules

- **`id`** — `v<version>-<slug>`. The script enforces uniqueness; if you
  edit manually, search the file to confirm no collision.
- **`summary`** vs **`blurb`** — `summary` is one sentence (the bell line);
  `blurb` is one paragraph (the spotlight and discovery cards). Both
  required.
- **`publishedAt`** — the deep-link router and "last seen" comparison rely
  on this being a real `Date.parse(...)`-able ISO string. Use UTC.
- **`version`** — the `major.minor` half MUST match `package.json` for the
  deploy gate to pass. Patch differences (`0.17.0` covers `0.17.x`) are
  fine.
- **`featured`** — omit for default. Only set `true` when the change is
  worth interrupting the home screen with a spotlight modal. Most entries
  should NOT be featured.
- **`sections`** — optional. If present, the detail page renders them.
  Section bodies are paragraphs; steps are numbered. Icons in steps must
  be names allowlisted in `WhatsNewPage.tsx`'s `ICON_MAP` (a small set of
  Lucide icons); unknown names fall back to a neutral help glyph.
- **`kbd`** on a step renders as a styled keycap chip (e.g. `Cmd+K`,
  `Esc`). Use `+` separators, no spaces.

### Image rules

- Aspect ratio: 16:9 (the bell thumbnails, spotlight hero, and grid cards
  all assume this).
- Resolution: ~1024×576 is plenty; the bell thumbnail is rendered at
  144×80, the floating overlay at ~288×162. Going much above 1280px wide
  bloats first-paint without visible gain.
- Location: `public/whats-new/whatsnew-v<version>.png` (or `.jpg` /
  `.webp`). Path in the entry starts with `/whats-new/...` because Vite
  serves `public/` from the site root.
- Style: keep them on-brand (brand teal / orange / red palette, optional
  artwork) and avoid embedded text that won't scale at thumbnail size.

## How the deploy gate works

`npm run build` runs `prebuild` first, which executes
`node scripts/whats-new.mjs check`. The check:

1. Reads `version` from `package.json`.
2. Reads all `version: '...'` entries from `data/whatsNew.ts`.
3. Fails with a non-zero exit if no entry shares the current `major.minor`.

This runs both locally (catches you before push) and on Render (catches
you before deploy). If you genuinely need to bypass for a one-off (e.g.
hotfix on an old branch), set `SKIP_WHATS_NEW_CHECK=1` for that build.

## Verify checklist

Before considering the entry "done":

- [ ] `npm run build` passes (gate + bundle).
- [ ] In `npm run dev`, the bell shows the new row at the top with the
      thumbnail rendered (not the Sparkles fallback).
- [ ] Hovering the new row floats the larger preview to the left of the
      dropdown, anchored vertically to the row.
- [ ] Clicking the row opens the detail view on `WhatsNewPage` with the
      sections rendered.
- [ ] If `featured: true`, the spotlight modal opens once on app load and
      the "Read the guide →" CTA opens the detail view.
- [ ] If `featured: true`, dismissing it (Esc, backdrop, or "Got it")
      doesn't re-fire on the next reload for the same user.
- [ ] `CHANGELOG.md` mentions the release in engineering voice.

## Files at a glance

| Purpose | Path |
|---|---|
| Content (single source of truth) | `data/whatsNew.ts` |
| Bell dropdown | `components/WhatsNewBell.tsx` |
| Spotlight modal | `components/WhatsNewSpotlight.tsx` |
| Discovery + detail page | `components/WhatsNewPage.tsx` |
| State + persistence | `hooks/useWhatsNew.ts` |
| Types | `types.ts` (`WhatsNewEntry`, `WhatsNewSection`, `WhatsNewStep`) |
| Scaffolder + deploy gate | `scripts/whats-new.mjs` |
| Engineering changelog | `CHANGELOG.md` |
