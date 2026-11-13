import { FormEvent, useState } from "react";
import { AppData } from "../state/useAppData";
import { isOpen } from "../state/lifecycle";
import { projectTodos } from "../state/projectTodos";
import { Project } from "../types";
import { Dialog } from "./Dialog";
import { EntityActions } from "./EntityActions";
import { useAction } from "./useAction";
import { ConversionContext, ConversionNotice } from "./ConversionNotice";
import { EntityMetadata } from "./EntityMetadata";

export function ProjectDetailModal({
  project,
  app,
  edit,
  openTask,
  close,
  conversion,
}: {
  project: Project;
  app: AppData;
  edit(): void;
  openTask(id: string): void;
  close(): void;
  conversion?: ConversionContext;
}) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editRevision, setEditRevision] = useState(project.updatedAt);
  const action = useAction();
  const todos = projectTodos(project.description);
  const linked = app.state.tasks.filter(
    (task) => task.projectId === project.id,
  );
  const canChange = project.status === "planned" || project.status === "active";
  const guard = () =>
    (!text && editing === null) ||
    window.confirm("Discard the unsaved TODO draft?");
  function add(event: FormEvent) {
    event.preventDefault();
    void action.run(
      () => app.addProjectTodo(project.id, text),
      () => setText(""),
    );
  }
  function row(todo: ReturnType<typeof projectTodos>[number]) {
    return (
      <div className="detail-todo" key={todo.sourceIndex}>
        <label>
          <input
            type="checkbox"
            checked={todo.checked}
            disabled={action.pending || !canChange}
            onChange={(event) =>
              void action.run(() =>
                app.toggleProjectTodo(
                  project.id,
                  todo.sourceIndex,
                  event.target.checked,
                  project.updatedAt,
                ),
              )
            }
          />
          <span className={todo.checked ? "project-todo-done" : ""}>
            {todo.text}
          </span>
        </label>
        {editing === todo.sourceIndex ? (
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(
                () =>
                  app.editProjectTodo(
                    project.id,
                    todo.sourceIndex,
                    editText,
                    editRevision,
                  ),
                () => setEditing(null),
              );
            }}
          >
            <input
              aria-label="Edit TODO text"
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              autoFocus
            />
            <button disabled={action.pending}>Save TODO</button>
            <button type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            disabled={action.pending || !canChange}
            onClick={() => {
              if (guard()) {
                setEditing(todo.sourceIndex);
                setEditText(todo.text);
                setEditRevision(project.updatedAt);
              }
            }}
          >
            Edit
          </button>
        )}
      </div>
    );
  }
  return (
    <Dialog
      title={project.title}
      className="entity-detail"
      close={close}
      dirty={Boolean(text || editing !== null)}
      busy={action.pending || app.busy}
    >
      <ConversionNotice context={conversion} beforeAction={guard} />
      <p className="entity-description">
        {project.summary ||
          "No short description yet. Add one in Edit project."}
      </p>
      <div className="actions">
        <span className="tags">
          {app.statusLabel(project)} · {todos.filter((todo) => !todo.checked).length}{" "}
          TODOs left
        </span>
        <button
          onClick={() => {
            if (guard()) edit();
          }}
        >
          Edit project
        </button>
      </div>
      <h4>TODOs</h4>
      {todos.filter((todo) => !todo.checked).map(row)}
      {!todos.length && <p className="meta">No TODOs yet.</p>}
      <details>
        <summary>
          Completed ({todos.filter((todo) => todo.checked).length})
        </summary>
        {todos.filter((todo) => todo.checked).map(row)}
      </details>
      <form onSubmit={add} className="row">
        <input
          aria-label="New TODO"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a TODO…"
          disabled={!canChange || action.pending}
        />
        <button disabled={!text.trim() || !canChange || action.pending}>
          Add TODO
        </button>
      </form>
      {action.error && (
        <p className="action-error" role="alert">
          {action.error}
        </p>
      )}
      <h4>
        Linked Tasks ({linked.filter(isOpen).length} open / {linked.length}{" "}
        total)
      </h4>
      <p className="meta">
        Linked Tasks are separate from the project checklist, as before.
      </p>
      <div className="cards">
        {linked.map((task) => (
          <button
            key={task.id}
            onClick={() => {
              if (guard()) openTask(task.id);
            }}
          >
            {task.title} · {app.statusLabel(task)}
          </button>
        ))}
      </div>
      <EntityActions
        type="project"
        entity={project}
        app={app}
        beforeAction={guard}
      />
      <EntityMetadata entity={project} />
    </Dialog>
  );
}
