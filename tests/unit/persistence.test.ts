import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { openDatabase, readSnapshot, replaceSnapshot } from "../../src/db";
import { backupPayload, parseBackupJson } from "../../src/db/backup";
import { emptyData } from "../../src/db/schema";
import { applyChanges, captureNote, deleteEntityCommand } from "../../src/state/commands";
import { legacyFixture } from "../fixtures/legacy";

const legacyJson = () => JSON.stringify({ app: "wow-goals", schemaVersion: 1, data: legacyFixture() });

it("parses a legacy restore directly from JSON and validates a current safety export", () => {
  const restored = parseBackupJson(legacyJson());
  expect(restored.tasks.find((task) => task.id === "task-a")).toMatchObject({ priority: 3, legacyPriority: 9 });
  expect(restored.notes.find((note) => note.id === "note-old")?.status).toBe("archived");
  expect(parseBackupJson(JSON.stringify(backupPayload(restored)))).toEqual(restored);
  expect(() => parseBackupJson('{"app":"wow-goals","schemaVersion":5,"data":{}}')).toThrow("missing notes");
});

it("rolls back a late restore quota failure and keeps the previous safety export until a successful retry", async () => {
  const db = await openDatabase(`restore-quota-${crypto.randomUUID()}`);
  const safety = () => new Promise<unknown>((resolve, reject) => {
    const req = db.transaction("meta").objectStore("meta").get("pre-import");
    req.onsuccess = () => resolve(req.result.data);
    req.onerror = () => reject(req.error);
  });
  try {
    await replaceSnapshot(db, parseBackupJson(legacyJson()));
    const before = await readSnapshot(db);
    const previousSafety = await safety();
    const incoming = emptyData();
    incoming.notes = [captureNote("Replacement")!];
    const original = IDBObjectStore.prototype.put;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args) {
      if (this.name === "settings") throw new DOMException("Simulated restore quota failure", "QuotaExceededError");
      return original.apply(this, args);
    });
    try {
      await expect(replaceSnapshot(db, incoming)).rejects.toMatchObject({ name: "QuotaExceededError" });
    } finally {
      put.mockRestore();
    }
    expect(await readSnapshot(db)).toEqual(before);
    expect(await safety()).toEqual(previousSafety);
    await replaceSnapshot(db, incoming);
    expect(await readSnapshot(db)).toEqual(incoming);
    const exported = await safety() as typeof before;
    expect(parseBackupJson(JSON.stringify(backupPayload(exported)))).toEqual({
      ...before,
      logs: [...before.logs].sort((a, b) => a.id.localeCompare(b.id)),
    });
  } finally {
    db.close();
  }
});

it("normalizes capture and unlinks only references when deleting an entity", () => {
  expect(captureNote(" \r\n \r\n")).toBeUndefined();
  expect(captureNote("\r\n  A title  \r\n  line one\r\n\r\nline two  \r\n")).toMatchObject({
    status: "inbox", title: "A title", description: "line one\n\nline two",
  });
  const data = parseBackupJson(legacyJson());
  data.settings.focusTaskIds = ["task-a", "task-b"];
  const records = (state: typeof data) => ({ ...state, settings: [state.settings] });
  const afterGoal = applyChanges(data, deleteEntityCommand(records(data), "goal", "goal-a", "2026-11-22"));
  expect(afterGoal.tasks.find((task) => task.id === "task-a")).toMatchObject({ goalId: undefined, projectId: "project-a" });
  expect(afterGoal.projects.find((project) => project.id === "project-a")?.goalId).toBeUndefined();
  expect(afterGoal.routines.find((routine) => routine.id === "routine-a")?.goalId).toBeUndefined();
  const afterTask = applyChanges(afterGoal, deleteEntityCommand(records(afterGoal), "task", "task-a", "2026-11-22"));
  expect(afterTask.settings.focusTaskIds).toEqual(["task-b"]);
  expect(afterTask.completions).toBe(data.completions);
  expect(afterTask.logs).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "delete-permanent", entityId: "task-a" }),
  ]));
});
