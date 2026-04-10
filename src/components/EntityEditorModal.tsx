import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppData, GoalDraft, ProjectDraft, RoutineDraft, TaskDraft } from "../state/useAppData";
import { EntityType, Goal, Note, Project, Routine, Task } from "../types";

type EditableType = Extract<EntityType, "note" | "task" | "project" | "goal" | "routine">;
type ExistingEntity = Note | Task | Project | Goal | Routine;

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
  const [importance, setImportance] = useState("3");
  const [effort, setEffort] = useState("3");
  const [isActive, setIsActive] = useState(true);
  const [metricName, setMetricName] = useState("Progress");
  const [metricCurrent, setMetricCurrent] = useState("0");
  const [metricTarget, setMetricTarget] = useState("10");

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
    setImportance(String(projectEntity?.importance ?? 3));
    setEffort(String(projectEntity?.effort ?? 3));
    setIsActive(projectEntity?.isActive ?? goalEntity?.isActive ?? true);
    if (type === "goal") {
      const g = goalEntity;
      const primary = g?.metrics?.find((m) => m.id === g.primaryMetricId) ?? g?.metrics?.[0];
      setMetricName(primary?.name ?? g?.metricName ?? "Progress");
      setMetricCurrent(String(primary?.current ?? g?.metricCurrent ?? 0));
      setMetricTarget(String(primary?.target ?? g?.metricTarget ?? 10));
    }
  }, [entity, type]);

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
        importance: Number(importance) || 3,
        effort: Number(effort) || 3,
        isActive,
      });
      close();
      return;
    }

    if (type === "goal") {
      await onSaveGoal({
        title: cleanTitle,
        description,
        isActive,
        metricName,
        metricCurrent: Number(metricCurrent) || 0,
        metricTarget: Number(metricTarget) || 10,
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

  return (
    <div className="modal-backdrop">
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>{modalTitle}</h3>
          <button onClick={close}>Close</button>
        </div>

        <form className="checklist" onSubmit={handleSubmit}>
          <label className="inline-select">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          </label>

          <label className="inline-select">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
          </label>

          {(type === "task" || type === "project") && (
            <label className="inline-select">
              Deadline
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          )}

          {(type === "task" || type === "project" || type === "routine") && (
            <label className="inline-select">
              Goal
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
              Project
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
              Priority
              <input type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} />
            </label>
          )}

          {type === "project" && (
            <>
              <label className="inline-select">
                Importance
                <input type="number" min={1} max={5} value={importance} onChange={(e) => setImportance(e.target.value)} />
              </label>
              <label className="inline-select">
                Effort
                <input type="number" min={1} max={5} value={effort} onChange={(e) => setEffort(e.target.value)} />
              </label>
            </>
          )}

          {(type === "project" || type === "goal") && (
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
            </label>
          )}

          {type === "goal" && (
            <>
              <label className="inline-select">
                Primary metric name
                <input value={metricName} onChange={(e) => setMetricName(e.target.value)} />
              </label>
              <label className="inline-select">
                Current value
                <input type="number" value={metricCurrent} onChange={(e) => setMetricCurrent(e.target.value)} />
              </label>
              <label className="inline-select">
                Target value
                <input type="number" value={metricTarget} onChange={(e) => setMetricTarget(e.target.value)} />
              </label>
            </>
          )}

          <div className="actions">
            <button type="submit" disabled={!canSave}>
              Save
            </button>
          </div>
        </form>

        {mode === "edit" && type === "note" && entity && onTriageNote ? (
          <div className="actions">
            <button onClick={() => void onTriageNote(entity as Note, "task")}>To Task</button>
            <button onClick={() => void onTriageNote(entity as Note, "project")}>To Project</button>
            <button onClick={() => void onTriageNote(entity as Note, "goal")}>To Goal</button>
            <button onClick={() => void onTriageNote(entity as Note, "routine")}>To Routine</button>
          </div>
        ) : null}

        {mode === "edit" && entity ? (
          <div className="actions">
            {type === "task" && onDoneTask ? <button onClick={() => void onDoneTask(entity.id)}>Done</button> : null}
            {type === "task" && onPostponeTask ? <button onClick={() => void onPostponeTask(entity.id)}>Postpone</button> : null}
            {entity.status === "discarded" ? (
              <button onClick={() => onRecover && void onRecover(type, entity.id)}>Recover</button>
            ) : (
              <button onClick={() => onDiscard && void onDiscard(type, entity.id)}>Discard</button>
            )}
            <button className="danger" onClick={() => onDelete && void onDelete(type, entity.id)}>
              Delete
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
