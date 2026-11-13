# WowGoals

WowGoals is a mobile-first, local-only personal execution PWA: capture notes → triage → execute tasks/projects and daily routines → review the week.

## Current behavior

- **Notes:** Inbox / Pinned / Archived, basic Markdown descriptions, expandable ten-line previews, Copy text with a clipboard fallback, and conversion with safe Undo.
- **Tasks:** To do / Active / Completed / Archived, named priorities, deadlines independent of planned dates, direct completion with Undo, expandable descriptions.
- **Today:** three pinned focus tasks, other due work without duplicate rows, snooze with Undo and daily routine check-ins. Urgent work remains visible despite snooze or archived projects.
- **Projects:** compact summary/count cards; detail popup with the original newline-based checklist, completed items and separate linked Tasks; Complete/Reopen without cascading changes.
- **Goals:** Active / Completed / Archived, primary metric on cards, quick value updates, full metrics/charts and linked work in details.
- **Routines:** On / Completed today / Archived views. Daily completion resets at the configured day boundary without removing history.
- **Review:** actionable prompts, weekly checklist/reflection and stable completion/history days.
- **Navigation:** Notes, Tasks, Today, Projects, More; More contains Review, Goals and Routines. Entity-specific filters remember your preferences; global search reveals matches without replacing those preferences.
- **Safety:** one-time atomic database upgrade, validated atomic JSON restore, pre-upgrade/pre-import safety snapshots, visible save failures and accessible, dirty-protected dialogs.
- **PWA:** offline shell/assets, manual update handling using installed-worker version, optional sound/themes and date debugging. No account, server, analytics or cloud synchronization.
- **Interface:** light and WOW themes restored during startup, compact spacing with visible Created/Updated timestamps, and full-height phone editors with an always-reachable Save bar. Archive is reversible; Delete is permanent after confirmation. All items remains available in every category.

## Development

Requires Node.js 22.12+ (Node 24 recommended).

```bash
npm ci
npm run dev
```

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit
```

Browser tests serve the production build on loopback port 4173 under the GitHub Pages base path (`PLAYWRIGHT_PORT=4183 npm run test:e2e` selects another port). They use isolated test data, not your installed app's database. Service workers register only in production builds.

## Organization

- `src/App.tsx`: screen/dialog orchestration.
- `src/state/`: commands, lifecycle/filter/sorting rules, history, device/PWA hooks and targeted React state updates.
- `src/db/`: IndexedDB transactions, one-time migration and backup validation.
- `src/features/`: tab-level UI; `src/components/`: shared dialogs/editors/controls.
- `src/styles/`: theme, layout, shared component and feature styles.
- `tests/`: migration/command regression tests and production browser tests.

## Deployment and transition

```bash
npm run deploy
```

Publishes to `https://hostile-entity.github.io/wow-goals/`.

**Before this update, export your existing data to a file.** The new app upgrades the existing IndexedDB once, in one transaction, and keeps an exportable original snapshot. Close old app tabs/windows so they do not block the upgrade. Do not clear browser storage or redeploy the old build after transitioning.

The current schema-5 release and exact one-time status migration are documented in [status update and migration safety](docs/status-update.md).

See [the product update and migration notes](docs/product-update.md) for every selected decision, exact mappings, safety behavior and validation scope. Persistent browser storage and a PWA installation are not substitutes for an off-device backup.

The [interface update notes](docs/interface-update.md) document the selected review options, phone usability corrections and non-destructive upgrades.
