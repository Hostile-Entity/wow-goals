import { AppData, formatDueLabel } from "../state/useAppData";

interface TodayTabProps {
  completedTodayCount: number;
  routinesTodayCount: number;
  activeNoteCount: number;
  todayTop3: AppData["todayTop3"];
  routines: AppData["state"]["routines"];
  completions: AppData["state"]["completions"];
  logicalDay: string;
  completeTask: AppData["completeTask"];
  postponeTask: AppData["postponeTask"];
  completeRoutine: AppData["completeRoutine"];
}

export function TodayTab({
  completedTodayCount,
  routinesTodayCount,
  activeNoteCount,
  todayTop3,
  routines,
  completions,
  logicalDay,
  completeTask,
  postponeTask,
  completeRoutine,
}: TodayTabProps) {
  return (
    <section className="today-tab">
      <h2>Today</h2>
      <div className="stats">
        <div className="stat">
          <span className="stat-value">{completedTodayCount}</span>
          <span className="stat-label">tasks done</span>
        </div>
        <div className="stat">
          <span className="stat-value">{routinesTodayCount}</span>
          <span className="stat-label">routines done</span>
        </div>
        <div className="stat">
          <span className="stat-value">{activeNoteCount}</span>
          <span className="stat-label">notes untriaged</span>
        </div>
      </div>
      <h3>Top 3 Tasks</h3>
      <div className="today-top3-list">
        {todayTop3.map((task) => (
          <article key={task.id} className="card today-task-card">
            <div className="today-task-main">
              <div className="title today-task-title">{task.title}</div>
              <div className="meta-row today-task-subtitle">{task.deadline ? formatDueLabel(task.deadline, logicalDay) : "No deadline"}</div>
            </div>
            <div className="today-task-actions">
              <button className="today-action-btn" onClick={() => void completeTask(task.id)}>
                Done
              </button>
              <button className="today-action-btn today-action-postpone" onClick={() => void postponeTask(task.id)}>
                Later
              </button>
            </div>
          </article>
        ))}
      </div>
      <h3>Routines</h3>
      <div className="routine-grid">
        {routines
          .filter((routine) => routine.status !== "discarded")
          .map((routine) => {
            const complete = completions.some((c) => c.entityType === "routine" && c.entityId === routine.id && c.date === logicalDay);
            return (
              <button key={routine.id} className={`routine-btn ${complete ? "is-done" : "is-pending"}`} onClick={() => void completeRoutine(routine.id)}>
                <span className="routine-btn-title">{routine.title}</span>
              </button>
            );
          })}
      </div>
    </section>
  );
}
