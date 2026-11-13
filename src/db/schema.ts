import { AppSettings, AppStateData } from "../types";

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
  const next = structuredClone(data);
  next.settings = { ...defaultSettings, ...next.settings, listDensity: "comfortable" };
  return next;
}

/** Single v1 -> v2 transition. Never reinterpret or normalize legacy text/history. */
export function migrateV1(data: AppStateData): AppStateData {
  const next = structuredClone(data);
  const groups = ["notes", "tasks", "projects", "goals", "routines"] as const;
  for (const group of groups)
    for (const row of next[group]) {
      const status = row.status as string;
      const legacy = row as unknown as { isActive?: boolean };
      if (status !== "discarded") {
        if (group === "notes")
          row.status = status === "completed" ? "processed" : "inbox";
        if (group === "tasks")
          row.status =
            status === "completed"
              ? "done"
              : status === "in_progress"
                ? "doing"
                : "open";
        if (group === "projects")
          row.status =
            status === "completed"
              ? "done"
              : legacy.isActive === false
                ? "paused"
                : status === "in_progress"
                  ? "active"
                  : "planned";
        if (group === "goals")
          row.status = status === "completed" ? "achieved" : "active";
        if (group === "routines") row.status = "enabled";
      }
      if (group === "projects") {
        (row as AppStateData["projects"][number]).summary = "";
        delete legacy.isActive;
      }
    }
  for (const task of next.tasks) {
    task.legacyPriority = task.priority;
    task.priority = task.priority <= 1 ? 1 : task.priority === 2 ? 2 : 3;
    // The old deadline has already been moved. Preserve it rather than guess its original value.
    if (task.lastPostponedAt) {
      const date = new Date(`${task.lastPostponedAt}T12:00:00`);
      date.setDate(date.getDate() + 1);
      task.scheduledFor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
  }
  next.settings = { ...defaultSettings, ...next.settings, focusTaskIds: [] };
  for (const log of next.logs)
    if (log.action === "project-todo") {
      try {
        const detail = JSON.parse(log.detail);
        if (!detail.occurredDay) {
          const date = new Date(log.at);
          if (date.getHours() < next.settings.dayStartHour)
            date.setDate(date.getDate() - 1);
          detail.occurredDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          log.detail = JSON.stringify(detail);
        }
      } catch {
        /* Unstructured legacy audit events are retained byte-for-byte. */
      }
    }
  return next;
}
