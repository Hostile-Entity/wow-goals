import type { AppSettings, AppStateData } from "../types";
import {
  dataStores,
  DB_NAME,
  DB_VERSION,
  emptyData,
  migrateLegacy,
  migrateV2,
} from "./schema";
import { migrateStatuses } from "./statuses";
import type { Change, Mutation, Records, StoreMap, StoreName, StoreRead } from "./records";
export type { Change, Mutation, PutChange, Records, StoreMap, StoreName, StoreRead } from "./records";
const REQUIRED_STORES: StoreName[] = [
  "notes",
  "tasks",
  "projects",
  "goals",
  "routines",
  "completions",
  "reviews",
  "logs",
  "settings",
  "meta",
];

let dbPromise: Promise<IDBDatabase> | null = null;

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

function dayStringFromDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toDayString(iso?: string, dayStartHour = 0): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return dayStringFromDate(new Date());
  if (dayStartHour > 0 && d.getHours() < dayStartHour) {
    d.setDate(d.getDate() - 1);
  }
  return dayStringFromDate(d);
}

export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  d.setDate(d.getDate() + delta);
  return dayStringFromDate(d);
}

export function startOfWeek(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const mondayIndex = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayIndex);
  return dayStringFromDate(d);
}

export function weekKeyToStartDay(weekKey: string): string {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return toDayString();
  const isoYear = Number(match[1]);
  const isoWeek = Number(match[2]);

  const jan4 = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  const week1Start = startOfWeek(dayStringFromDate(jan4));
  return addDays(week1Start, (isoWeek - 1) * 7);
}

export function getWeekDays(weekKey: string): string[] {
  const start = weekKeyToStartDay(weekKey);
  return Array.from({ length: 7 }, (_, idx) => addDays(start, idx));
}

export function formatWeekLabel(weekKey: string): string {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return weekKey;
  return `${match[1]} W${match[2]}`;
}

export function toWeekKey(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return `${new Date().getFullYear()}-W01`;

  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday + 3);
  const isoYear = date.getFullYear();

  const firstThursday = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  const firstWeekday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstWeekday + 3);

  const week =
    1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function ensureStores(db: IDBDatabase): void {
  for (const store of REQUIRED_STORES) {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: "id" });
    }
  }
}

const indexes = [
  ["completions", "by-date", "date"],
  ["reviews", "by-week", "weekKey"],
] as const;

function ensureIndexes(tx: IDBTransaction) {
  for (const [store, name, field] of indexes) {
    const rows = tx.objectStore(store);
    if (!rows.indexNames.contains(name)) rows.createIndex(name, field);
  }
}

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return openAtVersion(name, DB_VERSION);
}

function newerSchemaError(schema: unknown): Error | undefined {
  if (typeof schema === "number" && schema > DB_VERSION) {
    return new Error(
      `Local data uses a newer WowGoals schema (${schema}). Open a newer version of WowGoals. Your data has not been changed.`,
    );
  }
}

function openAtVersion(name: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDB.open(name)
        : indexedDB.open(name, version);
    let migrationError: unknown;
    request.onblocked = () => {
      if (typeof window !== "undefined")
        window.dispatchEvent(new CustomEvent("wowgoals-db-blocked"));
    };
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const wasV2 = db.objectStoreNames.contains("meta");
      const tx = request.transaction!;
      const migrate = () =>
        migrateDatabase(db, tx, event.oldVersion, wasV2, (error) => {
          migrationError = error;
          tx.abort();
        });
      if (!wasV2) {
        migrate();
        return;
      }
      // A logical schema can be newer even when the physical version is not.
      // Check it inside the upgrade transaction, before creating or writing stores.
      const schema = tx.objectStore("meta").get("status-schema");
      schema.onsuccess = () => {
        migrationError = newerSchemaError(schema.result?.data);
        if (migrationError) {
          tx.abort();
        } else if (
          schema.result?.data === DB_VERSION &&
          REQUIRED_STORES.every((store) => db.objectStoreNames.contains(store))
        ) {
          const settings = tx.objectStore("settings").get("settings");
          settings.onsuccess = () => {
            if (settings.result && settings.result.listDensity !== "comfortable") {
              migrate();
              return;
            }
            try {
              // Index-only physical upgrades must not rewrite records or backups.
              ensureIndexes(tx);
            } catch (error) {
              migrationError = error;
              tx.abort();
            }
          };
        } else {
          migrate();
        }
      };
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      const repair = () => {
        const nextVersion = db.version + 1;
        db.close();
        void openAtVersion(name, nextVersion).then(resolve, reject);
      };
      // Physical versions can exceed the app schema after legacy store repairs.
      if (!db.objectStoreNames.contains("meta")) {
        repair();
        return;
      }
      const hasSettings = db.objectStoreNames.contains("settings");
      const tx = db.transaction(["meta", ...["settings", ...indexes.map(([store]) => store)]
        .filter((store) => db.objectStoreNames.contains(store))]);
      const schema = tx.objectStore("meta").get("status-schema");
      const settings = hasSettings ? tx.objectStore("settings").get("settings") : undefined;
      const needsStores = REQUIRED_STORES.some((store) => !db.objectStoreNames.contains(store));
      const needsIndexes = !needsStores &&
        indexes.some(([store, name]) => !tx.objectStore(store).indexNames.contains(name));
      tx.oncomplete = () => {
        const error = newerSchemaError(schema.result?.data);
        if (error) {
          db.close();
          reject(error);
        } else if (
          schema.result?.data !== DB_VERSION ||
          needsStores || needsIndexes ||
          (settings?.result && settings.result.listDensity !== "comfortable")
        ) {
          repair();
        } else {
          resolve(db);
        }
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
    request.onerror = () => {
      if (request.error?.name === "VersionError")
        void openAtVersion(name).then(resolve, reject);
      else reject(migrationError ?? request.error);
    };
  });
}

function migrateDatabase(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
  wasV2: boolean,
  fail: (error: unknown) => void,
): void {
  try {
    ensureStores(db);
    ensureIndexes(tx);
    if (oldVersion === 0) {
      tx.objectStore("settings").put(emptyData().settings);
      tx.objectStore("meta").put({ id: "status-schema", data: DB_VERSION });
      return;
    }
    // Read the pre-upgrade snapshot and perform every migration write in this
    // versionchange transaction. Any failure rolls back both version and data.
    readSnapshotInTransaction(tx, (snapshot, hadSettings) => {
      try {
        const next = wasV2 ? migrateStatuses(migrateV2(snapshot)) : migrateLegacy(snapshot, 1);
        const previousSchema = !wasV2 ? 1
          : !("listDensity" in snapshot.settings) ? 2
            : (snapshot.settings.listDensity as string) === "compact" ? 3 : 4;
        const meta = tx.objectStore("meta");
        put(meta, {
          id: "pre-v5",
          at: new Date().toISOString(),
          data: {
            app: "wow-goals",
            schemaVersion: previousSchema,
            data: snapshot,
          },
        });
        // Keep older safety snapshots intact when only statuses are changing.
        if (!wasV2 || snapshot.settings.listDensity !== "comfortable") {
          put(meta, {
            id: "pre-v4",
            at: new Date().toISOString(),
            data: { app: "wow-goals", schemaVersion: wasV2 ? ("listDensity" in snapshot.settings ? 3 : 2) : 1, data: snapshot },
          });
        }
        if (!wasV2) {
          const priorities = new Map<string, number>();
          for (const task of next.tasks) {
            if (!priorities.has(task.id)) priorities.set(task.id, task.priority);
          }
          put(meta, {
            id: "pre-v2",
            at: new Date().toISOString(),
            data: { app: "wow-goals", schemaVersion: 1, data: snapshot },
          });
          put(meta, {
            id: "migration",
            at: new Date().toISOString(),
            data: {
              priorities: snapshot.tasks.map((task) => ({
                id: task.id,
                from: task.priority,
                to: priorities.get(task.id),
              })),
            },
          });
        }
        for (const storeName of dataStores) {
          const original = snapshot[storeName];
          const updated = next[storeName];
          if (original === updated) continue;
          const store = tx.objectStore(storeName);
          // Migration never reorders rows. Shared references were not changed.
          updated.forEach((row, index) => {
            if (row !== original[index]) put(store, row);
          });
        }
        if (!hadSettings || next.settings !== snapshot.settings)
          put(tx.objectStore("settings"), next.settings);
        put(meta, { id: "status-schema", data: DB_VERSION });
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    fail(error);
  }
}

export async function openDb(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  return dbPromise;
}

function put<T extends { id: string }>(store: IDBObjectStore, row: T) {
  if (store.keyPath === null) store.put(row, row.id);
  else store.put(row);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error("Database transaction failed. No changes were saved."),
      );
    tx.onabort = () =>
      reject(
        tx.error ??
          new Error("Database transaction was aborted. No changes were saved."),
      );
  });
}

export async function getAll<K extends StoreName>(
  store: K,
): Promise<Array<StoreMap[K]>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as Array<StoreMap[K]>);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<K extends StoreName>(
  store: K,
  id: string,
): Promise<StoreMap[K] | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as StoreMap[K] | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putItem<K extends StoreName>(
  store: K,
  item: StoreMap[NoInfer<K>],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  const objectStore = tx.objectStore(store);
  if (objectStore.keyPath === null) {
    const key = (item as { id?: string }).id;
    if (!key) {
      throw new Error(`Missing explicit key for store ${store}`);
    }
    objectStore.put(item, key);
  } else {
    objectStore.put(item);
  }
  await txDone(tx);
}

export async function deleteItem<K extends StoreName>(
  store: K,
  id: string,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}

export async function clearStore<K extends StoreName>(store: K): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}

/** Read only the declared rows, then write the changes and audit entries atomically. */
export function mutateDatabase<
  R extends StoreName = never,
  W extends StoreName = never,
  A extends StoreName = never,
>(
  db: IDBDatabase,
  { read = [], write, afterRead }: Mutation<R, W, A>,
  plan: (records: Records<NoInfer<R | A>>) => NoInfer<Change<W>[]>,
): Promise<Change<W>[]> {
  return new Promise((resolve, reject) => {
    const writable = new Set<StoreName>(write);
    const readStore = (spec: StoreRead) => typeof spec === "string" ? spec : spec.store;
    const stores = new Set([
      ...write, ...read.map(readStore),
      ...(afterRead?.stores ?? []),
    ]);
    const tx = db.transaction([...stores], "readwrite");
    let changes: Change<W>[] = [];
    let failure: unknown;
    tx.oncomplete = () => resolve(changes);
    tx.onabort = tx.onerror = () =>
      reject(
        failure ??
          tx.error ??
          new Error("Database write failed. No changes were saved."),
      );
    // IndexedDB is untyped. Initialize exactly the declared buckets, including
    // secondary stores for which the selector may request zero rows.
    const buckets = new Map<StoreName, unknown[]>(
      [...read.map(readStore), ...(afterRead?.stores ?? [])].map((store) => [store, []]),
    );
    const records = Object.fromEntries(buckets) as Records<R | A>;
    const apply = () => {
      try {
        changes = plan(records);
        for (const change of changes) {
          if (!writable.has(change.store))
            throw new Error(`Undeclared write to ${change.store}.`);
          const store = tx.objectStore(change.store);
          if ("deleteId" in change) store.delete(change.deleteId);
          else put(store, change.row);
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    function readRows(specs: readonly StoreRead[], done: () => void) {
      let remaining = specs.length;
      if (!remaining) {
        done();
        return;
      }
      for (const spec of specs) {
        const store = readStore(spec);
        const rows = buckets.get(store);
        if (!rows) throw new Error(`Undeclared read from ${store}.`);
        const source = tx.objectStore(store);
        const single = typeof spec !== "string" && spec.index === undefined;
        const request = typeof spec === "string" ? source.getAll() :
          spec.index !== undefined ? source.index(spec.index).getAll(spec.key) : source.get(spec.key);
        request.onsuccess = () => {
          if (single) {
            if (request.result !== undefined) rows.push(request.result);
          } else {
            for (const row of request.result) rows.push(row);
          }
          if (--remaining === 0) done();
        };
      }
    }
    readRows(read, () => {
      try {
        if (afterRead) {
          const allowed = new Set<StoreName>(afterRead.stores);
          const selected = afterRead.select(records);
          for (const spec of selected) {
            const store = readStore(spec);
            if (!allowed.has(store)) throw new Error(`Undeclared secondary read from ${store}.`);
          }
          readRows(selected, apply);
        }
        else apply();
      } catch (error) {
        failure = error;
        tx.abort();
      }
    });
  });
}

export type AppStore = keyof AppStateData;
export const coreStores = ["notes", "tasks", "projects", "goals", "routines", "settings"] as const;

export function logicalDayAt(now: number, settings: AppSettings): string {
  const date = new Date(now);
  date.setDate(date.getDate() + settings.dayOffset);
  return toDayString(date.toISOString(), settings.dayStartHour);
}

export async function readAppStores(
  db: IDBDatabase,
  stores: AppStore[],
  { completionAt, logKeys = [] }: { completionAt?: number; logKeys?: string[] } = {},
): Promise<{ data: Partial<AppStateData>; completionDay?: string; logChanges: Change[] }> {
  const data: Partial<AppStateData> = {};
  const scope = new Set(stores);
  if (completionAt !== undefined && scope.has("completions")) scope.add("settings");
  if (logKeys.length) scope.add("logs");
  const tx = db.transaction([...scope], "readonly");
  const done = txDone(tx);
  let completionDay: string | undefined;
  const logChanges: Change<"logs">[] = [];
  for (const store of stores) {
    if ((store === "completions" && completionAt !== undefined) || store === "settings") continue;
    const read = tx.objectStore(store).getAll();
    read.onsuccess = () => { (data[store] as unknown[]) = read.result; };
  }
  if (scope.has("settings")) {
    const read = tx.objectStore("settings").get("settings");
    read.onsuccess = () => {
      const settings = read.result ?? emptyData().settings;
      if (stores.includes("settings")) data.settings = settings;
      if (completionAt === undefined || !scope.has("completions")) return;
      completionDay = logicalDayAt(completionAt, settings);
      const rows = tx.objectStore("completions").index("by-date").getAll(completionDay);
      rows.onsuccess = () => { data.completions = rows.result; };
    };
  }
  for (const id of logKeys) {
    const read = tx.objectStore("logs").get(id);
    read.onsuccess = () => logChanges.push(read.result
      ? { store: "logs", row: read.result }
      : { store: "logs", deleteId: id });
  }
  await done;
  data.logs?.sort((a, b) => b.at.localeCompare(a.at));
  return { data, completionDay, logChanges };
}

// Invoke the callback from the final request, while the transaction can still
// accept writes. Reading rows does not make another application-level copy.
function readSnapshotInTransaction(
  tx: IDBTransaction,
  onRead: (snapshot: AppStateData, hadSettings: boolean) => void,
) {
  const snapshot = emptyData();
  let remaining = dataStores.length + 1;
  let hadSettings = false;
  for (const store of [...dataStores, "settings"] as const) {
    const read = tx.objectStore(store).getAll();
    read.onsuccess = () => {
      if (store === "settings") {
        hadSettings = read.result.length > 0;
        snapshot.settings = read.result[0] ?? snapshot.settings;
      } else (snapshot[store] as unknown[]) = read.result;
      if (--remaining === 0) onRead(snapshot, hadSettings);
    };
  }
}

export async function readSnapshot(db: IDBDatabase): Promise<AppStateData> {
  const tx = db.transaction([...dataStores, "settings"], "readonly");
  const done = txDone(tx);
  let snapshot!: AppStateData;
  readSnapshotInTransaction(tx, (data) => { snapshot = data; });
  await done;
  snapshot.logs.sort((a, b) => b.at.localeCompare(a.at));
  return snapshot;
}

export async function replaceSnapshot(
  db: IDBDatabase,
  data: AppStateData,
): Promise<void> {
  const tx = db.transaction([...dataStores, "settings", "meta"], "readwrite");
  const done = txDone(tx);
  let failure: unknown;
  const abort = (error: unknown) => {
    failure = error;
    tx.abort();
  };
  try {
    // A safety snapshot survives even if a user did not download the offered backup.
    readSnapshotInTransaction(tx, (old) => {
      try {
        put(tx.objectStore("meta"), { id: "pre-import", data: old });
        for (const name of dataStores) {
          const store = tx.objectStore(name);
          store.clear();
          for (const row of data[name]) put(store, row);
        }
        const settings = tx.objectStore("settings");
        settings.clear();
        put(settings, data.settings);
      } catch (error) {
        abort(error);
      }
    });
  } catch (error) {
    abort(error);
  }
  await done.catch((error) => { throw failure ?? error; });
}

export async function clearDatabase(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(REQUIRED_STORES, "readwrite");
  const done = txDone(tx);
  for (const store of REQUIRED_STORES) tx.objectStore(store).clear();
  put(tx.objectStore("settings"), emptyData().settings);
  put(tx.objectStore("meta"), { id: "status-schema", data: DB_VERSION } as StoreMap["meta"]);
  await done;
}
