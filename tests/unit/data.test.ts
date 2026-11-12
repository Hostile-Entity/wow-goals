import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  clearDatabase,
  mutateDatabase,
  openDatabase,
  readSnapshot,
  replaceSnapshot,
  Records,
} from "../../src/db";
import { backupPayload, parseBackup } from "../../src/db/backup";
import { emptyData, migrateV1 } from "../../src/db/schema";
import {
  applyChanges,
  completeTaskCommand,
  projectTodoCommand,
  triageCommand,
  undoTriageCommand,
  updateCommand,
} from "../../src/state/commands";
import { filterOptions, sortTasks } from "../../src/state/lifecycle";
import { changeTodo, projectTodos } from "../../src/state/projectTodos";
import { projectProgressByDay } from "../../src/state/history";
import { AppStateData } from "../../src/types";
import { legacyFixture } from "../fixtures/legacy";

const migrated = () => migrateV1(legacyFixture() as unknown as AppStateData);
const recordSet = (data = migrated()) =>
  ({ ...data, settings: [data.settings], meta: [] }) as Records;
async function seedLegacy(name: string, keyless = false, version = 1) {
  const fixture = legacyFixture();
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      for (const [name, values] of Object.entries(fixture)) {
        const store = request.result.createObjectStore(
          name,
          keyless ? undefined : { keyPath: "id" },
        );
        for (const row of Array.isArray(values) ? values : [values]) {
          if (keyless) store.put(row, row.id);
          else store.put(row);
        }
      }
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
const name = () => `test-${crypto.randomUUID()}`;
function canonical<T>(data: T): T {
  const copy = structuredClone(data) as any;
  for (const value of Object.values(copy))
    if (Array.isArray(value)) value.sort((a, b) => a.id.localeCompare(b.id));
  return copy;
}

describe("one-time database transition", () => {
  it.each([false, true])(
    "preserves IDs, text, relationships, timestamps and history (keyless=%s)",
    async (keyless) => {
      const dbName = name();
      await seedLegacy(dbName, keyless);
      const db = await openDatabase(dbName);
      const data = await readSnapshot(db);
      expect(db.version).toBe(2);
      const legacy = legacyFixture();
      expect(data.projects.find((p) => p.id === "project-a")?.description).toBe(
        legacy.projects[0].description,
      );
      expect(data.projects.map((p) => p.status)).toEqual([
        "active",
        "done",
        "paused",
      ]);
      expect(data.notes.find((n) => n.id === "note-a")?.description).toBe(
        legacy.notes[0].description,
      );
      expect(data.tasks.find((t) => t.id === "task-a")).toMatchObject({
        priority: 3,
        legacyPriority: 9,
        deadline: "2026-10-11",
        scheduledFor: "2026-10-11",
        projectId: "project-a",
        goalId: "goal-a",
      });
      expect(data.goals).toEqual(legacy.goals);
      expect(data.reviews).toEqual(legacy.reviews);
      expect(data.completions).toEqual(legacy.completions);
      expect(data.logs).toHaveLength(2);
      expect(JSON.parse(data.logs[0].detail).occurredDay).toBe("2026-10-11");
      const snapshot = await new Promise<any>((resolve) => {
        const read = db.transaction("meta").objectStore("meta").get("pre-v2");
        read.onsuccess = () => resolve(read.result);
      });
      expect(canonical(snapshot.data.data)).toEqual(canonical(legacy));
      db.close();
      const reopened = await openDatabase(dbName);
      expect(await readSnapshot(reopened)).toEqual(data);
      reopened.close();
    },
  );
  it("creates a fresh database with complete stores and settings", async () => {
    const db = await openDatabase(name());
    expect(await readSnapshot(db)).toEqual(emptyData());
    expect(db.objectStoreNames.contains("meta")).toBe(true);
    db.close();
  });
  it.each([2, 5])(
    "also transitions an old self-repaired physical version %s exactly once",
    async (version) => {
      const dbName = name();
      await seedLegacy(dbName, false, version);
      let db = await openDatabase(dbName);
      expect(db.version).toBe(version + 1);
      const data = await readSnapshot(db);
      expect(data.notes[0].status).toBe("inbox");
      expect(data.projects.find((p) => p.id === "project-paused")?.status).toBe(
        "paused",
      );
      db.close();
      db = await openDatabase(dbName);
      expect(await readSnapshot(db)).toEqual(data);
      db.close();
    },
  );
  it("rolls back the entire upgrade, including its version, if a migration write fails", async () => {
    const dbName = name();
    await seedLegacy(dbName);
    const original = IDBObjectStore.prototype.put;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["put"]>
      ) {
        if (this.name === "tasks") throw new Error("simulated storage failure");
        return original.apply(this, args);
      });
    await expect(openDatabase(dbName)).rejects.toBeTruthy();
    spy.mockRestore();
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(dbName);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    expect(old.version).toBe(1);
    expect(old.objectStoreNames.contains("meta")).toBe(false);
    old.close();
    const retry = await openDatabase(dbName);
    expect((await readSnapshot(retry)).tasks).toHaveLength(4);
    retry.close();
  });
});

describe("backup safety", () => {
  it("round trips every new field, completion date and all logs", () => {
    const data = migrated();
    expect(parseBackup(backupPayload(data))).toEqual(data);
  });
  it("restores a v1 backup once without changing source data", () => {
    const raw = { app: "wow-goals", schemaVersion: 1, data: legacyFixture() };
    expect(parseBackup(raw)).toEqual(migrated());
    expect(raw.data.projects[0].isActive).toBe(true);
  });
  it.each([
    "wrong-app",
    "missing-store",
    "duplicate-id",
    "bad-status",
    "bad-metric",
    "bad-focus",
    "bad-date",
    "bad-reference",
    "unknown-schema",
  ])("rejects %s before restore", (failure) => {
    const raw: any = backupPayload(migrated());
    if (failure === "wrong-app") raw.app = "other";
    if (failure === "missing-store") delete raw.data.tasks;
    if (failure === "duplicate-id") raw.data.tasks.push(raw.data.tasks[0]);
    if (failure === "bad-status") raw.data.notes[0].status = "nonsense";
    if (failure === "bad-metric") raw.data.goals[0].metrics[0].current = "bad";
    if (failure === "bad-focus") raw.data.settings.focusTaskIds = [1];
    if (failure === "bad-date") raw.data.tasks[0].deadline = "2026-02-31";
    if (failure === "bad-reference") raw.data.tasks[0].projectId = {};
    if (failure === "unknown-schema") raw.schemaVersion = 999;
    expect(() => parseBackup(raw)).toThrow();
  });
  it("keeps dangling legacy links and unusual finite legacy metrics rather than deleting user records", () => {
    const data = migrated();
    data.tasks[0].goalId = "deleted-goal";
    data.goals[0].metrics[0].target = -1;
    expect(parseBackup(backupPayload(data))).toEqual(data);
  });
  it("atomically replaces data and keeps a pre-import safety snapshot", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    expect(canonical(await readSnapshot(db))).toEqual(canonical(migrated()));
    await replaceSnapshot(db, emptyData());
    expect((await readSnapshot(db)).tasks).toEqual([]);
    const r = db.transaction("meta").objectStore("meta").get("pre-import");
    expect(
      await new Promise<any>((resolve) => {
        r.onsuccess = () => resolve(r.result.data.tasks.length);
      }),
    ).toBe(4);
    db.close();
  });
  it("failed restore does not clear existing data or its previous safety snapshot", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    const before = await readSnapshot(db);
    const bad = emptyData();
    bad.notes.push({ ...before.notes[0], description: (() => {}) as any });
    await expect(replaceSnapshot(db, bad)).rejects.toBeTruthy();
    expect(await readSnapshot(db)).toEqual(before);
    db.close();
  });
  it("explicit Delete all also removes safety snapshots atomically", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    await clearDatabase(db);
    expect(await readSnapshot(db)).toEqual(emptyData());
    const read = db.transaction("meta").objectStore("meta").getAll();
    expect(
      await new Promise((resolve) => {
        read.onsuccess = () => resolve(read.result);
      }),
    ).toEqual([]);
    db.close();
  });
});

describe("selected core flows", () => {
  it("keeps original blank lines and prose TODOs intact until edited", () => {
    const source = legacyFixture().projects[0].description;
    const rows = projectTodos(source);
    expect(rows).toHaveLength(3);
    expect(rows[1].sourceIndex).toBe(2);
    const changed = changeTodo(source, 2, { checked: true });
    expect(changed.split("\n")[0]).toBe(source.split("\n")[0]);
    expect(changed.endsWith("\n")).toBe(true);
    expect(projectTodos(changed)[1].checked).toBe(true);
  });
  it("conversion uses the edited draft, stores provenance and is undoable", () => {
    const records = recordSet();
    const note = records.notes[0];
    const changes = triageCommand(
      records,
      { ...note, title: "Edited title", description: "Edited\nmessage" },
      "task",
      "2026-11-12",
    );
    const state = applyChanges(migrated(), changes);
    expect(
      state.tasks.find((t) => t.title === "Edited title")?.description,
    ).toBe("Edited\nmessage");
    const converted = state.notes.find((n) => n.id === note.id)!;
    expect(converted.status).toBe("processed");
    expect(converted.triagedId).toBeTruthy();
    expect(() =>
      triageCommand(recordSet(state), converted, "task", "2026-11-12"),
    ).toThrow("already converted");
    const undone = applyChanges(
      state,
      undoTriageCommand(recordSet(state), note.id, "2026-11-12"),
    );
    expect(undone.tasks).toHaveLength(4);
    expect(undone.notes.find((n) => n.id === note.id)?.title).toBe(
      "Edited title",
    );
  });
  it("does not delete a converted item that was edited or used", () => {
    let state = applyChanges(
      migrated(),
      triageCommand(recordSet(), recordSet().notes[0], "task", "2026-11-12"),
    );
    const note = state.notes.find((n) => n.id === "note-a")!;
    state = {
      ...state,
      tasks: state.tasks.map((t) =>
        t.id === note.triagedId
          ? { ...t, updatedAt: "2099-01-01T00:00:00.000Z" }
          : t,
      ),
    };
    expect(() =>
      undoTriageCommand(recordSet(state), note.id, "2026-11-12"),
    ).toThrow("kept safe");
  });
  it("does not overwrite a note changed in another view during conversion", () => {
    const records = recordSet();
    expect(() =>
      triageCommand(
        records,
        { ...records.notes[0], updatedAt: "2000-01-01T00:00:00.000Z" },
        "task",
        "2026-11-12",
      ),
    ).toThrow("changed in another view");
  });
  it("only reads the affected store for a normal edit, not all history", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    const names: string[] = [];
    const original = IDBObjectStore.prototype.getAll;
    const spy = vi
      .spyOn(IDBObjectStore.prototype, "getAll")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore["getAll"]>
      ) {
        names.push(this.name);
        return original.apply(this, args);
      });
    await mutateDatabase(db, ["notes"], (records) =>
      updateCommand(
        records,
        "note",
        "note-a",
        (row) => ({ ...row, title: "Small update" }),
        "2026-11-12",
      ),
    );
    spy.mockRestore();
    expect(names).toEqual(["notes"]);
    db.close();
  });
  it("task completion is atomic/idempotent under repeated and concurrent taps", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    await Promise.all(
      [1, 2, 3].map(() =>
        mutateDatabase(db, ["tasks", "completions"], (records) =>
          completeTaskCommand(records, "task-a", "2026-11-12"),
        ),
      ),
    );
    const state = await readSnapshot(db);
    expect(state.tasks.find((t) => t.id === "task-a")?.status).toBe("done");
    expect(
      state.completions.filter((c) => c.entityId === "task-a"),
    ).toHaveLength(1);
    db.close();
  });
  it("failed action rolls back item and event together", async () => {
    const db = await openDatabase(name());
    await replaceSnapshot(db, migrated());
    await expect(
      mutateDatabase(db, ["tasks", "completions"], (records) => [
        ...completeTaskCommand(records, "task-a", "2026-11-12"),
        { store: "logs", row: { id: "bad", data: () => {} } as any },
      ]),
    ).rejects.toBeTruthy();
    expect(
      (await readSnapshot(db)).tasks.find((t) => t.id === "task-a")?.status,
    ).toBe("open");
    db.close();
  });
  it("project completion does not touch child Tasks/checklist and can reopen", () => {
    const before = migrated();
    const after = applyChanges(
      before,
      updateCommand(
        recordSet(before),
        "project",
        "project-a",
        (row) => ({ ...row, status: "done" }),
        "2026-11-12",
      ),
    );
    expect(after.tasks).toEqual(before.tasks);
    expect(after.projects.find((p) => p.id === "project-a")?.description).toBe(
      before.projects[0].description,
    );
    expect(
      applyChanges(
        after,
        updateCommand(
          recordSet(after),
          "project",
          "project-a",
          (row) => ({ ...row, status: "active" }),
          "2026-11-12",
        ),
      ).projects.find((p) => p.id === "project-a")?.status,
    ).toBe("active");
  });
  it("overdue tasks are not buried and legacy priority order is retained within named priorities", () => {
    const state = migrated();
    expect(sortTasks(state.tasks, "actionable", "2026-11-12")[0].id).toBe(
      "task-a",
    );
    const extra = { ...state.tasks[0], id: "later", legacyPriority: 20 };
    expect(
      sortTasks([...state.tasks, extra], "actionable", "2026-11-12").findIndex(
        (t) => t.id === "task-a",
      ),
    ).toBeLessThan(
      sortTasks([...state.tasks, extra], "actionable", "2026-11-12").findIndex(
        (t) => t.id === "later",
      ),
    );
    expect(filterOptions("notes")).not.toContain("paused");
    expect(filterOptions("routines")).not.toContain("done");
  });
  it("history uses net transitions and stable recorded logical days", () => {
    let state = migrated();
    for (const checked of [true, false, true, true])
      state = applyChanges(
        state,
        projectTodoCommand(
          recordSet(state),
          "project-a",
          2,
          { checked },
          "2026-11-12",
        ),
      );
    const counts = projectProgressByDay(state.logs, 0);
    expect(counts.get("project-a")?.get("2026-11-12")).toBe(1);
    expect(projectProgressByDay(state.logs, 23)).toEqual(counts);
  });
});
