# Interface update

Historical schema-4 release notes. The current status changes and one-time upgrade are documented in [status update and migration safety](status-update.md).

Decisions: `tmp/wowgoals-ux-review/wowgoals-interface-decisions.json`, alongside the HTML review (local, ignored by Git).

## Applied decisions

- Actions **B**: notes/tasks/routines have direct Edit; projects/goals have Open. Copy text lives in the note editor, copies the current draft, and has an inline manual-copy fallback. Duplicate goal actions removed.
- Filters **B**: one dropdown, entity-specific default labels, no duplicate default-status entry for notes/goals/routines. Stored progress states are preserved.
- Lifecycle **B**: To do / In progress / Completed; projects retain Planned / Active / Paused / Completed; Saved, Archived, On and Trash replace technical labels. Converted notes automatically enter Archived. These are display labels, not destructive status migrations.
- Rows (follow-up correction): comfortable cards only, no density switch. Created/Updated is always visible at the bottom right for notes, tasks, projects, goals and routines. Direct task completion supports guarded Undo; postponement counts remain in item information.
- Editor (follow-up correction): full-height phone editor with stacked labels, 16px input text (avoids iOS focus zoom), one scrollable body, fixed header and separate full-width Save bar. The editor tracks visual viewport height so the software keyboard does not cover Save. Schedule and Links remain accessible; dates share a row except on very narrow phones. No Danger zone; Discard and Delete are directly available and require confirmation. Existing draft/conflict guards remain.
- Today **B**: separate Focus, Other due tasks and Routines; focused tasks keep their due label and do not repeat in the due list. Snoozed tasks or tasks belonging to paused projects still appear when urgent. Statistics are a compact header line.
- Visual **A**: neutral surfaces, forest-green accent, system typography, quieter borders and clear keyboard focus. Per follow-up preference, regular buttons are 36px tall and primary buttons 40px, with their horizontal dimensions preserved. Input heights are unchanged. Mobile bottom tabs become a wide-screen side rail, without changing destination names/order. WOW remains optional.
- Capture **B**: conversion immediately opens the result; Back to Inbox and safe Undo are available there. Existing project detail/editor structure remains.
- Navigation and settings: no reorganization, as their choices were empty. A safety export was added to the existing transition disclosure.

## One-time database upgrade

The v4 transaction stores an exact pre-upgrade snapshot in `meta/pre-v4` and normalizes the former density preference to the sole supported value, `comfortable`. A v3 installation that selected compact upgrades automatically; there is no remaining compact layout or switching control. Existing `pre-v3` snapshots are preserved. This does **not** rewrite any note/task/project/goal/routine, priority, date, link, completion, review, audit log or previous safety snapshot. Existing legacy v1 installations still take their original conversion once; repaired databases with higher physical versions are detected by their stores/settings, not just the number.

All writes occur in one version-change transaction. Failure rolls back the settings, snapshot and physical version; reopening can retry without clearing data. Other tabs must close for a blocked upgrade. v1/v2/v3 backup imports are validated before mutation; the old v3 compact preference is accepted on import and normalized to comfortable. Current exports only contain comfortable. Old builds are not intended to run again.

Before deploying, export your current data and close old tabs. The existing Settings → One-time transition and restore safety disclosure offers the pre-interface-upgrade snapshot. Do not clear browser storage. Tests use representative isolated databases, never the installed user's database.

## Validation

Run `npm test`, `npm run build`, then `npm run test:e2e`. Coverage includes v1/v2/v3 upgrades, keyless and repaired database versions, rollback/retry, preservation of records and safety snapshots, backup validation/restore, clipboard fallback, conversion/Undo, completion/Undo, comfortable-only cards, visible timestamps, narrow/short phone editor geometry, confirmed destructive actions, deadline exceptions, dirty/conflicting editors and production offline/update behavior. Short-viewport tests simulate keyboard-sized space; real software keyboard behavior still merits a physical-device check.
