import { AppSettings, AppStateData, ItemStatus } from "../types";
import { mapChangedRows, migrateStatuses, normalizeArchivedStatus } from "./statuses";

export const DB_NAME = "wow-goals-db";
export const DB_VERSION = 5;
export const dataStores = [
  "notes",
  "tasks",
  "projects",
  "goals",
  "routines",
  "completions",
  "reviews",
  "logs",
] as const;
export const defaultSettings: AppSettings = {
  id: "settings",
  dayOffset: 0,
  dayStartHour: 5,
  soundVolume: 0,
  showStatus: false,
  theme: "light",
  listDensity: "comfortable",
  focusTaskIds: [],
};
export const emptyData = (): AppStateData => ({
  notes: [],
  tasks: [],
  projects: [],
  goals: [],
  routines: [],
  completions: [],
  reviews: [],
  logs: [],
  settings: { ...defaultSettings, focusTaskIds: [] },
});

/** v2/v3 -> current: comfortable is now the only layout. Records stay untouched. */
export function migrateV2(data: AppStateData): AppStateData {
  const settings: AppSettings = { ...defaultSettings, ...data.settings, listDensity: "comfortable" };
  return Object.keys(settings).every((key) => Object.is(
    settings[key as keyof AppSettings], data.settings[key as keyof AppSettings],
  )) ? data : { ...data, settings };
}

/** Single v1 -> v2 transition. Never reinterpret or normalize legacy text/history. */
export function migrateV1(data: AppStateData): AppStateData {
  return migrateV1Rows(data, false);
}

function migrateV1Rows(data: AppStateData, current: boolean): AppStateData {
  const settings = { ...defaultSettings, ...data.settings, focusTaskIds: [] };
  const status = (old: string, target: ItemStatus): ItemStatus => {
    const next = old === "discarded" ? old : target;
    return current ? normalizeArchivedStatus(next) : next;
  };
  const dayString = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const notes = mapChangedRows(data.notes, (row) => {
    const old: string = row.status;
    const nextStatus = status(old, old === "completed" ? "processed" : "inbox");
    const previous = row.triagePreviousStatus;
    const normalized = current && previous ? normalizeArchivedStatus(previous) : previous;
    if (normalized !== previous)
      return { ...row, status: nextStatus, triagePreviousStatus: normalized };
    return nextStatus === row.status ? row : { ...row, status: nextStatus };
  });
  return {
    ...data,
    settings,
    notes,
    tasks: data.tasks.map((row) => {
      const old: string = row.status;
      const next = {
        ...row,
        status: status(old, old === "completed" ? "done" : old === "in_progress" ? "doing" : "open"),
        legacyPriority: row.priority,
        priority: row.priority <= 1 ? 1 : row.priority === 2 ? 2 : 3,
      };
      // The old deadline has already been moved. Preserve it rather than guess its original value.
      if (row.lastPostponedAt) {
        const date = new Date(`${row.lastPostponedAt}T12:00:00`);
        date.setDate(date.getDate() + 1);
        next.scheduledFor = dayString(date);
      }
      return next;
    }),
    projects: data.projects.map((row) => {
      const { isActive, ...fields } = row as typeof row & { isActive?: boolean };
      const old: string = row.status;
      return {
        ...fields,
        status: status(old, old === "completed" ? "done" :
          isActive === false ? "paused" : old === "in_progress" ? "active" : "planned"),
        summary: "",
      };
    }),
    goals: mapChangedRows(data.goals, (row) => {
      const old: string = row.status;
      const nextStatus = status(old, old === "completed" ? "achieved" : "active");
      return nextStatus === row.status ? row : { ...row, status: nextStatus };
    }),
    routines: mapChangedRows(data.routines, (row) => {
      const nextStatus = status(row.status, "enabled");
      return nextStatus === row.status ? row : { ...row, status: nextStatus };
    }),
    logs: mapChangedRows(data.logs, (log) => {
      if (log.action === "project-todo") {
        try {
          const detail = JSON.parse(log.detail);
          if (!detail.occurredDay) {
            const date = new Date(log.at);
            if (date.getHours() < settings.dayStartHour)
              date.setDate(date.getDate() - 1);
            detail.occurredDay = dayString(date);
            return { ...log, detail: JSON.stringify(detail) };
          }
        } catch {
          /* Unstructured legacy audit events are retained byte-for-byte. */
        }
      }
      return log;
    }),
  };
}

/** Build one copy-on-write migration result, keeping the recovery data intact. */
export function migrateLegacy(data: AppStateData, version: number): AppStateData {
  if (version === 1) return migrateV1Rows(data, true);
  if (version === 2 || version === 3) return migrateStatuses(migrateV2(data));
  return version === 4 ? migrateStatuses(data) : data;
}
