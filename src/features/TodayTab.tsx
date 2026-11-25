import { useState } from "react";
import { AppData } from "../state/useAppData";
import { Task } from "../types";
import { useAction } from "../components/useAction";
import { TaskDeadline } from "../components/TaskDeadline";
import { TaskPlanPanel } from "../components/TaskPlanPanel";

export function TodayTab({
  app,
  openTask,
}: {
  app: AppData;
  openTask(id: string): void;
}) {
  const [pick, setPick] = useState("");
  const [planTaskId, setPlanTaskId] = useState<string | null>(null);
  const action = useAction();
  function row(task: Task, focusIndex?: number) {
    const project = task.projectId ? app.projectById.get(task.projectId) : undefined;
    const planning = planTaskId === task.id;
    const first = focusIndex === 0;
    const projectClosed = project && (project.status === "archived" || project.status === "done");
    return (
      <div className="today-task-entry" key={task.id}>
        <article className={`card today-task-card${first ? " today-first-focus" : ""}`}>
          <div className="today-task-main">
            {first && <div className="meta today-first-label">First focus</div>}
            <button className="today-task-link" onClick={() => openTask(task.id)}>
              {task.title}
            </button>
            {(task.deadline || task.scheduledFor || projectClosed) && (
              <div className="meta-row today-task-meta">
                {task.deadline && <TaskDeadline day={task.deadline} logicalDay={app.logicalDay} />}
                {task.scheduledFor && <span>planned for {task.scheduledFor}</span>}
                {projectClosed && <span>project {app.statusLabel(project).toLowerCase()}</span>}
              </div>
            )}
          </div>
          <div className="today-task-actions">
            <button
              disabled={action.pending}
              onClick={() => void action.run(() => app.completeTask(task.id), () => {
                if (planning) setPlanTaskId(null);
              })}
            >
              Done
            </button>
            <button
              disabled={action.pending}
              aria-expanded={planning}
              aria-controls={planning ? `plan-${task.id}` : undefined}
              onClick={() => setPlanTaskId(planning ? null : task.id)}
            >
              Replan
            </button>
          </div>
        </article>
        {planning && (
          <TaskPlanPanel
            task={task}
            logicalDay={app.logicalDay}
            pending={action.pending}
            onClose={() => setPlanTaskId(null)}
            onPlan={(day) => void action.run(() => app.postponeTask(task.id, day), () => setPlanTaskId(null))}
          />
        )}
        {focusIndex !== undefined && (
          <button
            disabled={action.pending}
            onClick={() => void action.run(() => app.toggleFocus(task.id))}
          >
            Unpin focus
          </button>
        )}
      </div>
    );
  }
  const hasFocus = app.todayTop3.length > 0;
  const deadlines = (
    <section className="today-deadlines">
      <h3>{hasFocus ? "Other due tasks" : "Due tasks"}</h3>
      <div className="today-top3-list">
        {app.urgentTasks.map((task) => row(task))}
        {!app.urgentTasks.length && <p className="meta">No urgent deadlines.</p>}
      </div>
    </section>
  );
  return (
    <section className="today-tab">
      <header className="today-header">
        <h2>Today</h2>
        <p className="meta">{app.completedTodayCount} tasks done · {app.routinesTodayCount} routines done · {app.activeNoteCount} notes in inbox</p>
      </header>
      {!hasFocus && deadlines}
      <section className="today-focus">
        <h3>Focus 3</h3>
        <div className="today-top3-list">
          {app.todayTop3.map((task, index) => row(task, index))}
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
          <button className={hasFocus ? undefined : "button-primary"} disabled={!pick || action.pending}>
            Pin
          </button>
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
      </section>
      {hasFocus && deadlines}
      <div><button className="browse-link" onClick={app.openTasks}>Open tasks</button></div>
      {action.error && (
        <p className="action-error" role="alert">
          {action.error}
        </p>
      )}
    </section>
  );
}
