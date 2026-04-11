import { useMemo } from "react";
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
  const goalById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.title])), [goals]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project.title])), [projects]);

  return (
    <div className="cards">
      {filteredTasks.map((task) => {
        const bucket = getStatusBucket(task);
        const cardToneClass = bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : "";

        return (
          <article key={task.id} id={`item-task-${task.id}`} className={`card entity-card ${cardToneClass}`}>
            <div className="entity-main">
              <div className="title entity-title">{task.title}</div>
              <div className="tags entity-summary">
                {task.deadline ? `due ${task.deadline} | ` : ""}postponed {task.postponedCount}
                {task.goalId ? ` | goal ${goalById.get(task.goalId) ?? "Unknown"}` : ""}
                {task.projectId ? ` | project ${projectById.get(task.projectId) ?? "Unknown"}` : ""}
              </div>
              <div className="tags entity-status">{statusLabel(task)}</div>
            </div>
            <div className="entity-side">
              <button className="manage-btn" onClick={() => onManage(task)}>
                Manage
              </button>
              <div className="meta-row entity-meta-time">
                {task.createdAt === task.updatedAt
                  ? `Created ${formatDateTime(task.createdAt)}`
                  : `Updated ${formatDateTime(task.updatedAt)}`}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
