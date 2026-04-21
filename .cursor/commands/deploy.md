Ship a new release of BranDoIt Studio. Running this command is explicit authorization to commit, push, and deploy (overriding the "don't push / don't deploy unless asked" development-workflow rule).

1. Sanity-check the source. Run `npm run check:no-native-selects` (enforces RichSelect usage). If it fails, stop and report the offending files.
2. Run `npm run build`. If the build fails, stop and report the errors.
3. Determine the appropriate semver bump based on changes since the last entry in `CHANGELOG.md`:
   - **patch** (0.0.X): bug fixes only
   - **minor** (0.X.0): new features, UI changes, new components/services
   - **major** (X.0.0): breaking changes (Firestore schema, auth contract, public API)
4. Update the `version` field in `package.json` to the new version.
5. Update `CHANGELOG.md`:
   - Move everything currently under `## [Unreleased]` into a new `## [X.Y.Z]` section dated today, keeping the `Added` / `Changed` / `Fixed` / `Removed` grouping from [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
   - Add any newly-noticed entries from `git log` / `git diff` since the previous version tag so the section is comprehensive.
   - Leave a fresh empty `## [Unreleased]` section at the top for future work.
6. If notable user-visible features were added, update the `## Features` list in `README.md` so it stays in sync with reality.
7. If Firestore or Storage access patterns changed, output the updated rules as a copyable code block in the chat — do NOT write `firestore.rules` / `storage.rules` files to the repo (per `AGENTS.md` guideline 5).
8. Stage and commit all changes (code, `package.json`, `CHANGELOG.md`, any `README.md` edits) with a conventional commit message, e.g. `chore(release): 0.1.3 — batch tile grouping + thumbnail rail`.
9. Push the branch to the remote: `git push`.
10. Create a GitHub release with `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <file>`, where `<file>` is the body of the new `## [X.Y.Z]` section extracted from `CHANGELOG.md` (not the whole file).
11. Deploy via the Render MCP (`user-render`):
    - First confirm the server is healthy; if it reports an error, stop and surface it before touching production.
    - Trigger a new deploy of the Brandoit static-site service.
    - Do NOT fall back to FTP — that's the separate `deploy-ftp-git` flow for other projects.
12. Report back the new version, the GitHub release URL, and the Render deploy URL / status so I can verify the release.
