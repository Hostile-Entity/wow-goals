# Product update and single-user transition

Historical schema-2 release notes. For the current one-time schema-5 upgrade, see [status update and migration safety](status-update.md).

Implements the choices exported on 12 November 2026 in the local decision workbook. The application remains a local-only, single-user PWA; there are no accounts, cloud services, notifications, parallel old/new models, or sync infrastructure.

## Implemented choices

| Decision | Implemented direction |
| --- | --- |
| 01 C | Select a note to reveal Copy / Manage. Copy includes title and all description lines; denied clipboard access offers selectable text. |
| 02 A | Compact project cards: separate short description and remaining TODO count. |
| 03 A | Detail-first project popup, checklist, add/edit/toggle, completed disclosure and linked Tasks. Metadata editing is separate. |
| 04 A | Complete/reopen projects; warn about unfinished checklist and linked Tasks; never cascade completion. |
| 05 Keep | The original description-line TODO format is retained, separately from linked Tasks. No prose/TODO guessing or conversion. |
| 06 Keep | Tasks are still completed through Manage or Today. No inline task-list completion redesign. New completion writes are idempotent for safety; existing completion history is untouched. |
| 07 A | Convert the current note draft, keep destination provenance, Open result and safe Undo. Undo refuses to remove a destination that has changed or acquired work. |
| 08 A | Entity-specific lifecycle statuses and actions. Notes have inbox/reference/processed statuses, not a new library/tagging system. |
| 09 A | Applicable filters only, open defaults, remembered preferences. Search reveal is temporary and does not save over a preference. |
| 10 A | Three explicitly pinned focus tasks and a separate overdue/due-today section, details and all-task access. |
| 11 A | Separate scheduled/snoozed date, tomorrow/next week/custom choices, deadline unchanged and schedule Undo. |
| 12 A | High/Normal/Low priorities, default Normal, original numeric rank retained as a tie-breaker. |
| 13 Keep | No Saved library, pins, tags or batch note triage. Existing status filtering remains. |
| 14 Keep | Daily routine check-ins remain. No weekday/frequency scheduling or reminders. Pause comes from choice 08; stable review history comes from 17. |
| 15 A | Primary metric on the card; quick update in details. Full metrics, configuration and charts remain accessible there. |
| 16 A | Goal details with open/historical linked work and manual Achieve/Reopen; child work stays unchanged. Task-goal links remain explicit, not inherited. |
| 17 A | Actionable review prompts, retained checklist/reflection, stable saved completion days and net project TODO transitions. Pausing/completing does not remove historical rows; deleted items with activity get historical placeholders. |
| 18–20 Keep | Five-tab navigation, search-to-card behavior, card metadata, themes, sound and settings organization remain. |
| 21 A | Validate a complete backup before writing; preview counts and missing links, offer an export, retain a local safety snapshot, restore in one transaction. |
| 22 A | Remain local-only, request persistent storage where supported, explain its limits and show backup freshness in Settings. |
| 23 A | Atomic writes plus targeted state updates. Normal edits read only affected stores, not all logs/history. Full snapshots are used for startup, import/export and peer-tab invalidation. |
| 24 A | Shared native modal dialogs, focus containment/return, Escape/backdrop handling, dirty-close protection, pending states and retryable errors. Stale editor saves are refused rather than silently overwriting another view. |
| 25 A | Remove unused ManageModal/prompt helpers; refresh documentation; add regression tests. |
| 26 A | Upgrade Vite/plugin and vulnerable tooling dependencies. Audit is checked independently from build success. |
| 27 C | Keep manual updates; version comes from the controlling installed worker, never fetched remote code. Test production offline reload and waiting-worker update. Preserve capture drafts across explicit reloads. |

## Database transition

The IndexedDB name remains **`wow-goals-db`**. The data/backup schema changes from **1 to 2**. A normal version-1 database advances to physical IDB version 2. The old app could also self-repair missing stores by increasing its physical version; if that happened, the upgrade advances that existing version instead of mistaking its still-v1 records for migrated data. The new `meta` store identifies a completed transition. There is one v1-to-v2 migration in `src/db/schema.ts`, run only inside IndexedDB's version-change transaction. The current app operates on v2 records exclusively.

- Store a complete, unchanged pre-upgrade snapshot in `meta/pre-v2` before the transaction commits. Export it in **Settings → Data Management → One-time transition and restore safety**.
- Preserve IDs, titles, multiline text (including spaces/blank lines), links, creation/update timestamps, metrics, weekly reviews, completions and audit events. Do not clear stores as part of the upgrade.
- Preserve the entire project `description` as its TODO source; initialize the new `summary` to empty. Add a prose short description later through Edit project. All existing non-empty lines keep their original TODO meaning.
- Notes: active/in-progress → inbox; completed → processed. Tasks: active → open, in-progress → doing, completed → done. Projects: active → planned, in-progress → active, inactive boolean → paused, completed → done. Goals: active/in-progress → active, completed → achieved. Routines: non-discarded → enabled. Discarded records remain discarded.
- Task priorities map 1 → High, 2 → Normal, 3+ → Low. Save the original number as `legacyPriority`, used to retain relative order within the mapped group. New tasks default to Normal. Urgency-first ordering is an intentional selected change, not accidental migration reordering.
- Keep existing deadlines exactly. The old app already moved them when postponing; recovering original deadlines would require guessing. Set a separate schedule from the last recorded postponement where available. Future snoozes never alter deadlines.
- Keep saved completion `date` values as authoritative. Existing project TODO events receive a fixed logical day based on the pre-upgrade day boundary; changing the boundary later does not reinterpret those events. Their original bytes remain in the safety snapshot.
- Any migration failure aborts **all** writes, the snapshot and the schema version change. Retrying does not apply a partial migration or duplicate items. The loading error never resets the database.
- An old open tab can block the version upgrade. Close the other WowGoals tabs/windows and retry; do **not** clear browser data. New-version connections close automatically when another database version is requested.
- Keep support for importing this user's existing v1 export and the pre-upgrade snapshot. This is a recovery path, not support for running the old app alongside the new one. Do not deploy the old build after this transition.

### Release precaution

Before deploying, download a JSON export from the currently installed app. After deployment, close old app windows, open the new build online once and verify your project/note counts. The automatic original snapshot provides an additional recovery copy but shares the device's storage; it is **not** an off-device backup.

Restore validates the app identifier, schema, required stores, duplicate IDs, statuses, fields, dates, metric shape and reference types before opening a write transaction. Dangling references created by the old permanent-delete behavior are counted/warned about and preserved, not used as a reason to delete otherwise valid items. A `meta/pre-import` snapshot is committed atomically with a successful replacement; a failed replacement preserves the old data and its prior safety snapshot. Explicit **Delete all data** also removes these snapshots.

## Validation

`npm test` exercises migration (including old explicit-key stores), migration failure/rollback/retry, fresh initialization, backup validation, v1/v2 round trips, failed restore rollback, targeted reads, provenance/undo, repeated task completion, child-work preservation, deadline/priority behavior and net logical-day history.

`npm run build` followed by `npm run test:e2e` tests the built production bytes under `/wow-goals/` in desktop Chromium and a Pixel-sized Chromium context. Coverage includes the real IndexedDB transition, checklist editing, completion/reopening, clipboard copy and draft conversion, focus/snooze/Undo, goal updates/chart/achievement, persisted filters, search reveal, native dialog keyboard/dirty protection, backup restore, first-install offline reload and a real service-worker update from a waiting worker. `tests/serve-production.mjs` changes only the in-memory worker version during that test, not app source files.

Tests use representative synthetic data and isolated browser storage. They do not read or alter the user's deployed database. Browser/device quota failures, power loss and every iOS/Safari behavior cannot be guaranteed by this test suite; atomic IndexedDB transactions and off-device backup remain the safeguards.

### Final verification results

- `npm test`: **31 passed**.
- `npm run build`: **passed** (TypeScript and Vite production build).
- `npm run test:e2e`: **26 passed**, covering 13 scenarios in desktop Chromium and Pixel-sized Chromium emulation.
- `npm audit --audit-level=low`: **0 vulnerabilities**.
- `git diff --check`: **passed**.
- Real-browser failure injection confirms a failed upgrade leaves the physical v1 database and original notes intact, with no partially created metadata store; retry succeeds after the simulated failure is removed.
- Browser checks also cover blocked old connections, clipboard denial fallback, keyboard-only note submission, normal save failure/retry, stale editor protection, fresh task/project/goal/routine creation, weekly review persistence and explicit full reset.

This validates the code and representative transitions, not an inspection of the sole user's actual deployed data, which was not provided. Nothing was published or deployed as part of this work.
