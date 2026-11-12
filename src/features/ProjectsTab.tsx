import { useMemo } from "react";
import { AppData, formatDueLabel, getStatusBucket } from "../state/useAppData";
import { projectTodos } from "../state/projectTodos";
import { Project } from "../types";

interface Props {
  filteredProjects: AppData["filteredProjects"];
  goals: AppData["state"]["goals"];
  logicalDay: string;
  showStatus: boolean;
  statusLabel: AppData["statusLabel"];
  onManage(project: Project): void;
  formatDateTime(iso: string): string;
}
export function ProjectsTab({
  filteredProjects,
  goals,
  logicalDay,
  showStatus,
  statusLabel,
  onManage,
  formatDateTime,
}: Props) {
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
    [goals],
  );
  return (
    <div className="cards">
      {!filteredProjects.length && (
        <p className="meta">
          No projects in this view. Create a project or change the filter to see
          history.
        </p>
      )}
      {filteredProjects.map((project) => {
        const bucket = getStatusBucket(project);
        const remaining = projectTodos(project.description).filter(
          (todo) => !todo.checked,
        ).length;
        return (
          <article
            key={project.id}
            id={`item-project-${project.id}`}
            className={`card entity-card ${bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : ""}`}
          >
            <div className="card-top-row">
              <div className="entity-main">
                <div className="title entity-title">{project.title}</div>
                <p className="project-summary">
                  {project.summary || "No short description yet."}
                </p>
                <div className="tags entity-summary">
                  {remaining} TODOs left
                </div>
              </div>
              <div className="entity-side">
                <button
                  className="manage-btn"
                  onClick={() => onManage(project)}
                >
                  Open
                </button>
              </div>
            </div>
            <div className="card-footer">
              <div className="card-footer-left">
                {showStatus && (
                  <div className="tags entity-status entity-footer-meta">
                    {statusLabel(project)}
                  </div>
                )}
                <div className="tags entity-summary entity-footer-meta">
                  {project.deadline
                    ? `${formatDueLabel(project.deadline, logicalDay)} | `
                    : ""}
                  {project.goalId
                    ? `goal ${goalById.get(project.goalId) ?? "Unknown"}`
                    : "No goal linked"}
                </div>
              </div>
              <div className="meta-row entity-meta-time">
                {project.createdAt === project.updatedAt
                  ? `Created ${formatDateTime(project.createdAt)}`
                  : `Updated ${formatDateTime(project.updatedAt)}`}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
