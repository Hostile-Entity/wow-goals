import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parseBackup } from "../../src/db/backup";
import { DB_VERSION, migrateV1 } from "../../src/db/schema";
import { AppStateData } from "../../src/types";
import { legacyFixture } from "../fixtures/legacy";
import { records, tab } from "./helpers";

test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value))
    return value.map(canonical).sort((a: any, b: any) =>
      a?.id && b?.id ? a.id.localeCompare(b.id) : 0);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, canonical(value)]));
  return value;
};
function previousData() {
  const data = migrateV1(legacyFixture() as unknown as AppStateData);
  data.notes[0].description = "  Original text 🙂\n\n**Markdown** stays raw\n- [ ] A line\n" + "long description\n".repeat(30);
  data.notes[1].triagedId = "task-a";
  data.notes[1].triagePreviousStatus = "reference";
  data.notes.push({ ...data.notes[0], id: "saved-note", status: "reference" });
  data.notes.push({ ...data.notes[0], id: "trashed-note", status: "discarded" });
  data.projects.push({ ...data.projects[0], id: "planned-project", status: "planned" });
  data.goals.push({ ...data.goals[0], id: "completed-goal", status: "achieved" });
  data.goals.push({ ...data.goals[0], id: "trashed-goal", status: "discarded" });
  data.routines.push({ ...data.routines[0], id: "paused-routine", status: "paused" });
  data.completions.push({
    id: "old-routine-completion", entityType: "routine", entityId: "routine-a",
    date: "2026-10-11", completedAt: "2026-10-11T12:00:00.000Z",
  });
  data.settings.focusTaskIds = ["task-a", "task-b"];
  return data;
}
async function seedV4(page: Page, keyless = false) {
  const data = previousData();
  await page.goto("icons/icon.svg");
  await page.evaluate(async ({ data, keyless }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wow-goals-db", 4);
      request.onupgradeneeded = () => {
        for (const [name, values] of Object.entries(data)) {
          const store = request.result.createObjectStore(name, keyless ? undefined : { keyPath: "id" });
          for (const row of Array.isArray(values) ? values : [values])
            keyless ? store.put(row, row.id) : store.put(row);
        }
        const meta = request.result.createObjectStore("meta", { keyPath: "id" });
        for (const id of ["pre-v2", "pre-v3", "pre-v4"])
          meta.put({ id, data: { original: id, keep: true } });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { data, keyless });
  return data;
}
async function snapshot(page: Page, template: AppStateData) {
  const next = {} as Record<string, unknown>;
  for (const key of Object.keys(template)) {
    const rows = await records(page, key);
    next[key] = key === "settings" ? rows[0] : rows;
  }
  return next as unknown as AppStateData;
}
const expectedUpgrade = (before: AppStateData) => {
  const next = structuredClone(before);
  for (const key of ["notes", "tasks", "projects", "goals", "routines"] as const)
    for (const row of next[key])
      if (["processed", "paused", "discarded"].includes(row.status)) row.status = "archived";
  return next;
};

for (const keyless of [false, true]) {
  test(`v4 upgrade preserves every field and safety export, and does not run again (keyless=${keyless})`, async ({ page }) => {
    const before = await seedV4(page, keyless);
    const oldMeta = await records(page, "meta");
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    const after = await snapshot(page, before);
    expect(canonical(after)).toEqual(canonical(expectedUpgrade(before)));
    const meta = await records(page, "meta");
    for (const row of oldMeta) expect(meta.find(saved => saved.id === row.id)).toEqual(row);
    const safety = meta.find(row => row.id === "pre-v5");
    expect(safety.data.schemaVersion).toBe(4);
    expect(canonical(safety.data.data)).toEqual(canonical(before));
    expect(canonical(parseBackup(safety.data))).toEqual(canonical(after));
    expect(meta.find(row => row.id === "status-schema").data).toBe(DB_VERSION);

    await page.getByRole("button", { name: "Open app settings" }).click();
    const settings = page.getByRole("dialog", { name: "App Settings", exact: true });
    await settings.getByText("One-time transition and restore safety", { exact: true }).click();
    const download = page.waitForEvent("download");
    await settings.getByRole("button", { name: "Export pre-status-upgrade data", exact: true }).click();
    const file = await download;
    expect(JSON.parse(await readFile((await file.path())!, "utf8"))).toEqual(safety.data);
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await tab(page, "Notes").click();
    await page.locator("#item-note-note-a").getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit note", exact: true });
    await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Edited after the one-time upgrade");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    const edited = await snapshot(page, before);
    await page.addInitScript(() => {
      IDBObjectStore.prototype.put = function() {
        throw new Error("A second launch must not write or repeat the upgrade");
      };
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    expect(canonical(await snapshot(page, before))).toEqual(canonical(edited));
    expect(await records(page, "meta")).toEqual(meta);
  });
}

test("a late v4 upgrade quota failure leaves the complete original database intact and retry succeeds", async ({ page }) => {
  const before = await seedV4(page);
  const oldMeta = await records(page, "meta");
  await page.addInitScript(() => {
    (window as any).__failMigration = true;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
      // Settings is written after all entity/history writes and the safety snapshot.
      if (this.name === "settings" && (window as any).__failMigration)
        throw new DOMException("Simulated quota exceeded during upgrade", "QuotaExceededError");
      return put.apply(this, args);
    };
  });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Simulated quota exceeded");
  expect(canonical(await snapshot(page, before))).toEqual(canonical(before));
  expect(await records(page, "meta")).toEqual(oldMeta);
  const version = await page.evaluate(() => new Promise<number>(resolve => {
    const request = indexedDB.open("wow-goals-db");
    request.onsuccess = () => { const db = request.result; resolve(db.version); db.close(); };
  }));
  expect(version).toBe(4);
  await page.evaluate(() => { (window as any).__failMigration = false; });
  await page.getByRole("button", { name: "Retry opening data", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  expect(canonical(await snapshot(page, before))).toEqual(canonical(expectedUpgrade(before)));
  expect(canonical((await records(page, "meta")).find(row => row.id === "pre-v5").data.data)).toEqual(canonical(before));
});
