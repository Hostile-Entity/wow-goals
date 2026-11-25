import { useMemo } from "react";
import { AppData, formatDueLabel, getStatusBucket } from "../state/useAppData";
import { Project } from "../types";
import { ItemCard } from "../components/ItemCard";
import { ProjectNextTask } from "../components/ProjectNextTask";

interface Props {
  filteredProjects: AppData["filteredProjects"];
  goals: AppData["state"]["goals"];
  logicalDay: string;
  showStatus: boolean;
  statusLabel: AppData["statusLabel"];
  nextProjectTasks: AppData["nextProjectTasks"];
  onOpenTask(id: string): void;
  onManage(project: Project): void;
}
export function ProjectsTab({
  filteredProjects,
  goals,
  logicalDay,
  showStatus,
  statusLabel,
  nextProjectTasks,
  onOpenTask,
  onManage,
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
        const details = [
          project.deadline && formatDueLabel(project.deadline, logicalDay),
          project.goalId && (goalById.get(project.goalId) ?? "Unknown goal"),
        ].filter(Boolean).join(" · ");
        return (
          <ItemCard
            key={project.id}
            type="project"
            entity={project}
            className={bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : ""}
            actions={
              <button className="manage-btn" onClick={() => onManage(project)}>Open</button>
            }
          >
            <div className="title entity-title">{project.title}</div>
            <p className="project-summary">
              {project.summary || "No short description yet."}
            </p>
            {project.status === "active" && (
              <ProjectNextTask task={nextProjectTasks.get(project.id)} onOpen={onOpenTask} />
            )}
            {(showStatus || details) && (
              <div className="card-footer-left">
                {showStatus && (
                  <div className="tags entity-status entity-footer-meta">
                    {statusLabel(project)}
                  </div>
                )}
                {details && <div className="tags entity-summary entity-footer-meta">{details}</div>}
              </div>
            )}
          </ItemCard>
        );
      })}
    </div>
  );
}
