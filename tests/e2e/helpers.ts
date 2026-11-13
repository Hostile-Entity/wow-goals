import { Page } from "@playwright/test";
import { legacyFixture } from "../fixtures/legacy";

export const tab = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true });

export async function seedDatabase(
  page: Page,
  data = legacyFixture(),
  // Most legacy fixture projects are Active; default to that explicit view.
  filters: Record<string, string> = { projects: "active" },
) {
  await page.goto("icons/icon.svg");
  await page.evaluate(async ({ data, filters }) => {
    localStorage.setItem("wowgoals-filters-v2", JSON.stringify(filters));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wow-goals-db", 1);
      request.onupgradeneeded = () => {
        for (const [name, values] of Object.entries(data)) {
          const store = request.result.createObjectStore(name, { keyPath: "id" });
          for (const row of Array.isArray(values) ? values : [values]) store.put(row);
        }
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { data, filters });
}

export async function records(page: Page, store: string) {
  return page.evaluate(async store => new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open("wow-goals-db");
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction(store).objectStore(store).getAll();
      read.onsuccess = () => { resolve(read.result); db.close(); };
      read.onerror = () => { reject(read.error); db.close(); };
    };
    request.onerror = () => reject(request.error);
  }), store);
}
