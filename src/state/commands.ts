import { Change, PutChange, Records, StoreMap, uid } from "../db";
import {
  BaseEntity,
  EntityType,
  EventLog,
  Goal,
  ItemStatus,
  Note,
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
): PutChange<"logs"> {
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
type EntityStore<T extends EntityType> = (typeof entityStores)[T];
export type EntityRow<T extends EntityType> = StoreMap[EntityStore<T>];

export function findEntity<T extends EntityType>(
  records: Records<EntityStore<T>>,
  type: T,
  id: string,
): EntityRow<T> {
  const row = records[entityStores[type]].find((row) => row.id === id);
  if (!row)
    throw new Error("This item no longer exists. Close and reopen the view.");
  return row;
}
export function updateCommand<T extends EntityType>(
  records: Records<EntityStore<T>>,
  type: T,
  id: string,
  mutator: (row: EntityRow<NoInfer<T>>) => EntityRow<NoInfer<T>>,
  day: string,
): Change<EntityStore<T> | "logs">[] {
  const current = findEntity(records, type, id);
  const updated = { ...mutator(structuredClone(current)), updatedAt: nowIso() };
  if (
    !lifecycle[type].includes(updated.status) ||
    !updated.title.trim()
  )
    throw new Error("Invalid item title or status.");
  // The generic entity key ties the store and row together; TS cannot express
  // that correlation when constructing a member of the mapped union.
  const changes: Change<EntityStore<T> | "logs">[] = [
    { store: entityStores[type], row: updated } as PutChange<EntityStore<T>>,
  ];
  if (type === "goal") {
    const goal = updated as Goal;
    const previousMetrics = (current as Goal).metrics;
    if (
      !goal.metrics.length ||
      !goal.metrics.some((metric) => metric.id === goal.primaryMetricId) ||
      goal.metrics.some(
        (metric) =>
          !Number.isFinite(metric.current) ||
          !Number.isFinite(metric.target) ||
          (metric.target <= 0 &&
            !previousMetrics.some(
              (previous) =>
                previous.id === metric.id && previous.target === metric.target,
            )),
      )
    )
      throw new Error(
        "Metrics need finite values and new targets greater than zero.",
      );
    for (const metric of goal.metrics) {
      const previous = previousMetrics.find(
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
  records: Records<"tasks">,
  id: string,
  day: string,
): Change<"tasks" | "completions" | "logs">[] {
  const task = findEntity(records, "task", id);
  if (task.status === "done") return [];
  if (!["open", "doing"].includes(task.status))
    throw new Error("Unarchive this task before completing it.");
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

export function triageCommand(
  records: Records<"notes">,
  draft: Note,
  to: Exclude<EntityType, "note">,
  day: string,
): Change<EntityStore<EntityType> | "logs">[] {
  const note = findEntity(records, "note", draft.id);
  if (draft.updatedAt !== note.updatedAt)
    throw new Error(
      "This note changed in another view. Your draft was kept; close and reopen before converting.",
    );
  if (note.triagedTo)
    throw new Error(
      "This note was already converted. Open the result or undo its conversion first.",
    );
  if (!draft.title.trim()) throw new Error("Enter a title before converting.");
  const fields = {
    ...base(to, draft.title),
    description: draft.description,
  };
  const destination: PutChange<EntityStore<Exclude<EntityType, "note">>> = (() => {
    switch (to) {
      case "task": return { store: "tasks", row: { ...fields, priority: 2, postponedCount: 0 } };
      case "project": return { store: "projects", row: { ...fields, summary: "" } };
      case "goal": {
        const metricId = uid("metric");
        return { store: "goals", row: {
          ...fields,
          metrics: [{ id: metricId, name: "Progress", current: 0, target: 10 }],
          primaryMetricId: metricId,
        } };
      }
      case "routine": return { store: "routines", row: fields };
    }
  })();
  return [
    destination,
    {
      store: "notes",
      row: {
        ...note,
        title: draft.title.trim(),
        description: draft.description,
        triagedTo: to,
        triagedId: destination.row.id,
        triagePreviousStatus: note.status,
        status: "archived",
        updatedAt: nowIso(),
      },
    },
    event("triage", "note", note.id, {
      to,
      destinationId: destination.row.id,
      occurredDay: day,
    }),
  ];
}
export function undoTriageCommand(
  records: Records<EntityStore<EntityType> | "completions">,
  id: string,
  day: string,
): Change<EntityStore<EntityType> | "logs">[] {
  const note = findEntity(records, "note", id);
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
  records: Records<"projects">,
  id: string,
  index: number,
  patch: { checked?: boolean; text?: string },
  day: string,
  expectedUpdatedAt?: string,
): Change<"projects" | "logs">[] {
  const project = findEntity(records, "project", id);
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
  const changes: Change<"projects" | "logs">[] = [
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

type DeleteWrites = EntityStore<EntityType> | "settings" | "logs";
export function deleteEntityCommand(
  records: Records<Exclude<DeleteWrites, "logs">>,
  type: EntityType,
  id: string,
  day: string,
): Change<DeleteWrites>[] {
  const current = findEntity(records, type, id);
  const changes: Change<DeleteWrites>[] = [
    { store: entityStores[type], deleteId: id },
    event("delete-permanent", type, id, {
      title: current.title,
      createdAt: current.createdAt,
      occurredDay: day,
    }),
  ];
  if (type === "task") {
    const [settings] = records.settings;
    if (settings.focusTaskIds.includes(id)) {
      changes.push({
        store: "settings",
        row: { ...settings, focusTaskIds: settings.focusTaskIds.filter((taskId) => taskId !== id) },
      });
    }
  }
  function unlink<T extends { id: string; goalId?: string; projectId?: string }>(
    rows: T[], add: (row: T) => void,
  ) {
    for (const row of rows) {
      if (row.id === id || (row.goalId !== id && row.projectId !== id)) continue;
      add({
        ...row,
        ...(row.goalId === id ? { goalId: undefined } : {}),
        ...(row.projectId === id ? { projectId: undefined } : {}),
      });
    }
  }
  unlink(records.tasks, (row) => changes.push({ store: "tasks", row }));
  unlink(records.projects, (row) => changes.push({ store: "projects", row }));
  unlink(records.routines, (row) => changes.push({ store: "routines", row }));
  return changes;
}

export function captureNote(input: string): Note | undefined {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const index = lines.findIndex((line) => line.trim());
  if (index < 0) return;
  return {
    ...base("note", lines[index]),
    description: lines.slice(index + 1).join("\n").trim(),
  };
}

export function applyChanges(
  state: import("../types").AppStateData,
  changes: Change[],
) {
  const next = { ...state };
  const batches = new Map<Exclude<keyof Records, "meta" | "settings">, Map<string, Change>>();
  for (const change of changes) {
    if (change.store === "meta") continue;
    if (change.store === "settings") {
      if ("row" in change)
        next.settings = change.row;
      continue;
    }
    const id = "row" in change ? change.row.id : change.deleteId;
    let batch = batches.get(change.store);
    if (!batch) batches.set(change.store, batch = new Map());
    batch.delete(id);
    batch.set(id, change);
  }
  for (const [store, batch] of batches) {
    const rows = (state[store] as { id: string }[]).filter((row) => !batch.has(row.id));
    for (const change of batch.values()) if ("row" in change) rows.push(change.row);
    (next[store] as unknown[]) = rows;
  }
  if (batches.has("logs")) next.logs.sort((a, b) => b.at.localeCompare(a.at));
  return next;
}
