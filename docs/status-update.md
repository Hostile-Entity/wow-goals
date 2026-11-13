# Status update and one-time migration safety

This is a one-time upgrade for the existing single user's installation, not a second database or parallel old/new application. The IndexedDB name remains `wow-goals-db` and the GitHub Pages origin/path remain unchanged.

## Current views

| Category | Views (plus All items everywhere) |
| --- | --- |
| Notes | Inbox, Pinned, Archived |
| Tasks | To do, Active, Completed, Archived |
| Projects | Planned, Active, Completed, Archived |
| Goals | Active, Completed, Archived |
| Routines | On, Completed today, Archived |

Routine completion is recorded for a logical day, not as a permanent status. It resets in the daily views at the configured day boundary; old completion records remain. Pinned notes sort first in All items. Archive is reversible. Delete removes an item permanently after confirmation; there is no Trash view or recovery action.

## Upgrade behavior

- Schema 5 remaps `processed`, `paused`, and `discarded` to `archived`. No old Trash records are deleted automatically.
- Existing Saved notes retain their stable `reference` storage ID and become Pinned in the interface. Task `doing` is labeled Active; goal `achieved` is labeled Completed.
- IDs, titles, complete description/TODO source text, timestamps, links, metrics, schedules, priorities, reviews, completion records, and logs are retained. Conversion links and previous-note-status provenance survive.
- The entire unchanged pre-upgrade data is saved to `meta/pre-v5`, exportable from **Settings → Data Management → One-time transition and restore safety → Export pre-status-upgrade data**. Earlier safety snapshots remain intact.
- Snapshot, status changes, and a `status-schema` completion marker are committed in the same IndexedDB version-change transaction. A failed write or quota error rolls back the version, all data writes, and metadata. The app displays an error and Retry, never silently resets storage.
- Subsequent launches read the marker and do not migrate or rewrite data again. The marker also handles old installations whose physical IDB version was previously increased by store repairs.
- Existing schema 1–4 JSON exports remain importable, with validation before the atomic restore. Earlier v1 data takes its original priority/status migration once before the final status mapping.

## Single-user update checklist

1. Before updating, export JSON from the installed app and keep the file outside browser storage.
2. Apply the update online, close old app tabs/windows if the database upgrade is blocked, then reopen the new app.
3. Check item counts in All items, including Archived, and inspect representative long notes, project TODOs, and history.
4. Continue using the app normally. Migration does not need to be run manually or repeated.

Do **not** clear browser/site data, uninstall in a way that removes its storage, change the hosting origin, or redeploy an old application build after the upgrade. A local safety snapshot shares the browser's storage and is not a substitute for an off-device export.

## Verification scope

Unit and real production-browser tests cover prior schemas, keyless stores, repaired physical versions, every record/field, pre-upgrade snapshot export/restore, preserved older snapshots, late-write/quota failure rollback and retry, and second launches that are forbidden from writing to IndexedDB. Tests use isolated representative data; the user's actual installed database is not accessible from the repository. Device storage eviction, hardware failure, and all browser-specific failure modes cannot be guaranteed away.
