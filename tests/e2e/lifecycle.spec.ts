import { expect, Page, test } from "@playwright/test";
import { legacyFixture } from "../fixtures/legacy";
import { records, seedDatabase, tab } from "./helpers";

test.use({ timezoneId: "UTC" });
test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});
async function view(page: Page, name: string) {
  await page.locator(".filter-btn").click();
  await page.locator(".filter-menu").getByRole("button", { name, exact: true }).click();
}

test("each category offers exactly its statuses and All items, and keeps migrated archived items", async ({ page }) => {
  await seedDatabase(page, legacyFixture(), {});
  await page.goto("./");
  const categories = [
    { tab: "Notes", initial: "Inbox", labels: ["Inbox", "Pinned", "Archived", "All items"] },
    { tab: "Tasks", initial: "To do", labels: ["To do", "Active", "Completed", "Archived", "All items"] },
    { tab: "Projects", initial: "Planned", labels: ["Planned", "Active", "Completed", "Archived", "All items"] },
    { tab: "More", sub: "Goals", initial: "Active", labels: ["Active", "Completed", "Archived", "All items"] },
    { tab: "More", sub: "Routines", initial: "On", labels: ["On", "Completed", "Archived", "All items"] },
  ];
  for (const category of categories) {
    await tab(page, category.tab).click();
    if (category.sub) await page.getByRole("button", { name: category.sub, exact: true }).click();
    await expect(page.locator(".filter-btn")).toHaveText(`View: ${category.initial}`);
    await page.locator(".filter-btn").click();
    await expect(page.locator(".filter-menu").getByRole("button")).toHaveText(category.labels);
    await page.locator(".filter-menu").getByRole("button", { name: "All items", exact: true }).click();
    const expectedCount = category.tab === "Tasks" ? 4 : category.tab === "Projects" ? 3 : category.sub === "Goals" ? 1 : 2;
    await expect(page.locator("[id^='item-']")).toHaveCount(expectedCount);
    if (category.sub !== "Goals") {
      await view(page, "Archived");
      await expect(page.locator("[id^='item-']")).toHaveCount(1);
    }
  }
  expect((await records(page, "tasks")).find(row => row.id === "task-discarded").status).toBe("archived");
  expect((await records(page, "projects")).find(row => row.id === "project-paused").status).toBe("archived");
  expect((await records(page, "routines")).find(row => row.id === "routine-discarded").status).toBe("archived");
});

test("pinned notes sort first, conversion archives them, and undo returns to the pinned view", async ({ page }) => {
  const data = legacyFixture();
  data.notes.push({ ...data.notes[0], id: "newer-note", title: "Newer inbox note", updatedAt: "2099-01-01T12:00:00Z" });
  await seedDatabase(page, data, {});
  await page.goto("./");
  await tab(page, "Notes").click();
  const note = page.locator("#item-note-note-a");
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit note", exact: true });
  await editor.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Move to Inbox", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(note).toHaveCount(0);
  await view(page, "All items");
  await expect(page.locator(".note-card").first()).toHaveAttribute("id", "item-note-note-a");
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("button", { name: "Task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit task", exact: true })).toBeVisible();
  let saved = (await records(page, "notes")).find(row => row.id === "note-a");
  expect(saved.status).toBe("archived");
  expect(saved.triagePreviousStatus).toBe("reference");
  expect(saved.triagedId).toBeTruthy();
  await page.getByRole("button", { name: "Undo conversion", exact: true }).click();
  await expect(page.locator(".filter-btn")).toHaveText("View: Pinned");
  await expect(note).toBeVisible();
  saved = (await records(page, "notes")).find(row => row.id === "note-a");
  expect(saved.status).toBe("reference");
  expect(saved.triagedId).toBeUndefined();
});

test("routine Completed means today, survives archive/unarchive, and resets at the logical day boundary", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-13T12:00:00Z") });
  await seedDatabase(page, legacyFixture(), {});
  await page.goto("./");
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Routines", exact: true }).click();
  const routine = page.locator("#item-routine-routine-a");
  await routine.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit routine", exact: true });
  await editor.getByRole("button", { name: "Done today", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Undo today's completion", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(routine).toHaveCount(0);
  await view(page, "Completed");
  await expect(routine).toBeVisible();
  expect((await records(page, "routines")).find(row => row.id === "routine-a").status).toBe("enabled");
  const completions = await records(page, "completions");
  expect(completions.some(row => row.entityId === "routine-a" && row.date === "2026-11-13")).toBe(true);
  await routine.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Done today", exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(routine).toHaveCount(0);
  await view(page, "Archived");
  await routine.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("button", { name: "Unarchive to On", exact: true }).click();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await view(page, "Completed");
  await expect(routine).toBeVisible();
  expect(await records(page, "completions")).toEqual(completions);
  // Midnight alone must not reset a day that starts at 05:00.
  await page.clock.fastForward(16 * 3600000 + 59 * 60000);
  await expect(routine).toBeVisible();
  await page.clock.fastForward(60000);
  await expect(routine).toHaveCount(0);
  await view(page, "On");
  await expect(routine).toBeVisible();
  expect(await records(page, "completions")).toEqual(completions);
  await view(page, "All items");
  await expect(page.locator("[id^='item-routine-']")).toHaveCount(2);
});

test("task Active and Archived views work, completing records history, and permanent deletion clears focus", async ({ page }) => {
  await seedDatabase(page, legacyFixture(), {});
  await page.goto("./");
  await page.getByRole("combobox", { name: "Choose focus task" }).selectOption("task-a");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await tab(page, "Tasks").click();
  const task = page.locator("#item-task-task-a");
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit task", exact: true });
  await editor.getByRole("button", { name: "Mark Active", exact: true }).click();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(task).toHaveCount(0);
  await view(page, "Active");
  await expect(task).toBeVisible();
  await tab(page, "Today").click();
  await expect(page.locator(".today-task-card").filter({ hasText: "Overdue task" })).toBeVisible();
  await tab(page, "Tasks").click();
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await tab(page, "Today").click();
  await expect(page.locator(".today-task-card").filter({ hasText: "Overdue task" })).toHaveCount(0);
  await tab(page, "Tasks").click();
  await view(page, "Archived");
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("button", { name: "Unarchive to Active", exact: true }).click();
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await view(page, "Completed");
  await expect(task).toBeVisible();
  expect((await records(page, "completions")).filter(row => row.entityId === "task-a")).toHaveLength(1);
  await task.getByRole("button", { name: "Edit", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(task).toHaveCount(0);
  expect((await records(page, "settings"))[0].focusTaskIds).toEqual([]);
  expect((await records(page, "tasks")).some(row => row.id === "task-a")).toBe(false);
  await view(page, "All items");
  await expect(task).toHaveCount(0);
});
