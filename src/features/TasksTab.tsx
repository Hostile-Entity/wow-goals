import { useMemo } from "react";
import { AppData, getStatusBucket } from "../state/useAppData";
import { Task } from "../types";
import { taskPriorities } from "../state/lifecycle";
import { useAction } from "../components/useAction";
import { ItemCard } from "../components/ItemCard";
import { ExpandableDescription } from "../components/ExpandableDescription";
import { TaskDeadline } from "../components/TaskDeadline";

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
        const priority = taskPriorities.find(({ value }) => value === task.priority) ?? taskPriorities[1];
        const details = [
          task.scheduledFor && `Planned for ${task.scheduledFor}`,
          task.projectId && (projectById.get(task.projectId) ?? "Unknown project"),
          task.goalId && (goalById.get(task.goalId) ?? "Unknown goal"),
        ].filter(Boolean).join(" · ");
        const cardToneClass =
          bucket === "in_progress"
            ? "is-in-progress"
            : bucket !== "active"
              ? "is-dimmed"
              : "";

        return (
          <ItemCard
            key={task.id}
            type="task"
            entity={task}
            accessibleLabel={`${task.title}, ${priority.label.toLowerCase()} priority`}
            className={`task-priority-${priority.tone} ${cardToneClass}`}
            actions={
              <>
                <button className="manage-btn" onClick={() => onManage(task)}>
                  Edit
                </button>
                {["open", "doing"].includes(task.status) &&
                  <button className="complete-task-btn" aria-label={`Complete ${task.title}`} disabled={action.pending}
                    onClick={() => void action.run(() => onComplete(task.id))}>Done</button>}
              </>
            }
          >
            <div className="title entity-title">{task.title}</div>
            {task.description && (
              <ExpandableDescription className="entity-description" previewLines={5}>
                {task.description}
              </ExpandableDescription>
            )}
            {(showStatus || details || task.deadline) && (
              <div className="card-footer-left">
                {showStatus && (
                  <div className="tags entity-status entity-footer-meta">
                    {statusLabel(task)}
                  </div>
                )}
                {details && <div className="tags entity-summary entity-footer-meta">{details}</div>}
                {task.deadline && <TaskDeadline day={task.deadline} logicalDay={logicalDay} />}
              </div>
            )}
          </ItemCard>
        );
      })}
    </div>
  );
}
