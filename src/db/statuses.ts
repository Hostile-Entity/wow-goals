import { AppStateData, EntityType, ItemStatus } from "../types";

/** Status vocabularies used by schema 2–4 backups, before Archive replaced Trash. */
export const legacyLifecycle: Record<EntityType, ItemStatus[]> = {
  note: ["inbox", "reference", "processed"],
  task: ["open", "doing", "done"],
  project: ["planned", "active", "paused", "done"],
  goal: ["active", "achieved"],
  routine: ["enabled", "paused"],
};

export function migrateStatuses(data: AppStateData): AppStateData {
  const next = structuredClone(data);
  const normalize = (status: ItemStatus): ItemStatus =>
    ["processed", "paused", "discarded"].includes(status) ? "archived" : status;
  for (const key of ["notes", "tasks", "projects", "goals", "routines"] as const)
    for (const item of next[key]) item.status = normalize(item.status);
  for (const note of next.notes)
    if (note.triagePreviousStatus)
      note.triagePreviousStatus = normalize(note.triagePreviousStatus);
  return next;
}
