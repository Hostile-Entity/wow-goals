import { BaseEntity, EntityType, ItemStatus, Task } from "../types";

export type FilterKey = "notes" | "tasks" | "projects" | "routines" | "goals";
export type StatusFilter = "all" | "actionable" | ItemStatus;
export const entityStores = {
  note: "notes",
  task: "tasks",
  project: "projects",
  goal: "goals",
  routine: "routines",
} as const;
export const lifecycle: Record<EntityType, ItemStatus[]> = {
  note: ["inbox", "reference", "processed"],
  task: ["open", "doing", "done"],
  project: ["planned", "active", "paused", "done"],
  goal: ["active", "achieved"],
  routine: ["enabled", "paused"],
};
export const initialStatus: Record<EntityType, ItemStatus> = {
  note: "inbox",
  task: "open",
  project: "planned",
  goal: "active",
  routine: "enabled",
};
export const defaultFilters: Record<FilterKey, StatusFilter> = {
  notes: "actionable",
  tasks: "actionable",
  projects: "actionable",
  routines: "actionable",
  goals: "actionable",
};
export function filterOptions(key: FilterKey): StatusFilter[] {
  const type = (Object.keys(entityStores) as EntityType[]).find(
    (type) => entityStores[type] === key,
  )!;
  // A single-state default view needs no duplicate status entry.
  const duplicate = type === "note" ? "inbox" : type === "goal" ? "active" : type === "routine" ? "enabled" : null;
  return ["actionable", ...lifecycle[type].filter(status => status !== duplicate), "discarded", "all"];
}

export function statusLabel(status: ItemStatus): string {
  const labels: Record<ItemStatus, string> = {
    inbox: "Inbox", reference: "Saved", processed: "Archived",
    open: "To do", doing: "In progress", done: "Completed",
    planned: "Planned", active: "Active", paused: "Paused",
    enabled: "On", achieved: "Achieved", discarded: "Trash",
  };
  return labels[status];
}

export function filterLabel(key: FilterKey, value: StatusFilter): string {
  if (value === "all") return "All items";
  if (value !== "actionable") return statusLabel(value);
  return { notes: "Inbox", tasks: "Unfinished", projects: "Current", goals: "Active", routines: "On" }[key];
}
export function isOpen(item: Pick<BaseEntity, "status">): boolean {
  return ["inbox", "open", "doing", "planned", "active", "enabled"].includes(
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
  if (item.status === "discarded") return "discarded";
  if (["done", "achieved", "processed"].includes(item.status))
    return "completed";
  if (["paused", "reference"].includes(item.status)) return "inactive";
  if (item.status === "doing" || item.status === "active") return "in_progress";
  return "active";
}
export function sortItems<T extends BaseEntity>(
  items: T[],
  filter: StatusFilter,
): T[] {
  const rank = {
    in_progress: 0,
    active: 1,
    inactive: 2,
    completed: 3,
    discarded: 4,
  };
  return items
    .filter((item) => matchesFilter(item, filter))
    .sort(
      (a, b) =>
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
  return !["done", "achieved", "processed", "discarded"].includes(item.status);
}
