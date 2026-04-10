import { AppData, getStatusBucket } from "../state/useAppData";
import { Project } from "../types";

interface ProjectsTabProps {
  filteredProjects: AppData["filteredProjects"];
  goals: AppData["state"]["goals"];
  statusLabel: AppData["statusLabel"];
  onManage(project: Project): void;
  formatDateTime(iso: string): string;
}

export function ProjectsTab({ filteredProjects, goals, statusLabel, onManage, formatDateTime }: ProjectsTabProps) {
  return (
    <div className="cards">
      {filteredProjects.map((project) => (
        <article
          key={project.id}
          id={`item-project-${project.id}`}
          className={`card entity-card ${getStatusBucket(project) !== "active" ? "is-dimmed" : ""}`}
        >
          <div className="entity-main">
            <div className="title entity-title">{project.title}</div>
            <div className="tags entity-summary">
              {project.goalId ? `goal ${goals.find((g) => g.id === project.goalId)?.title ?? "Unknown"}` : "No goal linked"}
            </div>
            <div className="tags entity-status">{statusLabel(project)}</div>
          </div>
          <div className="entity-side">
            <button onClick={() => onManage(project)}>Manage</button>
            <div className="meta-row entity-meta-time">
              {project.createdAt === project.updatedAt
                ? `Created ${formatDateTime(project.createdAt)}`
                : `Updated ${formatDateTime(project.updatedAt)}`}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
