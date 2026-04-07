import { FormEvent, useEffect, useMemo, useState } from "react";
import { deleteItem, getAll, getById, putItem, toDayString, toWeekKey, uid } from "./db";
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
} from "./types";

type Tab = "notes" | "tasks" | "today" | "routines" | "projects" | "goals" | "review" | "debug";
type PopupTarget = { type: EntityType; id: string } | null;

const emptySettings: AppSettings = { id: "settings", logicalDate: toDayString() };

const nowIso = () => new Date().toISOString();

function byUpdated<T extends { updatedAt: string }>(a: T, b: T): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function App() {
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
  const [popup, setPopup] = useState<PopupTarget>(null);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);
  const [swVersion, setSwVersion] = useState("unknown");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);

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

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const title = noteInput.trim();
    if (!title) return;
    const note: Note = { ...makeBase(title) };
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

  async function saveWeeklyReview(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
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
    e.currentTarget.reset();
    await reloadAll();
  }

  async function setLogicalDay(day: string): Promise<void> {
    await putItem("settings", { id: "settings", logicalDate: day });
    await logEvent("debug-date", "settings", "settings", `Logical day set to ${day}`);
    await reloadAll();
  }

  const activeTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => t.status === "active")
        .sort((a, b) => a.priority - b.priority || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")),
    [state.tasks],
  );

  const todayTop3 = activeTasks.slice(0, 3);
  const linkableGoals = useMemo(() => state.goals.filter((g) => g.status !== "discarded"), [state.goals]);
  const linkableProjects = useMemo(() => state.projects.filter((p) => p.status !== "discarded"), [state.projects]);
  const completedTodayCount = state.completions.filter((c) => c.date === logicalDay && c.entityType === "task").length;
  const routinesTodayCount = state.completions.filter((c) => c.date === logicalDay && c.entityType === "routine").length;
  const selectedNote = popup?.type === "note" ? state.notes.find((n) => n.id === popup.id) : undefined;
  const selectedTask = popup?.type === "task" ? state.tasks.find((t) => t.id === popup.id) : undefined;
  const selectedProject = popup?.type === "project" ? state.projects.find((p) => p.id === popup.id) : undefined;
  const selectedRoutine = popup?.type === "routine" ? state.routines.find((r) => r.id === popup.id) : undefined;
  const selectedGoal = popup?.type === "goal" ? state.goals.find((g) => g.id === popup.id) : undefined;

  if (!loaded) return <div className="loading">Loading control deck...</div>;

  return (
    <div className="app">
      <header className="topbar">
        <h1>WowGoals</h1>
        <div className="topbar-actions">
          <div className="meta">Day {logicalDay}</div>
          <button className="settings-btn" onClick={() => setShowSettingsPopup(true)} aria-label="Open app settings">
            Settings
          </button>
        </div>
      </header>

      <main className="main">
        {tab === "notes" && (
          <section>
            <h2>Capture &amp; Triage</h2>
            <form onSubmit={addNote} className="row">
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Capture thought, idea, obligation..."
              />
              <button type="submit">Add</button>
            </form>
            <div className="cards">
              {state.notes.sort(byUpdated).map((note) => (
                <article key={note.id} className="card">
                  <div className="card-top">
                    <div className="title">{note.title}</div>
                    <button onClick={() => setPopup({ type: "note", id: note.id })}>Manage</button>
                  </div>
                  <div className="tags">{note.status}{note.triagedTo ? ` -> ${note.triagedTo}` : ""}</div>
                  <div className="meta-row">Created {note.createdAt.slice(0, 10)} | Updated {note.updatedAt.slice(0, 10)}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "tasks" && (
          <section>
            <h2>Prioritized Tasks</h2>
            <div className="actions">
              <button onClick={() => void addQuickTask()}>+ Task</button>
            </div>
            <div className="cards">
              {state.tasks.sort((a, b) => a.priority - b.priority).map((task) => (
                <article key={task.id} className="card">
                  <div className="card-top">
                    <div className="title">#{task.priority} {task.title}</div>
                    <button onClick={() => setPopup({ type: "task", id: task.id })}>Manage</button>
                  </div>
                  <div className="tags">
                    {task.status} {task.deadline ? `| due ${task.deadline}` : ""} | postponed {task.postponedCount} {task.goalId ? `| goal ${state.goals.find((g) => g.id === task.goalId)?.title ?? "Unknown"}` : ""} {task.projectId ? `| project ${state.projects.find((p) => p.id === task.projectId)?.title ?? "Unknown"}` : ""}
                  </div>
                  <div className="meta-row">Created {task.createdAt.slice(0, 10)} | Updated {task.updatedAt.slice(0, 10)}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "today" && (
          <section>
            <h2>Today</h2>
            <div className="stats">
              <div className="stat"><span>{completedTodayCount}</span> tasks done</div>
              <div className="stat"><span>{routinesTodayCount}</span> routines done</div>
              <div className="stat"><span>{state.notes.filter((n) => n.status === "active").length}</span> notes untriaged</div>
            </div>
            <h3>Top 3 Tasks</h3>
            <div className="cards">
              {todayTop3.map((task) => (
                <article key={task.id} className="card task-hero">
                  <div className="title">{task.title}</div>
                  <div className="actions">
                    <button onClick={() => void completeTask(task.id)}>Complete</button>
                    <button onClick={() => void postponeTask(task.id)}>Postpone</button>
                  </div>
                </article>
              ))}
            </div>
            <h3>Routines</h3>
            <div className="routine-grid">
              {state.routines
                .filter((routine) => routine.status !== "discarded")
                .map((routine) => {
                  const complete = state.completions.some(
                    (c) => c.entityType === "routine" && c.entityId === routine.id && c.date === logicalDay,
                  );
                  return (
                    <button
                      key={routine.id}
                      className={`routine-btn ${complete ? "ok" : ""}`}
                      onClick={() => void completeRoutine(routine.id)}
                    >
                      {routine.title}
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        {tab === "routines" && (
          <section>
            <h2>Routines</h2>
            <div className="actions">
              <button onClick={() => void addQuickRoutine()}>+ Routine</button>
            </div>
            <div className="cards">
              {state.routines.sort(byUpdated).map((routine) => (
                <article key={routine.id} className="card">
                  <div className="card-top">
                    <div className="title">{routine.title}</div>
                    <button onClick={() => setPopup({ type: "routine", id: routine.id })}>Manage</button>
                  </div>
                  <div className="tags">{routine.goalId ? `goal ${state.goals.find((g) => g.id === routine.goalId)?.title ?? "Unknown"}` : "No goal linked"}</div>
                  <div className="meta-row">Created {routine.createdAt.slice(0, 10)} | Updated {routine.updatedAt.slice(0, 10)}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "projects" && (
          <section>
            <h2>Projects</h2>
            <div className="actions">
              <button onClick={() => void addQuickProject()}>+ Project</button>
            </div>
            <div className="cards">
              {state.projects.sort(byUpdated).map((project) => (
                <article key={project.id} className="card">
                  <div className="card-top">
                    <div className="title">{project.title}</div>
                    <button onClick={() => setPopup({ type: "project", id: project.id })}>Manage</button>
                  </div>
                  <div className="tags">{project.isActive ? "active" : "inactive"} | {project.status} {project.goalId ? `| goal ${state.goals.find((g) => g.id === project.goalId)?.title ?? "Unknown"}` : ""}</div>
                  <div className="meta-row">Created {project.createdAt.slice(0, 10)} | Updated {project.updatedAt.slice(0, 10)}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "goals" && (
          <section>
            <h2>Goals</h2>
            <div className="actions">
              <button onClick={() => void addQuickGoal()}>+ Goal</button>
            </div>
            <div className="cards">
              {state.goals.sort(byUpdated).map((goal) => {
                const pMetric = primaryMetric(goal);
                const linkedProjects = state.projects.filter((p) => p.goalId === goal.id);
                const linkedTasks = state.tasks.filter((t) => t.goalId === goal.id);
                const linkedRoutines = state.routines.filter((r) => r.goalId === goal.id);
                const progress = pMetric.target > 0 ? Math.min(100, Math.round((pMetric.current / pMetric.target) * 100)) : 0;
                return (
                  <article key={goal.id} className="card">
                    <div className="card-top">
                      <div className="title">{goal.title}</div>
                      <button onClick={() => setPopup({ type: "goal", id: goal.id })}>Manage</button>
                    </div>
                    <div className="tags">{pMetric.name}: {pMetric.current}/{pMetric.target} ({progress}%)</div>
                    <div className="bar"><i style={{ width: `${progress}%` }} /></div>
                    <div className="tags">linked: {linkedProjects.length} projects, {linkedTasks.length} tasks, {linkedRoutines.length} routines</div>
                    <div className="meta-row">Created {goal.createdAt.slice(0, 10)} | Updated {goal.updatedAt.slice(0, 10)}</div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "review" && (
          <section>
            <h2>Weekly Review</h2>
            <form className="checklist" onSubmit={saveWeeklyReview}>
              <label><input type="checkbox" name="inboxCleared" /> Inbox cleaned</label>
              <label><input type="checkbox" name="tasksPrioritized" /> Tasks prioritized</label>
              <label><input type="checkbox" name="weekPlanned" /> Week planned</label>
              <label><input type="checkbox" name="goalsChecked" /> Goals reviewed</label>
              <textarea name="note" placeholder="What changed this week?" />
              <button type="submit">Save Weekly Review</button>
            </form>
            <h3>Review History</h3>
            <div className="cards">
              {state.reviews
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((review) => (
                  <article key={review.id} className="card">
                    <div className="title">{review.weekKey}</div>
                    <div className="tags">
                      inbox:{String(review.inboxCleared)} | tasks:{String(review.tasksPrioritized)} | plan:{String(review.weekPlanned)}
                    </div>
                    <div>{review.note || "No note"}</div>
                  </article>
                ))}
            </div>
            <h3>Event Log</h3>
            <div className="cards">
              {state.logs.map((log) => (
                <article key={log.id} className="card log">
                  <div className="title">{log.action}</div>
                  <div className="tags">{log.at.slice(0, 19).replace("T", " ")} | {log.entityType} {log.entityId ?? ""}</div>
                  <div>{log.detail}</div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "debug" && (
          <section>
            <h2>Debug Date Control</h2>
            <div className="card">
              <div className="title">Logical Day: {logicalDay}</div>
              <div className="actions">
                <button onClick={() => void setLogicalDay(prevDay(logicalDay))}>-1 Day</button>
                <button onClick={() => void setLogicalDay(nextDay(logicalDay))}>+1 Day</button>
                <button onClick={() => void setLogicalDay(toDayString())}>Reset to Today</button>
                <button
                  onClick={() => {
                    const day = window.prompt("Set logical day YYYY-MM-DD", logicalDay);
                    if (day) void setLogicalDay(day);
                  }}
                >
                  Set Date
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {showSettingsPopup && (
        <div className="modal-backdrop" onClick={() => setShowSettingsPopup(false)}>
          <section className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-top">
              <h3>App Settings</h3>
              <button onClick={() => setShowSettingsPopup(false)}>Close</button>
            </div>
            <div className="card">
              <div className="title">Application Version</div>
              <div className="tags">Version: {swVersion}</div>
              <div className="actions">
                <button onClick={() => void checkForUpdates()} disabled={isCheckingUpdate || isApplyingUpdate}>
                  {isApplyingUpdate ? "Applying update..." : isCheckingUpdate ? "Checking updates..." : "Check for update"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {popup && (
        <div className="modal-backdrop" onClick={() => setPopup(null)}>
          <section className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="card-top">
              <h3>Manage {popup.type}</h3>
              <button onClick={() => setPopup(null)}>Close</button>
            </div>

            {selectedNote && (
              <div className="actions">
                <button onClick={() => void triageNote(selectedNote, "task")}>To Task</button>
                <button onClick={() => void triageNote(selectedNote, "project")}>To Project</button>
                <button onClick={() => void triageNote(selectedNote, "goal")}>To Goal</button>
                <button onClick={() => void triageNote(selectedNote, "routine")}>To Routine</button>
                <button onClick={() => void editTitle("note", selectedNote.id, selectedNote.title)}>Edit Title</button>
                <button onClick={() => void editDescription("note", selectedNote.id, selectedNote.description)}>Edit Description</button>
                {selectedNote.status === "discarded" ? (
                  <button onClick={() => void recoverEntity("note", selectedNote.id)}>Recover</button>
                ) : (
                  <button onClick={() => void discardEntity("note", selectedNote.id)}>Discard</button>
                )}
                <button className="danger" onClick={() => void permanentDelete("note", selectedNote.id)}>Delete</button>
              </div>
            )}

            {selectedTask && (
              <div className="actions">
                <button onClick={() => void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, priority: Math.max(1, t.priority - 1) }))}>Bump Up</button>
                <button onClick={() => void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, priority: t.priority + 1 }))}>Bump Down</button>
                <button onClick={() => void completeTask(selectedTask.id)}>Done</button>
                <button onClick={() => void postponeTask(selectedTask.id)}>Postpone</button>
                <button
                  onClick={() => {
                    const due = window.prompt("Deadline YYYY-MM-DD", selectedTask.deadline ?? logicalDay);
                    if (due) void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, deadline: due }));
                  }}
                >
                  Deadline
                </button>
                <label className="inline-select">
                  Goal
                  <select
                    value={selectedTask.goalId ?? ""}
                    onChange={(e) =>
                      void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, goalId: e.target.value || undefined }))
                    }
                  >
                    <option value="">None</option>
                    {linkableGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </label>
                <label className="inline-select">
                  Project
                  <select
                    value={selectedTask.projectId ?? ""}
                    onChange={(e) =>
                      void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, projectId: e.target.value || undefined }))
                    }
                  >
                    <option value="">None</option>
                    {linkableProjects.map((project) => (
                      <option key={project.id} value={project.id}>{project.title}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void editTitle("task", selectedTask.id, selectedTask.title)}>Edit Title</button>
                <button onClick={() => void editDescription("task", selectedTask.id, selectedTask.description)}>Edit Description</button>
                {selectedTask.status === "discarded" ? (
                  <button onClick={() => void recoverEntity("task", selectedTask.id)}>Recover</button>
                ) : (
                  <button onClick={() => void discardEntity("task", selectedTask.id)}>Discard</button>
                )}
                <button className="danger" onClick={() => void permanentDelete("task", selectedTask.id)}>Delete</button>
              </div>
            )}

            {selectedRoutine && (
              <div className="actions">
                <label className="inline-select">
                  Goal
                  <select
                    value={selectedRoutine.goalId ?? ""}
                    onChange={(e) =>
                      void updateEntity("routine", selectedRoutine.id, (r: Routine) => ({ ...r, goalId: e.target.value || undefined }))
                    }
                  >
                    <option value="">None</option>
                    {linkableGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void editTitle("routine", selectedRoutine.id, selectedRoutine.title)}>Edit Title</button>
                <button onClick={() => void editDescription("routine", selectedRoutine.id, selectedRoutine.description)}>Edit Description</button>
                {selectedRoutine.status === "discarded" ? (
                  <button onClick={() => void recoverEntity("routine", selectedRoutine.id)}>Recover</button>
                ) : (
                  <button onClick={() => void discardEntity("routine", selectedRoutine.id)}>Discard</button>
                )}
                <button className="danger" onClick={() => void permanentDelete("routine", selectedRoutine.id)}>Delete</button>
              </div>
            )}

            {selectedProject && (
              <div className="actions">
                <button onClick={() => void updateEntity("project", selectedProject.id, (p: Project) => ({ ...p, isActive: !p.isActive }))}>Toggle Active</button>
                <label className="inline-select">
                  Goal
                  <select
                    value={selectedProject.goalId ?? ""}
                    onChange={(e) =>
                      void updateEntity("project", selectedProject.id, (p: Project) => ({ ...p, goalId: e.target.value || undefined }))
                    }
                  >
                    <option value="">None</option>
                    {linkableGoals.map((goal) => (
                      <option key={goal.id} value={goal.id}>{goal.title}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void editTitle("project", selectedProject.id, selectedProject.title)}>Edit Title</button>
                <button onClick={() => void editDescription("project", selectedProject.id, selectedProject.description)}>Edit Description</button>
                {selectedProject.status === "discarded" ? (
                  <button onClick={() => void recoverEntity("project", selectedProject.id)}>Recover</button>
                ) : (
                  <button onClick={() => void discardEntity("project", selectedProject.id)}>Discard</button>
                )}
                <button className="danger" onClick={() => void permanentDelete("project", selectedProject.id)}>Delete</button>
              </div>
            )}

            {selectedGoal && (
              <>
                <div className="actions">
                  <button onClick={() => void addGoalMetric(selectedGoal)}>Add Metric</button>
                  <button onClick={() => void editTitle("goal", selectedGoal.id, selectedGoal.title)}>Edit Title</button>
                  <button onClick={() => void editDescription("goal", selectedGoal.id, selectedGoal.description)}>Edit Description</button>
                  {selectedGoal.status === "discarded" ? (
                    <button onClick={() => void recoverEntity("goal", selectedGoal.id)}>Recover</button>
                  ) : (
                    <button onClick={() => void discardEntity("goal", selectedGoal.id)}>Discard</button>
                  )}
                  <button className="danger" onClick={() => void permanentDelete("goal", selectedGoal.id)}>Delete</button>
                </div>
                <div className="cards">
                  {goalMetrics(selectedGoal).map((metric) => (
                    <article key={metric.id} className="card">
                      <div className="title">{metric.name}</div>
                      <div className="tags">{metric.current}/{metric.target}</div>
                      <div className="actions">
                        <button
                          className={selectedGoal.primaryMetricId === metric.id || (!selectedGoal.primaryMetricId && metric.id === goalMetrics(selectedGoal)[0].id) ? "active" : ""}
                          onClick={() => void setPrimaryGoalMetric(selectedGoal, metric.id)}
                        >
                          Set Primary
                        </button>
                        <button onClick={() => void editGoalMetric(selectedGoal, metric)}>Edit</button>
                        <button className="danger" onClick={() => void removeGoalMetric(selectedGoal, metric.id)}>Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <nav className="tabs">
        {[
          ["notes", "Notes"],
          ["tasks", "Tasks"],
          ["today", "Today"],
          ["routines", "Routines"],
          ["projects", "Projects"],
          ["goals", "Goals"],
          ["review", "Review"],
          ["debug", "Debug"],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as Tab)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
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

export default App;
