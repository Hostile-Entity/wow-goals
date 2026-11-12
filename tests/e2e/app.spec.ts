import { test, expect, Page } from "@playwright/test";
import { legacyFixture } from "../fixtures/legacy";
import { migrateV1 } from "../../src/db/schema";
import { AppStateData } from "../../src/types";

const tab = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true });
function canonical<T>(data: T): T {
  const copy = structuredClone(data) as any;
  if (Array.isArray(copy)) copy.sort((a, b) => a.id.localeCompare(b.id));
  for (const value of Object.values(copy))
    if (Array.isArray(value)) value.sort((a, b) => a.id.localeCompare(b.id));
  return copy;
}
async function seedDatabase(page: Page) {
  await page.goto("icons/icon.svg");
  await page.evaluate(async (data) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wow-goals-db", 1);
      request.onupgradeneeded = () => {
        for (const [name, values] of Object.entries(data)) {
          const store = request.result.createObjectStore(name, {
            keyPath: "id",
          });
          for (const row of Array.isArray(values) ? values : [values])
            store.put(row);
        }
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }, legacyFixture());
}
async function seed(page: Page) {
  await seedDatabase(page);
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
}
async function records(page: Page, store: string) {
  return page.evaluate(
    async (store) =>
      new Promise<any[]>((resolve) => {
        const r = indexedDB.open("wow-goals-db");
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
    store,
  );
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:4173/__test/reset");
});

test("real v1 transition, compact projects, checklist edits, complete and reopen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await seed(page);
  const raw = legacyFixture();
  expect(
    (await records(page, "projects")).find((p) => p.id === "project-a")
      .description,
  ).toBe(raw.projects[0].description);
  expect(
    canonical(
      (await records(page, "meta")).find((p) => p.id === "pre-v2").data.data,
    ),
  ).toEqual(canonical(raw));
  await tab(page, "Projects").click();
  const card = page.locator("#item-project-project-a");
  await expect(card.getByText("2 TODOs left")).toBeVisible();
  await expect(card.getByRole("checkbox")).toHaveCount(0);
  await card.getByRole("button", { name: "Open", exact: true }).click();
  let dialog = page.getByRole("dialog", {
    name: "Website project",
    exact: true,
  });
  await dialog
    .getByRole("checkbox", { name: "Write introduction", exact: true })
    .click();
  await expect(dialog.getByText("Active · 1 TODOs left")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "New TODO", exact: true })
    .fill("Publish the website");
  await dialog.getByRole("button", { name: "Add TODO", exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "Publish the website" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Edit project", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Edit project",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill("A portfolio that makes contact easy.");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    card.getByText("A portfolio that makes contact easy."),
  ).toBeVisible();
  await card.getByRole("button", { name: "Open", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Website project", exact: true });
  page.once("dialog", (dialog) => dialog.accept());
  await dialog
    .getByRole("button", { name: "Complete project", exact: true })
    .click();
  await expect(dialog.getByText("Completed · 2 TODOs left")).toBeVisible();
  expect(
    (await records(page, "tasks")).find((t) => t.id === "task-a").status,
  ).toBe("open");
  await dialog
    .getByRole("button", { name: "Reopen as Active", exact: true })
    .click();
  await expect(dialog.getByText("Active · 2 TODOs left")).toBeVisible();
  const changed = (await records(page, "projects")).find(
    (p) => p.id === "project-a",
  );
  expect(changed.description.split("\n")[0]).toBe(
    raw.projects[0].description.split("\n")[0],
  );
  expect(changed.description).toContain("\n\n");
  expect(errors).toEqual([]);
});

test("direct edit, copy fallback, current-draft conversion and safe undo", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await seed(page);
  await tab(page, "Notes").click();
  const card = page.locator("#item-note-note-a");
  await expect(card.getByRole("button", { name: /Select/ })).toHaveCount(0);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit note", exact: true });
  await dialog.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect(
    dialog.getByRole("status").filter({ hasText: "Note copied." }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Saved message\nLine one\nLine two\n🙂",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: () =>
        Promise.reject(new DOMException("Clipboard denied", "NotAllowedError")),
      configurable: true,
    }),
  );
  await dialog.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect(
    dialog.getByRole("textbox", { name: "Message to copy" }),
  ).toHaveValue("Saved message\nLine one\nLine two\n🙂");
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Edited message");
  await dialog
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Fresh description\nSecond line");
  await dialog.getByRole("button", { name: "Task", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const converted = (await records(page, "notes")).find(
    (n) => n.id === "note-a",
  );
  expect(converted.status).toBe("processed");
  expect(converted.triagedId).toBeTruthy();
  expect(
    (await records(page, "tasks")).find((t) => t.id === converted.triagedId),
  ).toMatchObject({
    title: "Edited message",
    description: "Fresh description\nSecond line",
    priority: 2,
  });
  await expect(page.getByRole("button", { name: "Back to Inbox", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Edit task", exact: true })
      .getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Edited message");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Undo conversion", exact: true })
    .click();
  await expect(card).toBeVisible();
  expect(
    (await records(page, "tasks")).some((t) => t.id === converted.triagedId),
  ).toBe(false);
  expect(
    (await records(page, "notes")).find((n) => n.id === "note-a").title,
  ).toBe("Edited message");
});

test("focus tasks and snooze preserve real deadlines and support undo", async ({
  page,
}) => {
  await seed(page);
  await page
    .getByRole("combobox", { name: "Choose focus task" })
    .selectOption("task-b");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unpin focus", exact: true }),
  ).toBeVisible();
  const urgent = page
    .locator(".today-task-card")
    .filter({ hasText: "Overdue task" });
  await urgent.getByRole("button", { name: "Later", exact: true }).click();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Deadline unchanged" }),
  ).toBeVisible();
  expect(
    (await records(page, "tasks")).find((t) => t.id === "task-a").deadline,
  ).toBe("2026-10-11");
  await expect(urgent).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Schedule restored" }),
  ).toBeVisible();
  expect(
    (await records(page, "tasks")).find((t) => t.id === "task-a").scheduledFor,
  ).toBe("2026-10-11");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Unpin focus", exact: true }),
  ).toBeVisible();
});

test("goal primary update, chart history and achievement preserve linked work", async ({
  page,
}) => {
  await seed(page);
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  const card = page.locator("#item-goal-goal-a");
  await expect(card.getByText(/Published pages:/)).toBeVisible();
  await expect(card.getByText(/Contacts:/)).toHaveCount(0);
  await card.getByRole("button", { name: "Open", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "goal-a", exact: true });
  await dialog
    .getByRole("spinbutton", { name: "Primary metric value" })
    .fill("5");
  await dialog
    .getByRole("button", { name: "Update value", exact: true })
    .click();
  await expect
    .poll(async () => (await records(page, "goals"))[0].metrics[0].current)
    .toBe(5);
  await dialog
    .getByRole("button", { name: "Chart history", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Metric Charts", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Metric Charts", exact: true }),
  ).not.toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await dialog
    .getByRole("button", { name: "Achieve goal", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Reopen as Active", exact: true }),
  ).toBeVisible();
  expect(
    (await records(page, "tasks")).find((t) => t.id === "task-a").status,
  ).toBe("open");
});

test("remembered filters, search reveal and dirty dialog keyboard protection", async ({
  page,
}) => {
  await seed(page);
  await tab(page, "Tasks").click();
  await page
    .getByRole("button", { name: "View: Unfinished", exact: true })
    .click();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await page.reload();
  await tab(page, "Tasks").click();
  await expect(
    page.getByRole("button", { name: "View: Completed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search all items" }).click();
  await page
    .getByRole("textbox", { name: "Search all items" })
    .fill("Overdue task");
  await page.getByRole("button", { name: /Overdue task/ }).click();
  await expect(page.locator("#item-task-task-a")).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("wowgoals-filters-v2")!).tasks,
    ),
  ).toBe("done");
  await page
    .locator("#item-task-task-a")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Unsaved task");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Unsaved task");
  await dialog.getByRole("button", { name: "Close", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("invalid backup is non-destructive and valid restore is atomic", async ({
  page,
}) => {
  await seed(page);
  const before = await records(page, "notes");
  await page.getByRole("button", { name: "Open app settings" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ data: {} })),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Import failed");
  expect(await records(page, "notes")).toEqual(before);
  await page.getByRole("button", { name: "Open app settings" }).click();
  let confirms = 0;
  page.on("dialog", (dialog) => {
    confirms += 1;
    void (confirms === 1 ? dialog.accept() : dialog.dismiss());
  });
  const fixture = legacyFixture();
  fixture.notes[0].title = "Restored note";
  await page.locator('input[type="file"]').setInputFiles({
    name: "good.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ app: "wow-goals", schemaVersion: 1, data: fixture }),
    ),
  });
  await expect
    .poll(
      async () =>
        (await records(page, "notes")).find((n) => n.id === "note-a").title,
    )
    .toBe("Restored note");
  expect(
    (await records(page, "meta")).find((m) => m.id === "pre-import").data.notes,
  ).toEqual(before);
});

test("fresh production install works offline after reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await tab(page, "Notes").click();
  await page
    .getByRole("textbox", { name: "Add a note..." })
    .fill("Offline message\nKeep me safe");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    page.getByText("Offline message", { exact: true }),
  ).toBeVisible();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.reload();
  await tab(page, "Notes").click();
  await expect(
    page.getByText("Offline message", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Keep me safe", { exact: true })).toBeVisible();
});

test("installed worker version stays accurate and manual update preserves capture draft", async ({
  page,
  request,
}) => {
  await page.goto("./");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await tab(page, "Notes").click();
  await page
    .getByRole("textbox", { name: "Add a note..." })
    .fill("Draft survives update");
  await page.getByRole("button", { name: "Open app settings" }).click();
  await expect(page.getByText("Version: v31", { exact: true })).toBeVisible();
  await request.post("http://127.0.0.1:4173/__test/update");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await reg.update();
  });
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
  );
  // A waiting worker is NOT the installed version.
  await expect(page.getByText("Version: v31", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Check for update", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "App Settings", exact: true }),
  ).not.toBeVisible();
  await tab(page, "Notes").click();
  await expect(
    page.getByRole("textbox", { name: "Add a note..." }),
  ).toHaveValue("Draft survives update");
  await page.getByRole("button", { name: "Open app settings" }).click();
  await expect(page.getByText("Version: v32", { exact: true })).toBeVisible();
});

test("blocked one-time upgrade waits for the old window without resetting data", async ({
  page,
  context,
}) => {
  await seedDatabase(page);
  const old = await context.newPage();
  await old.goto("icons/icon.svg");
  await old.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open("wow-goals-db", 1);
      request.onsuccess = () => {
        (window as any).__legacyConnection = request.result;
        resolve();
      };
    });
  });
  await page.goto("./");
  await expect(
    page.getByText(/Close the other WowGoals tab\/window/),
  ).toBeVisible();
  expect(
    await old.evaluate(() => (window as any).__legacyConnection.version),
  ).toBe(1);
  await old.close();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  expect(await records(page, "notes")).toHaveLength(2);
  expect(
    (await records(page, "meta")).some((item) => item.id === "pre-v2"),
  ).toBe(true);
});

test("storage write failure keeps the draft and original data for a successful retry", async ({
  page,
}) => {
  await seed(page);
  await tab(page, "Notes").click();
  const card = page.locator("#item-note-note-a");
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit note", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Retained draft");
  await page.evaluate(() => {
    const original: any = IDBObjectStore.prototype.put;
    (window as any).__restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args: any[]) {
      if (this.name === "notes")
        throw new DOMException("Simulated full disk", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Simulated full disk");
  expect(
    (await records(page, "notes")).find((note) => note.id === "note-a").title,
  ).toBe("Saved message");
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Retained draft");
  await page.evaluate(() => (window as any).__restorePut());
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await records(page, "notes")).find((note) => note.id === "note-a").title,
  ).toBe("Retained draft");
});

test("stale editor refuses to overwrite a changed record", async ({ page }) => {
  await seed(page);
  await tab(page, "Tasks").click();
  await page
    .locator("#item-task-task-a")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("My unsaved draft");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open("wow-goals-db");
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("tasks", "readwrite");
        const store = tx.objectStore("tasks");
        const read = store.get("task-a");
        read.onsuccess = () =>
          store.put({
            ...read.result,
            title: "Other view edit",
            updatedAt: "2099-01-01T00:00:00.000Z",
          });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changed in another view",
  );
  expect(
    (await records(page, "tasks")).find((task) => task.id === "task-a").title,
  ).toBe("Other view edit");
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("My unsaved draft");
});

test("fresh create flows, task completion, daily routine, review and full reset", async ({
  page,
}) => {
  await page.goto("./");
  await tab(page, "Notes").click();
  await page
    .getByRole("textbox", { name: "Add a note..." })
    .fill("Keyboard capture");
  await page.getByRole("button", { name: "Add", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Keyboard capture", { exact: true }),
  ).toBeVisible();
  await tab(page, "Tasks").click();
  await page.getByRole("button", { name: "+ Task", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Create task", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Fresh task");
  await expect(
    dialog.getByRole("combobox", { name: "Priority", exact: true }),
  ).toHaveValue("2");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .locator(".entity-card")
    .filter({ hasText: "Fresh task" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await expect
    .poll(async () => (await records(page, "completions")).length)
    .toBe(1);
  await tab(page, "Projects").click();
  await page.getByRole("button", { name: "+ Project", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Create project", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Fresh project");
  await dialog
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill("Independent prose");
  await dialog
    .getByRole("textbox", { name: "TODO source", exact: true })
    .fill("[ ] Prepare\n[x] Research");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("1 TODOs left", { exact: true })).toBeVisible();
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: "+ Goal", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Create goal", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Health");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  await page.getByRole("button", { name: "+ Routine", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Create routine", exact: true });
  await dialog
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Stretch");
  await dialog
    .getByRole("combobox", { name: "Goal", exact: true })
    .selectOption({ label: "Health" });
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await tab(page, "Today").click();
  await page.getByRole("button", { name: "Stretch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "✓ Stretch", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByPlaceholder("What changed this week?").fill("A useful week");
  await page
    .getByRole("button", { name: "Save Weekly Review", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await tab(page, "More").click();
  await expect(page.getByPlaceholder("What changed this week?")).toHaveValue(
    "A useful week",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open app settings" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete all data", exact: true })
    .click();
  await expect.poll(async () => (await records(page, "tasks")).length).toBe(0);
  expect(await records(page, "meta")).toEqual([]);
  expect(await records(page, "notes")).toEqual([]);
  expect(await records(page, "routines")).toEqual([]);
});

test("a real failed upgrade preserves v1 data and can retry without a reset", async ({
  page,
}) => {
  await seedDatabase(page);
  await page.addInitScript(() => {
    const original: any = IDBObjectStore.prototype.put;
    (window as any).__restoreMigrationPut = () => {
      IDBObjectStore.prototype.put = original;
    };
    IDBObjectStore.prototype.put = function (...args: any[]) {
      if (this.name === "tasks")
        throw new DOMException(
          "Simulated migration failure",
          "QuotaExceededError",
        );
      return original.apply(this, args);
    };
  });
  await page.goto("./");
  await expect(
    page.getByText("Simulated migration failure", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () =>
        new Promise((resolve) => {
          const request = indexedDB.open("wow-goals-db");
          request.onsuccess = () => {
            const db = request.result;
            resolve({
              version: db.version,
              hasMeta: db.objectStoreNames.contains("meta"),
            });
            db.close();
          };
        }),
    ),
  ).toEqual({ version: 1, hasMeta: false });
  expect(await records(page, "notes")).toEqual(legacyFixture().notes);
  await page.evaluate(() => (window as any).__restoreMigrationPut());
  await page
    .getByRole("button", { name: "Retry opening data", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  expect(await records(page, "tasks")).toHaveLength(4);
  expect((await records(page, "notes"))[0].status).toBe("inbox");
});

for (const version of [2, 3]) {
test(`v${version} upgrade preserves every record, uses only comfortable cards and supports completion Undo`, async ({ page }) => {
  const data = migrateV1(legacyFixture() as unknown as AppStateData);
  data.notes[0].status = "reference";
  data.settings.focusTaskIds = ["task-b"];
  delete (data.settings as Partial<AppStateData["settings"]>).listDensity;
  if (version === 3) Object.assign(data.settings, { listDensity: "compact" });
  await page.goto("icons/icon.svg");
  await page.evaluate(async ({ data, version }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("wow-goals-db", version);
      request.onupgradeneeded = () => {
        for (const [key, value] of Object.entries(data)) {
          const store = request.result.createObjectStore(key, { keyPath: "id" });
          for (const row of Array.isArray(value) ? value : [value]) store.put(row);
        }
        request.result.createObjectStore("meta", { keyPath: "id" }).put({ id: "existing-safety", data: "keep" });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { data, version });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  for (const [store, before] of Object.entries(data)) {
    const after = await records(page, store);
    if (store === "settings") expect(after[0]).toEqual({ ...before, listDensity: "comfortable" });
    else expect(canonical(after)).toEqual(canonical(before));
  }
  const meta = await records(page, "meta");
  expect(canonical(meta.find(row => row.id === "pre-v4").data.data)).toEqual(canonical(data));
  expect(meta.find(row => row.id === "existing-safety").data).toBe("keep");
  await tab(page, "Tasks").click();
  await expect(page.getByRole("group", { name: "List density", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Compact|Comfortable/ })).toHaveCount(0);
  await page.reload();
  await tab(page, "Tasks").click();
  const card = page.locator("#item-task-task-b");
  await expect(card).not.toContainText("postponed");
  await expect(card.locator(".item-timestamp")).toContainText("Created");
  await card.getByRole("button", { name: "Complete task-b", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(card).toBeVisible();
  expect((await records(page, "tasks")).find(t => t.id === "task-b").status).toBe("doing");
  expect(await records(page, "completions")).toEqual(data.completions);
  await tab(page, "Notes").click();
  await page.getByRole("button", { name: "View: Inbox", exact: true }).click();
  await expect(page.locator(".filter-menu").getByRole("button", { name: "Inbox", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.locator("#item-note-note-a")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
}

test("focused urgent tasks appear only once, with due and paused-project exceptions visible", async ({ page }) => {
  await seed(page);
  await page.getByRole("combobox", { name: "Choose focus task" }).selectOption("task-a");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  const urgent = page.locator(".today-task-card").filter({ hasText: "Overdue task" });
  await expect(urgent).toHaveCount(1);
  await expect(urgent.getByText(/Overdue by/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpin focus", exact: true })).toBeVisible();
  await urgent.getByRole("button", { name: "Later", exact: true }).click();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(urgent).toHaveCount(1);
  await expect(urgent).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpin focus", exact: true })).toHaveCount(0);
  await tab(page, "Projects").click();
  await page.locator("#item-project-project-a").getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark Paused", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await tab(page, "Today").click();
  await expect(urgent).toHaveCount(1);
  await expect(urgent).toContainText("project paused");
});

test("project conversion opens its result, Back to Inbox works, delete is directly accessible", async ({ page }) => {
  await seed(page);
  await tab(page, "Notes").click();
  await page.locator("#item-note-note-a").getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Project", exact: true }).click();
  const result = page.getByRole("dialog", { name: "Saved message", exact: true });
  await expect(result.getByRole("button", { name: "Back to Inbox", exact: true })).toBeVisible();
  await expect(result.getByText("Danger zone", { exact: true })).toHaveCount(0);
  await expect(result.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await result.getByRole("button", { name: "Back to Inbox", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Capture & Triage", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View: Inbox", exact: true }).click();
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(page.locator("#item-note-note-a")).toBeVisible();
});

test("all collection cards show a bottom-right timestamp, including updated notes", async ({ page }) => {
  await seed(page);
  for (const [name, selector] of [["Notes", "#item-note-note-a"], ["Tasks", "#item-task-task-a"], ["Projects", "#item-project-project-a"]]) {
    await tab(page, name).click();
    const timestamp = page.locator(selector).locator(".card-footer .item-timestamp");
    await expect(timestamp).toBeVisible();
    await expect(timestamp).toContainText("Created");
    expect(await timestamp.evaluate(el => getComputedStyle(el).textAlign)).toBe("right");
  }
  await tab(page, "More").click();
  for (const [name, selector] of [["Goals", "#item-goal-goal-a"], ["Routines", "#item-routine-routine-a"]]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(selector).locator(".card-footer .item-timestamp")).toBeVisible();
  }
  await tab(page, "Notes").click();
  const card = page.locator("#item-note-note-a");
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Title", exact: true }).fill("Updated phone note");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.locator(".item-timestamp")).toContainText("Updated");
  await expect(card.locator("time")).toHaveAttribute("datetime", (await records(page, "notes")).find(n => n.id === "note-a").updatedAt);
});

test("phone editor keeps stacked fields, a separate reachable Save bar, and no horizontal overflow", async ({ page }) => {
  await seed(page);
  await tab(page, "Tasks").click();
  await page.getByRole("button", { name: "+ Task", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create task", exact: true });
  for (const size of [{ width: 390, height: 780 }, { width: 320, height: 640 }, { width: 360, height: 420 }]) {
    await page.setViewportSize(size);
    await expect(editor).toBeVisible();
    await expect.poll(async () => editor.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(size.height);
    const metrics = await editor.evaluate(el => {
      const body = el.querySelector(".modal-body") as HTMLElement;
      const header = el.querySelector(".card-top")!.getBoundingClientRect();
      const footer = el.querySelector(".modal-footer")!.getBoundingClientRect();
      const content = body.getBoundingClientRect();
      const label = el.querySelector(".field-label")!.getBoundingClientRect();
      const input = el.querySelector("input")!.getBoundingClientRect();
      return { overflow: body.scrollWidth > body.clientWidth, stacked: label.bottom <= input.top,
        unobscured: content.top >= header.bottom && content.bottom <= footer.top,
        inputFont: parseFloat(getComputedStyle(el.querySelector("input")!).fontSize) };
    });
    expect(metrics).toEqual({ overflow: false, stacked: true, unobscured: true, inputFont: 16 });
    await editor.getByRole("combobox", { name: "Project", exact: true }).selectOption("project-a");
    const save = editor.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeInViewport();
    const footer = editor.locator(".modal-footer");
    expect((await footer.boundingBox())!.y + (await footer.boundingBox())!.height).toBeLessThanOrEqual(size.height + 1);
  }
  await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Created from small phone");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect((await records(page, "tasks")).find(t => t.title === "Created from small phone").projectId).toBe("project-a");
});

test("visible Discard and Delete require confirmation and cancellation preserves the item", async ({ page }) => {
  await seed(page);
  await tab(page, "Notes").click();
  await page.locator("#item-note-note-a").getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByText("Danger zone", { exact: true })).toHaveCount(0);
  for (const name of ["Discard", "Delete"]) {
    page.once("dialog", dialog => dialog.dismiss());
    await editor.getByRole("button", { name, exact: true }).click();
    expect((await records(page, "notes")).find(n => n.id === "note-a").status).toBe("inbox");
  }
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "Discard", exact: true }).click();
  await expect.poll(async () => (await records(page, "notes")).find(n => n.id === "note-a").status).toBe("discarded");
  await editor.getByRole("button", { name: "Recover", exact: true }).click();
  await expect.poll(async () => (await records(page, "notes")).find(n => n.id === "note-a").status).toBe("inbox");
});

test("tab headers sit directly below the top bar without a blank spacer", async ({ page }) => {
  await seed(page);
  for (const [name, selector] of [["Notes", ".section-head"], ["Tasks", ".section-head"], ["Projects", ".section-head"], ["More", ".more-tabs"]]) {
    await tab(page, name).click();
    const topBar = await page.locator(".topbar").boundingBox();
    const tabBar = await page.locator(selector).boundingBox();
    expect(Math.abs(tabBar!.y - (topBar!.y + topBar!.height))).toBeLessThanOrEqual(1);
  }
});

test("item cards use tighter padding and shorter actions without hiding timestamps", async ({ page }) => {
  await seed(page);
  for (const [name, selector] of [["Notes", "#item-note-note-a"], ["Tasks", "#item-task-task-a"], ["Projects", "#item-project-project-a"]]) {
    await tab(page, name).click();
    const card = page.locator(selector);
    expect(await card.evaluate(el => {
      const style = getComputedStyle(el);
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
    })).toEqual(["12px", "12px", "12px", "12px"]);
    await expect(card.locator(".item-timestamp")).toBeVisible();
    for (const button of await card.getByRole("button").all())
      expect((await button.boundingBox())!.height).toBe(36);
  }
  await tab(page, "Tasks").click();
  const actions = page.locator("#item-task-task-a .entity-side");
  const edit = await actions.getByRole("button", { name: "Edit", exact: true }).boundingBox();
  const done = await actions.getByRole("button", { name: "Complete Overdue task", exact: true }).boundingBox();
  expect(Math.abs(edit!.y - done!.y)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("note composer centers one line and still grows, scrolls and captures multiline text", async ({ page }) => {
  await page.goto("./");
  await tab(page, "Notes").click();
  const composer = page.getByRole("textbox", { name: "Add a note...", exact: true });
  async function checkSingleLine() {
    await expect.poll(async () => composer.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(44);
    const geometry = await composer.evaluate(el => {
      const s = getComputedStyle(el);
      return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom),
        content: el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom),
        line: parseFloat(s.lineHeight), font: parseFloat(s.fontSize) };
    });
    expect(geometry.top).toBe(geometry.bottom);
    expect(geometry.content).toBe(geometry.line);
    expect(geometry.font).toBe(16);
  }
  await checkSingleLine();
  await composer.fill("One line");
  await checkSingleLine();
  await composer.fill("Multiline title\nSecond line\nThird line");
  await expect.poll(async () => composer.evaluate(el => el.clientHeight)).toBeGreaterThan(44);
  expect(await composer.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true);
  await composer.fill(Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join("\n"));
  await expect(composer).toHaveCSS("overflow-y", "auto");
  expect((await composer.boundingBox())!.height).toBe(154);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".note-card").getByText("Line 1", { exact: true })).toBeVisible();
  expect((await records(page, "notes"))[0].description).toBe(Array.from({ length: 8 }, (_, i) => `Line ${i + 2}`).join("\n"));
  await checkSingleLine();
});

test("Today shows its controls without instructional paragraphs", async ({ page }) => {
  await seed(page);
  await expect(page.getByText("Choose up to three priorities for today.", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/No focus tasks yet\. Pick an open task/)).toHaveCount(0);
  await expect(page.getByText(/Due and overdue work stays visible/)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Choose focus task" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pin", exact: true })).toBeVisible();
  await page.locator(".today-task-card").filter({ hasText: "Overdue task" }).getByRole("button", { name: "Later", exact: true }).click();
  await expect(page.getByText("The deadline does not change. Urgent deadlines remain visible.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tomorrow", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next week", exact: true })).toBeVisible();
});

test("buttons are shorter while card action widths and form input heights stay unchanged", async ({ page }) => {
  await seed(page);
  for (const name of ["Search all items", "Open app settings"]) {
    expect((await page.getByRole("button", { name, exact: true }).boundingBox())!.height).toBe(36);
  }
  await tab(page, "Notes").click();
  const edit = page.locator("#item-note-note-a").getByRole("button", { name: "Edit", exact: true });
  expect(await edit.boundingBox()).toMatchObject({ width: 64, height: 36 });
  const add = page.getByRole("button", { name: "Add", exact: true });
  expect((await add.boundingBox())!.height).toBe(40);
  await expect(page.getByRole("textbox", { name: "Add a note...", exact: true })).toHaveCSS("min-height", "44px");
  await edit.click();
  const editor = page.getByRole("dialog");
  expect((await editor.getByRole("button", { name: "Close", exact: true }).boundingBox())!.height).toBe(36);
  expect((await editor.getByRole("button", { name: "Save", exact: true }).boundingBox())!.height).toBe(40);
  expect((await editor.getByRole("textbox", { name: "Title", exact: true }).boundingBox())!.height).toBe(48);
  expect((await editor.getByRole("button", { name: "Task", exact: true }).boundingBox())!.height).toBe(36);
});
