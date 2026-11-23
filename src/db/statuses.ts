import { AppStateData, BaseEntity, EntityType, ItemStatus, Note } from "../types";

/** Status vocabularies used by schema 2–4 backups, before Archive replaced Trash. */
export const legacyLifecycle: Record<EntityType, ItemStatus[]> = {
  note: ["inbox", "reference", "processed"],
  task: ["open", "doing", "done"],
  project: ["planned", "active", "paused", "done"],
  goal: ["active", "achieved"],
  routine: ["enabled", "paused"],
};

export const normalizeArchivedStatus = (status: ItemStatus): ItemStatus =>
  status === "processed" || status === "paused" || status === "discarded" ? "archived" : status;

export function normalizeStatus<T extends BaseEntity>(row: T): T {
  const status = normalizeArchivedStatus(row.status);
  return status === row.status ? row : { ...row, status };
}

export function normalizeNoteStatus(row: Note): Note {
  const status = normalizeArchivedStatus(row.status);
  const previous = row.triagePreviousStatus;
  const normalized = previous ? normalizeArchivedStatus(previous) : previous;
  if (normalized !== previous) return { ...row, status, triagePreviousStatus: normalized };
  return status === row.status ? row : { ...row, status };
}

export function mapChangedRows<T>(rows: T[], migrate: (row: T) => T): T[] {
  let updated: T[] | undefined;
  rows.forEach((row, index) => {
    const next = migrate(row);
    if (updated) updated.push(next);
    else if (next !== row) {
      updated = rows.slice(0, index);
      updated.push(next);
    }
  });
  return updated ?? rows;
}

/** Share untouched rows; callers must not mutate the original or result in place. */
export function migrateStatuses(data: AppStateData): AppStateData {
  return {
    ...data,
    notes: mapChangedRows(data.notes, normalizeNoteStatus),
    tasks: mapChangedRows(data.tasks, normalizeStatus),
    projects: mapChangedRows(data.projects, normalizeStatus),
    goals: mapChangedRows(data.goals, normalizeStatus),
    routines: mapChangedRows(data.routines, normalizeStatus),
  };
}
