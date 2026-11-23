// Run against a locally served production build: node tests/benchmark-startup.mjs [URL]
import { chromium, devices } from "@playwright/test";
const url = process.argv[2] ?? "http://127.0.0.1:4173/wow-goals/";
const browser = await chromium.launch();
const samples = Number(process.env.BENCH_SAMPLES ?? 5);
const results = [];
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function originBytes() {
  try {
    const response = await fetch(new URL("/__test/bytes", url));
    const value = await response.text();
    if (response.ok && /^\d+$/.test(value)) return Number(value);
  } catch {
    // A static preview server can run the timing benchmark without metering.
  }
}

try {
  for (const size of [20, 12000]) {
    const cases = new Map();
    for (let trial = 0; trial < samples; trial++) {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      let page = await context.newPage();
      await page.goto(new URL("icons/icon.svg", url).href);
      await page.evaluate(async ({ size, preindex }) => {
        const data = await new Promise((resolve, reject) => {
          const open = indexedDB.open("wow-goals-db", 5);
          open.onupgradeneeded = () => {
            for (const name of ["notes", "tasks", "projects", "goals", "routines", "completions", "reviews", "logs", "settings", "meta"])
              open.result.createObjectStore(name, { keyPath: "id" });
            open.transaction.objectStore("settings").put({
              id: "settings", dayOffset: 0, dayStartHour: 0, soundVolume: 0, theme: "wow",
              showStatus: true, listDensity: "comfortable", focusTaskIds: [],
            });
            open.transaction.objectStore("meta").put({ id: "status-schema", data: 5 });
            if (preindex) {
              open.transaction.objectStore("completions").createIndex("by-date", "date");
              open.transaction.objectStore("reviews").createIndex("by-week", "weekKey");
            }
          };
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        await new Promise((resolve, reject) => {
          const tx = data.transaction(["logs", "completions", "notes"], "readwrite");
          tx.objectStore("notes").put({
            id: "bench-note", title: "Benchmark note", description: "**Benchmark content**", status: "inbox",
            createdAt: "2020-01-01T00:00:00Z", updatedAt: "2020-01-01T00:00:00Z",
          });
          for (let i = 0; i < size; i++) {
            const at = new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString();
            tx.objectStore("logs").put({ id: `event-${i}`, at, action: "complete", entityType: "task", detail: "Historical audit event" });
            tx.objectStore("completions").put({ id: `done-${i}`, date: at.slice(0, 10), entityType: "task", entityId: `task-${i}`, completedAt: at });
          }
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
        data.close();
      }, { size, preindex: process.env.PREINDEX !== "0" });
      await context.addInitScript(() => {
        let start;
        let end;
        let fullLogs = 0;
        const open = IDBFactory.prototype.open;
        IDBFactory.prototype.open = function (...args) {
          start ??= performance.now();
          return open.apply(this, args);
        };
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
          const tx = transaction.apply(this, args);
          tx.addEventListener("complete", () => { end = performance.now(); });
          return tx;
        };
        const getAll = IDBObjectStore.prototype.getAll;
        IDBObjectStore.prototype.getAll = function (...args) {
          if (this.name === "logs" && !args.length) fullLogs++;
          return getAll.apply(this, args);
        };
        const observer = new MutationObserver(() => {
          if (!document.querySelector('.today-tab select')) return;
          observer.disconnect();
          const usable = performance.now();
          const nav = performance.getEntriesByType("navigation")[0];
          window.startup = {
            navigation: nav.responseEnd,
            js: start - nav.responseEnd,
            idb: (end ?? usable) - start,
            render: usable - (end ?? usable),
            usable,
            fullLogs,
          };
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      const record = (name, value) => cases.set(name, [...(cases.get(name) ?? []), value]);
      const launch = async (name) => {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.goto(url, { waitUntil: "commit" });
        await page.waitForFunction(() => window.startup);
        record(name, await page.evaluate(() => window.startup));
      };
      const beforeInstall = await originBytes();
      await launch("first visit (online)");
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      const afterInstall = await originBytes();
      if (beforeInstall !== undefined && afterInstall !== undefined)
        record("origin response bytes through first install", { bytes: afterInstall - beforeInstall });
      record("installed cache payload", await page.evaluate(async () => {
        const names = (await caches.keys()).filter((name) => name.startsWith("wow-goals-"));
        const cache = await caches.open(names.at(-1));
        const keys = await cache.keys();
        const sizes = await Promise.all(keys.map(async (key) => (await (await cache.match(key)).arrayBuffer()).byteLength));
        return { files: keys.length, bytes: sizes.reduce((sum, size) => sum + size, 0) };
      }));
      const notesStart = await page.evaluate(() => performance.now());
      await page.getByRole("navigation").getByRole("button", { name: "Notes" }).click();
      await page.getByText("Benchmark content", { exact: true }).waitFor();
      record("first Notes navigation", { usable: await page.evaluate((start) => performance.now() - start, notesStart) });
      for (const offline of [false, true]) {
        await context.setOffline(offline);
        await page.close();
        page = await context.newPage();
        await launch(`new page, installed worker (${offline ? "offline" : "online"})`);
        record(`running page, visibility resume (${offline ? "offline" : "online"})`, {
          usable: await page.evaluate(async () => {
            const start = performance.now();
            document.dispatchEvent(new Event("visibilitychange"));
            await new Promise(requestAnimationFrame);
            return performance.now() - start;
          }),
        });
      }
      await context.close();
    }
    for (const [scenario, rows] of cases) {
      const values = Object.fromEntries(Object.keys(rows[0]).map((key) => [key, Math.round(median(rows.map((row) => row[key])))]));
      results.push({ entries: size, scenario, ...values });
    }
  }
  console.table(results);
} finally {
  await browser.close();
}
