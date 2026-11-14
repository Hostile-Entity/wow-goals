import { useState } from "react";
import { AppData, formatDueLabel } from "../state/useAppData";
import { Task } from "../types";
import { useAction } from "../components/useAction";

export function TodayTab({
  app,
  openTask,
}: {
  app: AppData;
  openTask(id: string): void;
}) {
  const [pick, setPick] = useState("");
  const [snooze, setSnooze] = useState<Task | null>(null);
  const [until, setUntil] = useState("");
  const action = useAction();
  function row(task: Task) {
    const project = app.state.projects.find(
      (project) => project.id === task.projectId,
    );
    return (
      <article className="card today-task-card" key={task.id}>
        <div className="today-task-main">
          <button className="today-task-link" onClick={() => openTask(task.id)}>
            {task.title}
          </button>
          <div className="meta-row">
            {task.deadline
              ? formatDueLabel(task.deadline, app.logicalDay)
              : ""}
            {task.scheduledFor ? ` · planned for ${task.scheduledFor}` : ""}
            {project && ["archived", "done"].includes(project.status)
              ? ` · project ${app.statusLabel(project).toLowerCase()}`
              : ""}
          </div>
        </div>
        <div className="today-task-actions">
          <button
            disabled={action.pending}
            onClick={() => void action.run(() => app.completeTask(task.id))}
          >
            Done
          </button>
          <button
            disabled={action.pending}
            onClick={() => {
              setSnooze(task);
              setUntil("");
            }}
          >
            Later
          </button>
        </div>
      </article>
    );
  }
  return (
    <section className="today-tab">
      <header className="today-header">
        <h2>Today</h2>
        <p className="meta">{app.completedTodayCount} tasks done · {app.routinesTodayCount} routines done · {app.activeNoteCount} notes in inbox</p>
      </header>
      <h3>Focus 3</h3>
      <div className="today-top3-list">
        {app.todayTop3.map((task) => (
          <div key={task.id}>
            {row(task)}
            <button
              disabled={action.pending}
              onClick={() => void action.run(() => app.toggleFocus(task.id))}
            >
              Unpin focus
            </button>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (pick)
            void action.run(
              () => app.toggleFocus(pick),
              () => setPick(""),
            );
        }}
      >
        <select
          aria-label="Choose focus task"
          value={pick}
          onChange={(event) => setPick(event.target.value)}
        >
          <option value="">Choose a focus task…</option>
          {app.focusCandidates.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
        <button disabled={!pick || action.pending}>Pin</button>
      </form>
      {app.settings.focusTaskIds.some(
        (id) => !app.todayTop3.some((task) => task.id === id),
      ) && (
        <div className="meta">
          Hidden focus:{" "}
          {app.settings.focusTaskIds
            .filter((id) => !app.todayTop3.some((task) => task.id === id))
            .map((id) => (
              <button
                key={id}
                onClick={() => void action.run(() => app.toggleFocus(id))}
              >
                Unpin{" "}
                {app.state.tasks.find((task) => task.id === id)?.title ??
                  "missing task"}
              </button>
            ))}
        </div>
      )}
      <h3>Other due tasks</h3>
      <div className="today-top3-list">
        {app.urgentTasks.map(row)}
        {!app.urgentTasks.length && (
          <p className="meta">No urgent deadlines.</p>
        )}
      </div>
      {snooze && (
        <section className="card" aria-label="Snooze task">
          <h3>Plan “{snooze.title}” for later</h3>
          <div className="actions">
            <button
              onClick={() =>
                void action.run(
                  () => app.postponeTask(snooze.id),
                  () => setSnooze(null),
                )
              }
            >
              Tomorrow
            </button>
            <button
              onClick={() => {
                const date = new Date(`${app.logicalDay}T12:00:00`);
                date.setDate(date.getDate() + 7);
                const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                void action.run(
                  () => app.postponeTask(snooze.id, day),
                  () => setSnooze(null),
                );
              }}
            >
              Next week
            </button>
          </div>
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              if (until)
                void action.run(
                  () => app.postponeTask(snooze.id, until),
                  () => setSnooze(null),
                );
            }}
          >
            <input
              aria-label="Snooze until"
              type="date"
              min={app.logicalDay}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              required
            />
            <button disabled={!until || action.pending}>Schedule</button>
          </form>
          <button onClick={() => setSnooze(null)}>Cancel</button>
        </section>
      )}
      {action.error && (
        <p className="action-error" role="alert">
          {action.error}
        </p>
      )}
      <h3>Routines</h3>
      <div className="routine-grid">
        {app.state.routines
          .filter((routine) => routine.status === "enabled")
          .map((routine) => {
            const complete = app.state.completions.some(
              (c) =>
                c.entityType === "routine" &&
                c.entityId === routine.id &&
                c.date === app.logicalDay,
            );
            return (
              <button
                key={routine.id}
                aria-pressed={complete}
                className={`routine-btn ${complete ? "is-done" : "is-pending"}`}
                disabled={action.pending}
                onClick={() =>
                  void action.run(() => app.completeRoutine(routine.id))
                }
              >
                <span className="routine-btn-title">
                  {complete ? "✓ " : ""}
                  {routine.title}
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
