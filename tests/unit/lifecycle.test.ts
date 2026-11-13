import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  defaultFilters, filterLabel, filterOptions, isOpen, lifecycle, savedStatusFilter,
  sortItems, sortRoutines, statusActionLabel, statusLabel,
} from "../../src/state/lifecycle";
import { migrateV1 } from "../../src/db/schema";
import { migrateStatuses } from "../../src/db/statuses";
import { completeTaskCommand, triageCommand, undoTriageCommand, applyChanges } from "../../src/state/commands";
import { Records } from "../../src/db";
import { AppStateData, ItemStatus } from "../../src/types";
import { legacyFixture } from "../fixtures/legacy";

const data = () => migrateStatuses(migrateV1(legacyFixture() as unknown as AppStateData));
const records = (state: AppStateData) => ({ ...state, settings: [state.settings], meta: [] }) as Records;

describe("simplified lifecycle", () => {
  it("offers exactly the requested views, including All items, without aggregate duplicates", () => {
    const labels = (key: keyof typeof defaultFilters) => filterOptions(key).map(value => filterLabel(key, value));
    expect(labels("notes")).toEqual(["Inbox", "Pinned", "Archived", "All items"]);
    expect(labels("tasks")).toEqual(["To do", "Active", "Completed", "Archived", "All items"]);
    expect(labels("projects")).toEqual(["Planned", "Active", "Completed", "Archived", "All items"]);
    expect(labels("goals")).toEqual(["Active", "Completed", "Archived", "All items"]);
    expect(labels("routines")).toEqual(["On", "Completed", "Archived", "All items"]);
    expect(defaultFilters).toEqual({ notes: "inbox", tasks: "open", projects: "planned", goals: "active", routines: "enabled" });
    for (const statuses of Object.values(lifecycle))
      expect(statuses.some(status => ["discarded", "paused", "processed"].includes(status))).toBe(false);
  });

  it("keeps valid saved views and maps retired filters without exposing Trash", () => {
    expect(savedStatusFilter("notes", "reference")).toBe("reference");
    expect(savedStatusFilter("tasks", "doing")).toBe("doing");
    expect(savedStatusFilter("tasks", "all")).toBe("all");
    expect(savedStatusFilter("tasks", "actionable")).toBe("open");
    expect(savedStatusFilter("projects", "actionable")).toBe("planned");
    expect(savedStatusFilter("notes", "processed")).toBe("archived");
    expect(savedStatusFilter("tasks", "discarded")).toBe("archived");
    expect(savedStatusFilter("projects", "paused")).toBe("archived");
    expect(savedStatusFilter("routines", "paused")).toBe("archived");
    expect(savedStatusFilter("routines", "completed-today")).toBe("completed-today");
    expect(savedStatusFilter("goals", "invalid")).toBe("active");
  });

  it("pins notes above newer inbox notes and sorts Archived after completed work", () => {
    const note = data().notes[0];
    const rows = [
      { ...note, id: "new", status: "inbox" as ItemStatus, updatedAt: "2026-11-13T12:00:00Z" },
      { ...note, id: "archived", status: "archived" as ItemStatus },
      { ...note, id: "pin", status: "reference" as ItemStatus },
    ];
    expect(sortItems(rows, "all").map(row => row.id)).toEqual(["pin", "new", "archived"]);
    expect(sortItems(rows, "reference").map(row => row.id)).toEqual(["pin"]);
    expect(statusLabel("reference")).toBe("Pinned");
    expect(statusLabel("doing")).toBe("Active");
    expect(statusLabel("achieved")).toBe("Completed");
  });

  it("includes To do and Active tasks in Today, but not Archived or Completed", () => {
    expect(isOpen({ status: "open" })).toBe(true);
    expect(isOpen({ status: "doing" })).toBe(true);
    expect(isOpen({ status: "archived" })).toBe(false);
    expect(isOpen({ status: "done" })).toBe(false);
    const state = data();
    const task = state.tasks[0];
    task.status = "archived";
    expect(() => completeTaskCommand(records(state), task.id, "2026-11-13")).toThrow("Unarchive");
  });

  it("derives routine Completed from today's history, never from a permanent status", () => {
    const state = data();
    const routine = state.routines[0];
    const completions = [{
      id: "today", entityType: "routine" as const, entityId: routine.id,
      date: "2026-11-13", completedAt: "2026-11-13T12:00:00Z",
    }];
    expect(sortRoutines(state.routines, completions, "enabled", "2026-11-13")).toEqual([]);
    expect(sortRoutines(state.routines, completions, "completed-today", "2026-11-13")).toEqual([routine]);
    expect(sortRoutines(state.routines, completions, "enabled", "2026-11-14")).toEqual([routine]);
    expect(sortRoutines(state.routines, completions, "completed-today", "2026-11-14")).toEqual([]);
    routine.status = "archived";
    expect(sortRoutines(state.routines, completions, "completed-today", "2026-11-13")).toEqual([]);
    expect(sortRoutines(state.routines, completions, "all", "2026-11-13")).toHaveLength(2);
    expect(completions).toHaveLength(1);
  });

  it("archives converted pinned notes while preserving their link and undo destination", () => {
    const state = data();
    state.notes[0].status = "reference";
    const converted = applyChanges(state, triageCommand(records(state), state.notes[0], "task", "2026-11-13"));
    const note = converted.notes.find(row => row.id === state.notes[0].id)!;
    expect(note.status).toBe("archived");
    expect(note.triagePreviousStatus).toBe("reference");
    expect(note.triagedId).toBeTruthy();
    const undone = applyChanges(converted, undoTriageCommand(records(converted), note.id, "2026-11-13"));
    expect(undone.notes.find(row => row.id === note.id)?.status).toBe("reference");
    expect(undone.tasks).toEqual(state.tasks);
  });

  it("uses distinct archive, unarchive, and completion actions", () => {
    expect(statusActionLabel("note", "inbox", "reference")).toBe("Pin");
    expect(statusActionLabel("task", "open", "archived")).toBe("Archive");
    expect(statusActionLabel("note", "archived", "inbox")).toBe("Unarchive to Inbox");
    expect(statusActionLabel("goal", "active", "achieved")).toBe("Complete goal");
    expect(statusActionLabel("project", "done", "active")).toBe("Reopen as Active");
  });
});
