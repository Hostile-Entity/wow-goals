import {
  Fragment,
  TouchEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  formatWeekLabel,
  getWeekDays,
  startOfWeek,
  toDayString,
  toWeekKey,
} from "../db";
import {
  DailyCompletion,
  EntityType,
  EventLog,
  Note,
  Project,
  Routine,
  Task,
  WeeklyReview,
} from "../types";
import { historicalRows, projectProgressByDay } from "../state/history";
import { isOpen } from "../state/lifecycle";

type ReviewInput = {
  weekKey: string;
  goalsChecked: boolean;
  inboxCleared: boolean;
  tasksPrioritized: boolean;
  weekPlanned: boolean;
  note: string;
};

interface ReviewTabProps {
  notes: Note[];
  tasks: Task[];
  onOpen(type: EntityType, id: string): void;
  logicalDay: string;
  dayStartHour: number;
  projects: Project[];
  routines: Routine[];
  completions: DailyCompletion[];
  reviews: WeeklyReview[];
  logs: EventLog[];
  saveWeeklyReview(input: ReviewInput): Promise<void>;
  toggleRoutineCompletionForDay(routineId: string, day: string): Promise<void>;
}

function buildTrackedStartDay(
  logicalDay: string,
  completions: DailyCompletion[],
  reviews: WeeklyReview[],
  logs: EventLog[],
  routines: Routine[],
  projects: Project[],
): string {
  const dayCandidates = [logicalDay];

  for (const completion of completions) {
    dayCandidates.push(toDayString(completion.completedAt));
    if (completion.date) dayCandidates.push(completion.date);
  }
  for (const review of reviews) {
    dayCandidates.push(toDayString(review.createdAt));
  }
  for (const log of logs) {
    dayCandidates.push(toDayString(log.at));
  }
  for (const routine of routines) {
    dayCandidates.push(toDayString(routine.createdAt));
  }
  for (const project of projects) {
    dayCandidates.push(toDayString(project.createdAt));
  }

  return dayCandidates.sort((a, b) => a.localeCompare(b))[0] ?? logicalDay;
}

export function ReviewTab({
  notes,
  tasks,
  onOpen,
  logicalDay,
  dayStartHour,
  projects,
  routines,
  completions,
  reviews,
  logs,
  saveWeeklyReview,
  toggleRoutineCompletionForDay,
}: ReviewTabProps) {
  const trackedStartDay = useMemo(
    () =>
      buildTrackedStartDay(
        logicalDay,
        completions,
        reviews,
        logs,
        routines,
        projects,
      ),
    [logicalDay, completions, reviews, logs, routines, projects],
  );
  const firstWeekStart = startOfWeek(trackedStartDay);
  const currentWeekKey = toWeekKey(logicalDay);
  const currentWeekStart = startOfWeek(logicalDay);

  const weekKeys = useMemo(() => {
    const weeks: string[] = [];
    let cursor = firstWeekStart;
    while (cursor.localeCompare(currentWeekStart) <= 0) {
      weeks.push(toWeekKey(cursor));
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }, [firstWeekStart, currentWeekStart]);

  const [selectedWeek, setSelectedWeek] = useState(currentWeekKey);
  const [goalsChecked, setGoalsChecked] = useState(false);
  const [inboxCleared, setInboxCleared] = useState(false);
  const [tasksPrioritized, setTasksPrioritized] = useState(false);
  const [weekPlanned, setWeekPlanned] = useState(false);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [saveError, setSaveError] = useState("");
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!weekKeys.includes(selectedWeek)) {
      setSelectedWeek(currentWeekKey);
    }
  }, [weekKeys, selectedWeek, currentWeekKey]);

  const selectedReview = useMemo(
    () => reviews.find((review) => review.weekKey === selectedWeek),
    [reviews, selectedWeek],
  );

  useEffect(() => {
    setGoalsChecked(Boolean(selectedReview?.goalsChecked));
    setInboxCleared(Boolean(selectedReview?.inboxCleared));
    setTasksPrioritized(Boolean(selectedReview?.tasksPrioritized));
    setWeekPlanned(Boolean(selectedReview?.weekPlanned));
    setNote(selectedReview?.note ?? "");
    setIsLocked(Boolean(selectedReview));
  }, [selectedReview, selectedWeek]);

  const weekDays = useMemo(() => getWeekDays(selectedWeek), [selectedWeek]);
  const dayLabels = weekDays.map((day) => Number(day.slice(8, 10)).toString());
  const selectedWeekIndex = Math.max(0, weekKeys.indexOf(selectedWeek));

  const taskCounts = useMemo(() => {
    const entries = weekDays.map((day) => [day, 0] as const);
    const counts = new Map<string, number>(entries);
    for (const completion of completions) {
      if (completion.entityType !== "task") continue;
      const day = completion.date;
      if (!counts.has(day)) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [completions, weekDays, dayStartHour]);

  const trackedRoutines = useMemo(
    () =>
      historicalRows(
        routines,
        "routine",
        new Set([
          ...routines
            .filter((routine) => toDayString(routine.createdAt) <= weekDays[6])
            .map((routine) => routine.id),
          ...completions
            .filter(
              (c) => c.entityType === "routine" && weekDays.includes(c.date),
            )
            .map((c) => c.entityId),
        ]),
        logs,
      ),
    [routines, completions, weekDays, logs],
  );

  const routineDoneMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const routine of trackedRoutines) {
      map.set(routine.id, new Set());
    }
    for (const completion of completions) {
      if (completion.entityType !== "routine") continue;
      const day = completion.date;
      if (!weekDays.includes(day)) continue;
      map.get(completion.entityId)?.add(day);
    }
    return map;
  }, [trackedRoutines, completions, weekDays, dayStartHour]);

  const projectProgress = useMemo(
    () => projectProgressByDay(logs, dayStartHour),
    [logs, dayStartHour],
  );
  const trackedProjects = useMemo(
    () =>
      historicalRows(
        projects,
        "project",
        new Set([
          ...projects
            .filter((project) => toDayString(project.createdAt) <= weekDays[6])
            .map((project) => project.id),
          ...[...projectProgress]
            .filter(([, days]) => weekDays.some((day) => days.has(day)))
            .map(([id]) => id),
        ]),
        logs,
      ),
    [projects, projectProgress, weekDays, logs],
  );

  const projectTodoDoneMap = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const project of trackedProjects) {
      map.set(project.id, new Map(weekDays.map((day) => [day, 0] as const)));
    }
    for (const [id, counts] of projectProgress)
      for (const [day, count] of counts)
        if (weekDays.includes(day)) map.get(id)?.set(day, count);
    return map;
  }, [trackedProjects, projectProgress, weekDays]);

  function goToPrevWeek(): void {
    if (selectedWeekIndex <= 0) return;
    setSelectedWeek(weekKeys[selectedWeekIndex - 1]);
  }

  function goToNextWeek(): void {
    if (selectedWeekIndex >= weekKeys.length - 1) return;
    setSelectedWeek(weekKeys[selectedWeekIndex + 1]);
  }

  function handleTouchStart(e: TouchEvent<HTMLElement>): void {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: TouchEvent<HTMLElement>): void {
    const startX = touchStartX.current;
    const endX = e.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX === null || typeof endX !== "number") return;
    const delta = endX - startX;
    if (delta <= -40) goToNextWeek();
    if (delta >= 40) goToPrevWeek();
  }

  async function handleSave(): Promise<void> {
    if (isSaving || isLocked) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await saveWeeklyReview({
        weekKey: selectedWeek,
        goalsChecked,
        inboxCleared,
        tasksPrioritized,
        weekPlanned,
        note,
      });
      setIsLocked(true);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Review was not saved. Your reflection was kept.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveOrEdit(): void {
    if (isLocked) {
      setIsLocked(false);
      return;
    }
    void handleSave();
  }

  return (
    <section
      className="review-wrap"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <section className="card">
        <h3>Review next actions</h3>
        <p className="meta">
          {
            tasks.filter(
              (task) =>
                isOpen(task) && task.deadline && task.deadline < logicalDay,
            ).length
          }{" "}
          overdue tasks ·{" "}
          {notes.filter((note) => note.status === "inbox").length} untriaged
          notes ·{" "}
          {
            projects.filter(
              (project) =>
                isOpen(project) &&
                project.updatedAt.slice(0, 10) < addDays(logicalDay, -7),
            ).length
          }{" "}
          quiet projects
        </p>
        <div className="cards">
          {tasks
            .filter(
              (task) =>
                isOpen(task) && task.deadline && task.deadline < logicalDay,
            )
            .slice(0, 5)
            .map((task) => (
              <button key={task.id} onClick={() => onOpen("task", task.id)}>
                Overdue: {task.title}
              </button>
            ))}
          {notes
            .filter((note) => note.status === "inbox")
            .slice(0, 3)
            .map((note) => (
              <button key={note.id} onClick={() => onOpen("note", note.id)}>
                Triage: {note.title}
              </button>
            ))}
          {projects
            .filter(
              (project) =>
                isOpen(project) &&
                project.updatedAt.slice(0, 10) < addDays(logicalDay, -7),
            )
            .slice(0, 3)
            .map((project) => (
              <button
                key={project.id}
                onClick={() => onOpen("project", project.id)}
              >
                Revisit: {project.title}
              </button>
            ))}
        </div>
      </section>
      <div className="review-week-header">
        <button
          type="button"
          onClick={goToPrevWeek}
          disabled={selectedWeekIndex <= 0}
        >
          Prev
        </button>
        <h3>{formatWeekLabel(selectedWeek)}</h3>
        <button
          type="button"
          onClick={goToNextWeek}
          disabled={selectedWeekIndex >= weekKeys.length - 1}
        >
          Next
        </button>
      </div>
      {saveError && (
        <p className="action-error" role="alert">
          {saveError}
        </p>
      )}
      <p className="meta">
        Completion days are saved when recorded; changing your day boundary does
        not rewrite history. Project counts show net TODO changes, including
        unchecks.
      </p>

      <div
        className={`checklist review-checklist ${isLocked ? "is-locked" : ""}`}
      >
        <label>
          <input
            type="checkbox"
            checked={goalsChecked}
            disabled={isLocked || isSaving}
            onChange={(e) => setGoalsChecked(e.currentTarget.checked)}
          />{" "}
          Goals reviewed
        </label>
        <label>
          <input
            type="checkbox"
            checked={inboxCleared}
            disabled={isLocked || isSaving}
            onChange={(e) => setInboxCleared(e.currentTarget.checked)}
          />{" "}
          Notes cleaned
        </label>
        <label>
          <input
            type="checkbox"
            checked={tasksPrioritized}
            disabled={isLocked || isSaving}
            onChange={(e) => setTasksPrioritized(e.currentTarget.checked)}
          />
          Tasks prioritized
        </label>
        <label>
          <input
            type="checkbox"
            checked={weekPlanned}
            disabled={isLocked || isSaving}
            onChange={(e) => setWeekPlanned(e.currentTarget.checked)}
          />{" "}
          Week planned
        </label>
        <textarea
          value={note}
          disabled={isLocked || isSaving}
          onChange={(e) => setNote(e.currentTarget.value)}
          placeholder="What changed this week?"
        />
        <button type="button" onClick={handleSaveOrEdit} disabled={isSaving}>
          {isSaving ? "Saving..." : isLocked ? "Edit" : "Save Weekly Review"}
        </button>
      </div>

      <div className="review-grid-wrap">
        <div className="review-grid">
          <div className="review-grid-head" />
          {dayLabels.map((label, index) => (
            <div
              key={`day-head-${weekDays[index]}`}
              className="review-grid-head"
            >
              {label}
            </div>
          ))}

          <div className="review-grid-label">Tasks completed</div>
          {weekDays.map((day) => (
            <div
              key={`task-${day}`}
              className="review-grid-cell review-grid-value"
            >
              {taskCounts.get(day) ?? 0}
            </div>
          ))}

          {trackedRoutines.map((routine) => (
            <Fragment key={`routine-row-${routine.id}`}>
              <div
                key={`routine-label-${routine.id}`}
                className="review-grid-label"
              >
                <span className="review-label-text" title={routine.title}>
                  {routine.title}
                </span>
              </div>
              {weekDays.map((day) => {
                const isDone =
                  routineDoneMap.get(routine.id)?.has(day) ?? false;
                return (
                  <div
                    key={`routine-${routine.id}-${day}`}
                    className={`review-grid-cell review-grid-routine ${isDone ? "is-done" : ""}`}
                    aria-label={`${routine.title} ${day} ${isDone ? "done" : "not done"}`}
                    onClick={() =>
                      void toggleRoutineCompletionForDay(routine.id, day).catch(
                        (error) => setSaveError(String(error)),
                      )
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      void toggleRoutineCompletionForDay(routine.id, day).catch(
                        (error) => setSaveError(String(error)),
                      );
                    }}
                  />
                );
              })}
            </Fragment>
          ))}

          {trackedProjects.map((project) => (
            <Fragment key={`project-row-${project.id}`}>
              <div
                key={`project-label-${project.id}`}
                className="review-grid-label"
              >
                <span
                  className="review-label-text"
                  title={`${project.title} TODOs`}
                >
                  {project.title} TODOs
                </span>
              </div>
              {weekDays.map((day) => (
                <div
                  key={`project-${project.id}-${day}`}
                  className="review-grid-cell review-grid-value"
                >
                  {projectTodoDoneMap.get(project.id)?.get(day) ?? 0}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
