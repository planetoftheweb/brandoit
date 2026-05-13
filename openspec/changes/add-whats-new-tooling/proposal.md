# Change: Add What's New Authoring Tooling and Deploy Gate

## Why
The What's New surface ships, but the authoring path is fragile: hand-editing `data/whatsNew.ts` is error-prone (id collisions, malformed sections, missing image paths) and there is no enforcement that a feature release ships with a user-facing entry. CHANGELOG.md may get updated while `whatsNew.ts` is silently forgotten, which is exactly the kind of regression the surface was built to prevent.

## What Changes
- A Cursor skill at `.cursor/skills/whats-new/SKILL.md` captures the authoring conventions, field rules, image guidelines, and verify checklist so any future agent (or contributor) lands the entry consistently.
- A zero-dependency Node ESM script `scripts/whats-new.mjs` exposes two subcommands:
  - `add` — interactive prompt that appends a properly formatted entry to the top of `data/whatsNew.ts`, refusing to clobber an existing version.
  - `check` — non-zero exit when `package.json`'s `major.minor` has no matching entry in `data/whatsNew.ts`. Patch releases pass automatically because the parent minor entry covers the whole `x.y.*` line.
- `npm run whats-new` is the human-facing entry point for the scaffolder.
- `npm run whats-new:check` is the human-facing entry point for the gate.
- The gate runs automatically as `prebuild`, so both local `npm run build` and Render's production build refuse to ship a feature release without a What's New entry.
- An escape hatch (`SKIP_WHATS_NEW_CHECK=1`) exists for genuine one-offs like hotfixes on old branches.

## Impact
- Affected files: new `.cursor/skills/whats-new/SKILL.md`, new `scripts/whats-new.mjs`, edited `package.json` (3 new scripts incl. `prebuild`).
- Affected workflows: every local `npm run build` and every Render deploy now runs the version-vs-entry consistency check; `npm run whats-new` becomes the recommended authoring path.
- Affected data: none directly — the script edits `data/whatsNew.ts` only when invoked by the user.
- Affected docs: CHANGELOG.md gains an entry; `.cursor/skills/whats-new/SKILL.md` becomes the single skill reference for the authoring flow.
- Operational considerations: contributors who patch-bump (`0.16.1` → `0.16.2`) are not interrupted; only minor / major bumps without a matching entry trip the gate. The bypass env var is intentionally noisy (printed at the top of every skipped run) so it's hard to leave on by accident.
