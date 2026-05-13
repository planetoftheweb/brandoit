# Spec: What's New Authoring Tooling

## 1. Cursor Skill
- 1.1 A markdown skill at `.cursor/skills/whats-new/SKILL.md` MUST exist and MUST include a YAML frontmatter block with `name: whats-new` and a `description` written for proactive invocation (covers: adding a user-visible feature, bumping minor / major, encountering the prebuild gate, or being asked about the bell content origin).
- 1.2 The skill body MUST document the four surfaces backed by `data/whatsNew.ts` (bell dropdown, spotlight modal, discovery page, detail page) and identify the single source-of-truth file.
- 1.3 The skill body MUST document the full `WhatsNewEntry` schema including `id`, `title`, `summary`, `blurb`, `publishedAt`, `version`, `image`, optional `featured`, and optional `sections` (with `heading`, `body`, `steps[]`), and MUST call out the icon allowlist resolved by `WhatsNewPage`'s `ICON_MAP`.
- 1.4 The skill body MUST describe the image rules (16:9 ratio, recommended ~1024×576 resolution, path under `public/whats-new/`) and explain why the bell thumbnail (144×80) and hover overlay (~288 wide) determine the minimum useful resolution.
- 1.5 The skill body MUST describe the deploy gate (`prebuild` → `node scripts/whats-new.mjs check`) and MUST document the `SKIP_WHATS_NEW_CHECK=1` escape hatch and when it is acceptable to use.
- 1.6 The skill body MUST include a verify checklist covering: `npm run build` passes, bell shows the new row, hover overlay anchors to the row, detail view renders sections, spotlight fires once (when featured) and remembers dismissal, CHANGELOG mirrors the release.

## 2. Scaffolder Script (`add` subcommand)
- 2.1 `node scripts/whats-new.mjs add` MUST run as ESM under Node 22+, with no dependencies outside `node:` builtins.
- 2.2 The scaffolder MUST prompt for, in order: version (default = `package.json` version), title, summary, blurb, slug (default derived from title), image path (default `/whats-new/whatsnew-v<version>.png`), featured flag (default `false`), and optional instructional sections.
- 2.3 The scaffolder MUST refuse to overwrite an existing entry: when a `version: '<version>'` already appears in `data/whatsNew.ts`, the script MUST exit non-zero with an actionable error and MUST NOT modify the file.
- 2.4 Each section prompt MUST loop until the user supplies an empty heading, and each step prompt within a section MUST loop until the user supplies empty text. Both step `icon` and step `kbd` MUST be optional and only emitted into the output when non-empty.
- 2.5 The scaffolder MUST insert the new entry as the FIRST element of the `WHATS_NEW` array (immediately after `export const WHATS_NEW: WhatsNewEntry[] = [`) to preserve the newest-first ordering convention.
- 2.6 The scaffolder MUST TS-escape user input before writing: single quotes become `\'` and backslashes become `\\`. Non-ASCII punctuation (smart quotes, em-dash) MAY be passed through unchanged.
- 2.7 On success, the scaffolder MUST print: where the entry was added, the expected public path for the hero image, and the recommendation to run `npm run build` and update CHANGELOG.md. If `featured: true` was selected, it MUST also note that the spotlight modal will auto-open on next app load.
- 2.8 The scaffolder MUST abort with a clear error if the array-opening anchor (`export const WHATS_NEW: WhatsNewEntry[] = [`) is missing from `data/whatsNew.ts`, rather than risk corrupting the file.

## 3. Deploy Gate (`check` subcommand)
- 3.1 `node scripts/whats-new.mjs check` MUST read `package.json`'s `version` field, extract every `version: '...'` value from `data/whatsNew.ts`, and compare on `major.minor` only.
- 3.2 The check MUST exit 0 (with an OK log line) when at least one entry in `data/whatsNew.ts` shares the package's `major.minor`.
- 3.3 The check MUST exit non-zero with an actionable error pointing at `npm run whats-new` when no entry matches the package's `major.minor`.
- 3.4 The check MUST honor the `SKIP_WHATS_NEW_CHECK` environment variable: when set to any truthy value, the check MUST log that it was bypassed and exit 0 without further analysis.
- 3.5 The check MUST tolerate a `version` string that includes pre-release or build metadata (e.g. `0.17.0-rc.1`) by comparing only `parts[0].parts[1]`.

## 4. npm Script Wiring
- 4.1 `package.json` MUST declare these scripts: `prebuild` (runs `check`), `whats-new` (runs `add`), `whats-new:check` (runs `check`).
- 4.2 `npm run build` MUST execute the `check` subcommand before Vite begins bundling, so a failing gate aborts the build immediately.
- 4.3 The existing `check:no-native-selects` script MUST be preserved unchanged.

## 5. Operational Invariants
- 5.1 The gate MUST NOT block patch-only bumps: when `package.json` advances from `0.17.0` to `0.17.1` (the minor is unchanged), the existing `0.17.0` entry MUST satisfy the check.
- 5.2 The gate MUST trip on every minor and major bump that has not been accompanied by a new entry, regardless of whether CHANGELOG.md has been updated.
- 5.3 The scaffolder MUST be re-runnable: invoking `npm run whats-new` while an entry already exists for the requested version is a guaranteed no-op write (early non-zero exit per 2.3).
