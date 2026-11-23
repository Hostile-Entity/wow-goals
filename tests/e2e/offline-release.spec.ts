import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seedDatabase, tab } from "./helpers";

test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});

test("the unmodified production worker caches the whole release and opens every tab offline or during a 503", async ({ page, context, request }) => {
  const worker = await request.get("sw.js");
  expect(await worker.text()).toBe(await readFile("dist/sw.js", "utf8"));
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  await seedDatabase(page);
  await page.goto("./");
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const cached = await page.evaluate(async () => {
    const channel = new MessageChannel();
    const info = new Promise<{ cacheName: string; version: string; appVersion: string }>((resolve) => {
      channel.port1.onmessage = (event) => resolve(event.data);
    });
    navigator.serviceWorker.controller!.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    const { cacheName, version, appVersion } = await info;
    const keys = await (await caches.open(cacheName)).keys();
    return { version, appVersion, paths: keys.map((key) => new URL(key.url).pathname) };
  });
  expect(cached.version).toMatch(/^sha-[a-f0-9]{16}$/);
  expect(cached.appVersion).toBe(version);
  for (const path of ["index.html", "manifest.webmanifest", "icons/icon-512.png", "sounds/iUiInterfaceButtonA.ogg"])
    expect(cached.paths).toContain(`/wow-goals/${path}`);
  for (const chunk of ["NoteMarkdown", "ReviewTab", "GoalMetricChartsModal"])
    expect(cached.paths.some((path) => path.startsWith(`/wow-goals/assets/${chunk}-`))).toBe(true);
  await page.getByRole("button", { name: "Open app settings" }).click();
  await expect(page.getByText(`Version: v${version}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await request.post("/__test/outage");
  expect((await request.get("./")).status()).toBe(503);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await tab(page, "Notes").click();
  await expect(page.getByText("Saved message", { exact: true })).toBeVisible();
  await tab(page, "Tasks").click();
  await expect(page.getByRole("button", { name: "+ Task" })).toBeVisible();
  await tab(page, "Projects").click();
  await expect(page.getByText("Website project", { exact: true })).toBeVisible();
  await tab(page, "More").click();
  await expect(page.getByPlaceholder("What changed this week?")).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await expect(page.getByText("Read daily", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.locator("#item-goal-goal-a").getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Chart history" }).click();
  await expect(page.getByRole("dialog", { name: /chart/i })).toBeVisible();
});

test("a partial deployment cannot replace the previous complete release", async ({ page, request, context }) => {
  await request.post("/__test/synthetic");
  await page.goto("./");
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await request.post("/__test/update?corrupt");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const rejected = new Promise<void>((resolve) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "redundant") resolve();
        });
      }, { once: true });
    });
    await registration.update();
    await rejected;
  });
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain("wow-goals-v31");
  expect(names).not.toContain("wow-goals-v32");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.locator('script[type="module"][src]')).toHaveAttribute("src", /-test31\.js$/);
});
