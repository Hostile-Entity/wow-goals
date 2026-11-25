import { expect, test } from "@playwright/test";
import { legacyFixture } from "../fixtures/legacy";
import { records, seedDatabase, tab } from "./helpers";

test.use({ timezoneId: "UTC" });
test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});

test("capture, process and pause an inbox of about 100 notes without losing mixed notes", async ({ page }) => {
  const data = legacyFixture();
  for (let i = 0; i < 98; i++) {
    data.notes.push({
      ...data.notes[0], id: `inbox-${i}`, title: `Inbox note ${i}`,
      updatedAt: new Date(Date.UTC(2026, 9, 2, 0, i)).toISOString(),
    });
  }
  await seedDatabase(page, data);
  await page.goto("./");
  await expect(tab(page, "Notes")).toHaveAttribute("aria-current", "page");
  await page.getByRole("textbox", { name: "Add a note..." }).fill("Mixed notes\nCall the vendor\nSave the link");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Mixed notes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review inbox" })).toHaveCount(0);
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Review inbox" }).click();

  const note = page.getByRole("dialog", { name: "Edit note" });
  const title = note.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue("Mixed notes");
  await note.getByRole("button", { name: "Create separate task" }).click();
  const task = page.getByRole("dialog", { name: "Create task" });
  await task.getByRole("textbox", { name: "Title" }).fill("Call the vendor");
  await task.getByRole("button", { name: "Save", exact: true }).click();
  await expect(title).toHaveValue("Mixed notes");
  await expect(note.getByRole("textbox", { name: "Description" })).toHaveValue("Call the vendor\nSave the link");
  await note.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(title).toHaveValue("Inbox note 97");
  await note.getByRole("button", { name: "Task", exact: true }).click();
  await expect(title).toHaveValue("Inbox note 96");
  await expect(note.getByRole("button", { name: "Undo conversion" })).toBeVisible();
  await note.getByRole("button", { name: "Open result" }).click();
  const result = page.getByRole("dialog", { name: "Edit task" });
  await expect(result.getByRole("textbox", { name: "Title" })).toHaveValue("Inbox note 97");
  await result.getByRole("button", { name: "Pin to Today" }).click();
  await result.getByRole("button", { name: "Undo conversion" }).click();
  await expect(result.getByRole("alert")).toContainText("has been used or changed");
  await result.getByRole("button", { name: "Unpin focus" }).click();
  await result.getByRole("button", { name: "Close", exact: true }).click();
  await expect(title).toHaveValue("Inbox note 96");
  await note.getByRole("button", { name: "Undo conversion" }).click();
  await expect(note.getByRole("button", { name: "Undo conversion" })).toHaveCount(0);
  await expect(title).toHaveValue("Inbox note 96");
  await note.getByRole("button", { name: "Close", exact: true }).click();
  await expect(note).toHaveCount(0);
  expect((await records(page, "notes")).find(row => row.title === "Mixed notes"))
    .toMatchObject({ status: "archived", description: "Call the vendor\nSave the link" });
  expect((await records(page, "tasks")).map(row => row.title)).toContain("Call the vendor");
  expect((await records(page, "tasks")).map(row => row.title)).not.toContain("Inbox note 97");
});

test("a stale disposition stays on the note and the final successful disposition closes triage", async ({ page, context }) => {
  await seedDatabase(page);
  await page.goto("./");
  await tab(page, "More").click();
  const review = page.getByRole("button", { name: "Review inbox" });
  await review.click();
  const note = page.getByRole("dialog", { name: "Edit note" });
  const other = await context.newPage();
  await other.goto("./");
  await tab(other, "More").click();
  await other.getByRole("button", { name: "Review inbox" }).click();
  const otherNote = other.getByRole("dialog", { name: "Edit note" });
  await otherNote.getByRole("textbox", { name: "Title" }).fill("Revised elsewhere");
  await otherNote.getByRole("button", { name: "Save", exact: true }).click();
  await expect(otherNote).toHaveCount(0);
  await note.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(note.getByRole("alert")).toContainText("changed in another view");
  await expect(note.getByRole("textbox", { name: "Title" })).toHaveValue("Saved message");
  await note.getByRole("button", { name: "Close", exact: true }).click();
  await review.click();
  await expect(note.getByRole("textbox", { name: "Title" })).toHaveValue("Revised elsewhere");
  await note.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(note).toHaveCount(0);
  await expect(review).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Weekly Review" })).toBeVisible();
});

test("Today puts deadlines first and opens both task statuses without changing the saved view", async ({ page }) => {
  const data = legacyFixture();
  data.tasks.push({ ...data.tasks[1], id: "future", title: "Future work", lastPostponedAt: "2026-12-01" });
  await page.clock.setFixedTime(new Date("2026-11-18T12:00:00Z"));
  await seedDatabase(page, data, { tasks: "archived" });
  await page.goto("./");
  await tab(page, "Today").click();
  expect(await page.locator(".today-tab h3").allTextContents()).toEqual(["Due tasks", "Focus 3"]);
  const due = page.locator(".today-task-card").filter({ hasText: "Overdue task" });
  const replan = due.getByRole("button", { name: "Replan", exact: true });
  await replan.click();
  await expect(replan).toHaveAttribute("aria-expanded", "true");
  const panel = due.locator("..").getByRole("region", { name: "Replan Overdue task" });
  await expect(panel).toContainText("Planning changes the work date, not the deadline.");
  await panel.getByRole("button", { name: "Next week" }).click();
  await expect(replan).toHaveAttribute("aria-expanded", "false");
  await expect(due).toContainText("Overdue by");
  await page.getByRole("combobox", { name: "Choose focus task" }).selectOption("task-b");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  await expect(page.locator(".today-first-focus")).toContainText("task-b");
  await expect(page.getByRole("button", { name: "Future work", exact: true })).toHaveCount(0);
  const openTasks = page.getByRole("button", { name: "Open tasks", exact: true });
  await openTasks.press("Enter");
  const taskView = page.getByRole("button", { name: "View: Open tasks", exact: true });
  await taskView.click();
  await expect(page.locator(".filter-menu").getByRole("button")).toHaveText([
    "To do", "Active", "Completed", "Archived", "All items",
  ]);
  await taskView.click();
  await expect(page.locator(".task-list article")).toHaveCount(3);
  await expect(page.locator("#item-task-future")).toContainText("Planned for 2026-12-02");
  const title = page.locator("#item-task-task-a");
  await title.getByRole("button", { name: "Edit" }).click();
  const editor = page.getByRole("dialog", { name: "Edit task" });
  await editor.getByRole("button", { name: "Mark Active" }).click();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(title).toBeVisible();
  await expect(title).toContainText("Active");
  await expect(title).toContainText("Planned for 2026-11-25");
  await tab(page, "Today").click();
  await tab(page, "Tasks").click();
  await expect(page.getByRole("button", { name: "View: Archived" })).toBeVisible();
});

test("weekly review and Projects show one linked task, advance after completion and ignore local checklists", async ({ page }) => {
  const data = legacyFixture();
  data.projects.push({ ...data.projects[0], id: "local", title: "Only a checklist" });
  data.tasks.push({ ...data.tasks[1], id: "next", title: "Second linked task", projectId: "project-a" });
  await page.clock.setFixedTime(new Date("2026-11-18T12:00:00Z"));
  await seedDatabase(page, data);
  await page.goto("./");
  await tab(page, "More").click();
  const website = page.locator(".review-project-row").filter({ hasText: "Website project" });
  await expect(website.getByRole("button", { name: "Second linked task" })).toHaveCount(0);
  await expect(page.locator(".review-project-row").filter({ hasText: "Only a checklist" }))
    .toContainText("No open task");
  await website.getByRole("button", { name: "Overdue task" }).click();
  const editor = page.getByRole("dialog", { name: "Edit task" });
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await expect(website.getByRole("button", { name: "Second linked task" })).toBeVisible();
  await tab(page, "Projects").click();
  const card = page.locator("#item-project-project-a");
  await card.getByRole("button", { name: "Second linked task" }).click();
  await editor.getByRole("button", { name: "Archive", exact: true }).click();
  await editor.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card).toContainText("No open task");
});

for (const theme of ["light", "wow"]) {
  test(`priority rails and footer deadlines fit and stay keyboard accessible in ${theme}`, async ({ page }) => {
    const data = legacyFixture();
    data.settings.theme = theme;
    data.tasks.push({
      ...data.tasks[1], id: "normal", title: "Normal due now", priority: 2, deadline: "2026-11-18",
    });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.clock.setFixedTime(new Date("2026-11-18T12:00:00Z"));
    await seedDatabase(page, data);
    await page.goto("./");
    await tab(page, "Today").click();
    const due = page.locator(".today-task-card").filter({ hasText: "Overdue task" });
    const title = due.getByRole("button", { name: "Overdue task", exact: true });
    await expect(title).toHaveCSS("box-shadow", "none");
    await expect(title).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(due.locator(".task-deadline-due")).toHaveText(/Overdue by/);
    await title.press("Enter");
    await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open tasks", exact: true }).click();
    await page.getByRole("button", { name: "+ Task", exact: true }).press("Enter");
    const editor = page.getByRole("dialog", { name: "Create task" });
    await editor.getByRole("textbox", { name: "Title" }).fill("Optional follow-up");
    const priority = editor.getByRole("combobox", { name: "Priority" });
    await expect(priority).toHaveValue("2");
    await priority.selectOption({ label: "Optional" });
    await editor.getByRole("button", { name: "Save", exact: true }).press("Enter");
    const cards = page.locator(".task-list article");
    await expect(cards).toHaveCount(4);
    await expect(cards.getByText(/^(Normal|Low|High|Optional)$/)).toHaveCount(0);
    await expect(page.locator("#item-task-normal .card-footer-left .task-deadline-due")).toHaveText("Due today");
    await expect(page.locator("#item-task-task-a .card-footer-left .task-deadline-due")).toHaveText(/Overdue by/);
    await expect(page.locator("#item-task-task-b .task-deadline")).toHaveCount(0);
    await expect(page.locator("#item-task-normal .manage-btn")).toHaveCSS("min-width", "44px");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const rails = await cards.evaluateAll(items => items.map(card => {
      const style = getComputedStyle(card);
      return [style.borderInlineStartWidth, style.borderInlineStartColor];
    }));
    expect(rails.map(([width]) => width)).toEqual(["7px", "7px", "7px", "7px"]);
    const colors = rails.map(([, color]) => color);
    expect(new Set(colors).size).toBe(4);
    if (theme === "wow")
      expect(colors).toEqual(["rgb(255, 255, 0)", "rgb(64, 191, 64)", "rgb(255, 26, 26)", "rgb(128, 128, 128)"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
