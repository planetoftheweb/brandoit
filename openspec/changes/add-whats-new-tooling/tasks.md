# Tasks: Add What's New Authoring Tooling and Deploy Gate

## 1. Skill — Authoring conventions
- [x] 1.1 Author `.cursor/skills/whats-new/SKILL.md` with frontmatter (`name`, `description`) tuned for proactive use when shipping user-facing features or bumping minor / major.
- [x] 1.2 Document the four surfaces (bell, spotlight, discovery, detail) and the single source of truth (`data/whatsNew.ts`).
- [x] 1.3 Document field rules: `id` uniqueness, `summary` vs `blurb`, `publishedAt` ISO format, `version` matching `package.json`, sparing use of `featured`, allowlisted icon names, `kbd` chip format.
- [x] 1.4 Document image rules (16:9, ~1024×576, location under `public/whats-new/`).
- [x] 1.5 Document the deploy gate (`prebuild` runs `check`) and the `SKIP_WHATS_NEW_CHECK=1` escape hatch.
- [x] 1.6 Include a verify checklist and a files-at-a-glance table.

## 2. Script — `scripts/whats-new.mjs`
- [x] 2.1 ESM, Node 22+, zero new dependencies (uses `node:fs/promises`, `node:readline/promises` only).
- [x] 2.2 Subcommand `check`: read `package.json` version, regex-extract `version: '...'` entries from `data/whatsNew.ts`, compare on `major.minor`, exit non-zero with actionable error when missing.
- [x] 2.3 Subcommand `check`: honor `SKIP_WHATS_NEW_CHECK` env var.
- [x] 2.4 Subcommand `add`: interactive prompts (`readline/promises`) for version, title, summary, blurb, slug (defaulted from title), image path, featured flag, sections (heading + body + steps with optional icon / kbd).
- [x] 2.5 Subcommand `add`: reject duplicate version with a clear error before any write.
- [x] 2.6 Subcommand `add`: insert the new entry at the very top of the `WHATS_NEW` array (newest-first convention), using TS-safe escaping (`'` → `\'`, `\` → `\\`).
- [x] 2.7 Subcommand `add`: print next-step guidance (image drop path, build verification, CHANGELOG twin entry, featured-modal heads-up).
- [x] 2.8 Robustness: abort with a clear error if the array-opening anchor isn't found (file refactored).

## 3. Wiring — `package.json`
- [x] 3.1 Add `prebuild` script that runs `node scripts/whats-new.mjs check`.
- [x] 3.2 Add `whats-new` script (`add` subcommand) as the human-facing scaffold entry point.
- [x] 3.3 Add `whats-new:check` script (`check` subcommand) for ad-hoc validation.
- [x] 3.4 Preserve the existing `check:no-native-selects` script ordering / behavior.

## 4. Verification
- [x] 4.1 `npm run whats-new:check` exits 0 against the current `data/whatsNew.ts` (`package.json` v0.15.1, `0.15.0` entry covers `0.15.x`).
- [x] 4.2 `npm run build` succeeds end-to-end (gate + Vite bundle).
- [x] 4.3 CHANGELOG.md gains an entry describing the new tooling.

## 5. OpenSpec
- [x] 5.1 Author `openspec/changes/add-whats-new-tooling/proposal.md`.
- [x] 5.2 Author `openspec/changes/add-whats-new-tooling/specs/whats-new-tooling/spec.md`.
