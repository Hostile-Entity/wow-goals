import { AppData } from "../state/useAppData";

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
    <section>
      <h2>Today</h2>
      <div className="stats">
        <div className="stat">
          <span>{completedTodayCount}</span> tasks done
        </div>
        <div className="stat">
          <span>{routinesTodayCount}</span> routines done
        </div>
        <div className="stat">
          <span>{activeNoteCount}</span> notes untriaged
        </div>
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
        {routines
          .filter((routine) => routine.status !== "discarded")
          .map((routine) => {
            const complete = completions.some((c) => c.entityType === "routine" && c.entityId === routine.id && c.date === logicalDay);
            return (
              <button key={routine.id} className={`routine-btn ${complete ? "ok" : ""}`} onClick={() => void completeRoutine(routine.id)}>
                {routine.title}
              </button>
            );
          })}
      </div>
    </section>
  );
}
