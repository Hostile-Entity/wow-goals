import { Task } from "../types";

export function ProjectNextTask({ task, onOpen }: { task?: Task; onOpen(id: string): void }) {
  return task ? (
    <div className="project-next-task">
      <span className="meta">Next task:</span>{" "}
      <button className="browse-link" onClick={() => onOpen(task.id)}>{task.title}</button>
    </div>
  ) : <p className="meta project-next-task">No open task</p>;
}
