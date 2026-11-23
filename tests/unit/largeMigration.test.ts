import "fake-indexeddb/auto";
import { IDBObjectStore } from "fake-indexeddb";
import { expect, it, vi } from "vitest";
import { openDatabase, readSnapshot } from "../../src/db";
import { parseBackup } from "../../src/db/backup";
import type { AppStateData } from "../../src/types";
import { legacyFixture } from "../fixtures/legacy";

it("preserves a large keyless v1 database and its original safety export", async () => {
  const data = legacyFixture() as unknown as AppStateData;
  const [task] = data.tasks;
  const [log] = data.logs;
  for (let i = 0; i < 10_000; i++) {
    const suffix = String(i).padStart(5, "0");
    data.tasks.push({ ...task, id: `fixture-task-${suffix}` });
    data.logs.push({ ...log, id: `fixture-log-${suffix}`, action: "create" });
  }
  const name = `large-v1-${crypto.randomUUID()}`;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      for (const [name, rows] of Object.entries(data)) {
        const store = req.result.createObjectStore(name);
        for (const row of Array.isArray(rows) ? rows : [rows]) store.put(row, row.id);
      }
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const put = vi.spyOn(IDBObjectStore.prototype, "put");
  const before = performance.now();
  const db = await openDatabase(name);
  const elapsed = performance.now() - before;
  const logWrites = put.mock.contexts.filter((store) => store.name === "logs").length;
  put.mockRestore();
  try {
    if (process.env.PROFILE_MIGRATION)
      console.info(`Large v1 upgrade: ${elapsed.toFixed(0)} ms, ${logWrites} log puts`);
    expect(logWrites).toBe(1);
    const meta = db.transaction("meta").objectStore("meta");
    const get = (id: string) => new Promise<any>((resolve, reject) => {
      const req = meta.get(id);
      req.onsuccess = () => resolve(req.result.data);
      req.onerror = () => reject(req.error);
    });
    const [saved, audit, snapshot] = await Promise.all([
      get("pre-v5"), get("migration"), readSnapshot(db),
    ]);
    const byId = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const canonical = (snapshot: AppStateData) => Object.fromEntries(
      Object.entries(snapshot).map(([store, rows]) => [store, Array.isArray(rows) ? byId(rows) : rows]),
    );
    expect(canonical(saved.data)).toEqual(canonical(data));
    const restored = parseBackup(saved);
    expect(canonical(snapshot)).toEqual(canonical(restored));
    expect(audit.priorities).toHaveLength(data.tasks.length);
    expect(audit.priorities[0]).toEqual({ id: "fixture-task-00000", from: 9, to: 3 });
  } finally {
    db.close();
  }
});
