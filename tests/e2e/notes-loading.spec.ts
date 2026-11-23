import { expect, test } from "@playwright/test";
import { seedDatabase, tab } from "./helpers";

test.use({ serviceWorkers: "block" });

test("Notes stays readable and editable when the Markdown download fails", async ({ page, request }) => {
  await request.post("/__test/reset");
  await seedDatabase(page);
  const failed = page.waitForEvent("requestfailed", {
    predicate: (request) => /\/assets\/(?:NotesTab|NoteMarkdown)-[^/]+\.js$/.test(request.url()),
  });
  await page.route(/\/assets\/(?:NotesTab|NoteMarkdown)-[^/]+\.js$/, (route) => route.abort());

  await page.goto("./");
  await tab(page, "Notes").click();
  await failed;
  const note = page.locator("#item-note-note-a");
  await expect(note.getByText("Saved message")).toBeVisible();
  await expect(note.locator(".note-description")).toContainText("Line one");
  await note.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit note" })).toBeVisible();
});
