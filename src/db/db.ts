import {
  AppSettings,
  DailyCompletion,
  EventLog,
  Goal,
  Note,
  Project,
  Routine,
  Task,
  WeeklyReview,
} from "../types";
import { AppStateData } from "../types";
import {
  dataStores,
  DB_NAME,
  DB_VERSION,
  emptyData,
  migrateV1,
} from "./schema";

export type StoreName =
  | "notes"
  | "tasks"
  | "projects"
  | "goals"
  | "routines"
  | "completions"
  | "reviews"
  | "logs"
  | "settings"
  | "meta";
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

export type StoreMap = {
  notes: Note;
  tasks: Task;
  projects: Project;
  goals: Goal;
  routines: Routine;
  completions: DailyCompletion;
  reviews: WeeklyReview;
  logs: EventLog;
  settings: AppSettings;
  meta: { id: string; data?: unknown; at?: string };
};

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

export function openDatabase(name = DB_NAME): Promise<IDBDatabase> {
  return openAtVersion(name, DB_VERSION);
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
      ensureStores(db);
      const tx = request.transaction!;
      if (event.oldVersion === 0) {
        tx.objectStore("settings").put(emptyData().settings);
        return;
      }
      // Read the pre-upgrade snapshot and perform every migration write in this
      // versionchange transaction. Any failure rolls back both version and data.
      const snapshot = emptyData();
      let remaining = dataStores.length + 1;
      for (const store of [...dataStores, "settings"] as const) {
        const read = tx.objectStore(store).getAll();
        read.onsuccess = () => {
          if (store === "settings")
            snapshot.settings = read.result[0] ?? snapshot.settings;
          else (snapshot[store] as unknown[]) = read.result;
          remaining -= 1;
          if (remaining) return;
          try {
            const next = migrateV1(snapshot);
            tx.objectStore("meta").put({
              id: "pre-v2",
              at: new Date().toISOString(),
              data: { app: "wow-goals", schemaVersion: 1, data: snapshot },
            });
            tx.objectStore("meta").put({
              id: "migration",
              at: new Date().toISOString(),
              data: {
                priorities: snapshot.tasks.map((task) => ({
                  id: task.id,
                  from: task.priority,
                  to: next.tasks.find((t) => t.id === task.id)!.priority,
                })),
              },
            });
            for (const storeName of dataStores)
              for (const row of next[storeName])
                put(tx.objectStore(storeName), row);
            put(tx.objectStore("settings"), next.settings);
          } catch (error) {
            migrationError = error;
            tx.abort();
          }
        };
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // The old app repaired missing stores by bumping its physical IDB version.
      // Such a database may already be version 2+ but still contain v1 records.
      if (!db.objectStoreNames.contains("meta")) {
        const nextVersion = db.version + 1;
        db.close();
        void openAtVersion(name, nextVersion).then(resolve, reject);
        return;
      }
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      if (request.error?.name === "VersionError")
        void openAtVersion(name).then(resolve, reject);
      else reject(migrationError ?? request.error);
    };
  });
}

export async function openDb(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = openDatabase().catch((error) => {
      dbPromise = null;
      throw error;
    });
  return dbPromise;
}

function put(store: IDBObjectStore, row: { id: string }) {
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
  item: StoreMap[K],
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

export type Change =
  | { store: StoreName; row: StoreMap[StoreName] }
  | { store: StoreName; deleteId: string };
export type Records = { [K in StoreName]: StoreMap[K][] };

/** Read only affected stores, plan synchronously, then write atomically with logs. */
export function mutateDatabase(
  db: IDBDatabase,
  stores: StoreName[],
  plan: (records: Records) => Change[],
): Promise<Change[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set([...stores, "logs"])], "readwrite");
    let changes: Change[] = [];
    let failure: unknown;
    tx.oncomplete = () => resolve(changes);
    tx.onabort = tx.onerror = () =>
      reject(
        failure ??
          tx.error ??
          new Error("Database write failed. No changes were saved."),
      );
    const records = {} as Records;
    const keys = [...new Set(stores)];
    let remaining = keys.length;
    const apply = () => {
      try {
        changes = plan(records);
        for (const change of changes) {
          const store = tx.objectStore(change.store);
          if ("deleteId" in change) store.delete(change.deleteId);
          else put(store, change.row);
        }
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    for (const store of keys) {
      const read = tx.objectStore(store).getAll();
      read.onsuccess = () => {
        (records[store] as unknown[]) = read.result;
        if (--remaining === 0) apply();
      };
    }
    if (!remaining) apply();
  });
}

export async function readSnapshot(db: IDBDatabase): Promise<AppStateData> {
  const snapshot = emptyData();
  const tx = db.transaction([...dataStores, "settings"], "readonly");
  const done = txDone(tx);
  for (const store of [...dataStores, "settings"] as const) {
    const read = tx.objectStore(store).getAll();
    read.onsuccess = () => {
      if (store === "settings")
        snapshot.settings = read.result[0] ?? snapshot.settings;
      else (snapshot[store] as unknown[]) = read.result;
    };
  }
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
  try {
    // A safety snapshot survives even if a user did not download the offered backup.
    const old = emptyData();
    let remaining = dataStores.length + 1;
    for (const store of [...dataStores, "settings"] as const) {
      const read = tx.objectStore(store).getAll();
      read.onsuccess = () => {
        if (store === "settings") old.settings = read.result[0] ?? old.settings;
        else (old[store] as unknown[]) = read.result;
        if (--remaining) return;
        try {
          put(tx.objectStore("meta"), {
            id: "pre-import",
            data: old,
          } as StoreMap["meta"]);
          for (const name of dataStores) {
            tx.objectStore(name).clear();
            for (const row of data[name]) put(tx.objectStore(name), row);
          }
          tx.objectStore("settings").clear();
          put(tx.objectStore("settings"), data.settings);
        } catch {
          tx.abort();
        }
      };
    }
  } catch {
    tx.abort();
  }
  await done;
}

export async function clearDatabase(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(REQUIRED_STORES, "readwrite");
  const done = txDone(tx);
  for (const store of REQUIRED_STORES) tx.objectStore(store).clear();
  put(tx.objectStore("settings"), emptyData().settings);
  await done;
}
