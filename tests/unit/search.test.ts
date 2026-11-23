import { expect, it } from "vitest";
import { emptyData } from "../../src/db/schema";
import { buildSearchResults } from "../../src/state/search";
import { Note } from "../../src/types";

it("preserves exact, prefix, word, substring and description ranking with newest first for ties", () => {
  const base: Note = { id: "", title: "", description: "", createdAt: "", updatedAt: "2026-01-01", status: "inbox" };
  const state = emptyData();
  state.notes = [
    { ...base, id: "desc", title: "Other note", description: "Release details" },
    { ...base, id: "substring", title: "preRelease" },
    { ...base, id: "word", title: "a release" },
    { ...base, id: "prefix-old", title: "Release soon" },
    { ...base, id: "exact", title: "release" },
    { ...base, id: "prefix-new", title: "Release plan", updatedAt: "2026-01-02" },
  ];
  const results = buildSearchResults(state, " ReleAse ");
  expect(results.map((result) => result.id)).toEqual(["exact", "prefix-new", "prefix-old", "word", "substring", "desc"]);
  expect(results.at(-1)).toMatchObject({ matchedField: "description", description: "Release details" });
  expect(buildSearchResults(state, "  ")).toEqual([]);
});
