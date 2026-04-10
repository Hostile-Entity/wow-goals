import { AppData } from "../state/useAppData";
import { Goal, GoalMetric, Note, Project, Routine, Task } from "../types";

interface ManageModalProps {
  popupType: "note" | "task" | "project" | "goal" | "routine";
  selectedNote?: Note;
  selectedTask?: Task;
  selectedRoutine?: Routine;
  selectedProject?: Project;
  selectedGoal?: Goal;
  logicalDay: string;
  linkableGoals: AppData["linkableGoals"];
  linkableProjects: AppData["linkableProjects"];
  setPrimaryGoalMetric: AppData["setPrimaryGoalMetric"];
  removeGoalMetric: AppData["removeGoalMetric"];
  editGoalMetric: AppData["editGoalMetric"];
  addGoalMetric: AppData["addGoalMetric"];
  addQuickRoutine: AppData["addQuickRoutine"];
  goalMetrics: AppData["goalMetrics"];
  updateEntity: AppData["updateEntity"];
  triageNote: AppData["triageNote"];
  editTitle: AppData["editTitle"];
  editDescription: AppData["editDescription"];
  recoverEntity: AppData["recoverEntity"];
  discardEntity: AppData["discardEntity"];
  permanentDelete: AppData["permanentDelete"];
  completeTask: AppData["completeTask"];
  postponeTask: AppData["postponeTask"];
  close(): void;
}

export function ManageModal({
  popupType,
  selectedNote,
  selectedTask,
  selectedRoutine,
  selectedProject,
  selectedGoal,
  logicalDay,
  linkableGoals,
  linkableProjects,
  setPrimaryGoalMetric,
  removeGoalMetric,
  editGoalMetric,
  addGoalMetric,
  goalMetrics,
  updateEntity,
  triageNote,
  editTitle,
  editDescription,
  recoverEntity,
  discardEntity,
  permanentDelete,
  completeTask,
  postponeTask,
  close,
}: ManageModalProps) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-top">
          <h3>Manage {popupType}</h3>
          <button onClick={close}>Close</button>
        </div>

        {selectedNote && (
          <div className="actions">
            <button onClick={() => void triageNote(selectedNote, "task")}>To Task</button>
            <button onClick={() => void triageNote(selectedNote, "project")}>To Project</button>
            <button onClick={() => void triageNote(selectedNote, "goal")}>To Goal</button>
            <button onClick={() => void triageNote(selectedNote, "routine")}>To Routine</button>
            <button onClick={() => void editTitle("note", selectedNote.id, selectedNote.title)}>Edit Title</button>
            <button onClick={() => void editDescription("note", selectedNote.id, selectedNote.description)}>Edit Description</button>
            {selectedNote.status === "discarded" ? (
              <button onClick={() => void recoverEntity("note", selectedNote.id)}>Recover</button>
            ) : (
              <button onClick={() => void discardEntity("note", selectedNote.id)}>Discard</button>
            )}
            <button className="danger" onClick={() => void permanentDelete("note", selectedNote.id)}>
              Delete
            </button>
          </div>
        )}

        {selectedTask && (
          <div className="actions">
            <button onClick={() => void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, priority: Math.max(1, t.priority - 1) }))}>
              Bump Up
            </button>
            <button onClick={() => void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, priority: t.priority + 1 }))}>
              Bump Down
            </button>
            <button onClick={() => void completeTask(selectedTask.id)}>Done</button>
            <button onClick={() => void postponeTask(selectedTask.id)}>Postpone</button>
            <button
              onClick={() => {
                const due = window.prompt("Deadline YYYY-MM-DD", selectedTask.deadline ?? logicalDay);
                if (due) void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, deadline: due }));
              }}
            >
              Deadline
            </button>
            <label className="inline-select">
              Goal
              <select
                value={selectedTask.goalId ?? ""}
                onChange={(e) =>
                  void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, goalId: e.target.value || undefined }))
                }
              >
                <option value="">None</option>
                {linkableGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-select">
              Project
              <select
                value={selectedTask.projectId ?? ""}
                onChange={(e) =>
                  void updateEntity("task", selectedTask.id, (t: Task) => ({ ...t, projectId: e.target.value || undefined }))
                }
              >
                <option value="">None</option>
                {linkableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => void editTitle("task", selectedTask.id, selectedTask.title)}>Edit Title</button>
            <button onClick={() => void editDescription("task", selectedTask.id, selectedTask.description)}>Edit Description</button>
            {selectedTask.status === "discarded" ? (
              <button onClick={() => void recoverEntity("task", selectedTask.id)}>Recover</button>
            ) : (
              <button onClick={() => void discardEntity("task", selectedTask.id)}>Discard</button>
            )}
            <button className="danger" onClick={() => void permanentDelete("task", selectedTask.id)}>
              Delete
            </button>
          </div>
        )}

        {selectedRoutine && (
          <div className="actions">
            <label className="inline-select">
              Goal
              <select
                value={selectedRoutine.goalId ?? ""}
                onChange={(e) =>
                  void updateEntity("routine", selectedRoutine.id, (r: Routine) => ({ ...r, goalId: e.target.value || undefined }))
                }
              >
                <option value="">None</option>
                {linkableGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => void editTitle("routine", selectedRoutine.id, selectedRoutine.title)}>Edit Title</button>
            <button onClick={() => void editDescription("routine", selectedRoutine.id, selectedRoutine.description)}>
              Edit Description
            </button>
            {selectedRoutine.status === "discarded" ? (
              <button onClick={() => void recoverEntity("routine", selectedRoutine.id)}>Recover</button>
            ) : (
              <button onClick={() => void discardEntity("routine", selectedRoutine.id)}>Discard</button>
            )}
            <button className="danger" onClick={() => void permanentDelete("routine", selectedRoutine.id)}>
              Delete
            </button>
          </div>
        )}

        {selectedProject && (
          <div className="actions">
            <button onClick={() => void updateEntity("project", selectedProject.id, (p: Project) => ({ ...p, isActive: !p.isActive }))}>
              Toggle Active
            </button>
            <label className="inline-select">
              Goal
              <select
                value={selectedProject.goalId ?? ""}
                onChange={(e) =>
                  void updateEntity("project", selectedProject.id, (p: Project) => ({ ...p, goalId: e.target.value || undefined }))
                }
              >
                <option value="">None</option>
                {linkableGoals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => void editTitle("project", selectedProject.id, selectedProject.title)}>Edit Title</button>
            <button onClick={() => void editDescription("project", selectedProject.id, selectedProject.description)}>Edit Description</button>
            {selectedProject.status === "discarded" ? (
              <button onClick={() => void recoverEntity("project", selectedProject.id)}>Recover</button>
            ) : (
              <button onClick={() => void discardEntity("project", selectedProject.id)}>Discard</button>
            )}
            <button className="danger" onClick={() => void permanentDelete("project", selectedProject.id)}>
              Delete
            </button>
          </div>
        )}

        {selectedGoal && (
          <>
            <div className="actions">
              <button onClick={() => void addGoalMetric(selectedGoal)}>Add Metric</button>
              <button onClick={() => void editTitle("goal", selectedGoal.id, selectedGoal.title)}>Edit Title</button>
              <button onClick={() => void editDescription("goal", selectedGoal.id, selectedGoal.description)}>Edit Description</button>
              {selectedGoal.status === "discarded" ? (
                <button onClick={() => void recoverEntity("goal", selectedGoal.id)}>Recover</button>
              ) : (
                <button onClick={() => void discardEntity("goal", selectedGoal.id)}>Discard</button>
              )}
              <button className="danger" onClick={() => void permanentDelete("goal", selectedGoal.id)}>
                Delete
              </button>
            </div>
            <div className="cards">
              {goalMetrics(selectedGoal).map((metric: GoalMetric) => (
                <article key={metric.id} className="card">
                  <div className="title">{metric.name}</div>
                  <div className="tags">
                    {metric.current}/{metric.target}
                  </div>
                  <div className="actions">
                    <button
                      className={
                        selectedGoal.primaryMetricId === metric.id ||
                        (!selectedGoal.primaryMetricId && metric.id === goalMetrics(selectedGoal)[0].id)
                          ? "active"
                          : ""
                      }
                      onClick={() => void setPrimaryGoalMetric(selectedGoal, metric.id)}
                    >
                      Set Primary
                    </button>
                    <button onClick={() => void editGoalMetric(selectedGoal, metric)}>Edit</button>
                    <button className="danger" onClick={() => void removeGoalMetric(selectedGoal, metric.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
