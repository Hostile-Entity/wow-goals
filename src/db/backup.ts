import { AppStateData, EntityType } from "../types";
import { entityStores, lifecycle } from "../state/lifecycle";
import { dataStores, DB_VERSION, migrateV1 } from "./schema";

export const backupPayload = (data: AppStateData) => ({
  app: "wow-goals" as const,
  schemaVersion: DB_VERSION,
  exportedAt: new Date().toISOString(),
  data,
});
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function fail(message: string): never {
  throw new Error(`Invalid backup: ${message}`);
}
const text = (value: unknown) => typeof value === "string";
const dateTime = (value: unknown) =>
  text(value) && Number.isFinite(Date.parse(value as string));
const day = (value: unknown) =>
  text(value) &&
  /^\d{4}-\d{2}-\d{2}$/.test(value as string) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;

/** Validate before ANY destructive writes. Also accepts the single user's old exported backup. */
export function parseBackup(raw: unknown): AppStateData {
  if (
    !object(raw) ||
    raw.app !== "wow-goals" ||
    ![1, DB_VERSION].includes(raw.schemaVersion) ||
    !object(raw.data)
  )
    fail("wrong app or unsupported schema");
  const data = raw.data;
  for (const store of dataStores) {
    if (!Array.isArray(data[store])) fail(`missing ${store}`);
    const ids = new Set();
    for (const row of data[store]) {
      if (!object(row) || !text(row.id) || !row.id.trim() || ids.has(row.id))
        fail(`${store} has an invalid/duplicate ID`);
      ids.add(row.id);
    }
  }
  for (const type of Object.keys(entityStores) as EntityType[])
    for (const row of data[entityStores[type]]) {
      if (
        ![row.title, row.description].every(text) ||
        !dateTime(row.createdAt) ||
        !dateTime(row.updatedAt)
      )
        fail(`${type} has invalid text/timestamps`);
      const statuses =
        raw.schemaVersion === 1
          ? ["active", "in_progress", "completed", "discarded"]
          : [...lifecycle[type], "discarded"];
      if (!statuses.includes(row.status)) fail(`${type} has invalid status`);
      if (row.deadline !== undefined && !day(row.deadline))
        fail("invalid deadline");
      if (type === "project" && raw.schemaVersion === 2 && !text(row.summary))
        fail("project has no short description");
      if (row.completedAt !== undefined && !dateTime(row.completedAt))
        fail("invalid completion timestamp");
    }
  for (const note of data.notes) {
    if (
      note.triagedTo !== undefined &&
      !Object.keys(entityStores)
        .filter((type) => type !== "note")
        .includes(note.triagedTo)
    )
      fail("invalid conversion type");
    if (note.triagedId !== undefined && !text(note.triagedId))
      fail("invalid conversion reference");
    if (
      note.triagePreviousStatus !== undefined &&
      ![...lifecycle.note, "discarded"].includes(note.triagePreviousStatus)
    )
      fail("invalid conversion provenance");
  }
  for (const task of data.tasks) {
    if (
      !Number.isInteger(task.priority) ||
      task.priority < 1 ||
      (raw.schemaVersion === 2 && task.priority > 3) ||
      !Number.isInteger(task.postponedCount) ||
      task.postponedCount < 0
    )
      fail("invalid task priority/counter");
    if (task.scheduledFor !== undefined && !day(task.scheduledFor))
      fail("invalid scheduled date");
    if (
      task.legacyPriority !== undefined &&
      (!Number.isInteger(task.legacyPriority) || task.legacyPriority < 1)
    )
      fail("invalid legacy priority");
  }
  for (const goal of data.goals) {
    if (!Array.isArray(goal.metrics) || !goal.metrics.length)
      fail("goal has no metrics");
    const ids = new Set();
    for (const metric of goal.metrics) {
      if (
        !object(metric) ||
        !text(metric.id) ||
        !metric.id ||
        ids.has(metric.id) ||
        !text(metric.name) ||
        !Number.isFinite(metric.current) ||
        !Number.isFinite(metric.target)
      )
        fail("invalid goal metric");
      ids.add(metric.id);
    }
    if (!ids.has(goal.primaryMetricId)) fail("missing primary metric");
  }
  for (const item of data.completions)
    if (
      !["task", "routine"].includes(item.entityType) ||
      !text(item.entityId) ||
      !day(item.date) ||
      !dateTime(item.completedAt)
    )
      fail("invalid completion");
  for (const review of data.reviews)
    if (
      !/^\d{4}-W\d{2}$/.test(review.weekKey) ||
      ![
        review.inboxCleared,
        review.tasksPrioritized,
        review.weekPlanned,
        review.goalsChecked,
      ].every((v) => typeof v === "boolean") ||
      !text(review.note) ||
      !dateTime(review.createdAt)
    )
      fail("invalid review");
  for (const log of data.logs)
    if (
      ![log.action, log.entityType, log.detail].every(text) ||
      !dateTime(log.at)
    )
      fail("invalid log");
  const s = data.settings;
  if (
    !object(s) ||
    s.id !== "settings" ||
    !Number.isInteger(s.dayOffset) ||
    !Number.isInteger(s.dayStartHour) ||
    s.dayStartHour < 0 ||
    s.dayStartHour > 23 ||
    !Number.isFinite(s.soundVolume) ||
    s.soundVolume < 0 ||
    s.soundVolume > 100 ||
    typeof s.showStatus !== "boolean" ||
    !["light", "wow"].includes(s.theme)
  )
    fail("invalid settings");
  if (s.lastBackupAt !== undefined && !dateTime(s.lastBackupAt))
    fail("invalid backup timestamp");
  if (
    raw.schemaVersion === 2 &&
    (!Array.isArray(s.focusTaskIds) ||
      s.focusTaskIds.length > 3 ||
      !s.focusTaskIds.every(text) ||
      new Set(s.focusTaskIds).size !== s.focusTaskIds.length)
  )
    fail("invalid focus list");
  for (const group of ["tasks", "projects", "routines"])
    for (const row of data[group]) {
      if (row.goalId !== undefined && !text(row.goalId))
        fail("invalid goal reference");
      if (row.projectId !== undefined && !text(row.projectId))
        fail("invalid project reference");
    }
  // Dangling legacy references can result from permanent deletion. Preserve and report them, never erase their records.
  return raw.schemaVersion === 1
    ? migrateV1(data as AppStateData)
    : (structuredClone(data) as AppStateData);
}

export function danglingReferences(data: AppStateData): number {
  const goals = new Set(data.goals.map((item) => item.id));
  const projects = new Set(data.projects.map((item) => item.id));
  return (
    [...data.tasks, ...data.projects, ...data.routines].filter(
      (row) => row.goalId && !goals.has(row.goalId),
    ).length +
    data.tasks.filter((row) => row.projectId && !projects.has(row.projectId))
      .length
  );
}
