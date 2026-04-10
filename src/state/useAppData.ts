import { useEffect, useMemo, useRef, useState } from "react";
import { deleteItem, getAll, getById, putItem, toDayString, toWeekKey, uid } from "../db";
import {
  AppSettings,
  AppStateData,
  EntityType,
  EventLog,
  Goal,
  GoalMetric,
  Note,
  Project,
  Routine,
  Task,
  WeeklyReview,
} from "../types";

export type Tab = "notes" | "tasks" | "today" | "projects" | "more";
export type MoreTab = "routines" | "goals" | "review";
export type StatusFilter = "all" | "active" | "inactive" | "completed" | "discarded";
export type FilterKey = "notes" | "tasks" | "projects" | "routines" | "goals";
export type StatusBucket = Exclude<StatusFilter, "all">;
export type SortableEntity = { status: "active" | "completed" | "discarded"; updatedAt: string; isActive?: boolean };

const emptySettings: AppSettings = { id: "settings", logicalDate: toDayString() };

const nowIso = () => new Date().toISOString();

const statusRank: Record<StatusBucket, number> = {
  active: 0,
  inactive: 1,
  completed: 2,
  discarded: 3,
};

export function getStatusBucket(item: SortableEntity): StatusBucket {
  if (item.status === "discarded") return "discarded";
  if (item.status === "completed") return "completed";
  if (item.isActive === false) return "inactive";
  return "active";
}

function sortAndFilterItems<T extends SortableEntity>(items: T[], filter: StatusFilter): T[] {
  const sorted = [...items].sort((a, b) => {
    const rankDiff = statusRank[getStatusBucket(a)] - statusRank[getStatusBucket(b)];
    if (rankDiff !== 0) return rankDiff;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  if (filter === "all") return sorted;
  return sorted.filter((item) => getStatusBucket(item) === filter);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 16).replace("T", " ");
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDayString(d.toISOString());
}

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return toDayString(d.toISOString());
}

export function useAppData() {
  const [tab, setTab] = useState<Tab>("today");
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<AppStateData>({
    notes: [],
    tasks: [],
    projects: [],
    goals: [],
    routines: [],
    completions: [],
    reviews: [],
    logs: [],
    settings: emptySettings,
  });
  const [noteInput, setNoteInput] = useState("");
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [swVersion, setSwVersion] = useState("unknown");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [moreTab, setMoreTab] = useState<MoreTab>("routines");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, StatusFilter>>({
    notes: "all",
    tasks: "all",
    projects: "all",
    routines: "all",
    goals: "all",
  });
  const [openFilterMenu, setOpenFilterMenu] = useState<FilterKey | null>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteComposerRef = useRef<HTMLFormElement | null>(null);

  const logicalDay = state.settings.logicalDate;

  async function reloadAll(): Promise<void> {
    const settings = await getById("settings", "settings");
    if (!settings) {
      await putItem("settings", emptySettings);
    }
    const [notes, tasks, projects, goals, routines, completions, reviews, logs, updatedSettings] = await Promise.all([
      getAll("notes"),
      getAll("tasks"),
      getAll("projects"),
      getAll("goals"),
      getAll("routines"),
      getAll("completions"),
      getAll("reviews"),
      getAll("logs"),
      getById("settings", "settings"),
    ]);
    setState({
      notes,
      tasks,
      projects,
      goals,
      routines,
      completions,
      reviews,
      logs: logs.sort((a, b) => b.at.localeCompare(a.at)),
      settings: updatedSettings ?? emptySettings,
    });
    setLoaded(true);
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  useEffect(() => {
    let baselineHeight = window.innerHeight;

    const hasEditableFocus = () => {
      const active = document.activeElement;
      if (!active) return false;
      if (active instanceof HTMLInputElement) return true;
      if (active instanceof HTMLTextAreaElement) return true;
      if (active instanceof HTMLSelectElement) return true;
      return active instanceof HTMLElement && active.isContentEditable;
    };

    const updateKeyboardVisibility = () => {
      const vv = window.visualViewport;
      const viewportHeight = window.innerHeight;
      const visibleHeight = vv ? vv.height + vv.offsetTop : viewportHeight;
      const isFocused = hasEditableFocus();

      if (!isFocused && Math.abs(viewportHeight - baselineHeight) > 120) {
        baselineHeight = viewportHeight;
      }

      const keyboardOpen = isFocused && baselineHeight - visibleHeight > 80;
      setIsKeyboardVisible((prev) => (prev === keyboardOpen ? prev : keyboardOpen));
    };

    updateKeyboardVisibility();

    const vv = window.visualViewport;
    window.addEventListener("resize", updateKeyboardVisibility);
    window.addEventListener("focusin", updateKeyboardVisibility);
    window.addEventListener("focusout", updateKeyboardVisibility);
    vv?.addEventListener("resize", updateKeyboardVisibility);
    vv?.addEventListener("scroll", updateKeyboardVisibility);

    return () => {
      window.removeEventListener("resize", updateKeyboardVisibility);
      window.removeEventListener("focusin", updateKeyboardVisibility);
      window.removeEventListener("focusout", updateKeyboardVisibility);
      vv?.removeEventListener("resize", updateKeyboardVisibility);
      vv?.removeEventListener("scroll", updateKeyboardVisibility);
    };
  }, []);

  useEffect(() => {
    const textarea = noteTextareaRef.current;
    if (!textarea) return;

    const styles = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(styles.lineHeight) || 20;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const borderTop = parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
    const maxHeight = lineHeight * 6 + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";

    const composer = noteComposerRef.current;
    if (composer) {
      document.documentElement.style.setProperty("--notes-composer-live-height", `${composer.offsetHeight}px`);
    }
  }, [noteInput, tab]);

  useEffect(() => {
    const updateComposerHeight = () => {
      const composer = noteComposerRef.current;
      if (composer) {
        document.documentElement.style.setProperty("--notes-composer-live-height", `${composer.offsetHeight}px`);
      }
    };

    window.addEventListener("resize", updateComposerHeight);
    updateComposerHeight();

    return () => {
      window.removeEventListener("resize", updateComposerHeight);
    };
  }, []);

  useEffect(() => {
    setOpenFilterMenu(null);
  }, [tab, moreTab]);

  useEffect(() => {
    let cancelled = false;

    async function resolveCachedVersion(): Promise<string | null> {
      if (!("caches" in window)) return null;
      try {
        const keys = await caches.keys();
        const versions = keys
          .map((key) => {
            const match = key.match(/wow-goals-v(\d+)/i);
            return match ? Number(match[1]) : null;
          })
          .filter((v): v is number => v !== null);
        if (versions.length === 0) return null;
        return `v${Math.max(...versions)}`;
      } catch {
        return null;
      }
    }

    async function fetchVersion() {
      try {
        const cachedVersion = await resolveCachedVersion();
        if (!cancelled && cachedVersion) {
          setSwVersion(cachedVersion);
        }

        const resp = await fetch(`${import.meta.env.BASE_URL}sw.js?ts=${Date.now()}`, { cache: "no-store" });
        if (!resp.ok) {
          if (!cancelled && !cachedVersion) setSwVersion("unknown");
          return;
        }

        const code = await resp.text();
        const match = code.match(/wow-goals-v(\d+)/i);
        if (!cancelled) {
          setSwVersion(match ? `v${match[1]}` : (cachedVersion ?? "unknown"));
        }
      } catch {
        if (!cancelled) {
          const cachedVersion = await resolveCachedVersion();
          setSwVersion(cachedVersion ?? "unknown");
        }
      }
    }

    void fetchVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  async function getRegistration() {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported in this browser.");
    }

    const reg =
      (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) ??
      (await navigator.serviceWorker.getRegistration());

    if (!reg) {
      throw new Error("Service worker is not registered yet.");
    }

    return reg;
  }

  async function waitForWaitingWorker(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<ServiceWorker | null> {
    if (reg.waiting) return reg.waiting;

    return new Promise<ServiceWorker | null>((resolve) => {
      let resolved = false;

      const finish = (worker: ServiceWorker | null) => {
        if (resolved) return;
        resolved = true;
        resolve(worker);
      };

      const timer = window.setTimeout(() => {
        finish(reg.waiting ?? null);
      }, timeoutMs);

      const onUpdateFound = () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") {
            window.clearTimeout(timer);
            finish(reg.waiting ?? installing);
          } else if (installing.state === "redundant") {
            window.clearTimeout(timer);
            finish(null);
          }
        });
      };

      reg.addEventListener("updatefound", onUpdateFound, { once: true });

      if (reg.installing) {
        onUpdateFound();
      }
    });
  }

  async function applyUpdate(): Promise<void> {
    setIsApplyingUpdate(true);
    try {
      const reg = await getRegistration();
      await reg.update();
      const targetWorker = await waitForWaitingWorker(reg, 8000);
      if (!targetWorker) {
        window.alert("No new update to apply right now.");
        return;
      }

      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };

        navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
        targetWorker.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(finish, 4000);
      });

      window.location.reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply update.";
      window.alert(`Apply failed: ${msg}`);
    } finally {
      setIsApplyingUpdate(false);
    }
  }

  async function checkForUpdates(): Promise<void> {
    setIsCheckingUpdate(true);
    try {
      await getRegistration();
      const resp = await fetch(`${import.meta.env.BASE_URL}sw.js?ts=${Date.now()}`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`Failed to fetch sw.js (${resp.status})`);

      const code = await resp.text();
      const match = code.match(/wow-goals-v(\d+)/i);
      if (!match) throw new Error("Could not read version from sw.js");

      const remote = Number(match[1]);
      const current = Number(swVersion.replace(/[^0-9]/g, ""));
      if (!Number.isFinite(remote)) throw new Error("Invalid version in sw.js");

      if (!current || remote > current) {
        const shouldApply = window.confirm(`Update v${remote} is available.\n\nApply now?`);
        if (shouldApply) {
          await applyUpdate();
        }
      } else {
        window.alert(`You are up to date (v${remote}).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update check failed.";
      window.alert(`Update check failed: ${msg}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  async function logEvent(action: string, entityType: string, entityId: string | undefined, detail: string): Promise<void> {
    const log: EventLog = {
      id: uid("log"),
      at: nowIso(),
      action,
      entityType,
      entityId,
      detail,
    };
    await putItem("logs", log);
  }

  function makeBase(title: string) {
    const now = nowIso();
    return {
      id: uid("item"),
      title,
      description: "",
      createdAt: now,
      updatedAt: now,
      status: "active" as const,
    };
  }

  function goalMetrics(goal: Goal): GoalMetric[] {
    if (goal.metrics && goal.metrics.length > 0) {
      return goal.metrics;
    }
    return [
      {
        id: "legacy_primary",
        name: goal.metricName,
        current: goal.metricCurrent,
        target: goal.metricTarget,
      },
    ];
  }

  function primaryMetric(goal: Goal): GoalMetric {
    const metrics = goalMetrics(goal);
    const primary = metrics.find((m) => m.id === goal.primaryMetricId);
    return primary ?? metrics[0];
  }

  function syncGoalMetricFields(goal: Goal, metrics: GoalMetric[], primaryMetricId?: string): Goal {
    const primary = metrics.find((m) => m.id === primaryMetricId) ?? metrics[0];
    return {
      ...goal,
      metrics,
      primaryMetricId: primary.id,
      metricName: primary.name,
      metricCurrent: primary.current,
      metricTarget: primary.target,
    };
  }

  async function addNote(): Promise<void> {
    const lines = noteInput.replace(/\r\n/g, "\n").split("\n");
    const titleLineIndex = lines.findIndex((line) => line.trim().length > 0);
    if (titleLineIndex < 0) return;
    const title = lines[titleLineIndex].trim();
    if (!title) return;
    const description = lines.slice(titleLineIndex + 1).join("\n").trim();
    const note: Note = { ...makeBase(title), description };
    await putItem("notes", note);
    await logEvent("create", "note", note.id, "Captured note in inbox");
    setNoteInput("");
    await reloadAll();
  }

  async function updateEntity<K extends EntityType>(type: K, id: string, mutator: (row: any) => any): Promise<void> {
    const storeMap = {
      note: "notes",
      task: "tasks",
      project: "projects",
      goal: "goals",
      routine: "routines",
    } as const;
    const store = storeMap[type];
    const current = await getById(store, id);
    if (!current) return;
    const updated = { ...mutator(current), updatedAt: nowIso() };
    await putItem(store, updated);
    await logEvent("update", type, id, "Updated item");
    await reloadAll();
  }

  async function discardEntity(type: EntityType, id: string): Promise<void> {
    await updateEntity(type, id, (row: any) => ({ ...row, status: "discarded" }));
    await logEvent("discard", type, id, "Moved to discarded");
  }

  async function recoverEntity(type: EntityType, id: string): Promise<void> {
    await updateEntity(type, id, (row: any) => ({ ...row, status: "active" }));
    await logEvent("recover", type, id, "Recovered from discarded");
  }

  async function completeTask(taskId: string): Promise<void> {
    await updateEntity("task", taskId, (task: Task) => ({ ...task, status: "completed" }));
    await putItem("completions", {
      id: uid("cmp"),
      entityType: "task",
      entityId: taskId,
      date: logicalDay,
      completedAt: nowIso(),
    });
    await logEvent("complete", "task", taskId, `Task completed on ${logicalDay}`);
    await reloadAll();
  }

  async function postponeTask(taskId: string): Promise<void> {
    await updateEntity("task", taskId, (task: Task) => ({
      ...task,
      postponedCount: task.postponedCount + 1,
      lastPostponedAt: logicalDay,
      deadline: task.deadline ? nextDay(task.deadline) : nextDay(logicalDay),
    }));
    await logEvent("postpone", "task", taskId, "Postponed task by one day");
  }

  async function permanentDelete(type: EntityType, id: string): Promise<void> {
    const ok = window.confirm("Delete permanently? This cannot be recovered.");
    if (!ok) return;
    const storeMap = {
      note: "notes",
      task: "tasks",
      project: "projects",
      goal: "goals",
      routine: "routines",
    } as const;
    const store = storeMap[type];
    await deleteItem(store, id);
    await logEvent("delete-permanent", type, id, "Item permanently deleted");
    await reloadAll();
  }

  async function triageNote(note: Note, to: Exclude<EntityType, "note">): Promise<void> {
    const title = window.prompt("Title", note.title)?.trim() || note.title;
    if (to === "task") {
      const deadline = window.prompt("Deadline YYYY-MM-DD (optional)", logicalDay)?.trim();
      const task: Task = {
        ...makeBase(title),
        priority: state.tasks.length + 1,
        postponedCount: 0,
        deadline: deadline || undefined,
      };
      await putItem("tasks", task);
    }
    if (to === "project") {
      const deadline = window.prompt("Deadline YYYY-MM-DD (optional)", "")?.trim();
      const project: Project = {
        ...makeBase(title),
        isActive: true,
        effort: 3,
        importance: 3,
        deadline: deadline || undefined,
      };
      await putItem("projects", project);
    }
    if (to === "goal") {
      const target = Number(window.prompt("Metric target", "10") || "10");
      const goal: Goal = {
        ...makeBase(title),
        isActive: true,
        metricName: "Progress",
        metricCurrent: 0,
        metricTarget: target,
        metrics: [{ id: uid("metric"), name: "Progress", current: 0, target }],
      };
      await putItem("goals", goal);
    }
    if (to === "routine") {
      const routine: Routine = {
        ...makeBase(title),
        cadence: "daily",
      };
      await putItem("routines", routine);
    }
    await updateEntity("note", note.id, (row: Note) => ({ ...row, triagedTo: to, status: "completed" }));
    await logEvent("triage", "note", note.id, `Converted to ${to}`);
    await reloadAll();
  }

  async function completeRoutine(routineId: string): Promise<void> {
    const id = `routine_${routineId}_${logicalDay}`;
    const existing = await getById("completions", id);
    if (existing) {
      const cancel = window.confirm("Cancel completion for today?");
      if (!cancel) return;
      await deleteItem("completions", id);
      await logEvent("undo-complete", "routine", routineId, `Undid routine completion on ${logicalDay}`);
      await reloadAll();
      return;
    }
    await putItem("completions", {
      id,
      entityType: "routine",
      entityId: routineId,
      date: logicalDay,
      completedAt: nowIso(),
    });
    await logEvent("complete", "routine", routineId, `Routine completed on ${logicalDay}`);
    await reloadAll();
  }

  async function editTitle(type: EntityType, id: string, currentTitle: string): Promise<void> {
    const title = window.prompt("Title", currentTitle)?.trim();
    if (!title) return;
    await updateEntity(type, id, (row: any) => ({ ...row, title }));
  }

  async function editDescription(type: EntityType, id: string, current: string): Promise<void> {
    const description = window.prompt("Description", current) ?? current;
    await updateEntity(type, id, (row: any) => ({ ...row, description }));
  }

  async function addQuickTask(): Promise<void> {
    const title = window.prompt("Task title", "");
    if (!title?.trim()) return;
    const task: Task = {
      ...makeBase(title.trim()),
      priority: state.tasks.length + 1,
      postponedCount: 0,
    };
    await putItem("tasks", task);
    await logEvent("create", "task", task.id, "Quick added task");
    await reloadAll();
  }

  async function addQuickProject(): Promise<void> {
    const title = window.prompt("Project title", "");
    if (!title?.trim()) return;
    const project: Project = {
      ...makeBase(title.trim()),
      isActive: true,
      effort: 3,
      importance: 3,
    };
    await putItem("projects", project);
    await logEvent("create", "project", project.id, "Quick added project");
    await reloadAll();
  }

  async function addQuickGoal(): Promise<void> {
    const title = window.prompt("Goal title", "");
    if (!title?.trim()) return;
    const goal: Goal = {
      ...makeBase(title.trim()),
      isActive: true,
      metricName: "Progress",
      metricCurrent: 0,
      metricTarget: 10,
      metrics: [{ id: uid("metric"), name: "Progress", current: 0, target: 10 }],
    };
    await putItem("goals", goal);
    await logEvent("create", "goal", goal.id, "Quick added goal");
    await reloadAll();
  }

  async function addGoalMetric(goal: Goal): Promise<void> {
    const name = window.prompt("Metric name", "")?.trim();
    if (!name) return;
    const target = Number(window.prompt("Target", "10") ?? "10");
    const current = Number(window.prompt("Current", "0") ?? "0");
    const metrics = [...goalMetrics(goal), { id: uid("metric"), name, current, target }];
    await updateEntity("goal", goal.id, (g: Goal) => syncGoalMetricFields(g, metrics, goal.primaryMetricId));
  }

  async function editGoalMetric(goal: Goal, metric: GoalMetric): Promise<void> {
    const name = window.prompt("Metric name", metric.name)?.trim();
    if (!name) return;
    const target = Number(window.prompt("Target", String(metric.target)) ?? String(metric.target));
    const current = Number(window.prompt("Current", String(metric.current)) ?? String(metric.current));
    const metrics = goalMetrics(goal).map((m) => (m.id === metric.id ? { ...m, name, target, current } : m));
    await updateEntity("goal", goal.id, (g: Goal) => syncGoalMetricFields(g, metrics, goal.primaryMetricId));
  }

  async function removeGoalMetric(goal: Goal, metricId: string): Promise<void> {
    const metrics = goalMetrics(goal);
    if (metrics.length <= 1) {
      window.alert("A goal needs at least one metric.");
      return;
    }
    const nextMetrics = metrics.filter((m) => m.id !== metricId);
    await updateEntity("goal", goal.id, (g: Goal) => syncGoalMetricFields(g, nextMetrics, goal.primaryMetricId));
  }

  async function setPrimaryGoalMetric(goal: Goal, metricId: string): Promise<void> {
    const metrics = goalMetrics(goal);
    await updateEntity("goal", goal.id, (g: Goal) => syncGoalMetricFields(g, metrics, metricId));
  }

  async function addQuickRoutine(): Promise<void> {
    const title = window.prompt("Routine title", "");
    if (!title?.trim()) return;
    const routine: Routine = {
      ...makeBase(title.trim()),
      cadence: "daily",
    };
    await putItem("routines", routine);
    await logEvent("create", "routine", routine.id, "Quick added routine");
    await reloadAll();
  }

  async function saveWeeklyReview(form: FormData): Promise<void> {
    const review: WeeklyReview = {
      id: uid("review"),
      weekKey: toWeekKey(logicalDay),
      inboxCleared: form.get("inboxCleared") === "on",
      tasksPrioritized: form.get("tasksPrioritized") === "on",
      weekPlanned: form.get("weekPlanned") === "on",
      goalsChecked: form.get("goalsChecked") === "on",
      note: String(form.get("note") ?? ""),
      createdAt: nowIso(),
    };
    await putItem("reviews", review);
    await logEvent("review", "weekly", review.id, `Saved weekly review ${review.weekKey}`);
    await reloadAll();
  }

  async function setLogicalDay(day: string): Promise<void> {
    await putItem("settings", { id: "settings", logicalDate: day });
    await logEvent("debug-date", "settings", "settings", `Logical day set to ${day}`);
    await reloadAll();
  }

  async function decrementLogicalDay(): Promise<void> {
    await setLogicalDay(prevDay(logicalDay));
  }

  async function incrementLogicalDay(): Promise<void> {
    await setLogicalDay(nextDay(logicalDay));
  }

  async function resetLogicalDayToToday(): Promise<void> {
    await setLogicalDay(toDayString());
  }

  function closeSettingsPopup(): void {
    setShowSettingsPopup(false);
    setShowDebugTools(false);
  }

  const activeTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.status === "active")
        .sort((a, b) => a.priority - b.priority || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")),
    [state.tasks],
  );

  const todayTop3 = activeTasks.slice(0, 3);
  const filteredNotes = useMemo(() => sortAndFilterItems(state.notes, filters.notes), [state.notes, filters.notes]);
  const filteredTasks = useMemo(() => sortAndFilterItems(state.tasks, filters.tasks), [state.tasks, filters.tasks]);
  const filteredProjects = useMemo(
    () => sortAndFilterItems(state.projects, filters.projects),
    [state.projects, filters.projects],
  );
  const filteredRoutines = useMemo(
    () => sortAndFilterItems(state.routines, filters.routines),
    [state.routines, filters.routines],
  );
  const filteredGoals = useMemo(() => sortAndFilterItems(state.goals, filters.goals), [state.goals, filters.goals]);
  const linkableGoals = useMemo(() => state.goals.filter((g) => g.status !== "discarded"), [state.goals]);
  const linkableProjects = useMemo(() => state.projects.filter((p) => p.status !== "discarded"), [state.projects]);
  const completedTodayCount = state.completions.filter((c) => c.date === logicalDay && c.entityType === "task").length;
  const routinesTodayCount = state.completions.filter((c) => c.date === logicalDay && c.entityType === "routine").length;

  function statusLabel(item: SortableEntity): string {
    return getStatusBucket(item);
  }

  return {
    tab,
    setTab,
    loaded,
    state,
    noteInput,
    setNoteInput,
    showSettingsPopup,
    setShowSettingsPopup,
    showDebugTools,
    setShowDebugTools,
    swVersion,
    isCheckingUpdate,
    isApplyingUpdate,
    moreTab,
    setMoreTab,
    isKeyboardVisible,
    filters,
    setFilters,
    openFilterMenu,
    setOpenFilterMenu,
    noteTextareaRef,
    noteComposerRef,
    logicalDay,
    activeTasks,
    todayTop3,
    filteredNotes,
    filteredTasks,
    filteredProjects,
    filteredRoutines,
    filteredGoals,
    linkableGoals,
    linkableProjects,
    completedTodayCount,
    routinesTodayCount,
    checkForUpdates,
    closeSettingsPopup,
    setLogicalDay,
    decrementLogicalDay,
    incrementLogicalDay,
    resetLogicalDayToToday,
    addNote,
    updateEntity,
    discardEntity,
    recoverEntity,
    completeTask,
    postponeTask,
    permanentDelete,
    triageNote,
    completeRoutine,
    editTitle,
    editDescription,
    addQuickTask,
    addQuickProject,
    addQuickGoal,
    addGoalMetric,
    editGoalMetric,
    removeGoalMetric,
    setPrimaryGoalMetric,
    addQuickRoutine,
    saveWeeklyReview,
    goalMetrics,
    primaryMetric,
    statusLabel,
  };
}

export type AppData = ReturnType<typeof useAppData>;
