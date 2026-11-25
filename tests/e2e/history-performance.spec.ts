import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { emptyData } from "../../src/db/schema";
import { legacyFixture } from "../fixtures/legacy";
import { tab } from "./helpers";

test.use({ timezoneId: "UTC" });

const DAY = "2026-11-18";
const NOW = `${DAY}T12:00:00.000Z`;
const count = (page: Page) => page.locator(".today-header .meta");
const openSettings = (page: Page) => page.getByRole("button", { name: "Open app settings" }).click();

test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});

test("Today reads one completion day and no audit history, while Review, Complete Log and export keep it", async ({ page, context }) => {
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto("icons/icon.svg");
  await page.evaluate(async ({ data, now, day }) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("wow-goals-db", 5);
      open.onupgradeneeded = () => {
        for (const name of [...Object.keys(data), "meta"]) open.result.createObjectStore(name, { keyPath: "id" });
        const tx = open.transaction!;
        const completions = tx.objectStore("completions");
        const logs = tx.objectStore("logs");
        completions.createIndex("by-date", "date");
        tx.objectStore("reviews").createIndex("by-week", "weekKey");
        tx.objectStore("settings").put({ ...data.settings, dayStartHour: 0 });
        tx.objectStore("meta").put({ id: "status-schema", data: 5 });
        for (let i = 0; i < 12000; i++) {
          const completedAt = new Date(Date.UTC(2019, 0, 1) + i * 3600000).toISOString();
          logs.put({ id: `old-log-${i}`, at: completedAt, action: "complete", entityType: "task", detail: "Old history" });
          completions.put({ id: `old-completion-${i}`, date: completedAt.slice(0, 10), entityId: "t", entityType: "task", completedAt });
        }
        logs.put({
          id: "deleted", at: now, action: "delete-permanent", entityType: "routine", entityId: "r",
          detail: JSON.stringify({ title: "Deleted routine", occurredDay: day, createdAt: now }),
        });
        completions.put({ id: "today-task", date: day, entityId: "t", entityType: "task", completedAt: now });
        for (const id of ["today-routine", "legacy-duplicate"])
          completions.put({ id, date: day, entityId: "r", entityType: "routine", completedAt: now });
      };
      open.onsuccess = () => { open.result.close(); resolve(); };
      open.onerror = () => reject(open.error);
    });
  }, { data: emptyData(), now: NOW, day: DAY });
  await page.addInitScript(() => {
    const reads: string[] = [];
    Object.assign(window, { reads });
    const scan = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      reads.push(`all:${this.name}`);
      return scan.apply(this, args);
    };
    const range = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      reads.push(`${this.name}:${args[0]}`);
      return range.apply(this, args);
    };
  });
  const reads = () => page.evaluate(() => (window as unknown as { reads: string[] }).reads);
  await page.goto("./");
  await tab(page, "Today").click();
  await expect(count(page)).toHaveText("1 tasks done · 2 routines done · 0 notes in inbox");
  expect(await reads()).toContain(`by-date:${DAY}`);
  expect(await reads()).not.toContain("all:logs");
  expect(await reads()).not.toContain("all:completions");
  expect(await reads()).not.toContain("all:reviews");
  expect(await reads()).toContain("all:tasks");

  await tab(page, "More").click();
  await expect(page.locator(".review-grid").getByText("Deleted routine", { exact: false })).toBeVisible();
  await expect(page.locator(".review-grid-value").filter({ hasText: /^1$/ })).toHaveCount(1);
  expect(await reads()).toEqual(expect.arrayContaining(["all:logs", "all:completions", "all:reviews"]));

  await openSettings(page);
  const logTab = context.waitForEvent("page");
  await page.getByRole("button", { name: "Complete log", exact: true }).click();
  const log = await logTab;
  await expect(log.locator("article.log").first()).toContainText("delete-permanent");
  await log.close();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data to JSON" }).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, "utf8"));
  expect(exported.data.logs).toHaveLength(12001);
  expect(exported.data.completions).toHaveLength(12003);
  expect(exported.data.logs[0].id).toBe("deleted");
});

test("resuming Today reconciles missed writes and the new logical day", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined }); });
  await page.clock.setFixedTime(new Date(NOW));
  await page.goto("./");
  await tab(page, "Today").click();
  await expect(count(page)).toContainText("0 tasks done");
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("wow-goals-db");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("completions", "readwrite");
      tx.objectStore("completions").put({
        id: "other-tab", date: "2026-11-19", entityId: "other-task", entityType: "task",
        completedAt: "2026-11-19T07:00:00.000Z",
      });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  await expect(count(page)).toContainText("0 tasks done");
  await page.clock.setFixedTime(new Date("2026-11-19T12:00:00.000Z"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(count(page)).toContainText("1 tasks done");
});

test("import and reset reconcile all data in another tab", async ({ page, context }) => {
  await page.goto("./");
  await tab(page, "More").click();
  await expect(page.getByPlaceholder("What changed this week?")).toBeVisible();
  const writer = await context.newPage();
  await writer.goto("./");
  await openSettings(writer);
  const fixture = legacyFixture();
  fixture.notes[0].title = "Restored in another tab";
  const confirmRestore = (dialog: import("@playwright/test").Dialog) => {
    void (dialog.message().startsWith("Restore ") ? dialog.accept() : dialog.dismiss());
  };
  writer.on("dialog", confirmRestore);
  await writer.locator('input[type="file"]').setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "wow-goals", schemaVersion: 1, data: fixture })),
  });
  await expect(page.getByText(/1 untriaged notes/)).toBeVisible();
  writer.off("dialog", confirmRestore);

  await expect(page.locator(".review-grid").getByText("Read daily", { exact: true })).toBeVisible();
  writer.once("dialog", (dialog) => dialog.accept());
  await writer.getByRole("button", { name: "Delete all data", exact: true }).click();
  await expect(page.getByText(/0 untriaged notes/)).toBeVisible();
  await expect(page.locator(".review-grid").getByText("Read daily", { exact: true })).not.toBeVisible();
});
