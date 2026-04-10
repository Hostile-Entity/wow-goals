import { FormEvent, ReactNode } from "react";
import { AppData, FilterKey, MoreTab as MoreTabId, getStatusBucket } from "../state/useAppData";
import { Goal, Routine } from "../types";

interface MoreTabProps {
  moreTab: MoreTabId;
  setMoreTab(tab: MoreTabId): void;
  filteredRoutines: AppData["filteredRoutines"];
  filteredGoals: AppData["filteredGoals"];
  goals: AppData["state"]["goals"];
  projects: AppData["state"]["projects"];
  tasks: AppData["state"]["tasks"];
  routines: AppData["state"]["routines"];
  reviews: AppData["state"]["reviews"];
  logs: AppData["state"]["logs"];
  statusLabel: AppData["statusLabel"];
  onCreateRoutine(): void;
  onCreateGoal(): void;
  primaryMetric: AppData["primaryMetric"];
  saveWeeklyReview(form: FormData): Promise<void>;
  renderFilterControl(key: FilterKey): ReactNode;
  onManageRoutine(routine: Routine): void;
  onManageGoal(goal: Goal): void;
  formatDateTime(iso: string): string;
}

export function MoreTab({
  moreTab,
  setMoreTab,
  filteredRoutines,
  filteredGoals,
  goals,
  projects,
  tasks,
  routines,
  reviews,
  logs,
  statusLabel,
  onCreateRoutine,
  onCreateGoal,
  primaryMetric,
  saveWeeklyReview,
  renderFilterControl,
  onManageRoutine,
  onManageGoal,
  formatDateTime,
}: MoreTabProps) {
  async function handleSaveWeeklyReview(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await saveWeeklyReview(form);
    e.currentTarget.reset();
  }

  return (
    <section>
      <h2>More</h2>
      <div className="more-tabs">
        {[
          ["routines", "Routines"],
          ["goals", "Goals"],
          ["review", "Review"],
        ].map(([id, label]) => (
          <button key={id} className={moreTab === id ? "active" : ""} onClick={() => setMoreTab(id as MoreTabId)}>
            {label}
          </button>
        ))}
      </div>
      {moreTab === "routines" && (
        <>
          <div className="section-subhead">
            <h3>Routines</h3>
            {renderFilterControl("routines")}
          </div>
          <div className="actions">
            <button onClick={onCreateRoutine}>+ Routine</button>
          </div>
          <div className="cards">
            {filteredRoutines.map((routine) => (
              <article
                key={routine.id}
                id={`item-routine-${routine.id}`}
                className={`card entity-card ${getStatusBucket(routine) !== "active" ? "is-dimmed" : ""}`}
              >
                <div className="entity-main">
                  <div className="title entity-title">{routine.title}</div>
                  <div className="tags entity-summary">
                    {routine.goalId ? `goal ${goals.find((g) => g.id === routine.goalId)?.title ?? "Unknown"}` : "No goal linked"}
                  </div>
                  <div className="tags entity-status">{statusLabel(routine)}</div>
                </div>
                <div className="entity-side">
                  <button onClick={() => onManageRoutine(routine)}>Manage</button>
                  <div className="meta-row entity-meta-time">
                    {routine.createdAt === routine.updatedAt
                      ? `Created ${formatDateTime(routine.createdAt)}`
                      : `Updated ${formatDateTime(routine.updatedAt)}`}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {moreTab === "goals" && (
        <>
          <div className="section-subhead">
            <h3>Goals</h3>
            {renderFilterControl("goals")}
          </div>
          <div className="actions">
            <button onClick={onCreateGoal}>+ Goal</button>
          </div>
          <div className="cards">
            {filteredGoals.map((goal) => {
              const pMetric = primaryMetric(goal);
              const linkedProjects = projects.filter((p) => p.goalId === goal.id);
              const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
              const linkedRoutines = routines.filter((r) => r.goalId === goal.id);
              const progress = pMetric.target > 0 ? Math.min(100, Math.round((pMetric.current / pMetric.target) * 100)) : 0;
              return (
                <article
                  key={goal.id}
                  id={`item-goal-${goal.id}`}
                  className={`card entity-card ${getStatusBucket(goal) !== "active" ? "is-dimmed" : ""}`}
                >
                  <div className="entity-main">
                    <div className="title entity-title">{goal.title}</div>
                    <div className="tags entity-summary">
                      {pMetric.name}: {pMetric.current}/{pMetric.target} ({progress}%)
                    </div>
                    <div className="bar">
                      <i style={{ width: `${progress}%` }} />
                    </div>
                    <div className="tags entity-summary">
                      linked: {linkedProjects.length} projects, {linkedTasks.length} tasks, {linkedRoutines.length} routines
                    </div>
                    <div className="tags entity-status">{statusLabel(goal)}</div>
                  </div>
                  <div className="entity-side">
                    <button onClick={() => onManageGoal(goal)}>Manage</button>
                    <div className="meta-row entity-meta-time">
                      {goal.createdAt === goal.updatedAt
                        ? `Created ${formatDateTime(goal.createdAt)}`
                        : `Updated ${formatDateTime(goal.updatedAt)}`}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {moreTab === "review" && (
        <>
          <h3>Weekly Review</h3>
          <form className="checklist" onSubmit={handleSaveWeeklyReview}>
            <label>
              <input type="checkbox" name="inboxCleared" /> Inbox cleaned
            </label>
            <label>
              <input type="checkbox" name="tasksPrioritized" /> Tasks prioritized
            </label>
            <label>
              <input type="checkbox" name="weekPlanned" /> Week planned
            </label>
            <label>
              <input type="checkbox" name="goalsChecked" /> Goals reviewed
            </label>
            <textarea name="note" placeholder="What changed this week?" />
            <button type="submit">Save Weekly Review</button>
          </form>
          <h3>Review History</h3>
          <div className="cards">
            {reviews
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
            {logs.map((log) => (
              <article key={log.id} className="card log">
                <div className="title">{log.action}</div>
                <div className="tags">
                  {log.at.slice(0, 19).replace("T", " ")} | {log.entityType} {log.entityId ?? ""}
                </div>
                <div>{log.detail}</div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
