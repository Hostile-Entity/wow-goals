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

type StoreName =
  | "notes"
  | "tasks"
  | "projects"
  | "goals"
  | "routines"
  | "completions"
  | "reviews"
  | "logs"
  | "settings";

const DB_NAME = "wow-goals-db";
const DB_VERSION = 1;
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
];

type StoreMap = {
  notes: Note;
  tasks: Task;
  projects: Project;
  goals: Goal;
  routines: Routine;
  completions: DailyCompletion;
  reviews: WeeklyReview;
  logs: EventLog;
  settings: AppSettings;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

export function toDayString(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function toWeekKey(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  const first = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - first.getTime()) / 86400000);
  const week = Math.ceil((days + first.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function ensureStores(db: IDBDatabase): void {
  for (const store of REQUIRED_STORES) {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: "id" });
    }
  }
}

function openWithVersion(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => {
      ensureStores(request.result);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function hasRequiredStores(db: IDBDatabase): boolean {
  return REQUIRED_STORES.every((store) => db.objectStoreNames.contains(store));
}

async function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    try {
      const db = await openWithVersion(DB_VERSION);
      if (hasRequiredStores(db)) return db;
      const nextVersion = db.version + 1;
      db.close();
      return openWithVersion(nextVersion);
    } catch (error) {
      const maybeVersionError = error as DOMException;
      if (maybeVersionError?.name !== "VersionError") {
        throw error;
      }

      const currentDb = await openWithVersion();
      if (hasRequiredStores(currentDb)) {
        return currentDb;
      }
      const nextVersion = currentDb.version + 1;
      currentDb.close();
      return openWithVersion(nextVersion);
    }
  })();

  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll<K extends StoreName>(store: K): Promise<Array<StoreMap[K]>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as Array<StoreMap[K]>);
    req.onerror = () => reject(req.error);
  });
}

export async function getById<K extends StoreName>(store: K, id: string): Promise<StoreMap[K] | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as StoreMap[K] | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function putItem<K extends StoreName>(store: K, item: StoreMap[K]): Promise<void> {
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

export async function deleteItem<K extends StoreName>(store: K, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
}
