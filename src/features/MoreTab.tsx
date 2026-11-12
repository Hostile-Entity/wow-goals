import { ReactNode, useMemo } from "react";
import {
  AppData,
  FilterKey,
  MoreTab as MoreTabId,
  getStatusBucket,
} from "../state/useAppData";
import { ReviewTab } from "./ReviewTab";
import { EntityType, Goal, Routine } from "../types";
import { isOpen } from "../state/lifecycle";
import { ItemTimestamp } from "../components/ItemTimestamp";

interface MoreTabProps {
  notes: AppData["state"]["notes"];
  onOpen(type: EntityType, id: string): void;
  moreTab: MoreTabId;
  setMoreTab(tab: MoreTabId): void;
  filteredRoutines: AppData["filteredRoutines"];
  filteredGoals: AppData["filteredGoals"];
  showStatus: boolean;
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
}

export function MoreTab({
  notes,
  onOpen,
  moreTab,
  setMoreTab,
  filteredRoutines,
  filteredGoals,
  showStatus,
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
}: MoreTabProps) {
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );
  const linkedProjectCountByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of projects) {
      if (!project.goalId || !isOpen(project)) continue;
      map.set(project.goalId, (map.get(project.goalId) ?? 0) + 1);
    }
    return map;
  }, [projects]);
  const linkedTaskCountByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (!task.goalId || !isOpen(task)) continue;
      map.set(task.goalId, (map.get(task.goalId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);
  const linkedRoutineCountByGoal = useMemo(() => {
    const map = new Map<string, number>();
    for (const routine of routines) {
      if (!routine.goalId || !isOpen(routine)) continue;
      map.set(routine.goalId, (map.get(routine.goalId) ?? 0) + 1);
    }
    return map;
  }, [routines]);

  return (
    <section>
      <div className="more-tabs">
        {[
          ["review", "Review"],
          ["goals", "Goals"],
          ["routines", "Routines"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={moreTab === id ? "active" : ""}
            onClick={() => setMoreTab(id as MoreTabId)}
          >
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
              const cardToneClass =
                bucket === "in_progress"
                  ? "is-in-progress"
                  : bucket !== "active"
                    ? "is-dimmed"
                    : "";

              return (
                <article
                  key={routine.id}
                  id={`item-routine-${routine.id}`}
                  className={`card entity-card ${cardToneClass}`}
                >
                  <div className="card-top-row">
                    <div className="entity-main">
                      <div className="title entity-title">{routine.title}</div>
                      {routine.description ? (
                        <div className="entity-description">
                          {routine.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="entity-side">
                      <button
                        className="manage-btn"
                        onClick={() => onManageRoutine(routine)}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="card-footer">
                    <div className="card-footer-left">
                      {showStatus ? (
                        <div className="tags entity-status entity-footer-meta">
                          {statusLabel(routine)}
                        </div>
                      ) : null}
                      <div className="tags entity-summary entity-footer-meta">
                        {routine.goalId
                          ? `goal ${goalById.get(routine.goalId) ?? "Unknown"}`
                          : ""}
                      </div>
                    </div>
                    <ItemTimestamp entity={routine} />
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
              const bucket = getStatusBucket(goal);
              const cardToneClass =
                bucket === "in_progress"
                  ? "is-in-progress"
                  : bucket !== "active"
                    ? "is-dimmed"
                    : "";
              return (
                <article
                  key={goal.id}
                  id={`item-goal-${goal.id}`}
                  className={`card entity-card ${cardToneClass}`}
                >
                  <div className="card-top-row">
                    <div className="entity-main">
                      <div className="title entity-title">{goal.title}</div>
                      <div className="goal-metric-stack">
                        {[pMetric].map((metric) => {
                          const progress =
                            metric.target > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (metric.current / metric.target) * 100,
                                  ),
                                )
                              : 0;
                          return (
                            <div key={metric.id} className="goal-metric-item">
                              <div className="tags entity-summary">
                                {metric.name}: {metric.current}/{metric.target}{" "}
                                ({progress}%)
                              </div>
                              <div className="bar">
                                <i style={{ width: `${progress}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="entity-side">
                      <button
                        className="manage-btn"
                        onClick={() => onManageGoal(goal)}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="card-footer">
                    <div className="card-footer-left">
                      {showStatus ? (
                        <div className="tags entity-status entity-footer-meta">
                          {statusLabel(goal)}
                        </div>
                      ) : null}
                      <div className="tags entity-summary entity-footer-meta">
                        open linked:{" "}
                        {linkedProjectCountByGoal.get(goal.id) ?? 0} projects,{" "}
                        {linkedTaskCountByGoal.get(goal.id) ?? 0} tasks,{" "}
                        {linkedRoutineCountByGoal.get(goal.id) ?? 0} routines
                      </div>
                    </div>
                    <ItemTimestamp entity={goal} />
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
            notes={notes}
            tasks={tasks}
            onOpen={onOpen}
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
