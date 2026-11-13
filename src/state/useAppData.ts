import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  Change,
  clearDatabase,
  getById,
  mutateDatabase,
  openDb,
  readSnapshot,
  Records,
  replaceSnapshot,
  StoreName,
  toDayString,
  uid,
} from "../db";
import { backupPayload, danglingReferences, parseBackup } from "../db/backup";
import { dataStores, defaultSettings, emptyData } from "../db/schema";
import {
  AppSettings,
  AppStateData,
  BaseEntity,
  EntityType,
  Goal,
  GoalMetric,
  ItemStatus,
  Note,
  Project,
  Routine,
  Task,
  WeeklyReview,
} from "../types";
import {
  applyChanges,
  base,
  completeTaskCommand,
  event,
  findEntity,
  nowIso,
  projectTodoCommand,
  triageCommand,
  undoTriageCommand,
  undoTaskCompletionCommand,
  updateCommand,
} from "./commands";
import {
  defaultFilters,
  entityStores,
  FilterKey,
  getStatusBucket,
  isOpen,
  isUnfinished,
  sortItems,
  sortTasks,
  sortRoutines,
  routineCompletedToday,
  savedStatusFilter,
  StatusFilter,
  statusLabel,
} from "./lifecycle";
import { projectTodos } from "./projectTodos";
import { useDeviceUI } from "./useDeviceUI";
import { usePwa } from "./usePwa";
import { applyTheme } from "./theme";

export { getStatusBucket };
export type { FilterKey, StatusFilter };
export type Tab = "notes" | "tasks" | "today" | "projects" | "more";
export type MoreTab = "routines" | "goals" | "review";
export type TaskDraft = {
  title: string;
  description?: string;
  deadline?: string;
  scheduledFor?: string;
  priority?: number;
  goalId?: string;
  projectId?: string;
};
export type ProjectDraft = {
  title: string;
  description?: string;
  summary?: string;
  deadline?: string;
  goalId?: string;
};
export type GoalDraft = {
  title: string;
  description?: string;
  metrics?: GoalMetric[];
  primaryMetricId?: string;
};
export type RoutineDraft = {
  title: string;
  description?: string;
  goalId?: string;
};
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString([], {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : iso;
}
export function formatDueLabel(deadline: string, logicalDay: string) {
  const diff = Math.round(
    (new Date(`${deadline}T12:00:00`).getTime() -
      new Date(`${logicalDay}T12:00:00`).getTime()) /
      86400000,
  );
  return diff === 0
    ? "Due today"
    : diff < 0
      ? `Overdue by ${-diff} day${diff === -1 ? "" : "s"}`
      : `Due in ${diff} day${diff === 1 ? "" : "s"}`;
}
function savedFilters(): Record<FilterKey, StatusFilter> {
  try {
    const saved = JSON.parse(
      localStorage.getItem("wowgoals-filters-v2") ?? "{}",
    );
    return Object.fromEntries(
      Object.entries(defaultFilters).map(([key, value]) => [
        key,
        savedStatusFilter(key as FilterKey, saved[key] ?? value),
      ]),
    ) as Record<FilterKey, StatusFilter>;
  } catch {
    return { ...defaultFilters };
  }
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function useAppData() {
  const [state, setState] = useState<AppStateData>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(0);
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState<null | (() => Promise<void>)>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [moreTab, setMoreTab] = useState<MoreTab>("review");
  const [filters, setFilters] = useState(savedFilters);
  const [reveal, setReveal] = useState<FilterKey | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<FilterKey | null>(null);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [noteInput, setNoteInput] = useState(() => {
    try {
      return sessionStorage.getItem("wowgoals-note-draft") ?? "";
    } catch {
      return "";
    }
  });
  const [now, setNow] = useState(Date.now);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const noteComposerRef = useRef<HTMLFormElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const settings = state.settings;
  const {
    dayStartHour,
    soundVolume,
    showStatus,
    theme,
    dayOffset: logicalOffset,
  } = settings;
  const date = new Date(now);
  date.setDate(date.getDate() + logicalOffset);
  const logicalDay = toDayString(date.toISOString(), dayStartHour);
  const isKeyboardVisible = useDeviceUI(
    soundVolume,
    noteInput,
    tab,
    noteTextareaRef,
    noteComposerRef,
  );
  const pwa = usePwa();

  useLayoutEffect(() => {
    // Do not overwrite the boot theme with default settings while data loads.
    if (loaded) applyTheme(theme);
  }, [loaded, theme]);

  async function reloadAll() {
    try {
      const next = await readSnapshot(await openDb());
      stateRef.current = next;
      setState(next);
      setLoaded(true);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not open local data. Your database has not been reset.",
      );
    }
  }
  useEffect(() => {
    void reloadAll();
    const blocked = () =>
      setError(
        "Close the other WowGoals tab/window to finish the one-time database upgrade. Do not clear browser data.",
      );
    window.addEventListener("wowgoals-db-blocked", blocked);
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("wowgoals-v2");
      channelRef.current = channel;
      channel.onmessage = () => void reloadAll();
    }
    return () => {
      window.removeEventListener("wowgoals-db-blocked", blocked);
      channelRef.current?.close();
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("wowgoals-filters-v2", JSON.stringify(filters));
    } catch {
      /* Filtering still works without localStorage. */
    }
  }, [filters]);
  useEffect(() => {
    try {
      sessionStorage.setItem("wowgoals-note-draft", noteInput);
    } catch {
      /* Do not block capture when session storage is unavailable. */
    }
  }, [noteInput]);
  useEffect(() => {
    setOpenFilterMenu(null);
    setReveal(null);
  }, [tab, moreTab]);
  useEffect(() => {
    if (loaded && navigator.storage?.persist)
      void navigator.storage.persist().catch(() => false);
  }, [loaded]);

  async function mutate(
    stores: StoreName[],
    plan: (records: Records) => Change[],
  ) {
    setBusy((value) => value + 1);
    try {
      const changes = await mutateDatabase(await openDb(), stores, plan);
      setError("");
      setState((current) => {
        const next = applyChanges(current, changes);
        stateRef.current = next;
        return next;
      });
      channelRef.current?.postMessage("changed");
      return changes;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Nothing was saved. Please try again.",
      );
      throw error;
    } finally {
      setBusy((value) => value - 1);
    }
  }
  function notify(text: string, action?: () => Promise<void>) {
    setMessage(text);
    setUndo(action ? () => action : null);
  }
  async function updateEntity(
    type: EntityType,
    id: string,
    mutator: (row: any) => any,
    expectedUpdatedAt?: string,
  ) {
    await mutate([entityStores[type]], (records) => {
      if (
        expectedUpdatedAt &&
        findEntity(records, type, id).updatedAt !== expectedUpdatedAt
      )
        throw new Error(
          "This item changed in another view. Your draft was kept; copy your edits, then close and reopen the item before saving.",
        );
      return updateCommand(records, type, id, mutator, logicalDay);
    });
  }
  async function addNote() {
    const lines = noteInput.replace(/\r\n/g, "\n").split("\n");
    const index = lines.findIndex((line) => line.trim());
    if (index < 0) return;
    const note: Note = {
      ...base("note", lines[index]),
      description: lines
        .slice(index + 1)
        .join("\n")
        .trim(),
    };
    await mutate(["notes"], () => [
      { store: "notes", row: note },
      event("create", "note", note.id, "Captured note"),
    ]);
    setNoteInput("");
  }
  // Include destination stores in transactions even when there is no read needed.
  async function createTask(draft: TaskDraft) {
    const task: Task = {
      ...base("task", draft.title),
      ...draft,
      title: draft.title.trim(),
      description: draft.description ?? "",
      priority: draft.priority ?? 2,
      postponedCount: 0,
    };
    if (!task.title) throw new Error("Enter a task title.");
    await mutate(["tasks"], () => [
      { store: "tasks", row: task },
      event("create", "task", task.id, "Added task"),
    ]);
  }
  async function createProject(draft: ProjectDraft) {
    const project: Project = {
      ...base("project", draft.title),
      ...draft,
      description: draft.description ?? "",
      summary: draft.summary ?? "",
    };
    await mutate(["projects"], () => [
      { store: "projects", row: project },
      event("create", "project", project.id, "Added project"),
    ]);
  }
  async function createGoal(draft: GoalDraft) {
    const metrics = draft.metrics?.length
      ? draft.metrics
      : [{ id: uid("metric"), name: "Progress", current: 0, target: 10 }];
    const goal: Goal = {
      ...base("goal", draft.title),
      description: draft.description ?? "",
      metrics,
      primaryMetricId: draft.primaryMetricId ?? metrics[0].id,
    };
    await mutate(["goals"], () => [
      { store: "goals", row: goal },
      event("create", "goal", goal.id, "Added goal"),
    ]);
  }
  async function createRoutine(draft: RoutineDraft) {
    const routine: Routine = {
      ...base("routine", draft.title),
      ...draft,
      description: draft.description ?? "",
    };
    await mutate(["routines"], () => [
      { store: "routines", row: routine },
      event("create", "routine", routine.id, "Added routine"),
    ]);
  }
  async function triageNote(note: Note, to: Exclude<EntityType, "note">) {
    const changes = await mutate(["notes", entityStores[to]], (records) =>
      triageCommand(records, note, to, logicalDay),
    );
    notify(`Note converted to ${to}.`, () =>
      undoTriage(note.id),
    );
    const destination = changes.find(change => change.store === entityStores[to] && "row" in change);
    if (!destination || !("row" in destination)) throw new Error("Conversion result unavailable.");
    return destination.row.id;
  }
  async function undoTriage(id: string) {
    const changes = await mutate(
      ["notes", "tasks", "projects", "goals", "routines", "completions"],
      (records) => undoTriageCommand(records, id, logicalDay),
    );
    const restored = changes.find(change => change.store === "notes" && "row" in change);
    if (restored && "row" in restored && "status" in restored.row) {
      const status = restored.row.status;
      setReveal(null);
      setFilters(current => ({ ...current, notes: status }));
    }
    notify("Conversion undone. Your edited note was kept.");
  }
  async function completeTask(id: string) {
    let previousStatus: ItemStatus = "open";
    const changes = await mutate(["tasks", "completions"], (records) => {
      previousStatus = findEntity(records, "task", id).status;
      return completeTaskCommand(records, id, logicalDay);
    });
    const taskChange = changes.find(c => c.store === "tasks" && "row" in c);
    const completion = changes.find(c => c.store === "completions" && "row" in c);
    if (taskChange && "row" in taskChange && "updatedAt" in taskChange.row && completion && "row" in completion) {
      const revision = taskChange.row.updatedAt;
      const completionId = completion.row.id;
      notify("Task completed.", async () => {
        await mutate(["tasks", "completions"], records =>
          undoTaskCompletionCommand(records, id, revision, completionId, previousStatus, logicalDay));
        notify("Task completion undone.");
      });
    }
  }
  async function postponeTask(id: string, until = addDays(logicalDay, 1)) {
    let previous: Task;
    await mutate(["tasks"], (records) => {
      previous = findEntity(records, "task", id) as Task;
      return updateCommand(
        records,
        "task",
        id,
        (task: Task) => ({
          ...task,
          scheduledFor: until,
          lastPostponedAt: logicalDay,
          postponedCount: task.postponedCount + 1,
        }),
        logicalDay,
      );
    });
    notify(`Scheduled for ${until}. Deadline unchanged.`, async () => {
      await updateEntity("task", id, (task: Task) => {
        if (task.scheduledFor !== until)
          throw new Error(
            "The schedule has since changed; it was not overwritten.",
          );
        return {
          ...task,
          scheduledFor: previous.scheduledFor,
          postponedCount: previous.postponedCount,
          lastPostponedAt: previous.lastPostponedAt,
        };
      });
      notify("Schedule restored.");
    });
  }
  async function toggleFocus(id: string) {
    await mutate(["settings", "tasks"], (records) => {
      const current = records.settings[0];
      if (current.focusTaskIds.includes(id))
        return [
          {
            store: "settings",
            row: {
              ...current,
              focusTaskIds: current.focusTaskIds.filter(
                (value) => value !== id,
              ),
            },
          },
        ];
      const task = findEntity(records, "task", id);
      if (!isOpen(task)) throw new Error("Only open tasks can be focused.");
      const ids = current.focusTaskIds.filter((id) =>
        records.tasks.some((task) => task.id === id && isOpen(task)),
      );
      if (!ids.includes(id) && ids.length >= 3)
        throw new Error("Unpin a focus task first (maximum three).");
      return [
        {
          store: "settings",
          row: {
            ...current,
            focusTaskIds: ids.includes(id)
              ? ids.filter((value) => value !== id)
              : [...ids, id],
          },
        },
      ];
    });
  }
  async function setStatus(type: EntityType, id: string, status: ItemStatus) {
    if (
      (type === "project" && status === "done") ||
      (type === "goal" && status === "achieved")
    ) {
      const current = stateRef.current;
      const remaining =
        type === "project"
          ? projectTodos(
              current.projects.find((p) => p.id === id)!.description,
            ).filter((todo) => !todo.checked).length +
            current.tasks.filter((t) => t.projectId === id && isOpen(t)).length
          : [...current.projects, ...current.tasks, ...current.routines].filter(
              (row) => row.goalId === id && isUnfinished(row),
            ).length;
      if (
        remaining &&
        !window.confirm(
          `${remaining} unfinished linked item(s) remain. Complete this ${type} anyway? Child work will be left unchanged.`,
        )
      )
        return;
    }
    await updateEntity(type, id, (row) => ({
      ...row,
      status,
      ...(type === "project"
        ? { completedAt: status === "done" ? nowIso() : undefined }
        : {}),
    }));
  }
  async function permanentDelete(type: EntityType, id: string) {
    if (
      !window.confirm(
        "Delete permanently? This cannot be recovered from the app.",
      )
    )
      return;
    await mutate(
      [
        entityStores[type],
        "tasks",
        "projects",
        "routines",
        "notes",
        "settings",
      ],
      (records) => {
        const current = findEntity(records, type, id);
        const changes: Change[] = [
          { store: entityStores[type], deleteId: id },
          event("delete-permanent", type, id, {
            title: current.title,
            createdAt: current.createdAt,
            occurredDay: logicalDay,
          }),
        ];
        if (type === "task" && records.settings[0].focusTaskIds.includes(id))
          changes.push({
            store: "settings",
            row: {
              ...records.settings[0],
              focusTaskIds: records.settings[0].focusTaskIds.filter(taskId => taskId !== id),
            },
          });
        for (const key of ["tasks", "projects", "routines"] as const)
          for (const row of records[key])
            if (
              row.id !== id &&
              (row.goalId === id ||
                ("projectId" in row && row.projectId === id))
            )
              changes.push({
                store: key,
                row: {
                  ...row,
                  ...(row.goalId === id ? { goalId: undefined } : {}),
                  ...("projectId" in row && row.projectId === id
                    ? { projectId: undefined }
                    : {}),
                },
              });
        return changes;
      },
    );
  }
  async function toggleRoutineCompletionForDay(
    id: string,
    day: string,
    fromToday = false,
  ) {
    const existing = stateRef.current.completions.some(
      (c) => c.entityType === "routine" && c.entityId === id && c.date === day,
    );
    if (
      (!fromToday || existing) &&
      !window.confirm(
        `${existing ? "Remove" : "Mark"} routine completion for ${day}?`,
      )
    )
      return;
    await mutate(["completions", "routines"], (records) => {
      const routine = findEntity(records, "routine", id);
      if (fromToday && routine.status !== "enabled")
        throw new Error("Unarchive this routine before completing it.");
      const matches = records.completions.filter(
        (c) =>
          c.entityType === "routine" && c.entityId === id && c.date === day,
      );
      return matches.length
        ? [
            ...matches.map((c) => ({
              store: "completions" as const,
              deleteId: c.id,
            })),
            event("undo-complete", "routine", id, { occurredDay: day }),
          ]
        : [
            {
              store: "completions",
              row: {
                id: `routine_${id}_${day}`,
                entityType: "routine",
                entityId: id,
                date: day,
                completedAt:
                  day === logicalDay
                    ? nowIso()
                    : new Date(
                        `${day}T${String(dayStartHour).padStart(2, "0")}:00:00`,
                      ).toISOString(),
              },
            },
            event("complete", "routine", id, { occurredDay: day }),
          ];
    });
  }
  async function completeRoutine(id: string) {
    await toggleRoutineCompletionForDay(id, logicalDay, true);
  }
  async function toggleProjectTodo(
    id: string,
    index: number,
    checked: boolean,
    revision?: string,
  ) {
    await mutate(["projects"], (records) =>
      projectTodoCommand(records, id, index, { checked }, logicalDay, revision),
    );
  }
  async function editProjectTodo(
    id: string,
    index: number,
    text: string,
    revision?: string,
  ) {
    await mutate(["projects"], (records) =>
      projectTodoCommand(records, id, index, { text }, logicalDay, revision),
    );
  }
  async function addProjectTodo(id: string, text: string) {
    if (!text.trim() || /[\r\n]/.test(text))
      throw new Error("Enter a single-line TODO.");
    await updateEntity("project", id, (row: Project) => {
      if (!isOpen(row))
        throw new Error("Resume or reopen this project before adding TODOs.");
      return {
        ...row,
        description: `${row.description}${row.description && !row.description.endsWith("\n") ? "\n" : ""}[ ] ${text.trim()}`,
      };
    });
  }
  async function saveWeeklyReview(
    input: Omit<WeeklyReview, "id" | "createdAt">,
  ) {
    await mutate(["reviews"], (records) => {
      const previous = records.reviews.find(
        (row) => row.weekKey === input.weekKey,
      );
      const review = {
        ...input,
        id: previous?.id ?? uid("review"),
        createdAt: previous?.createdAt ?? nowIso(),
      };
      return [
        { store: "reviews", row: review },
        event("review", "weekly", review.id, input.weekKey),
      ];
    });
  }
  async function setSettings(patch: Partial<AppSettings>) {
    await mutate(["settings"], (records) => [
      { store: "settings", row: { ...records.settings[0], ...patch } },
    ]);
  }
  async function setLogicalDay(day: string) {
    const current = toDayString(undefined, dayStartHour);
    await setSettings({
      dayOffset: Math.round(
        (new Date(`${day}T12:00:00`).getTime() -
          new Date(`${current}T12:00:00`).getTime()) /
          86400000,
      ),
    });
  }
  async function exportData() {
    const data = await readSnapshot(await openDb());
    download(backupPayload(data), `wow-goals-backup-${logicalDay}.json`);
    await setSettings({ lastBackupAt: nowIso() });
  }
  async function exportSafetySnapshot(which: "pre-v2" | "pre-v3" | "pre-v4" | "pre-v5" | "pre-import") {
    const saved = await getById("meta", which);
    if (!saved?.data) {
      throw new Error("No safety snapshot exists yet.");
    }
    download(
      which !== "pre-import"
        ? saved.data
        : backupPayload(saved.data as AppStateData),
      `wow-goals-${which}.json`,
    );
  }
  async function importData(file: File) {
    try {
      const data = parseBackup(JSON.parse(await file.text()));
      const counts = dataStores
        .map((key) => `${data[key].length} ${key}`)
        .join(", ");
      const dangling = danglingReferences(data);
      if (
        !window.confirm(
          `Restore ${counts}?${dangling ? `\n${dangling} older missing links will be preserved; their items will not be lost.` : ""}\nThis replaces current data atomically. Continue?`,
        )
      )
        return false;
      if (
        window.confirm(
          "Download your current data first? A local safety snapshot is also kept automatically.",
        )
      )
        await exportData();
      await replaceSnapshot(await openDb(), data);
      await reloadAll();
      channelRef.current?.postMessage("changed");
      notify("Backup restored successfully.");
      return true;
    } catch (error) {
      const message = `Import failed; your existing data was not replaced. ${error instanceof Error ? error.message : "Invalid file."}`;
      setError(message);
      throw new Error(message);
    }
  }
  async function deleteAllData() {
    if (
      !window.confirm(
        "Delete ALL app data, including safety snapshots? Export a backup first. This cannot be undone.",
      )
    )
      return;
    await clearDatabase(await openDb());
    await reloadAll();
    setNoteInput("");
    setFilters({ ...defaultFilters });
    channelRef.current?.postMessage("changed");
  }
  const activeTasks = useMemo(
    () => sortTasks(state.tasks, "actionable", logicalDay),
    [state.tasks, logicalDay],
  );
  const eligibleTasks = activeTasks.filter(
    (task) =>
      !task.projectId ||
      !["archived", "done"].includes(
        state.projects.find((project) => project.id === task.projectId)
          ?.status ?? "",
      ),
  );
  const todayTop3 = settings.focusTaskIds
    .flatMap((id) =>
      eligibleTasks.filter(
        (task) =>
          task.id === id &&
          (!task.scheduledFor || task.scheduledFor <= logicalDay),
      ),
    )
    .slice(0, 3);
  const urgentTasks = activeTasks.filter(
    (task) => task.deadline && task.deadline <= logicalDay && !todayTop3.some(focus => focus.id === task.id),
  );
  const primaryMetric = (goal: Goal) =>
    goal.metrics.find((metric) => metric.id === goal.primaryMetricId) ??
    goal.metrics[0];
  const effectiveFilters = {
    ...filters,
    ...(reveal ? { [reveal]: "all" as const } : {}),
  };
  return {
    state,
    loaded,
    error,
    setError,
    busy: busy > 0,
    message,
    setMessage,
    undo,
    notify,
    reloadAll,
    tab,
    setTab,
    moreTab,
    setMoreTab,
    filters: effectiveFilters,
    setFilters,
    selectFilter: (key: FilterKey, value: StatusFilter) => {
      setReveal(null);
      setFilters((current) => ({ ...current, [key]: value }));
    },
    revealFilter: (key: FilterKey) => {
      window.setTimeout(() => setReveal(key), 0);
    },
    openFilterMenu,
    setOpenFilterMenu,
    showSettingsPopup,
    setShowSettingsPopup,
    showDebugTools,
    setShowDebugTools,
    closeSettingsPopup: () => {
      setShowSettingsPopup(false);
      setShowDebugTools(false);
    },
    noteInput,
    setNoteInput,
    noteTextareaRef,
    noteComposerRef,
    isKeyboardVisible,
    logicalDay,
    logicalOffset,
    dayStartHour,
    soundVolume,
    showStatus,
    theme,
    ...pwa,
    filteredNotes: useMemo(
      () => sortItems(state.notes, effectiveFilters.notes),
      [state.notes, effectiveFilters.notes],
    ),
    filteredTasks: useMemo(
      () => sortTasks(state.tasks, effectiveFilters.tasks, logicalDay),
      [state.tasks, effectiveFilters.tasks, logicalDay],
    ),
    filteredProjects: useMemo(
      () => sortItems(state.projects, effectiveFilters.projects),
      [state.projects, effectiveFilters.projects],
    ),
    filteredGoals: useMemo(
      () => sortItems(state.goals, effectiveFilters.goals),
      [state.goals, effectiveFilters.goals],
    ),
    filteredRoutines: useMemo(
      () => sortRoutines(state.routines, state.completions, effectiveFilters.routines, logicalDay),
      [state.routines, state.completions, effectiveFilters.routines, logicalDay],
    ),
    linkableGoals: state.goals.filter(isOpen),
    linkableProjects: state.projects.filter(isOpen),
    activeNoteCount: state.notes.filter((note) => note.status === "inbox")
      .length,
    completedTodayCount: state.completions.filter(
      (c) => c.date === logicalDay && c.entityType === "task",
    ).length,
    routinesTodayCount: state.completions.filter(
      (c) => c.date === logicalDay && c.entityType === "routine",
    ).length,
    activeTasks,
    todayTop3,
    urgentTasks,
    primaryMetric,
    focusCandidates: eligibleTasks.filter(
      (task) =>
        !settings.focusTaskIds.includes(task.id) &&
        (!task.scheduledFor || task.scheduledFor <= logicalDay),
    ),
    statusLabel: (row: Pick<BaseEntity, "status" | "id">) =>
      row.status === "enabled" && routineCompletedToday(state.completions, row.id, logicalDay)
        ? "Completed" : statusLabel(row.status),
    isRoutineCompletedToday: (id: string) => routineCompletedToday(state.completions, id, logicalDay),
    addNote,
    updateEntity,
    createTask,
    createProject,
    createGoal,
    createRoutine,
    triageNote,
    undoTriage,
    completeTask,
    postponeTask,
    toggleFocus,
    completeRoutine,
    toggleRoutineCompletionForDay,
    setStatus,
    permanentDelete,
    toggleProjectTodo,
    editProjectTodo,
    addProjectTodo,
    saveWeeklyReview,
    exportData,
    importData,
    exportSafetySnapshot,
    deleteAllData,
    setLogicalDay,
    decrementLogicalDay: () => setSettings({ dayOffset: logicalOffset - 1 }),
    incrementLogicalDay: () => setSettings({ dayOffset: logicalOffset + 1 }),
    resetLogicalDayToToday: () => setSettings({ dayOffset: 0 }),
    setDayStartHour: (hour: number) => setSettings({ dayStartHour: hour }),
    setSoundVolume: (volume: number) => setSettings({ soundVolume: volume }),
    setShowStatus: (value: boolean) => setSettings({ showStatus: value }),
    setTheme: (value: "light" | "wow") => setSettings({ theme: value }),
    backupDue:
      !settings.lastBackupAt ||
      Date.now() - Date.parse(settings.lastBackupAt) > 7 * 86400000,
    settings: { ...defaultSettings, ...settings },
  };
}
export type AppData = ReturnType<typeof useAppData>;
