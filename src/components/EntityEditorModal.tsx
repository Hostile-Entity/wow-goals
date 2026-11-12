import { FormEvent, useState } from "react";
import {
  AppData,
  GoalDraft,
  ProjectDraft,
  RoutineDraft,
  TaskDraft,
} from "../state/useAppData";
import { EntityType, Goal, Note, Project, Task } from "../types";
import { Dialog } from "./Dialog";
import { EntityActions } from "./EntityActions";
import { useAction } from "./useAction";
import { uid } from "../db";

interface Props {
  mode: "create" | "edit";
  type: EntityType;
  entity?: Note | Task | Project | Goal;
  goals: AppData["linkableGoals"];
  projects: AppData["linkableProjects"];
  app: AppData;
  onSaveTask(input: TaskDraft, revision?: string): Promise<void>;
  onSaveProject(input: ProjectDraft, revision?: string): Promise<void>;
  onSaveGoal(input: GoalDraft, revision?: string): Promise<void>;
  onSaveRoutine(input: RoutineDraft, revision?: string): Promise<void>;
  onSaveNote(
    input: { title: string; description: string },
    revision?: string,
  ): Promise<void>;
  onOpen(type: EntityType, id: string): void;
  close(): void;
}
export function EntityEditorModal({
  mode,
  type,
  entity,
  goals,
  projects,
  app,
  onSaveTask,
  onSaveProject,
  onSaveGoal,
  onSaveRoutine,
  onSaveNote,
  onOpen,
  close,
}: Props) {
  const task = entity as Task | undefined;
  const goal = entity as Goal | undefined;
  const [title, setTitle] = useState(entity?.title ?? "");
  const [revision] = useState(entity?.updatedAt);
  const [description, setDescription] = useState(entity?.description ?? "");
  const [summary, setSummary] = useState(
    (entity as Project | undefined)?.summary ?? "",
  );
  const [deadline, setDeadline] = useState(task?.deadline ?? "");
  const [scheduledFor, setScheduledFor] = useState(task?.scheduledFor ?? "");
  const [goalId, setGoalId] = useState(task?.goalId ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [priority, setPriority] = useState(task?.priority ?? 2);
  const [metrics, setMetrics] = useState(
    type === "goal"
      ? (goal?.metrics ?? [
          { id: uid("metric"), name: "Progress", current: 0, target: 10 },
        ])
      : [],
  );
  const [primary, setPrimary] = useState(
    goal?.primaryMetricId ?? metrics[0]?.id ?? "",
  );
  const [advancedTriage, setAdvancedTriage] = useState(false);
  const [initial] = useState(() =>
    JSON.stringify({
      title,
      description,
      summary,
      deadline,
      scheduledFor,
      goalId,
      projectId,
      priority,
      metrics,
      primary,
    }),
  );
  const dirty =
    JSON.stringify({
      title,
      description,
      summary,
      deadline,
      scheduledFor,
      goalId,
      projectId,
      priority,
      metrics,
      primary,
    }) !== initial;
  const action = useAction();
  const guard = () =>
    !dirty ||
    window.confirm(
      "This action will use the saved item, not your unsaved edits. Continue without saving?",
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await action.run(async () => {
      const common = { title: title.trim(), description };
      if (type === "note") await onSaveNote(common, revision);
      if (type === "task")
        await onSaveTask(
          {
            ...common,
            deadline: deadline || undefined,
            scheduledFor: scheduledFor || undefined,
            goalId: goalId || undefined,
            projectId: projectId || undefined,
            priority,
          },
          revision,
        );
      if (type === "project")
        await onSaveProject(
          {
            ...common,
            summary,
            deadline: deadline || undefined,
            goalId: goalId || undefined,
          },
          revision,
        );
      if (type === "routine")
        await onSaveRoutine(
          { ...common, goalId: goalId || undefined },
          revision,
        );
      if (type === "goal")
        await onSaveGoal(
          { ...common, metrics, primaryMetricId: primary },
          revision,
        );
    }, close);
  }
  const missingGoal = goalId && !goals.some((row) => row.id === goalId);
  const missingProject =
    projectId && !projects.some((row) => row.id === projectId);
  const note = entity as Note | undefined;
  function triage(to: Exclude<EntityType, "note">) {
    if (note)
      void action.run(
        () =>
          app.triageNote(
            {
              ...note,
              updatedAt: revision ?? note.updatedAt,
              title,
              description,
            },
            to,
          ),
        close,
      );
  }
  return (
    <Dialog
      title={`${mode === "create" ? "Create" : "Edit"} ${type}`}
      close={close}
      dirty={dirty}
      busy={action.pending || app.busy}
    >
      <form
        className="checklist editor-checklist"
        onSubmit={(event) => void save(event)}
      >
        <fieldset disabled={action.pending} className="editor-fields">
          <label className="inline-select">
            <span className="field-label">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          {type === "project" && (
            <label className="inline-select">
              <span className="field-label">Short description</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={2}
                placeholder="What is this project for?"
              />
            </label>
          )}
          <label className="inline-select">
            <span className="field-label">
              {type === "project" ? "TODO source" : "Description"}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={type === "project" ? 6 : 3}
              placeholder={
                type === "project"
                  ? "[ ] First TODO\n[x] Completed TODO"
                  : "Description"
              }
            />
          </label>
          {type === "project" && (
            <p className="meta">
              Each non-empty source line is a TODO, just as before. The short
              description is stored separately; existing text is never
              automatically split or discarded.
            </p>
          )}
          {(type === "task" || type === "project") && (
            <label className="inline-select">
              <span className="field-label">Deadline</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          )}
          {type === "task" && (
            <>
              <label className="inline-select">
                <span className="field-label">Scheduled</span>
                <input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </label>
              <label className="inline-select">
                <span className="field-label">Priority</span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                >
                  <option value={1}>High</option>
                  <option value={2}>Normal</option>
                  <option value={3}>Low</option>
                </select>
              </label>
            </>
          )}
          {(type === "task" || type === "project" || type === "routine") && (
            <label className="inline-select">
              <span className="field-label">Goal</span>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                <option value="">None</option>
                {missingGoal && (
                  <option value={goalId}>
                    Existing goal (closed or missing)
                  </option>
                )}
                {goals.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === "task" && (
            <label className="inline-select">
              <span className="field-label">Project</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">None</option>
                {missingProject && (
                  <option value={projectId}>
                    Existing project (closed, paused or missing)
                  </option>
                )}
                {projects.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === "task" && projectId && (
            <p className="meta">
              Task goal links are explicit: selecting a project does not change
              the task’s goal.{" "}
              {goalId &&
              projects.find((project) => project.id === projectId)?.goalId &&
              projects.find((project) => project.id === projectId)?.goalId !==
                goalId
                ? "This task and project link to different goals."
                : ""}
            </p>
          )}
          {type === "goal" && (
            <div className="cards">
              {metrics.map((metric) => (
                <article className="card" key={metric.id}>
                  <label className="inline-select">
                    Metric name
                    <input
                      value={metric.name}
                      onChange={(e) =>
                        setMetrics((rows) =>
                          rows.map((row) =>
                            row.id === metric.id
                              ? { ...row, name: e.target.value }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="inline-select">
                    Current value
                    <input
                      type="number"
                      step="any"
                      value={metric.current}
                      onChange={(e) =>
                        setMetrics((rows) =>
                          rows.map((row) =>
                            row.id === metric.id
                              ? { ...row, current: e.target.valueAsNumber }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="inline-select">
                    Target value
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      value={metric.target}
                      onChange={(e) =>
                        setMetrics((rows) =>
                          rows.map((row) =>
                            row.id === metric.id
                              ? { ...row, target: e.target.valueAsNumber }
                              : row,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <div className="actions">
                    <button type="button" onClick={() => setPrimary(metric.id)}>
                      {primary === metric.id ? "Primary" : "Set primary"}
                    </button>
                    <button
                      type="button"
                      disabled={metrics.length === 1}
                      onClick={() => {
                        const next = metrics.filter(
                          (row) => row.id !== metric.id,
                        );
                        setMetrics(next);
                        if (primary === metric.id) setPrimary(next[0].id);
                      }}
                    >
                      Remove metric
                    </button>
                  </div>
                </article>
              ))}
              <button
                type="button"
                onClick={() =>
                  setMetrics((rows) => [
                    ...rows,
                    {
                      id: uid("metric"),
                      name: "Metric",
                      current: 0,
                      target: 10,
                    },
                  ])
                }
              >
                Add metric
              </button>
            </div>
          )}
          <div className="actions editor-save-row">
            <button type="submit" disabled={!title.trim()}>
              {action.pending ? "Saving…" : "Save"}
            </button>
          </div>
        </fieldset>
      </form>
      {action.error && (
        <p className="action-error" role="alert">
          {action.error}
        </p>
      )}
      {mode === "edit" && type === "note" && note && (
        <section aria-label="Convert to">
          {note.triagedTo ? (
            <>
              <p className="meta">Converted to {note.triagedTo}.</p>
              <div className="actions">
                {note.triagedId && (
                  <>
                    <button
                      disabled={action.pending}
                      onClick={() => {
                        if (guard()) onOpen(note.triagedTo!, note.triagedId!);
                      }}
                    >
                      Open result
                    </button>
                    <button
                      disabled={action.pending}
                      onClick={() => {
                        if (guard())
                          void action.run(() => app.undoTriage(note.id), close);
                      }}
                    >
                      Undo conversion
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <h4>Convert to…</h4>
              <div className="actions">
                <button
                  disabled={action.pending || !title.trim()}
                  onClick={() => triage("task")}
                >
                  Task
                </button>
                <button
                  disabled={action.pending || !title.trim()}
                  onClick={() => triage("project")}
                >
                  Project
                </button>
                <button
                  disabled={action.pending}
                  onClick={() => setAdvancedTriage(!advancedTriage)}
                >
                  Other types
                </button>
                {advancedTriage && (
                  <>
                    <button
                      disabled={action.pending}
                      onClick={() => triage("goal")}
                    >
                      Goal
                    </button>
                    <button
                      disabled={action.pending}
                      onClick={() => triage("routine")}
                    >
                      Routine
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}
      {mode === "edit" && entity && (
        <>
          {type === "task" && (
            <div className="actions">
              <button
                disabled={
                  action.pending ||
                  entity.status === "done" ||
                  entity.status === "discarded"
                }
                onClick={() => {
                  if (guard())
                    void action.run(() => app.completeTask(entity.id), close);
                }}
              >
                Done
              </button>
              <button
                disabled={action.pending}
                onClick={() => {
                  if (guard())
                    void action.run(() => app.postponeTask(entity.id), close);
                }}
              >
                Snooze until tomorrow
              </button>
              <button
                disabled={action.pending}
                onClick={() => {
                  if (guard())
                    void action.run(() => app.toggleFocus(entity.id));
                }}
              >
                {app.settings.focusTaskIds.includes(entity.id)
                  ? "Unpin focus"
                  : "Pin to Today"}
              </button>
            </div>
          )}
          <EntityActions
            type={type}
            entity={entity}
            app={app}
            beforeAction={guard}
          />
        </>
      )}
    </Dialog>
  );
}
