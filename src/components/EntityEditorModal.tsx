import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppData, GoalDraft, ProjectDraft, RoutineDraft, TaskDraft } from "../state/useAppData";
import { EntityType, Goal, GoalMetric, ItemStatus, Note, Project, Routine, Task } from "../types";

type EditableType = Extract<EntityType, "note" | "task" | "project" | "goal" | "routine">;
type ExistingEntity = Note | Task | Project | Goal | Routine;
type GoalMetricInput = { id: string; name: string; current: string; target: string };

function makeMetricId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `metric_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toMetricInputs(goal?: Goal): GoalMetricInput[] {
  const source: GoalMetric[] =
    goal?.metrics && goal.metrics.length > 0
      ? goal.metrics
      : [
          {
            id: goal?.primaryMetricId ?? makeMetricId(),
            name: "Progress",
            current: 0,
            target: 10,
          },
        ];

  return source.map((metric) => ({
    id: metric.id,
    name: metric.name,
    current: String(metric.current),
    target: String(metric.target),
  }));
}

interface EntityEditorModalProps {
  mode: "create" | "edit";
  type: EditableType;
  entity?: ExistingEntity;
  goals: AppData["linkableGoals"];
  projects: AppData["linkableProjects"];
  onSaveTask(input: TaskDraft): Promise<void>;
  onSaveProject(input: ProjectDraft): Promise<void>;
  onSaveGoal(input: GoalDraft): Promise<void>;
  onSaveRoutine(input: RoutineDraft): Promise<void>;
  onSaveNote(input: Pick<Note, "title" | "description">): Promise<void>;
  onTriageNote?(note: Note, to: Exclude<EntityType, "note">): Promise<void>;
  onDoneTask?(taskId: string): Promise<void>;
  onPostponeTask?(taskId: string): Promise<void>;
  onSetStatus?(type: EditableType, id: string, status: Extract<ItemStatus, "active" | "in_progress">): Promise<void>;
  onDiscard?(type: EditableType, id: string): Promise<void>;
  onRecover?(type: EditableType, id: string): Promise<void>;
  onDelete?(type: EditableType, id: string): Promise<void>;
  close(): void;
}

export function EntityEditorModal({
  mode,
  type,
  entity,
  goals,
  projects,
  onSaveTask,
  onSaveProject,
  onSaveGoal,
  onSaveRoutine,
  onSaveNote,
  onTriageNote,
  onDoneTask,
  onPostponeTask,
  onSetStatus,
  onDiscard,
  onRecover,
  onDelete,
  close,
}: EntityEditorModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [goalId, setGoalId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState("1");
  const [goalMetrics, setGoalMetrics] = useState<GoalMetricInput[]>([{ id: makeMetricId(), name: "Progress", current: "0", target: "10" }]);
  const [primaryMetricId, setPrimaryMetricId] = useState("");
  const [currentMetricIndex, setCurrentMetricIndex] = useState(0);

  useEffect(() => {
    const taskEntity = type === "task" ? (entity as Task | undefined) : undefined;
    const noteEntity = type === "note" ? (entity as Note | undefined) : undefined;
    const projectEntity = type === "project" ? (entity as Project | undefined) : undefined;
    const routineEntity = type === "routine" ? (entity as Routine | undefined) : undefined;
    const goalEntity = type === "goal" ? (entity as Goal | undefined) : undefined;

    setTitle(noteEntity?.title ?? entity?.title ?? "");
    setDescription(noteEntity?.description ?? entity?.description ?? "");
    setDeadline(taskEntity?.deadline ?? projectEntity?.deadline ?? "");
    setGoalId(taskEntity?.goalId ?? projectEntity?.goalId ?? routineEntity?.goalId ?? "");
    setProjectId(taskEntity?.projectId ?? "");
    setPriority(String(taskEntity?.priority ?? 1));
    if (type === "goal") {
      const metrics = toMetricInputs(goalEntity);
      setGoalMetrics(metrics);
      setPrimaryMetricId(goalEntity?.primaryMetricId && metrics.some((metric) => metric.id === goalEntity.primaryMetricId) ? goalEntity.primaryMetricId : metrics[0].id);
      setCurrentMetricIndex(0);
    } else {
      setGoalMetrics([{ id: makeMetricId(), name: "Progress", current: "0", target: "10" }]);
      setPrimaryMetricId("");
      setCurrentMetricIndex(0);
    }
  }, [entity, type]);

  useEffect(() => {
    setCurrentMetricIndex((prev) => {
      if (goalMetrics.length === 0) return 0;
      if (prev < 0) return 0;
      if (prev > goalMetrics.length - 1) return goalMetrics.length - 1;
      return prev;
    });
  }, [goalMetrics]);

  const modalTitle = useMemo(() => `${mode === "create" ? "Create" : "Edit"} ${type}`, [mode, type]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    if (type === "note") {
      await onSaveNote({ title: cleanTitle, description });
      close();
      return;
    }

    if (type === "task") {
      await onSaveTask({
        title: cleanTitle,
        description,
        deadline: deadline || undefined,
        goalId: goalId || undefined,
        projectId: projectId || undefined,
        priority: Number(priority) || 1,
      });
      close();
      return;
    }

    if (type === "project") {
      await onSaveProject({
        title: cleanTitle,
        description,
        deadline: deadline || undefined,
        goalId: goalId || undefined,
      });
      close();
      return;
    }

    if (type === "goal") {
      const metrics = goalMetrics.map((metric) => ({
        id: metric.id,
        name: metric.name.trim() || "Metric",
        current: Number(metric.current) || 0,
        target: Number(metric.target) || 10,
      }));
      if (metrics.length === 0) return;
      const primary = metrics.find((metric) => metric.id === primaryMetricId) ?? metrics[0];

      await onSaveGoal({
        title: cleanTitle,
        description,
        metrics,
        primaryMetricId: primary.id,
      });
      close();
      return;
    }

    await onSaveRoutine({
      title: cleanTitle,
      description,
      goalId: goalId || undefined,
    });
    close();
  }

  const canSave = title.trim().length > 0;

  async function runActionAndClose(action: () => Promise<void>): Promise<void> {
    await action();
    close();
  }

  function updateGoalMetric(id: string, patch: Partial<GoalMetricInput>): void {
    setGoalMetrics((prev) => prev.map((metric) => (metric.id === id ? { ...metric, ...patch } : metric)));
  }

  function addGoalMetricInput(): void {
    const id = makeMetricId();
    setGoalMetrics((prev) => {
      const next = [...prev, { id, name: "", current: "0", target: "10" }];
      setCurrentMetricIndex(next.length - 1);
      return next;
    });
    setPrimaryMetricId((prev) => prev || id);
  }

  function removeGoalMetricInput(id: string): void {
    setGoalMetrics((prev) => {
      if (prev.length <= 1) return prev;
      const removedIndex = prev.findIndex((metric) => metric.id === id);
      const next = prev.filter((metric) => metric.id !== id);
      if (primaryMetricId === id) {
        setPrimaryMetricId(next[0]?.id ?? "");
      }
      if (removedIndex >= 0) {
        setCurrentMetricIndex((idx) => Math.max(0, idx > removedIndex ? idx - 1 : Math.min(idx, next.length - 1)));
      }
      return next;
    });
  }

  const currentMetric = goalMetrics[currentMetricIndex];

  return (
    <div className="modal-backdrop">
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>{modalTitle}</h3>
          <button onClick={close}>Close</button>
        </div>

        <form className="checklist editor-checklist" onSubmit={handleSubmit}>
          <label className="inline-select">
            <span className="field-label">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          </label>

          {type === "project" ? (
            <label className="inline-select">
              <span className="field-label">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Plan setup\nDraft architecture\nShip MVP"
                rows={8}
              />
            </label>
          ) : (
            <label className="inline-select">
              <span className="field-label">Description</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
            </label>
          )}

          {(type === "task" || type === "project") && (
            <label className="inline-select">
              <span className="field-label">Deadline</span>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          )}

          {(type === "task" || type === "project" || type === "routine") && (
            <label className="inline-select">
              <span className="field-label">Goal</span>
              <select value={goalId} onChange={(e) => setGoalId(e.currentTarget.value)}>
                <option value="">None</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type === "task" && (
            <label className="inline-select">
              <span className="field-label">Project</span>
              <select value={projectId} onChange={(e) => setProjectId(e.currentTarget.value)}>
                <option value="">None</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {type === "task" && (
            <label className="inline-select">
              <span className="field-label">Priority</span>
              <input type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} />
            </label>
          )}

          {type === "goal" && (
            <>
              <div className="goal-metric-nav">
                <button type="button" onClick={() => setCurrentMetricIndex((idx) => Math.max(0, idx - 1))} disabled={currentMetricIndex === 0}>
                  ←
                </button>
                <div className="meta-row">
                  Metric {goalMetrics.length === 0 ? 0 : currentMetricIndex + 1} / {goalMetrics.length}
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentMetricIndex((idx) => Math.min(goalMetrics.length - 1, idx + 1))}
                  disabled={currentMetricIndex >= goalMetrics.length - 1}
                >
                  →
                </button>
              </div>
              {currentMetric ? (
                <article key={currentMetric.id} className="card">
                  <label className="inline-select">
                    <span className="field-label">Metric name</span>
                    <input value={currentMetric.name} onChange={(e) => updateGoalMetric(currentMetric.id, { name: e.target.value })} />
                  </label>
                  <label className="inline-select">
                    <span className="field-label">Current value</span>
                    <input
                      type="number"
                      value={currentMetric.current}
                      onChange={(e) => updateGoalMetric(currentMetric.id, { current: e.target.value })}
                    />
                  </label>
                  <label className="inline-select">
                    <span className="field-label">Target value</span>
                    <input
                      type="number"
                      value={currentMetric.target}
                      onChange={(e) => updateGoalMetric(currentMetric.id, { target: e.target.value })}
                    />
                  </label>
                  <div className="actions">
                    <button
                      type="button"
                      className={primaryMetricId === currentMetric.id ? "active" : ""}
                      onClick={() => setPrimaryMetricId(currentMetric.id)}
                    >
                      {primaryMetricId === currentMetric.id ? "Primary" : "Set Primary"}
                    </button>
                    <button type="button" onClick={() => removeGoalMetricInput(currentMetric.id)} disabled={goalMetrics.length <= 1}>
                      Remove
                    </button>
                  </div>
                </article>
              ) : null}
            </>
          )}

          {type === "goal" ? (
            <div className="actions goal-metric-footer">
              <button type="button" onClick={addGoalMetricInput}>
                Add Metric
              </button>
              <button type="submit" disabled={!canSave}>
                Save
              </button>
            </div>
          ) : (
            <div className={`actions editor-save-row ${mode === "edit" ? "is-edit" : ""}`}>
              <button type="submit" disabled={!canSave}>
                Save
              </button>
            </div>
          )}
        </form>

        {mode === "edit" && type === "note" && entity && onTriageNote ? (
          <div className="actions note-triage-actions">
            <button onClick={() => void runActionAndClose(() => onTriageNote(entity as Note, "task"))}>Task</button>
            <button onClick={() => void runActionAndClose(() => onTriageNote(entity as Note, "project"))}>Project</button>
            <button onClick={() => void runActionAndClose(() => onTriageNote(entity as Note, "goal"))}>Goal</button>
            <button onClick={() => void runActionAndClose(() => onTriageNote(entity as Note, "routine"))}>Routine</button>
          </div>
        ) : null}

        {mode === "edit" && entity ? (
          <div className="actions">
            {type === "task" && onDoneTask ? <button onClick={() => void runActionAndClose(() => onDoneTask(entity.id))}>Done</button> : null}
            {type === "task" && onPostponeTask ? <button onClick={() => void runActionAndClose(() => onPostponeTask(entity.id))}>Postpone</button> : null}
            {entity.status !== "discarded" && onSetStatus ? (
              entity.status === "in_progress" ? (
                <button onClick={() => void runActionAndClose(() => onSetStatus(type, entity.id, "active"))}>Mark Active</button>
              ) : (
                <button onClick={() => void runActionAndClose(() => onSetStatus(type, entity.id, "in_progress"))}>Mark In Progress</button>
              )
            ) : null}
            {entity.status === "discarded" ? (
              <button onClick={() => onRecover && void runActionAndClose(() => onRecover(type, entity.id))}>Recover</button>
            ) : (
              <button onClick={() => onDiscard && void runActionAndClose(() => onDiscard(type, entity.id))}>Discard</button>
            )}
            <button className="danger" onClick={() => onDelete && void runActionAndClose(() => onDelete(type, entity.id))}>
              Delete
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
