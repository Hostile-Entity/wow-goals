import { Change, Records, uid } from "../db";
import {
  BaseEntity,
  EntityType,
  EventLog,
  Goal,
  ItemStatus,
  Note,
  Project,
  Task,
} from "../types";
import { entityStores, initialStatus, lifecycle } from "./lifecycle";
import { changeTodo, projectTodos } from "./projectTodos";

export const nowIso = () => new Date().toISOString();
export function base(type: EntityType, title: string): BaseEntity {
  const now = nowIso();
  return {
    id: uid("item"),
    title: title.trim(),
    description: "",
    createdAt: now,
    updatedAt: now,
    status: initialStatus[type],
  };
}
export function event(
  action: string,
  entityType: string,
  entityId: string | undefined,
  detail: unknown,
): Change {
  const row: EventLog = {
    id: uid("log"),
    at: nowIso(),
    action,
    entityType,
    entityId,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
  };
  return { store: "logs", row };
}
export function findEntity(
  records: Records,
  type: EntityType,
  id: string,
): BaseEntity {
  const row = records[entityStores[type]].find((row) => row.id === id);
  if (!row)
    throw new Error("This item no longer exists. Close and reopen the view.");
  return row;
}
export function updateCommand(
  records: Records,
  type: EntityType,
  id: string,
  mutator: (row: any) => any,
  day: string,
): Change[] {
  const current = findEntity(records, type, id);
  const updated = { ...mutator(structuredClone(current)), updatedAt: nowIso() };
  if (
    ![...lifecycle[type], "discarded"].includes(updated.status) ||
    !updated.title.trim()
  )
    throw new Error("Invalid item title or status.");
  const changes: Change[] = [{ store: entityStores[type], row: updated }];
  if (type === "goal") {
    const goal = updated as Goal;
    if (
      !goal.metrics.length ||
      !goal.metrics.some((metric) => metric.id === goal.primaryMetricId) ||
      goal.metrics.some(
        (metric) =>
          !Number.isFinite(metric.current) ||
          !Number.isFinite(metric.target) ||
          (metric.target <= 0 &&
            !(current as Goal).metrics.some(
              (previous) =>
                previous.id === metric.id && previous.target === metric.target,
            )),
      )
    )
      throw new Error(
        "Metrics need finite values and new targets greater than zero.",
      );
    for (const metric of goal.metrics) {
      const previous = (current as Goal).metrics.find(
        (item) => item.id === metric.id,
      );
      if (previous && previous.current !== metric.current)
        changes.push(
          event("goal-metric-update", "goal", id, {
            metricId: metric.id,
            metricName: metric.name,
            from: previous.current,
            to: metric.current,
            occurredDay: day,
          }),
        );
    }
  }
  changes.push(
    event("update", type, id, {
      occurredDay: day,
      fromStatus: current.status,
      toStatus: updated.status,
      title: current.title,
    }),
  );
  return changes;
}
export function completeTaskCommand(
  records: Records,
  id: string,
  day: string,
): Change[] {
  const task = findEntity(records, "task", id) as Task;
  if (task.status === "done") return [];
  if (task.status === "discarded")
    throw new Error("Recover this task before completing it.");
  return [
    { store: "tasks", row: { ...task, status: "done", updatedAt: nowIso() } },
    {
      store: "completions",
      row: {
        id: uid("cmp"),
        entityType: "task",
        entityId: id,
        date: day,
        completedAt: nowIso(),
      },
    },
    event("complete", "task", id, { occurredDay: day, title: task.title }),
  ];
}

/** Undo only this completion, never a subsequent edit or older history. */
export function undoTaskCompletionCommand(
  records: Records,
  id: string,
  revision: string,
  completionId: string,
  previousStatus: ItemStatus,
  day: string,
): Change[] {
  const task = findEntity(records, "task", id);
  if (task.status !== "done" || task.updatedAt !== revision ||
      !records.completions.some(c => c.id === completionId && c.entityId === id))
    throw new Error("This task has since changed. Its current state was kept safe.");
  return [
    ...updateCommand(records, "task", id, row => ({ ...row, status: previousStatus }), day),
    { store: "completions", deleteId: completionId },
    event("undo-complete", "task", id, { occurredDay: day }),
  ];
}
export function triageCommand(
  records: Records,
  draft: Note,
  to: Exclude<EntityType, "note">,
  day: string,
): Change[] {
  const note = findEntity(records, "note", draft.id) as Note;
  if (draft.updatedAt !== note.updatedAt)
    throw new Error(
      "This note changed in another view. Your draft was kept; close and reopen before converting.",
    );
  if (note.triagedTo)
    throw new Error(
      "This note was already converted. Open the result or undo its conversion first.",
    );
  if (!draft.title.trim()) throw new Error("Enter a title before converting.");
  const destination: any = {
    ...base(to, draft.title),
    description: draft.description,
  };
  if (to === "task")
    Object.assign(destination, { priority: 2, postponedCount: 0 });
  if (to === "project") destination.summary = "";
  if (to === "goal") {
    const metricId = uid("metric");
    Object.assign(destination, {
      metrics: [{ id: metricId, name: "Progress", current: 0, target: 10 }],
      primaryMetricId: metricId,
    });
  }
  return [
    { store: entityStores[to], row: destination },
    {
      store: "notes",
      row: {
        ...note,
        title: draft.title.trim(),
        description: draft.description,
        triagedTo: to,
        triagedId: destination.id,
        triagePreviousStatus: note.status,
        status: "processed",
        updatedAt: nowIso(),
      },
    },
    event("triage", "note", note.id, {
      to,
      destinationId: destination.id,
      occurredDay: day,
    }),
  ];
}
export function undoTriageCommand(
  records: Records,
  id: string,
  day: string,
): Change[] {
  const note = findEntity(records, "note", id) as Note;
  if (!note.triagedTo || !note.triagedId)
    throw new Error(
      "This older conversion has no recoverable destination link.",
    );
  const destination = findEntity(records, note.triagedTo, note.triagedId);
  if (
    destination.updatedAt !== destination.createdAt ||
    records.tasks.some(
      (task) =>
        task.projectId === destination.id || task.goalId === destination.id,
    ) ||
    records.projects.some((project) => project.goalId === destination.id) ||
    records.routines.some((routine) => routine.goalId === destination.id) ||
    records.completions.some(
      (completion) => completion.entityId === destination.id,
    )
  )
    throw new Error(
      "The converted item has been used or changed. It was kept safe; manage it separately instead of undoing.",
    );
  const restored = {
    ...note,
    status: note.triagePreviousStatus ?? "inbox",
    updatedAt: nowIso(),
  };
  delete restored.triagedTo;
  delete restored.triagedId;
  delete restored.triagePreviousStatus;
  return [
    { store: entityStores[note.triagedTo], deleteId: destination.id },
    { store: "notes", row: restored },
    event("undo-triage", "note", id, { occurredDay: day }),
  ];
}
export function projectTodoCommand(
  records: Records,
  id: string,
  index: number,
  patch: { checked?: boolean; text?: string },
  day: string,
  expectedUpdatedAt?: string,
): Change[] {
  const project = findEntity(records, "project", id) as Project;
  if (expectedUpdatedAt && project.updatedAt !== expectedUpdatedAt)
    throw new Error(
      "The project changed in another view. Your draft was kept; close and reopen it before changing this TODO.",
    );
  if (!(["planned", "active"] as ItemStatus[]).includes(project.status))
    throw new Error("Resume or reopen this project before changing its TODOs.");
  const previous = projectTodos(project.description).find(
    (row) => row.sourceIndex === index,
  );
  const description = changeTodo(project.description, index, patch);
  const changes: Change[] = [
    {
      store: "projects",
      row: { ...project, description, updatedAt: nowIso() },
    },
  ];
  changes.push(
    event("project-todo", "project", id, {
      lineIndex: projectTodos(project.description).findIndex(
        (row) => row.sourceIndex === index,
      ),
      checked: patch.checked ?? previous?.checked,
      previousChecked: previous?.checked,
      text: patch.text ?? previous?.text,
      occurredDay: day,
      changed:
        patch.checked !== undefined && patch.checked !== previous?.checked,
      delta:
        patch.checked === undefined || patch.checked === previous?.checked
          ? 0
          : patch.checked
            ? 1
            : -1,
    }),
  );
  return changes;
}

export function applyChanges(
  state: import("../types").AppStateData,
  changes: Change[],
) {
  const next = { ...state };
  for (const change of changes) {
    if (change.store === "meta") continue;
    if (change.store === "settings") {
      if ("row" in change)
        next.settings = change.row as import("../types").AppSettings;
      continue;
    }
    const rows = next[change.store] as { id: string }[];
    const id = "row" in change ? change.row.id : change.deleteId;
    const filtered = rows.filter((row) => row.id !== id);
    (next[change.store] as unknown[]) =
      "row" in change ? [...filtered, change.row] : filtered;
  }
  next.logs = [...next.logs].sort((a, b) => b.at.localeCompare(a.at));
  return next;
}
