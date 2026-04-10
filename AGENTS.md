# AGENTS

## Project at a glance
- App: **WowGoals** (mobile-first PWA for personal execution)
- Stack: **Vite + React + TypeScript + IndexedDB + Service Worker**
- Main flow: capture notes -> triage into tasks/projects/goals/routines -> execute daily -> review weekly

## Repository organization
- `src/App.tsx`: composition shell (wires tabs, modals, top/bottom nav)
- `src/state/`: app state and business logic (`useAppData.ts`)
- `src/features/`: tab-level UI (Notes, Tasks, Today, Projects, More)
- `src/components/`: shared UI pieces (top bar, tabs, filters, modals)
- `src/db/`: IndexedDB access layer
- `src/styles/`: split CSS (`theme.css`, `layout.css`, `components.css`, `features.css`)

## Basic principles
- Keep **business logic in `state/`**, not in feature/component render code.
- Keep **feature screens in `features/`** and reusable pieces in `components/`.
- Keep `App.tsx` as a **thin orchestrator**.
- Prefer **small focused files** over monoliths.
- Preserve existing class names and UX behavior when refactoring.
- Put new styles in the appropriate split stylesheet; avoid recreating a single global CSS file.
