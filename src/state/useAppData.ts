import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  Change,
  clearDatabase,
  getById,
  logicalDayAt,
  Mutation,
  mutateDatabase,
  openDb,
  readSnapshot,
  Records,
  replaceSnapshot,
  StoreName,
  toDayString,
  uid,
} from "../db";
import { backupPayload, danglingReferences, parseBackupJson } from "../db/backup";
import { dataStores, defaultSettings } from "../db/schema";
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
  base,
  captureNote,
  completeTaskCommand,
  deleteEntityCommand,
  EntityRow,
  event,
  findEntity,
  nowIso,
  projectTodoCommand,
  triageCommand,
  undoTriageCommand,
  updateCommand,
} from "./commands";
import {
  defaultFilters,
  entityStores,
  FilterKey,
  getStatusBucket,
  isOpen,
  isUnfinished,
  nextTasksByProject,
  sortItems,
  sortTasks,
  sortRoutines,
  completionsForDay,
  savedStatusFilter,
  StatusFilter,
  statusLabel,
} from "./lifecycle";
import { projectTodos } from "./projectTodos";
import { useDeviceUI } from "./useDeviceUI";
import { usePwa } from "./usePwa";
import { applyTheme } from "./theme";
import { useWeeklyReviewDrafts } from "./useWeeklyReviewDrafts";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { ReviewFields, WeeklyReviewConflict, weeklyReviewCommand } from "./weeklyReview";

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
export function useAppData(wantsLogs = false) {
  const [busy, setBusy] = useState(0);
  const [tab, setTab] = useState<Tab>("notes");
  const [moreTab, setMoreTab] = useState<MoreTab>("review");
  const [wantsChartHistory, setWantsChartHistory] = useState(false);
  const [filters, setFilters] = useState(savedFilters);
  const [viewOverride, setViewOverride] = useState<{ key: FilterKey; filter: StatusFilter } | null>(null);
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
  const {
    data: state, stateRef, loaded, error, setError, reloadAll, run, applyCommitted,
    notifyReplacement, logsReady, reviewReady,
  } = useLiveSnapshot(wantsLogs || wantsChartHistory, tab === "more" && moreTab === "review", now, setNow);
  const settings = state.settings;
  const {
    dayStartHour,
    soundVolume,
    showStatus,
    theme,
    dayOffset: logicalOffset,
  } = settings;
  const logicalDay = logicalDayAt(now, settings);
  const isKeyboardVisible = useDeviceUI(
    soundVolume,
    noteInput,
    tab,
    noteTextareaRef,
    noteComposerRef,
  );
  const pwa = usePwa();
  const weeklyReviewDrafts = useWeeklyReviewDrafts(saveWeeklyReview);

  useLayoutEffect(() => {
    // Do not overwrite the boot theme with default settings while data loads.
    if (loaded) applyTheme(theme);
  }, [loaded, theme]);

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
    if (loaded && navigator.storage?.persist)
      void navigator.storage.persist().catch(() => false);
  }, [loaded]);

  async function mutate<R extends StoreName = never, W extends StoreName = never, A extends StoreName = never>(
    scope: Mutation<R, W, A>,
    plan: (records: Records<NoInfer<R | A>>) => NoInfer<Change<W>[]>,
  ) {
    setBusy((value) => value + 1);
    try {
      return await run(async () => {
        const changes = await mutateDatabase(await openDb(), scope, plan);
        setError("");
        applyCommitted(changes);
        return changes;
      });
    } catch (error) {
      if (!(error instanceof WeeklyReviewConflict)) {
        setError(
          error instanceof Error
            ? error.message
            : "Nothing was saved. Please try again.",
        );
      }
      throw error;
    } finally {
      setBusy((value) => value - 1);
    }
  }
  async function updateEntity<T extends EntityType>(
    type: T,
    id: string,
    mutator: (row: EntityRow<NoInfer<T>>) => EntityRow<NoInfer<T>>,
    expectedUpdatedAt?: string,
  ) {
    const store = entityStores[type];
    await mutate({ read: [{ store, key: id }], write: [store, "logs"] }, (records) => {
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
    const note = captureNote(noteInput);
    if (!note) return;
    await mutate({ write: ["notes", "logs"] }, () => [
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
    await mutate({ write: ["tasks", "logs"] }, () => [
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
    await mutate({ write: ["projects", "logs"] }, () => [
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
    await mutate({ write: ["goals", "logs"] }, () => [
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
    await mutate({ write: ["routines", "logs"] }, () => [
      { store: "routines", row: routine },
      event("create", "routine", routine.id, "Added routine"),
    ]);
  }
  async function triageNote(note: Note, to: Exclude<EntityType, "note">) {
    const changes = await mutate({
      read: [{ store: "notes", key: note.id }],
      write: ["notes", entityStores[to], "logs"],
    }, (records) =>
      triageCommand(records, note, to, logicalDay),
    );
    const destination = changes.find(change => change.store === entityStores[to] && "row" in change);
    if (!destination || !("row" in destination)) throw new Error("Conversion result unavailable.");
    return destination.row.id;
  }
  async function undoTriage(id: string) {
    const changes = await mutate(
      {
        read: [
          { store: "notes", key: id }, { store: "settings", key: "settings" },
          "tasks", "projects", "goals", "routines", "completions",
        ],
        write: ["notes", "tasks", "projects", "goals", "routines", "logs"],
      },
      (records) => undoTriageCommand(records, id, logicalDay),
    );
    const restored = changes.find(change => change.store === "notes" && "row" in change);
    if (tab === "notes" && restored && "row" in restored && "status" in restored.row) {
      const status = restored.row.status;
      setViewOverride(null);
      setFilters(current => ({ ...current, notes: status }));
    }
  }
  async function completeTask(id: string) {
    await mutate({ read: [{ store: "tasks", key: id }], write: ["tasks", "completions", "logs"] }, (records) =>
      completeTaskCommand(records, id, logicalDay),
    );
  }
  async function postponeTask(id: string, until = addDays(logicalDay, 1)) {
    await mutate({ read: [{ store: "tasks", key: id }], write: ["tasks", "logs"] }, (records) =>
      updateCommand(
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
      ),
    );
  }
  async function toggleFocus(id: string) {
    await mutate({
      read: [{ store: "settings", key: "settings" }],
      afterRead: {
        stores: ["tasks"],
        select: ({ settings: [current] }) => current.focusTaskIds.includes(id)
          ? []
          : [id, ...current.focusTaskIds].map((key) => ({ store: "tasks", key })),
      },
      write: ["settings"],
    }, (records) => {
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
  async function setStatus(type: EntityType, id: string, status: ItemStatus, revision?: string) {
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
    }), revision);
  }
  async function permanentDelete(type: EntityType, id: string) {
    if (
      !window.confirm(
        "Delete permanently? This cannot be recovered from the app.",
      )
    )
      return false;
    await mutate(
      {
        read: [
          "tasks", "projects", "routines",
          ...(type === "note" ? [{ store: "notes" as const, key: id }] : []),
          ...(type === "goal" ? [{ store: "goals" as const, key: id }] : []),
          ...(type === "task" ? [{ store: "settings" as const, key: "settings" }] : []),
        ],
        write: [entityStores[type], "tasks", "projects", "routines", "settings", "logs"],
      },
      (records) => deleteEntityCommand(records, type, id, logicalDay),
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
    await mutate({
      read: [{ store: "completions", index: "by-date", key: day }, { store: "routines", key: id }],
      write: ["completions", "logs"],
    }, (records) => {
      const routine = findEntity(records, "routine", id);
      if (fromToday && routine.status !== "enabled")
        throw new Error("Unarchive this routine before completing it.");
      const matches = records.completions.filter(
        (c) =>
          c.entityType === "routine" && c.entityId === id && c.date === day,
      );
      // If another tab already performed the action that was presented, do
      // not turn a second tap into the opposite action.
      if (existing !== (matches.length > 0)) return [];
      return existing
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
    await mutate({ read: [{ store: "projects", key: id }], write: ["projects", "logs"] }, (records) =>
      projectTodoCommand(records, id, index, { checked }, logicalDay, revision),
    );
  }
  async function editProjectTodo(
    id: string,
    index: number,
    text: string,
    revision?: string,
  ) {
    await mutate({ read: [{ store: "projects", key: id }], write: ["projects", "logs"] }, (records) =>
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
    weekKey: string,
    fields: ReviewFields,
    baseline: WeeklyReview | undefined,
  ) {
    try {
      await mutate({
        read: [{ store: "reviews", index: "by-week", key: weekKey }],
        write: ["reviews", "logs"],
      }, (records) => weeklyReviewCommand(records, weekKey, fields, baseline));
    } catch (error) {
      if (error instanceof WeeklyReviewConflict) await reloadAll();
      throw error;
    }
  }
  async function setSettings(patch: Partial<AppSettings>) {
    await mutate({ read: [{ store: "settings", key: "settings" }], write: ["settings"] }, (records) => [
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
      const data = parseBackupJson(await file.text());
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
      await run(async () => replaceSnapshot(await openDb(), data));
      await reloadAll();
      notifyReplacement();
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
    await run(async () => clearDatabase(await openDb()));
    await reloadAll();
    setNoteInput("");
    setFilters({ ...defaultFilters });
    notifyReplacement();
  }
  const activeTasks = useMemo(
    () => sortTasks(state.tasks, "actionable", logicalDay),
    [state.tasks, logicalDay],
  );
  const nextProjectTasks = useMemo(() => nextTasksByProject(activeTasks), [activeTasks]);
  const activeProjects = useMemo(() => sortItems(state.projects, "active"), [state.projects]);
  const projectById = useMemo(
    () => new Map(state.projects.map((project) => [project.id, project])),
    [state.projects],
  );
  const dayCompletions = useMemo(
    () => completionsForDay(state.completions, logicalDay),
    [state.completions, logicalDay],
  );
  const eligibleTasks = useMemo(() => activeTasks.filter(
    (task) => !task.projectId ||
      !["archived", "done"].includes(projectById.get(task.projectId)?.status ?? ""),
  ), [activeTasks, projectById]);
  const todayTop3 = useMemo(() => settings.focusTaskIds
    .flatMap((id) =>
      eligibleTasks.filter(
        (task) =>
          task.id === id &&
          (!task.scheduledFor || task.scheduledFor <= logicalDay),
      ),
    )
    .slice(0, 3), [settings.focusTaskIds, eligibleTasks, logicalDay]);
  const urgentTasks = useMemo(() => activeTasks.filter(
    (task) => task.deadline && task.deadline <= logicalDay && !todayTop3.some(focus => focus.id === task.id),
  ), [activeTasks, logicalDay, todayTop3]);
  const primaryMetric = (goal: Goal) =>
    goal.metrics.find((metric) => metric.id === goal.primaryMetricId) ??
    goal.metrics[0];
  const effectiveFilters = {
    ...filters,
    ...(viewOverride ? { [viewOverride.key]: viewOverride.filter } : {}),
  };
  return {
    state,
    loaded,
    logsReady,
    reviewReady,
    setWantsChartHistory,
    error,
    setError,
    busy: busy > 0,
    reloadAll,
    tab,
    setTab: (next: Tab) => {
      if (next !== tab) setViewOverride(null);
      setOpenFilterMenu(null);
      setTab(next);
    },
    moreTab,
    setMoreTab: (next: MoreTab) => {
      if (next !== moreTab) setViewOverride(null);
      setOpenFilterMenu(null);
      setMoreTab(next);
    },
    filters: effectiveFilters,
    setFilters,
    selectFilter: (key: FilterKey, value: StatusFilter) => {
      setViewOverride(null);
      setFilters((current) => ({ ...current, [key]: value }));
    },
    revealFilter: (key: FilterKey) => setViewOverride({ key, filter: "all" }),
    openTasks: () => {
      setOpenFilterMenu(null);
      setTab("tasks");
      setViewOverride({ key: "tasks", filter: "actionable" });
    },
    nextInboxNote: (excludedId?: string) =>
      sortItems(stateRef.current.notes, "inbox").find(
        (note) => note.id !== excludedId && !note.triagedTo,
      ),
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
      () => sortRoutines(state.routines, dayCompletions.routines, effectiveFilters.routines),
      [state.routines, dayCompletions.routines, effectiveFilters.routines],
    ),
    linkableGoals: state.goals.filter(isOpen),
    linkableProjects: state.projects.filter(isOpen),
    activeNoteCount: state.notes.filter((note) => note.status === "inbox" && !note.triagedTo)
      .length,
    completedTodayCount: dayCompletions.taskCount,
    routinesTodayCount: dayCompletions.routineCount,
    projectById,
    activeProjects,
    nextProjectTasks,
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
      row.status === "enabled" && dayCompletions.routines.has(row.id)
        ? "Completed" : statusLabel(row.status),
    isRoutineCompletedToday: (id: string) => dayCompletions.routines.has(id),
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
    weeklyReviewDrafts,
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
