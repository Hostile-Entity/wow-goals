import { useMemo } from "react";
import { AppData, formatDueLabel, getStatusBucket } from "../state/useAppData";
import { Task } from "../types";
import { priorityLabel } from "../state/lifecycle";
import { useAction } from "../components/useAction";
import { ItemTimestamp } from "../components/ItemTimestamp";
import { ExpandableDescription } from "../components/ExpandableDescription";

interface TasksTabProps {
  filteredTasks: AppData["filteredTasks"];
  goals: AppData["state"]["goals"];
  projects: AppData["state"]["projects"];
  logicalDay: AppData["logicalDay"];
  showStatus: boolean;
  statusLabel: AppData["statusLabel"];
  onManage(task: Task): void;
  onComplete(id: string): Promise<void>;
}

export function TasksTab({
  filteredTasks,
  goals,
  projects,
  logicalDay,
  showStatus,
  statusLabel,
  onManage,
  onComplete,
}: TasksTabProps) {
  const action = useAction();
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title])),
    [projects],
  );

  return (
    <div className="cards task-list">
      {action.error && <p className="action-error" role="alert">{action.error}</p>}
      {filteredTasks.map((task) => {
        const bucket = getStatusBucket(task);
        const cardToneClass =
          bucket === "in_progress"
            ? "is-in-progress"
            : bucket !== "active"
              ? "is-dimmed"
              : "";

        return (
          <article
            key={task.id}
            id={`item-task-${task.id}`}
            className={`card entity-card ${cardToneClass}`}
          >
            <div className="card-top-row">
              <div className="entity-main">
                <div className="title entity-title">{task.title}</div>
                {task.description ? (
                  <ExpandableDescription className="entity-description">
                    {task.description}
                  </ExpandableDescription>
                ) : null}
              </div>
              <div className="entity-side">
                <button className="manage-btn" onClick={() => onManage(task)}>
                  Edit
                </button>
                {["open", "doing"].includes(task.status) &&
                  <button className="complete-task-btn" aria-label={`Complete ${task.title}`} disabled={action.pending}
                    onClick={() => void action.run(() => onComplete(task.id))}>Done</button>}
              </div>
            </div>
            <div className="card-footer">
              <div className="card-footer-left">
                {showStatus ? (
                  <div className="tags entity-status entity-footer-meta">
                    {statusLabel(task)}
                  </div>
                ) : null}
                <div className="tags entity-summary entity-footer-meta">
                  {[
                    task.priority !== 2 && priorityLabel(task.priority),
                    task.deadline && formatDueLabel(task.deadline, logicalDay),
                    task.scheduledFor && `Planned for ${task.scheduledFor}`,
                    task.projectId && (projectById.get(task.projectId) ?? "Unknown project"),
                    task.goalId && (goalById.get(task.goalId) ?? "Unknown goal"),
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
              <ItemTimestamp entity={task} />
            </div>
          </article>
        );
      })}
    </div>
  );
}
