import { ReactNode } from "react";
import { AppData, FilterKey, MoreTab as MoreTabId, getStatusBucket } from "../state/useAppData";
import { ReviewTab } from "./ReviewTab";
import { Goal, GoalMetric, Routine } from "../types";

interface MoreTabProps {
  moreTab: MoreTabId;
  setMoreTab(tab: MoreTabId): void;
  filteredRoutines: AppData["filteredRoutines"];
  filteredGoals: AppData["filteredGoals"];
  goals: AppData["state"]["goals"];
  projects: AppData["state"]["projects"];
  tasks: AppData["state"]["tasks"];
  routines: AppData["state"]["routines"];
  completions: AppData["state"]["completions"];
  reviews: AppData["state"]["reviews"];
  logs: AppData["state"]["logs"];
  logicalDay: AppData["logicalDay"];
  dayStartHour: AppData["dayStartHour"];
  statusLabel: AppData["statusLabel"];
  onCreateRoutine(): void;
  onCreateGoal(): void;
  primaryMetric: AppData["primaryMetric"];
  saveWeeklyReview(input: {
    weekKey: string;
    goalsChecked: boolean;
    inboxCleared: boolean;
    tasksPrioritized: boolean;
    weekPlanned: boolean;
    note: string;
  }): Promise<void>;
  toggleRoutineCompletionForDay(routineId: string, day: string): Promise<void>;
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
  completions,
  reviews,
  logs,
  logicalDay,
  dayStartHour,
  statusLabel,
  onCreateRoutine,
  onCreateGoal,
  primaryMetric,
  saveWeeklyReview,
  toggleRoutineCompletionForDay,
  renderFilterControl,
  onManageRoutine,
  onManageGoal,
  formatDateTime,
}: MoreTabProps) {
  return (
    <section>
      <h2>More</h2>
      <div className="more-tabs">
        {[
          ["review", "Review"],
          ["goals", "Goals"],
          ["routines", "Routines"],
        ].map(([id, label]) => (
          <button key={id} className={moreTab === id ? "active" : ""} onClick={() => setMoreTab(id as MoreTabId)}>
            {label}
          </button>
        ))}
      </div>
      {moreTab === "routines" && (
        <>
          <div className="section-subhead sticky-head">
            <button onClick={onCreateRoutine}>+ Routine</button>
            {renderFilterControl("routines")}
          </div>
          <div className="cards">
            {filteredRoutines.map((routine) => {
              const bucket = getStatusBucket(routine);
              const cardToneClass = bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : "";

              return (
                <article key={routine.id} id={`item-routine-${routine.id}`} className={`card entity-card ${cardToneClass}`}>
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
              );
            })}
          </div>
        </>
      )}

      {moreTab === "goals" && (
        <>
          <div className="section-subhead sticky-head">
            <button onClick={onCreateGoal}>+ Goal</button>
            {renderFilterControl("goals")}
          </div>
          <div className="cards">
            {filteredGoals.map((goal) => {
              const pMetric = primaryMetric(goal);
              const baseMetrics: GoalMetric[] =
                goal.metrics && goal.metrics.length > 0
                  ? goal.metrics
                  : [{ id: goal.primaryMetricId ?? "legacy_primary", name: goal.metricName, current: goal.metricCurrent, target: goal.metricTarget }];
              const primaryId = goal.primaryMetricId ?? pMetric.id;
              const orderedMetrics = [...baseMetrics].sort((a, b) => {
                if (a.id === primaryId) return -1;
                if (b.id === primaryId) return 1;
                return 0;
              });
              const linkedProjects = projects.filter((p) => p.goalId === goal.id);
              const linkedTasks = tasks.filter((t) => t.goalId === goal.id);
              const linkedRoutines = routines.filter((r) => r.goalId === goal.id);
              const bucket = getStatusBucket(goal);
              const cardToneClass = bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : "";
              return (
                <article key={goal.id} id={`item-goal-${goal.id}`} className={`card entity-card ${cardToneClass}`}>
                  <div className="entity-main">
                    <div className="title entity-title">{goal.title}</div>
                    <div className="goal-metric-stack">
                      {orderedMetrics.map((metric) => {
                        const progress = metric.target > 0 ? Math.min(100, Math.round((metric.current / metric.target) * 100)) : 0;
                        return (
                          <div key={metric.id} className="goal-metric-item">
                            <div className="tags entity-summary">
                              {metric.name}: {metric.current}/{metric.target} ({progress}%)
                            </div>
                            <div className="bar">
                              <i style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        );
                      })}
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
          <ReviewTab
            logicalDay={logicalDay}
            dayStartHour={dayStartHour}
            projects={projects}
            routines={routines}
            completions={completions}
            reviews={reviews}
            logs={logs}
            saveWeeklyReview={saveWeeklyReview}
            toggleRoutineCompletionForDay={toggleRoutineCompletionForDay}
          />
        </>
      )}
    </section>
  );
}
