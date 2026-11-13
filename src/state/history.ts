import { EventLog, Project, Routine } from "../types";
import { toDayString } from "../db";

export function projectProgressByDay(logs: EventLog[], dayStartHour: number) {
  const days = new Map<string, Map<string, number>>();
  const checked = new Map<string, boolean>();
  for (const log of [...logs].sort((a, b) => a.at.localeCompare(b.at))) {
    if (log.action !== "project-todo" || !log.entityId) continue;
    try {
      const payload = JSON.parse(log.detail);
      if (typeof payload.checked !== "boolean") continue;
      const key = `${log.entityId}:${payload.lineIndex}`;
      const before =
        typeof payload.previousChecked === "boolean"
          ? payload.previousChecked
          : (checked.get(key) ?? false);
      const delta =
        typeof payload.delta === "number"
          ? payload.delta
          : Number(payload.checked) - Number(before);
      checked.set(key, payload.checked);
      const day = payload.occurredDay ?? toDayString(log.at, dayStartHour);
      const counts = days.get(log.entityId) ?? new Map<string, number>();
      counts.set(day, (counts.get(day) ?? 0) + delta);
      days.set(log.entityId, counts);
    } catch {
      /* Preserve old unstructured logs but do not invent activity. */
    }
  }
  return days;
}
/** Include deleted items when history exists, using a stable placeholder if older logs lack a title. */
export function historicalRows<T extends Project | Routine>(
  items: T[],
  type: "project" | "routine",
  ids: Set<string>,
  logs: EventLog[],
): Array<Pick<T, "id" | "title" | "createdAt" | "status">> {
  const rows: Array<Pick<T, "id" | "title" | "createdAt" | "status">> =
    items.filter((item) => ids.has(item.id));
  for (const id of ids)
    if (!rows.some((item) => item.id === id)) {
      let title = `Deleted ${type} (${id})`;
      let createdAt =
        logs.find((log) => log.entityId === id)?.at ?? new Date().toISOString();
      const deletion = logs.find(
        (log) => log.entityId === id && log.action === "delete-permanent",
      );
      try {
        const payload = JSON.parse(deletion?.detail ?? "{}");
        title = payload.title ?? title;
        createdAt = payload.createdAt ?? createdAt;
      } catch {
        /* Older delete events did not include metadata. */
      }
      rows.push({ id, title, createdAt, status: "archived" });
    }
  return rows;
}
