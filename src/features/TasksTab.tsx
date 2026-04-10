import { AppData, getStatusBucket } from "../state/useAppData";
import { Task } from "../types";

interface TasksTabProps {
  filteredTasks: AppData["filteredTasks"];
  goals: AppData["state"]["goals"];
  projects: AppData["state"]["projects"];
  statusLabel: AppData["statusLabel"];
  onManage(task: Task): void;
  formatDateTime(iso: string): string;
}

export function TasksTab({ filteredTasks, goals, projects, statusLabel, onManage, formatDateTime }: TasksTabProps) {
  return (
    <div className="cards">
      {filteredTasks.map((task) => (
        <article
          key={task.id}
          id={`item-task-${task.id}`}
          className={`card entity-card ${getStatusBucket(task) !== "active" ? "is-dimmed" : ""}`}
        >
          <div className="entity-main">
            <div className="title entity-title">{task.title}</div>
            <div className="tags entity-summary">
              {task.deadline ? `due ${task.deadline} | ` : ""}postponed {task.postponedCount}
              {task.goalId ? ` | goal ${goals.find((g) => g.id === task.goalId)?.title ?? "Unknown"}` : ""}
              {task.projectId ? ` | project ${projects.find((p) => p.id === task.projectId)?.title ?? "Unknown"}` : ""}
            </div>
            <div className="tags entity-status">{statusLabel(task)}</div>
          </div>
          <div className="entity-side">
            <button onClick={() => onManage(task)}>Manage</button>
            <div className="meta-row entity-meta-time">
              {task.createdAt === task.updatedAt
                ? `Created ${formatDateTime(task.createdAt)}`
                : `Updated ${formatDateTime(task.updatedAt)}`}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
