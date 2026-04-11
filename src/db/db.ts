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

  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
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

export async function clearStore<K extends StoreName>(store: K): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).clear();
  await txDone(tx);
}
