import { useMemo } from "react";
import { AppData, getStatusBucket } from "../state/useAppData";
import { Project } from "../types";

interface ProjectsTabProps {
  filteredProjects: AppData["filteredProjects"];
  goals: AppData["state"]["goals"];
  statusLabel: AppData["statusLabel"];
  onToggleTodo(projectId: string, lineIndex: number, checked: boolean): void;
  onManage(project: Project): void;
  formatDateTime(iso: string): string;
}

function parseTodoLine(line: string): { checked: boolean; text: string } {
  const trimmed = line.trim();
  if (/^\[(x|X)\]\s+/.test(trimmed)) return { checked: true, text: trimmed.replace(/^\[(x|X)\]\s+/, "") };
  if (/^\[\s\]\s+/.test(trimmed)) return { checked: false, text: trimmed.replace(/^\[\s\]\s+/, "") };
  return { checked: false, text: trimmed };
}

export function ProjectsTab({ filteredProjects, goals, statusLabel, onToggleTodo, onManage, formatDateTime }: ProjectsTabProps) {
  const goalById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.title])), [goals]);

  return (
    <div className="cards">
      {filteredProjects.map((project) => {
        const bucket = getStatusBucket(project);
        const cardToneClass = bucket === "in_progress" ? "is-in-progress" : bucket !== "active" ? "is-dimmed" : "";
        const sourceDescription = (project.description ?? "").trim();
        const todoLines = sourceDescription
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        const parsedTodo = todoLines.map((line, lineIndex) => ({ ...parseTodoLine(line), lineIndex }));
        const undoneTodo = parsedTodo.filter((line) => !line.checked);
        const visibleUndoneTodo = undoneTodo.slice(0, 3);
        const completedCount = parsedTodo.filter((line) => line.checked).length;

        return (
          <article key={project.id} id={`item-project-${project.id}`} className={`card entity-card ${cardToneClass}`}>
            <div className="card-top-row">
              <div className="entity-main">
                <div className="title entity-title">{project.title}</div>
                {parsedTodo.length > 0 ? (
                  <>
                    <div className="tags entity-summary">
                      {completedCount}/{parsedTodo.length} TODOs done
                    </div>
                    <div className="project-todo-list">
                      {visibleUndoneTodo.map((line) => (
                        <label key={`${project.id}-${line.lineIndex}`} className="project-todo-item">
                          <input
                            type="checkbox"
                            checked={line.checked}
                            onChange={(e) => onToggleTodo(project.id, line.lineIndex, e.currentTarget.checked)}
                          />
                          <span className={line.checked ? "project-todo-done" : ""}>{line.text}</span>
                        </label>
                      ))}
                    </div>
                    {undoneTodo.length > visibleUndoneTodo.length ? (
                      <div className="meta-row entity-summary">Showing first {visibleUndoneTodo.length} undone items</div>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="entity-side">
                <button className="manage-btn" onClick={() => onManage(project)}>
                  Manage
                </button>
              </div>
            </div>
            <div className="card-footer">
              <div className="card-footer-left">
                <div className="tags entity-status entity-footer-meta">{statusLabel(project)}</div>
                <div className="tags entity-summary entity-footer-meta">
                  {project.goalId ? `goal ${goalById.get(project.goalId) ?? "Unknown"}` : "No goal linked"}
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
