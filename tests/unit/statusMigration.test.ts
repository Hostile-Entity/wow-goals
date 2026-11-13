import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { openDatabase, readSnapshot } from "../../src/db";
import { backupPayload, parseBackup } from "../../src/db/backup";
import { DB_VERSION, migrateV1 } from "../../src/db/schema";
import { migrateStatuses } from "../../src/db/statuses";
import { AppStateData } from "../../src/types";
import { legacyFixture } from "../fixtures/legacy";

function oldData() {
  const data = migrateV1(legacyFixture() as unknown as AppStateData);
  data.notes[0].status = "reference";
  data.notes[1].triagedId = "task-a";
  data.notes[1].triagePreviousStatus = "reference";
  data.notes.push({ ...data.notes[0], id: "trashed-note", status: "discarded", triagePreviousStatus: "discarded" });
  data.routines.push({ ...data.routines[0], id: "paused-routine", status: "paused" });
  data.settings.focusTaskIds = ["task-a"];
  return data;
}
const canonical = (value: AppStateData) => {
  const copy = structuredClone(value);
  for (const rows of Object.values(copy))
    if (Array.isArray(rows)) rows.sort((a, b) => a.id.localeCompare(b.id));
  return copy;
};
async function seed(version = 4) {
  const name = `status-upgrade-${crypto.randomUUID()}`;
  const data = oldData();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => {
      for (const [name, rows] of Object.entries(data)) {
        const store = request.result.createObjectStore(name, { keyPath: "id" });
        for (const row of Array.isArray(rows) ? rows : [rows]) store.put(row);
      }
      const meta = request.result.createObjectStore("meta", { keyPath: "id" });
      meta.put({ id: "pre-v4", data: "original interface-upgrade snapshot" });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  return { name, data };
}
const metadata = (db: IDBDatabase) => new Promise<any[]>(resolve => {
  const request = db.transaction("meta").objectStore("meta").getAll();
  request.onsuccess = () => resolve(request.result);
});

describe("status schema upgrade", () => {
  it("only remaps retired statuses and provenance, never text, timestamps, links, or history", () => {
    const before = oldData();
    const next = migrateStatuses(before);
    expect(next.notes[0].status).toBe("reference");
    expect(next.notes[1]).toMatchObject({ status: "archived", triagedTo: "task", triagedId: "task-a", triagePreviousStatus: "reference" });
    expect(next.notes[2]).toMatchObject({ status: "archived", triagePreviousStatus: "archived" });
    expect(next.projects.find(row => row.id === "project-paused")?.status).toBe("archived");
    expect(next.tasks.find(row => row.id === "task-discarded")?.status).toBe("archived");
    expect(next.routines.filter(row => row.status === "archived")).toHaveLength(2);
    expect(before.notes[1].status).toBe("processed");
    for (const key of ["notes", "tasks", "projects", "goals", "routines"] as const) {
      expect(next[key]).toHaveLength(before[key].length);
      for (const item of next[key]) {
        const original = before[key].find(row => row.id === item.id)!;
        const { status: _status, triagePreviousStatus: _previous, ...fields } = item as AppStateData["notes"][number];
        const { status: _oldStatus, triagePreviousStatus: _oldPrevious, ...oldFields } = original as AppStateData["notes"][number];
        expect(fields).toEqual(oldFields);
      }
    }
    expect(next.logs).toEqual(before.logs);
    expect(next.completions).toEqual(before.completions);
    expect(next.settings).toEqual(before.settings);
  });

  it.each([4, 9])("upgrades physical version %s once, preserving older snapshots and a restorable pre-v5 backup", async version => {
    const { name, data } = await seed(version);
    const db = await openDatabase(name);
    expect(db.version).toBe(Math.max(DB_VERSION, version + 1));
    const next = await readSnapshot(db);
    expect(canonical(next)).toEqual(canonical(migrateStatuses(data)));
    const meta = await metadata(db);
    expect(meta.find(row => row.id === "pre-v4").data).toBe("original interface-upgrade snapshot");
    expect(canonical(meta.find(row => row.id === "pre-v5").data.data)).toEqual(canonical(data));
    expect(canonical(parseBackup(meta.find(row => row.id === "pre-v5").data))).toEqual(canonical(next));
    expect(meta.find(row => row.id === "status-schema").data).toBe(DB_VERSION);
    const physicalVersion = db.version;
    db.close();
    const reopened = await openDatabase(name);
    expect(reopened.version).toBe(physicalVersion);
    expect(await metadata(reopened)).toEqual(meta);
    reopened.close();
  });

  it("rolls back partial status writes and metadata on failure, then retries safely", async () => {
    const { name, data } = await seed();
    const put = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
      if (this.name === "tasks") throw new Error("status migration write failed");
      return put.apply(this, args);
    });
    await expect(openDatabase(name)).rejects.toThrow("status migration write failed");
    spy.mockRestore();
    const old = await new Promise<IDBDatabase>(resolve => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
    });
    expect(old.version).toBe(4);
    expect(canonical(await readSnapshot(old))).toEqual(canonical(data));
    expect((await metadata(old)).some(row => row.id === "pre-v5")).toBe(false);
    old.close();
    const retry = await openDatabase(name);
    expect(canonical(await readSnapshot(retry))).toEqual(canonical(migrateStatuses(data)));
    retry.close();
  });

  it.each([2, 3, 4])("imports schema %s backups without deleting old Trash, Paused, or Archived records", schemaVersion => {
    const data = oldData();
    const before = structuredClone(data);
    expect(parseBackup({ app: "wow-goals", schemaVersion, data })).toEqual(migrateStatuses(data));
    expect(data).toEqual(before);
    const next = parseBackup({ app: "wow-goals", schemaVersion, data });
    expect(parseBackup(backupPayload(next))).toEqual(next);
  });
});
