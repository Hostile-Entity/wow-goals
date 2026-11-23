import { expect, Page, test } from "@playwright/test";
import { records, seedDatabase, tab } from "./helpers";

const reflection = (page: Page) => page.getByPlaceholder("What changed this week?");
const save = (page: Page) => page.getByRole("button", { name: "Save Weekly Review", exact: true });
const edit = (page: Page) => page.locator(".review-checklist").getByRole("button", { name: "Edit", exact: true });
const goalsChecked = (page: Page) => page.getByRole("checkbox", { name: "Goals reviewed" });

test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset");
});

async function openReview(page: Page) {
  await page.goto("./");
  await tab(page, "More").click();
}

test("a week keeps its unsaved reflection, checklist and edit mode through a cross-tab refresh and navigation", async ({ page, context }) => {
  await page.addInitScript(() => {
    const scans: string[] = [];
    Object.assign(window, { scans });
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      scans.push(this.name);
      return getAll.apply(this, args);
    };
  });
  await page.clock.setFixedTime(new Date("2026-11-18T12:00:00Z"));
  await seedDatabase(page);
  await openReview(page);
  await reflection(page).fill("Saved reflection");
  await save(page).click();
  await edit(page).click();
  await reflection(page).fill("Unsaved reflection");
  await goalsChecked(page).check();
  await page.getByRole("checkbox", { name: "Tasks prioritized" }).check();
  await page.evaluate(() => { (window as unknown as { scans: string[] }).scans.length = 0; });

  const other = await context.newPage();
  await other.goto("./");
  await tab(other, "Notes").click();
  await other.getByRole("textbox", { name: "Add a note..." }).fill("Note from another tab");
  await other.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Triage: Note from another tab" })).toBeVisible();
  await expect(reflection(page)).toHaveValue("Unsaved reflection");
  await expect(goalsChecked(page)).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Tasks prioritized" })).toBeChecked();
  await expect(save(page)).toBeEnabled();
  const scans = await page.evaluate(() => (window as unknown as { scans: string[] }).scans);
  expect(scans).toEqual(["notes"]);

  await page.getByRole("button", { name: "Prev", exact: true }).click();
  const previousReflection = await reflection(page).inputValue();
  expect(previousReflection).not.toBe("Unsaved reflection");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await tab(page, "Today").click();
  await tab(page, "More").click();
  await expect(reflection(page)).toHaveValue("Unsaved reflection");
  await expect(goalsChecked(page)).toBeChecked();
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(edit(page)).toBeVisible();
  await page.reload();
  await tab(page, "More").click();
  await expect(reflection(page)).toHaveValue("Unsaved reflection");
  await expect(goalsChecked(page)).toBeChecked();
});

for (const existing of [false, true]) {
  test(`a stale same-week save keeps the losing draft and never overwrites the winner (existing=${existing})`, async ({ page, context }) => {
    // A missed broadcast must not bypass the transaction's baseline check.
    await page.addInitScript(() => { Object.defineProperty(window, "BroadcastChannel", { value: undefined }); });
    await openReview(page);
    if (existing) {
      await reflection(page).fill("Original");
      await save(page).click();
      await edit(page).click();
    }
    await reflection(page).fill("My unsaved draft");
    await goalsChecked(page).check();

    const other = await context.newPage();
    await openReview(other);
    if (existing) await edit(other).click();
    await reflection(other).fill("Saved first");
    await save(other).click();
    await expect(edit(other)).toBeVisible();
    const committedReviews = await records(other, "reviews");
    const committedLogs = await records(other, "logs");

    await save(page).click();
    await expect(page.getByRole("alert")).toContainText("Your draft was kept");
    await expect(reflection(page)).toHaveValue("My unsaved draft");
    await expect(reflection(page)).toBeEditable();
    await expect(goalsChecked(page)).toBeChecked();
    expect(await records(page, "reviews")).toEqual(committedReviews);
    expect(await records(page, "logs")).toEqual(committedLogs);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Discard draft", exact: true }).click();
    await expect(reflection(page)).toHaveValue("Saved first");
    await expect(edit(page)).toBeVisible();
  });
}
