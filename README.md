# WowGoals

WowGoals is a mobile-first, local-only personal execution PWA: capture notes → triage → execute tasks/projects and daily routines → review the week.

## Current behavior

- **Notes:** fast multiline capture; direct Edit with Copy text and a clipboard fallback; conversion opens the result with Back to Inbox and safe Undo.
- **Tasks:** named priorities, deadlines independent of planned dates, direct completion with Undo, recoverable discard.
- **Today:** three pinned focus tasks, other due work without duplicate rows, snooze with Undo and daily routine check-ins. Urgent work remains visible despite snooze or paused projects.
- **Projects:** compact summary/count cards; detail popup with the original newline-based checklist, completed items and separate linked Tasks; Complete/Reopen without cascading changes.
- **Goals:** primary metric on cards, quick value updates, full metrics/charts and linked work in details, Achieve/Reopen.
- **Review:** actionable prompts, weekly checklist/reflection and stable completion/history days.
- **Navigation:** Notes, Tasks, Today, Projects, More; More contains Review, Goals and Routines. Entity-specific filters remember your preferences; global search reveals matches without replacing those preferences.
- **Safety:** one-time atomic database upgrade, validated atomic JSON restore, pre-upgrade/pre-import safety snapshots, visible save failures and accessible, dirty-protected dialogs.
- **PWA:** offline shell/assets, manual update handling using installed-worker version, optional sound/themes and date debugging. No account, server, analytics or cloud synchronization.
- **Interface:** calm light theme (WOW remains optional), comfortable cards with visible Created/Updated timestamps, and full-height phone editors with stacked labels, a single scrolling body and an always-reachable Save bar. Discard/Delete are directly accessible and confirmed. The same five destinations become a side rail on wide screens.

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

Browser tests serve the production build on loopback port 4173 under the GitHub Pages base path. They use isolated test data, not your installed app's database. Service workers register only in production builds.

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

See [the product update and migration notes](docs/product-update.md) for every selected decision, exact mappings, safety behavior and validation scope. Persistent browser storage and a PWA installation are not substitutes for an off-device backup.

The [interface update notes](docs/interface-update.md) document the selected review options, phone usability corrections and non-destructive upgrades.
