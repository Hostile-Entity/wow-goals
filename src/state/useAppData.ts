import { useEffect, useMemo, useRef, useState } from "react";
import { clearStore, deleteItem, getAll, getById, putItem, toDayString, uid } from "../db";
import { playTabClickSound, playUiClickSound, primeAudio, setSfxMasterVolume01 } from "../audio/soundManager";
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
export type StatusFilter = "all" | "in_progress" | "active" | "inactive" | "completed" | "discarded";
export type FilterKey = "notes" | "tasks" | "projects" | "routines" | "goals";
export type StatusBucket = Exclude<StatusFilter, "all">;
export type SortableEntity = { status: "active" | "in_progress" | "completed" | "discarded"; updatedAt: string; isActive?: boolean };
export type TaskDraft = {
  title: string;
  description?: string;
  deadline?: string;
  priority?: number;
  goalId?: string;
  projectId?: string;
};
export type ProjectDraft = {
  title: string;
  description?: string;
  deadline?: string;
  goalId?: string;
  isActive?: boolean;
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

const DEFAULT_DAY_START_HOUR = 5;
const DEFAULT_SOUND_VOLUME = 0;
const emptySettings: AppSettings = {
  id: "settings",
  dayOffset: 0,
  dayStartHour: DEFAULT_DAY_START_HOUR,
  soundVolume: DEFAULT_SOUND_VOLUME,
  showStatus: false,
  theme: "light",
};
const dataStores = ["notes", "tasks", "projects", "goals", "routines", "completions", "reviews", "logs"] as const;

type BackupPayload = {
  app: "wow-goals";
  schemaVersion: number;
  exportedAt: string;
  data: AppStateData;
};

type GoalMetricUpdateLogDetail = {
  metricId: string;
  metricName: string;
  from: number;
  to: number;
  occurredDay: string;
};

const nowIso = () => new Date().toISOString();

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ensureNonEmptyText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function sanitizeBase(raw: any) {
  const now = nowIso();
  return {
    id: ensureNonEmptyText(raw?.id, uid("item")),
    title: ensureNonEmptyText(raw?.title, "Untitled"),
    description: ensureNonEmptyText(raw?.description, ""),
    createdAt: ensureNonEmptyText(raw?.createdAt, now),
    updatedAt: ensureNonEmptyText(raw?.updatedAt, now),
    status: raw?.status === "in_progress" || raw?.status === "completed" || raw?.status === "discarded" ? raw.status : "active",
  } as const;
}

function sanitizeNotes(items: unknown[]): Note[] {
  return items.map((raw: any) => {
    const base = sanitizeBase(raw);
    return {
      ...base,
      ...(raw?.triagedTo ? { triagedTo: raw.triagedTo as EntityType } : {}),
    };
  });
}

function sanitizeTasks(items: unknown[]): Task[] {
  return items.map((raw: any) => {
    const base = sanitizeBase(raw);
    return {
      ...base,
      ...(raw?.goalId ? { goalId: String(raw.goalId) } : {}),
      ...(raw?.projectId ? { projectId: String(raw.projectId) } : {}),
      ...(raw?.deadline ? { deadline: String(raw.deadline) } : {}),
      priority: typeof raw?.priority === "number" && Number.isFinite(raw.priority) ? Math.max(1, Math.trunc(raw.priority)) : 1,
      postponedCount: typeof raw?.postponedCount === "number" && Number.isFinite(raw.postponedCount) ? Math.max(0, Math.trunc(raw.postponedCount)) : 0,
      ...(raw?.lastPostponedAt ? { lastPostponedAt: String(raw.lastPostponedAt) } : {}),
    };
  });
}

function sanitizeProjects(items: unknown[]): Project[] {
  return items.map((raw: any) => {
    const base = sanitizeBase(raw);
    return {
      ...base,
      ...(raw?.goalId ? { goalId: String(raw.goalId) } : {}),
      ...(raw?.deadline ? { deadline: String(raw.deadline) } : {}),
      isActive: raw?.isActive !== false,
    };
  });
}

function sanitizeGoals(items: unknown[]): Goal[] {
  return items.map((raw: any) => {
    const base = sanitizeBase(raw);
    const inputMetrics = Array.isArray(raw?.metrics) ? raw.metrics : [];
    const metrics =
      inputMetrics.length > 0
        ? inputMetrics.map((metric: any) => ({
            id: ensureNonEmptyText(metric?.id, uid("metric")),
            name: ensureNonEmptyText(metric?.name, "Metric"),
            current: typeof metric?.current === "number" && Number.isFinite(metric.current) ? metric.current : 0,
            target: typeof metric?.target === "number" && Number.isFinite(metric.target) ? metric.target : 10,
          }))
        : [{ id: uid("metric"), name: "Progress", current: 0, target: 10 }];
    const primaryMetricId =
      typeof raw?.primaryMetricId === "string" && metrics.some((metric: GoalMetric) => metric.id === raw.primaryMetricId)
        ? raw.primaryMetricId
        : metrics[0].id;
    return {
      ...base,
      metrics,
      primaryMetricId,
    };
  });
}

function sanitizeRoutines(items: unknown[]): Routine[] {
  return items.map((raw: any) => {
    const base = sanitizeBase(raw);
    return {
      ...base,
      ...(raw?.goalId ? { goalId: String(raw.goalId) } : {}),
    };
  });
}

function sanitizeCompletions(items: unknown[]): AppStateData["completions"] {
  return items.map((raw: any) => ({
    id: ensureNonEmptyText(raw?.id, uid("cmp")),
    entityType: raw?.entityType === "routine" ? "routine" : "task",
    entityId: ensureNonEmptyText(raw?.entityId, "unknown"),
    date: ensureNonEmptyText(raw?.date, toDayString(raw?.completedAt)),
    completedAt: ensureNonEmptyText(raw?.completedAt, nowIso()),
  }));
}

const statusRank: Record<StatusBucket, number> = {
  in_progress: 0,
  active: 1,
  inactive: 2,
  completed: 3,
  discarded: 4,
};

export function getStatusBucket(item: SortableEntity): StatusBucket {
  if (item.status === "in_progress") return "in_progress";
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

function daysUntil(fromDay: string, toDay?: string): number | null {
  if (!toDay) return null;
  const from = new Date(`${fromDay}T12:00:00`);
  const to = new Date(`${toDay}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function sortAndFilterTasks(tasks: Task[], filter: StatusFilter, logicalDay: string): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    const rankDiff = statusRank[getStatusBucket(a)] - statusRank[getStatusBucket(b)];
    if (rankDiff !== 0) return rankDiff;

    const aDaysToDeadline = daysUntil(logicalDay, a.deadline);
    const bDaysToDeadline = daysUntil(logicalDay, b.deadline);
    const aIsSoon = aDaysToDeadline !== null && aDaysToDeadline >= 0 && aDaysToDeadline <= 2;
    const bIsSoon = bDaysToDeadline !== null && bDaysToDeadline >= 0 && bDaysToDeadline <= 2;
    if (aIsSoon !== bIsSoon) return aIsSoon ? -1 : 1;

    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;

    if (aDaysToDeadline !== null && bDaysToDeadline !== null && aDaysToDeadline !== bDaysToDeadline) {
      return aDaysToDeadline - bDaysToDeadline;
    }
    if (aDaysToDeadline === null && bDaysToDeadline !== null) return 1;
    if (aDaysToDeadline !== null && bDaysToDeadline === null) return -1;

    const updatedAtDiff = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedAtDiff !== 0) return updatedAtDiff;

    return b.createdAt.localeCompare(a.createdAt);
  });

  if (filter === "all") return sorted;
  return sorted.filter((task) => getStatusBucket(task) === filter);
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

export function formatDueLabel(deadline: string, logicalDay: string): string {
  const due = new Date(`${deadline}T12:00:00`);
  const today = new Date(`${logicalDay}T12:00:00`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(today.getTime())) {
    return `Due ${deadline}`;
  }

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due in 1 day";
  if (diffDays > 1 && diffDays < 30) return `Due in ${diffDays} days`;
  if (diffDays >= 30) {
    const months = Math.floor(diffDays / 30);
    return months === 1 ? "Due in 1 month" : `Due in ${months} months`;
  }

  const overdueDays = Math.abs(diffDays);
  return overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDayString(d.toISOString());
}

function dayDiff(baseDay: string, targetDay: string): number {
  const base = new Date(`${baseDay}T00:00:00`);
  const target = new Date(`${targetDay}T00:00:00`);
  if (Number.isNaN(base.getTime()) || Number.isNaN(target.getTime())) return 0;
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function toLogicalDay(offset: number, nowMs: number, dayStartHour: number): string {
  const d = new Date(nowMs);
  d.setDate(d.getDate() + offset);
  return toDayString(d.toISOString(), dayStartHour);
}

function normalizeSettings(raw: unknown): AppSettings {
  if (raw && typeof raw === "object" && "id" in raw && (raw as { id?: string }).id === "settings") {
    const row = raw as {
      dayOffset?: unknown;
      dayStartHour?: unknown;
      soundVolume?: unknown;
      showStatus?: unknown;
      theme?: unknown;
    };
    const parsedDayStartHour =
      typeof row.dayStartHour === "number" && Number.isFinite(row.dayStartHour)
        ? Math.max(0, Math.min(23, Math.trunc(row.dayStartHour)))
        : DEFAULT_DAY_START_HOUR;
    const parsedSoundVolume =
      typeof row.soundVolume === "number" && Number.isFinite(row.soundVolume)
        ? Math.max(0, Math.min(100, Math.trunc(row.soundVolume)))
        : DEFAULT_SOUND_VOLUME;
    const parsedShowStatus = row.showStatus === true;
    const parsedTheme = row.theme === "wow" ? "wow" : "light";
    if (typeof row.dayOffset === "number" && Number.isFinite(row.dayOffset)) {
      return {
        id: "settings",
        dayOffset: Math.trunc(row.dayOffset),
        dayStartHour: parsedDayStartHour,
        soundVolume: parsedSoundVolume,
        showStatus: parsedShowStatus,
        theme: parsedTheme,
      };
    }
  }
  return emptySettings;
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
  const [moreTab, setMoreTab] = useState<MoreTab>("review");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, StatusFilter>>({
    notes: "all",
    tasks: "all",
    projects: "all",
    routines: "all",
    goals: "all",
  });
  const [openFilterMenu, setOpenFilterMenu] = useState<FilterKey | null>(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteComposerRef = useRef<HTMLFormElement | null>(null);

  const logicalOffset = state.settings.dayOffset;
  const dayStartHour = state.settings.dayStartHour;
  const soundVolume = state.settings.soundVolume;
  const showStatus = state.settings.showStatus;
  const theme = state.settings.theme;
  const logicalDay = toLogicalDay(logicalOffset, clockNowMs, dayStartHour);

  async function reloadAll(): Promise<void> {
    const settings = await getById("settings", "settings");
    const normalizedSettings = normalizeSettings(settings);
    if (!settings || JSON.stringify(settings) !== JSON.stringify(normalizedSettings)) {
      await putItem("settings", normalizedSettings);
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

    const normalizedNotes = sanitizeNotes(notes);
    const normalizedTasks = sanitizeTasks(tasks);
    const normalizedProjects = sanitizeProjects(projects);
    const normalizedGoals = sanitizeGoals(goals);
    const normalizedRoutines = sanitizeRoutines(routines);
    const normalizedCompletions = sanitizeCompletions(completions);

    const sanitizeWrites: Promise<void>[] = [];
    for (let i = 0; i < notes.length; i += 1) {
      if (!sameJson(notes[i], normalizedNotes[i])) sanitizeWrites.push(putItem("notes", normalizedNotes[i]));
    }
    for (let i = 0; i < tasks.length; i += 1) {
      if (!sameJson(tasks[i], normalizedTasks[i])) sanitizeWrites.push(putItem("tasks", normalizedTasks[i]));
    }
    for (let i = 0; i < projects.length; i += 1) {
      if (!sameJson(projects[i], normalizedProjects[i])) sanitizeWrites.push(putItem("projects", normalizedProjects[i]));
    }
    for (let i = 0; i < goals.length; i += 1) {
      if (!sameJson(goals[i], normalizedGoals[i])) sanitizeWrites.push(putItem("goals", normalizedGoals[i]));
    }
    for (let i = 0; i < routines.length; i += 1) {
      if (!sameJson(routines[i], normalizedRoutines[i])) sanitizeWrites.push(putItem("routines", normalizedRoutines[i]));
    }
    for (let i = 0; i < completions.length; i += 1) {
      if (!sameJson(completions[i], normalizedCompletions[i])) sanitizeWrites.push(putItem("completions", normalizedCompletions[i]));
    }
    if (sanitizeWrites.length > 0) {
      await Promise.all(sanitizeWrites);
    }

    setState({
      notes: normalizedNotes,
      tasks: normalizedTasks,
      projects: normalizedProjects,
      goals: normalizedGoals,
      routines: normalizedRoutines,
      completions: normalizedCompletions,
      reviews,
      logs: logs.sort((a, b) => b.at.localeCompare(a.at)),
      settings: normalizeSettings(updatedSettings),
    });
    setLoaded(true);
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
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

  useEffect(() => {
    function primeOnGesture() {
      document.removeEventListener("pointerdown", primeOnGesture, true);
      document.removeEventListener("keydown", primeOnGesture, true);
      void primeAudio();
    }

    document.addEventListener("pointerdown", primeOnGesture, true);
    document.addEventListener("keydown", primeOnGesture, true);
    return () => {
      document.removeEventListener("pointerdown", primeOnGesture, true);
      document.removeEventListener("keydown", primeOnGesture, true);
    };
  }, []);

  useEffect(() => {
    setSfxMasterVolume01((soundVolume ?? 0) / 100);
  }, [soundVolume]);

  useEffect(() => {
    function handleClick(ev: MouseEvent): void {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      const clickable = target.closest<HTMLElement>("button, [role='button'], a, [data-click-sound]");
      if (!clickable) return;
      if (clickable instanceof HTMLButtonElement && clickable.disabled) return;

      const clickSound = clickable.dataset.clickSound;
      const isMainButton =
        clickSound === "main" ||
        clickable.classList.contains("tabs-main-btn") ||
        clickable.classList.contains("tabs-bar-button") ||
        clickable.closest(".tabs") !== null ||
        clickable.closest(".more-tabs") !== null;

      if (isMainButton) {
        playTabClickSound();
      } else {
        playUiClickSound();
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
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
    if (goal.metrics.length > 0) {
      return goal.metrics;
    }
    return [{ id: "metric_default", name: "Progress", current: 0, target: 10 }];
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
    };
  }

  function collectGoalMetricUpdates(previousGoal: Goal, nextGoal: Goal, occurredDay: string): GoalMetricUpdateLogDetail[] {
    const prevMetrics = goalMetrics(previousGoal);
    const nextMetrics = goalMetrics(nextGoal);
    const prevById = new Map(prevMetrics.map((metric) => [metric.id, metric]));
    const updates: GoalMetricUpdateLogDetail[] = [];

    for (const metric of nextMetrics) {
      const previousMetric = prevById.get(metric.id);
      if (!previousMetric) continue;
      if (previousMetric.current === metric.current) continue;
      updates.push({
        metricId: metric.id,
        metricName: metric.name,
        from: previousMetric.current,
        to: metric.current,
        occurredDay,
      });
    }

    return updates;
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
    const metricUpdates =
      type === "goal"
        ? collectGoalMetricUpdates(current as Goal, updated as Goal, toDayString(updated.updatedAt, dayStartHour))
        : [];
    await putItem(store, updated);
    for (const metricUpdate of metricUpdates) {
      await logEvent("goal-metric-update", "goal", id, JSON.stringify(metricUpdate));
    }
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
    const title = note.title;
    const description = note.description ?? "";

    if (to === "task") {
      const task: Task = {
        ...makeBase(title),
        description,
        priority: state.tasks.length + 1,
        postponedCount: 0,
      };
      await putItem("tasks", task);
    }
    if (to === "project") {
      const project: Project = {
        ...makeBase(title),
        description,
        isActive: true,
      };
      await putItem("projects", project);
    }
    if (to === "goal") {
      const target = 10;
      const metricId = uid("metric");
      const goal: Goal = {
        ...makeBase(title),
        description,
        metrics: [{ id: metricId, name: "Progress", current: 0, target }],
        primaryMetricId: metricId,
      };
      await putItem("goals", goal);
    }
    if (to === "routine") {
      const routine: Routine = {
        ...makeBase(title),
        description,
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

  async function toggleRoutineCompletionForDay(routineId: string, day: string): Promise<void> {
    const id = `routine_${routineId}_${day}`;
    const existing = await getById("completions", id);
    if (existing) {
      const cancel = window.confirm(`Remove completion for ${day}?`);
      if (!cancel) return;
      await deleteItem("completions", id);
      await logEvent("undo-complete", "routine", routineId, `Undid routine completion on ${day}`);
      await reloadAll();
      return;
    }

    const ok = window.confirm(`Mark routine as completed for ${day}?`);
    if (!ok) return;
    const hour = String(dayStartHour).padStart(2, "0");
    const completedAt = new Date(`${day}T${hour}:00:00`).toISOString();
    await putItem("completions", {
      id,
      entityType: "routine",
      entityId: routineId,
      date: day,
      completedAt,
    });
    await logEvent("complete", "routine", routineId, `Routine completed on ${day}`);
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
    await createTask({ title: title.trim() });
  }

  async function createTask(draft: TaskDraft): Promise<void> {
    const title = draft.title.trim();
    if (!title) return;
    const task: Task = {
      ...makeBase(title),
      description: draft.description?.trim() ?? "",
      priority: draft.priority ?? state.tasks.length + 1,
      postponedCount: 0,
      deadline: draft.deadline || undefined,
      goalId: draft.goalId || undefined,
      projectId: draft.projectId || undefined,
    };
    await putItem("tasks", task);
    await logEvent("create", "task", task.id, "Added task");
    await reloadAll();
  }

  async function addQuickProject(): Promise<void> {
    const title = window.prompt("Project title", "");
    if (!title?.trim()) return;
    await createProject({ title: title.trim() });
  }

  async function createProject(draft: ProjectDraft): Promise<void> {
    const title = draft.title.trim();
    if (!title) return;
    const project: Project = {
      ...makeBase(title),
      description: draft.description?.trim() ?? "",
      isActive: draft.isActive ?? true,
      deadline: draft.deadline || undefined,
      goalId: draft.goalId || undefined,
    };
    await putItem("projects", project);
    await logEvent("create", "project", project.id, "Added project");
    await reloadAll();
  }

  async function addQuickGoal(): Promise<void> {
    const title = window.prompt("Goal title", "");
    if (!title?.trim()) return;
    await createGoal({ title: title.trim() });
  }

  async function createGoal(draft: GoalDraft): Promise<void> {
    const title = draft.title.trim();
    if (!title) return;
    const sourceMetrics = draft.metrics ?? [];
    const metrics =
      sourceMetrics.length > 0
        ? sourceMetrics.map((metric) => ({
            id: metric.id || uid("metric"),
            name: metric.name.trim() || "Metric",
            current: Number.isFinite(metric.current) ? metric.current : 0,
            target: Number.isFinite(metric.target) ? metric.target : 10,
          }))
        : [{ id: uid("metric"), name: "Progress", current: 0, target: 10 }];
    const primaryMetric = metrics.find((metric) => metric.id === draft.primaryMetricId) ?? metrics[0];
    const goal: Goal = {
      ...makeBase(title),
      description: draft.description?.trim() ?? "",
      metrics,
      primaryMetricId: primaryMetric.id,
    };
    await putItem("goals", goal);
    await logEvent("create", "goal", goal.id, "Added goal");
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
    await createRoutine({ title: title.trim() });
  }

  async function createRoutine(draft: RoutineDraft): Promise<void> {
    const title = draft.title.trim();
    if (!title) return;
    const routine: Routine = {
      ...makeBase(title),
      description: draft.description?.trim() ?? "",
      goalId: draft.goalId || undefined,
    };
    await putItem("routines", routine);
    await logEvent("create", "routine", routine.id, "Added routine");
    await reloadAll();
  }

  async function toggleProjectTodo(projectId: string, lineIndex: number, checked: boolean): Promise<void> {
    const current = await getById("projects", projectId);
    if (!current) return;

    const sourceDescription = String(current.description ?? "").trim();
    const lines = sourceDescription
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);
    const rawLine = lines[lineIndex];
    if (!rawLine) return;

    const text = rawLine.replace(/^\[(x|X|\s)\]\s+/, "").trim();
    const prefix = checked ? "[x] " : "[ ] ";
    lines[lineIndex] = `${prefix}${text}`;
    const updatedProject: Project = { ...current, description: lines.join("\n"), updatedAt: nowIso() };

    await putItem("projects", updatedProject);
    await logEvent(
      "project-todo",
      "project",
      projectId,
      JSON.stringify({ lineIndex, checked, text, occurredAt: nowIso() }),
    );
    await reloadAll();
  }

  async function saveWeeklyReview(input: {
    weekKey: string;
    inboxCleared: boolean;
    tasksPrioritized: boolean;
    weekPlanned: boolean;
    goalsChecked: boolean;
    note: string;
  }): Promise<void> {
    const existing = state.reviews.find((review) => review.weekKey === input.weekKey);
    const review: WeeklyReview = {
      id: existing?.id ?? uid("review"),
      weekKey: input.weekKey,
      inboxCleared: input.inboxCleared,
      tasksPrioritized: input.tasksPrioritized,
      weekPlanned: input.weekPlanned,
      goalsChecked: input.goalsChecked,
      note: input.note,
      createdAt: nowIso(),
    };
    await putItem("reviews", review);
    await logEvent("review", "weekly", review.id, `Saved weekly review ${review.weekKey}`);
    await reloadAll();
  }

  async function setLogicalDay(day: string): Promise<void> {
    const offset = dayDiff(toDayString(undefined, dayStartHour), day);
    await putItem("settings", { id: "settings", dayOffset: offset, dayStartHour, soundVolume, showStatus, theme });
    await logEvent("debug-date", "settings", "settings", `Logical day offset set to ${offset} (${day})`);
    await reloadAll();
  }

  async function decrementLogicalDay(): Promise<void> {
    const nextOffset = logicalOffset - 1;
    await putItem("settings", { id: "settings", dayOffset: nextOffset, dayStartHour, soundVolume, showStatus, theme });
    await logEvent("debug-date", "settings", "settings", `Logical day offset changed to ${nextOffset}`);
    await reloadAll();
  }

  async function incrementLogicalDay(): Promise<void> {
    const nextOffset = logicalOffset + 1;
    await putItem("settings", { id: "settings", dayOffset: nextOffset, dayStartHour, soundVolume, showStatus, theme });
    await logEvent("debug-date", "settings", "settings", `Logical day offset changed to ${nextOffset}`);
    await reloadAll();
  }

  async function resetLogicalDayToToday(): Promise<void> {
    await putItem("settings", { id: "settings", dayOffset: 0, dayStartHour, soundVolume, showStatus, theme });
    await logEvent("debug-date", "settings", "settings", "Logical day offset reset to 0");
    await reloadAll();
  }

  async function setDayStartHour(nextHour: number): Promise<void> {
    const hour = Math.max(0, Math.min(23, Math.trunc(nextHour)));
    await putItem("settings", { id: "settings", dayOffset: logicalOffset, dayStartHour: hour, soundVolume, showStatus, theme });
    await logEvent("settings", "settings", "settings", `Day starts at ${hour}:00`);
    await reloadAll();
  }

  async function setSoundVolume(nextVolume: number): Promise<void> {
    const volume = Math.max(0, Math.min(100, Math.trunc(nextVolume)));
    await putItem("settings", { id: "settings", dayOffset: logicalOffset, dayStartHour, soundVolume: volume, showStatus, theme });
    setState((prev) => ({ ...prev, settings: { ...prev.settings, soundVolume: volume } }));
  }

  async function setShowStatus(nextShowStatus: boolean): Promise<void> {
    await putItem("settings", { id: "settings", dayOffset: logicalOffset, dayStartHour, soundVolume, showStatus: nextShowStatus, theme });
    setState((prev) => ({ ...prev, settings: { ...prev.settings, showStatus: nextShowStatus } }));
  }

  async function setTheme(nextTheme: "light" | "wow"): Promise<void> {
    await putItem("settings", { id: "settings", dayOffset: logicalOffset, dayStartHour, soundVolume, showStatus, theme: nextTheme });
    setState((prev) => ({ ...prev, settings: { ...prev.settings, theme: nextTheme } }));
  }

  async function exportData(): Promise<void> {
    const payload: BackupPayload = {
      app: "wow-goals",
      schemaVersion: 1,
      exportedAt: nowIso(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const day = toDayString();
    a.href = url;
    a.download = `wow-goals-backup-${day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File): Promise<void> {
    const shouldReplace = window.confirm("Import will replace all existing app data. Continue?");
    if (!shouldReplace) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<BackupPayload>;
      const data = parsed?.data as Partial<AppStateData> | undefined;
      if (!data) {
        throw new Error("Backup file is missing data payload.");
      }

      const next: AppStateData = {
        notes: Array.isArray(data.notes) ? data.notes : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        projects: Array.isArray(data.projects) ? data.projects : [],
        goals: Array.isArray(data.goals) ? data.goals : [],
        routines: Array.isArray(data.routines) ? data.routines : [],
        completions: Array.isArray(data.completions) ? data.completions : [],
        reviews: Array.isArray(data.reviews) ? data.reviews : [],
        logs: Array.isArray(data.logs) ? data.logs : [],
        settings: normalizeSettings(data.settings),
      };

      await Promise.all([...dataStores.map((store) => clearStore(store)), clearStore("settings")]);

      await Promise.all(
        dataStores.map(async (store) => {
          const rows = next[store];
          for (const row of rows as any[]) {
            await putItem(store, row);
          }
        }),
      );
      await putItem("settings", next.settings);
      await reloadAll();
      window.alert("Import completed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not import backup file.";
      window.alert(`Import failed: ${msg}`);
    }
  }

  async function deleteAllData(): Promise<void> {
    const ok = window.confirm("Delete ALL app data, including settings and logs? This cannot be undone.");
    if (!ok) return;

    await Promise.all([...dataStores.map((store) => clearStore(store)), clearStore("settings")]);
    await putItem("settings", emptySettings);
    setFilters({ notes: "all", tasks: "all", projects: "all", routines: "all", goals: "all" });
    setOpenFilterMenu(null);
    await reloadAll();
    window.alert("All data has been deleted.");
  }

  function closeSettingsPopup(): void {
    setShowSettingsPopup(false);
    setShowDebugTools(false);
  }

  const activeTasks = useMemo(
    () => sortAndFilterTasks(state.tasks, "all", logicalDay).filter((t) => t.status === "active" || t.status === "in_progress"),
    [state.tasks, logicalDay],
  );

  const todayTop3 = useMemo(
    () => activeTasks.filter((task) => task.lastPostponedAt !== logicalDay).slice(0, 3),
    [activeTasks, logicalDay],
  );
  const filteredNotes = useMemo(() => sortAndFilterItems(state.notes, filters.notes), [state.notes, filters.notes]);
  const filteredTasks = useMemo(() => sortAndFilterTasks(state.tasks, filters.tasks, logicalDay), [state.tasks, filters.tasks, logicalDay]);
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
  const activeNoteCount = useMemo(
    () => state.notes.filter((note) => note.status === "active" || note.status === "in_progress").length,
    [state.notes],
  );
  const completedTodayCount = state.completions.filter((c) => toDayString(c.completedAt, dayStartHour) === logicalDay && c.entityType === "task").length;
  const routinesTodayCount = state.completions.filter((c) => toDayString(c.completedAt, dayStartHour) === logicalDay && c.entityType === "routine").length;

  function statusLabel(item: SortableEntity): string {
    return getStatusBucket(item).replace("_", " ");
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
    logicalOffset,
    dayStartHour,
    soundVolume,
    showStatus,
    theme,
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
    activeNoteCount,
    completedTodayCount,
    routinesTodayCount,
    checkForUpdates,
    exportData,
    importData,
    deleteAllData,
    closeSettingsPopup,
    setLogicalDay,
    setDayStartHour,
    setSoundVolume,
    setShowStatus,
    setTheme,
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
    toggleRoutineCompletionForDay,
    editTitle,
    editDescription,
    addQuickTask,
    createTask,
    addQuickProject,
    createProject,
    toggleProjectTodo,
    addQuickGoal,
    createGoal,
    addGoalMetric,
    editGoalMetric,
    removeGoalMetric,
    setPrimaryGoalMetric,
    addQuickRoutine,
    createRoutine,
    saveWeeklyReview,
    goalMetrics,
    primaryMetric,
    statusLabel,
  };
}

export type AppData = ReturnType<typeof useAppData>;
