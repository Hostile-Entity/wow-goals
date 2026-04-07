# WowGoals

WowGoals is a mobile-first goals tracker PWA built with Vite + React + TypeScript + IndexedDB.

The app is designed as a control layer for personal execution: capture notes quickly, triage them into actionable items, prioritize work, complete tasks/routines, and run weekly reviews.

## Current implementation

- **Tech stack**: Vite, React 18, TypeScript 5, native IndexedDB, service worker PWA setup.
- **Tabs**: Notes, Tasks, Today, Routines, Projects, Goals, Review, Debug.
- **Capture + triage**: Create notes and convert them into tasks, projects, goals, or routines.
- **Task management**: Priorities, deadlines, postpone, complete, and quick add.
- **Today view**: Stats, top-3 tasks, one-tap routine completion buttons.
- **Routines tab**: Dedicated routine management with goal linking.
- **Projects/Goals**: Active/inactive projects, goal progress bars, linked-item visibility.
- **Goal metrics**: Multiple metrics per goal with one primary metric used on the main card.
- **Weekly review**: Checklist + history.
- **Auditability**: Global event log for actions (including discard/postpone/recover/delete/debug date changes).
- **Lifecycle controls**: Discard, recover, and permanent delete with confirmation.
- **Debug tools**: Logical date simulation (+1/-1/set date/reset).
- **UX updates**: Per-item `Manage` popup to reduce card clutter, metadata visible on cards.
- **PWA update flow**: Settings popup with app version and update check/apply actions.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Deploy (GitHub Pages)

```bash
npm run deploy
```

This publishes `dist` to the `gh-pages` branch for:

`https://hostile-entity.github.io/wow-goals/`
