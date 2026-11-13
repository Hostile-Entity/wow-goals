import { BaseEntity, DailyCompletion, EntityType, ItemStatus, Routine, Task } from "../types";

export type FilterKey = "notes" | "tasks" | "projects" | "routines" | "goals";
// "actionable" is internal (Today), not a selectable status/view.
export type StatusFilter = "all" | "actionable" | "completed-today" | ItemStatus;
export const entityStores = {
  note: "notes",
  task: "tasks",
  project: "projects",
  goal: "goals",
  routine: "routines",
} as const;
export const lifecycle: Record<EntityType, ItemStatus[]> = {
  note: ["inbox", "reference", "archived"],
  task: ["open", "doing", "done", "archived"],
  project: ["planned", "active", "done", "archived"],
  goal: ["active", "achieved", "archived"],
  routine: ["enabled", "archived"],
};
export const initialStatus: Record<EntityType, ItemStatus> = {
  note: "inbox",
  task: "open",
  project: "planned",
  goal: "active",
  routine: "enabled",
};
export const defaultFilters: Record<FilterKey, StatusFilter> = {
  notes: "inbox",
  tasks: "open",
  projects: "planned",
  routines: "enabled",
  goals: "active",
};
export function filterOptions(key: FilterKey): StatusFilter[] {
  const type = (Object.keys(entityStores) as EntityType[]).find(
    (type) => entityStores[type] === key,
  )!;
  return type === "routine"
    ? ["enabled", "completed-today", "archived", "all"]
    : [...lifecycle[type], "all"];
}

export function savedStatusFilter(key: FilterKey, value: unknown): StatusFilter {
  const normalized = ["processed", "paused", "discarded"].includes(String(value))
    ? "archived"
    : value;
  return filterOptions(key).includes(normalized as StatusFilter)
    ? normalized as StatusFilter
    : defaultFilters[key];
}

export function statusLabel(status: ItemStatus): string {
  const labels: Record<ItemStatus, string> = {
    inbox: "Inbox", reference: "Pinned", processed: "Archived",
    open: "To do", doing: "Active", done: "Completed",
    planned: "Planned", active: "Active", paused: "Archived",
    enabled: "On", achieved: "Completed", archived: "Archived", discarded: "Archived",
  };
  return labels[status];
}

export function filterLabel(key: FilterKey, value: StatusFilter): string {
  if (value === "all") return "All items";
  if (value === "completed-today") return "Completed";
  if (value !== "actionable") return statusLabel(value);
  return statusLabel(defaultFilters[key] as ItemStatus);
}
export function isOpen(item: Pick<BaseEntity, "status">): boolean {
  return ["inbox", "reference", "open", "doing", "planned", "active", "enabled"].includes(
    item.status,
  );
}
export function matchesFilter(item: BaseEntity, filter: StatusFilter): boolean {
  return (
    filter === "all" ||
    (filter === "actionable" ? isOpen(item) : item.status === filter)
  );
}
export function getStatusBucket(
  item: Pick<BaseEntity, "status">,
): "active" | "in_progress" | "inactive" | "completed" | "discarded" {
  if (["archived", "discarded", "processed", "paused"].includes(item.status)) return "inactive";
  if (["done", "achieved"].includes(item.status))
    return "completed";
  if (["doing", "active", "reference"].includes(item.status)) return "in_progress";
  return "active";
}
export function sortItems<T extends BaseEntity>(
  items: T[],
  filter: StatusFilter,
): T[] {
  const rank = {
    in_progress: 0,
    active: 1,
    inactive: 3,
    completed: 2,
    discarded: 4,
  };
  return items
    .filter((item) => matchesFilter(item, filter))
    .sort(
      (a, b) =>
        Number(b.status === "reference") - Number(a.status === "reference") ||
        rank[getStatusBucket(a)] - rank[getStatusBucket(b)] ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}
export function sortTasks(
  tasks: Task[],
  filter: StatusFilter,
  day: string,
): Task[] {
  return tasks
    .filter((item) => matchesFilter(item, filter))
    .sort((a, b) => {
      const urgency = (t: Task) => (t.deadline && t.deadline <= day ? 0 : 1);
      return (
        Number(!isOpen(a)) - Number(!isOpen(b)) ||
        Number(a.status === "archived") - Number(b.status === "archived") ||
        urgency(a) - urgency(b) ||
        a.priority - b.priority ||
        (a.legacyPriority ?? a.priority) - (b.legacyPriority ?? b.priority) ||
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        b.updatedAt.localeCompare(a.updatedAt)
      );
    });
}
export const priorityLabel = (priority: number) =>
  priority === 1 ? "High" : priority === 3 ? "Low" : "Normal";

export function isUnfinished(item: Pick<BaseEntity, "status">): boolean {
  return isOpen(item);
}

export function routineCompletedToday(completions: DailyCompletion[], id: string, day: string) {
  return completions.some(row => row.entityType === "routine" && row.entityId === id && row.date === day);
}

export function sortRoutines(routines: Routine[], completions: DailyCompletion[], filter: StatusFilter, day: string) {
  if (filter !== "enabled" && filter !== "completed-today") return sortItems(routines, filter);
  return sortItems(routines, "enabled").filter(routine =>
    routineCompletedToday(completions, routine.id, day) === (filter === "completed-today"));
}

export function statusActionLabel(type: EntityType, current: ItemStatus, target: ItemStatus) {
  if (target === "archived") return "Archive";
  if (current === "archived") return `Unarchive to ${statusLabel(target)}`;
  if (target === "done" || target === "achieved") return `Complete ${type}`;
  if (current === "done" || current === "achieved") return `Reopen as ${statusLabel(target)}`;
  if (target === "reference") return "Pin";
  if (target === "inbox") return "Move to Inbox";
  return `Mark ${statusLabel(target)}`;
}
