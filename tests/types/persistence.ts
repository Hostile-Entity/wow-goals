import { mutateDatabase, putItem, type Change, type Records } from "../../src/db";
import { updateCommand } from "../../src/state/commands";
import type { Goal, Task } from "../../src/types";

// Compiled by tsc -b, never run or bundled.
export function persistenceTypes(db: IDBDatabase, task: Task, goal: Goal, records: Records<"tasks">) {
  const good: Change = { store: "tasks", row: task };
  void good;
  // @ts-expect-error A task isn't a goal record.
  const wrong: Change = { store: "goals", row: task };
  void wrong;
  // @ts-expect-error The item cannot widen the store argument.
  void putItem("goals", task);
  // @ts-expect-error An entity mutator has to return the same entity type.
  updateCommand(records, "task", task.id, () => goal, "2026-11-22");

  void mutateDatabase(db, { read: ["tasks"], write: ["tasks"] }, (rows) => {
    // @ts-expect-error Only tasks were declared for reading.
    void rows.goals;
    return [{ store: "tasks", row: rows.tasks[0] }];
  });
  // @ts-expect-error Writing goals was not declared.
  void mutateDatabase(db, { write: ["tasks"] }, () => [{ store: "goals", row: goal }]);
  // @ts-expect-error The week index belongs to reviews, not completions.
  void mutateDatabase(db, { read: [{ store: "completions", index: "by-week", key: "2026-W44" }], write: ["logs"] }, () => []);
  void mutateDatabase(db, {
    read: ["tasks"],
    afterRead: {
      stores: ["goals"],
      // @ts-expect-error Secondary reads can target only declared secondary stores.
      select: () => [{ store: "notes", key: task.id }],
    },
    write: ["tasks"],
  }, () => []);
}
