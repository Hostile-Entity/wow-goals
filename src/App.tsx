import { FormEvent, useState } from "react";
import { BottomTabs } from "./components/BottomTabs";
import { FilterControl } from "./components/FilterControl";
import { ManageModal } from "./components/ManageModal";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";
import { MoreTab } from "./features/MoreTab";
import { NotesTab } from "./features/NotesTab";
import { ProjectsTab } from "./features/ProjectsTab";
import { TasksTab } from "./features/TasksTab";
import { TodayTab } from "./features/TodayTab";
import { FilterKey, formatDateTime, useAppData } from "./state/useAppData";
import { EntityType } from "./types";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/features.css";

type PopupTarget = { type: EntityType; id: string } | null;

function App() {
  const [popup, setPopup] = useState<PopupTarget>(null);
  const app = useAppData();

  const selectedNote = popup?.type === "note" ? app.state.notes.find((n) => n.id === popup.id) : undefined;
  const selectedTask = popup?.type === "task" ? app.state.tasks.find((t) => t.id === popup.id) : undefined;
  const selectedProject = popup?.type === "project" ? app.state.projects.find((p) => p.id === popup.id) : undefined;
  const selectedRoutine = popup?.type === "routine" ? app.state.routines.find((r) => r.id === popup.id) : undefined;
  const selectedGoal = popup?.type === "goal" ? app.state.goals.find((g) => g.id === popup.id) : undefined;

  function renderFilterControl(key: FilterKey) {
    return (
      <FilterControl
        filterKey={key}
        current={app.filters[key]}
        isOpen={app.openFilterMenu === key}
        onToggle={() => app.setOpenFilterMenu((prev) => (prev === key ? null : key))}
        onSelect={(option) => {
          app.setFilters((prev) => ({ ...prev, [key]: option }));
          app.setOpenFilterMenu(null);
        }}
      />
    );
  }

  async function handleAddNoteSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await app.addNote();
  }

  if (!app.loaded) return <div className="loading">Loading control deck...</div>;

  return (
    <div className={`app ${app.tab === "notes" ? "notes-mode" : ""} ${app.tab === "notes" && app.isKeyboardVisible ? "keyboard-open" : ""}`}>
      <TopBar logicalDay={app.logicalDay} onOpenSettings={() => app.setShowSettingsPopup(true)} />

      <main className="main">
        {app.tab === "notes" && (
          <section>
            <div className="section-head">
              <h2>Capture &amp; Triage</h2>
              {renderFilterControl("notes")}
            </div>
            <NotesTab
              filteredNotes={app.filteredNotes}
              statusLabel={app.statusLabel}
              formatDateTime={formatDateTime}
              onManage={(note) => setPopup({ type: "note", id: note.id })}
            />
          </section>
        )}

        {app.tab === "tasks" && (
          <section>
            <div className="section-head">
              <h2>Prioritized Tasks</h2>
              {renderFilterControl("tasks")}
            </div>
            <div className="actions">
              <button onClick={() => void app.addQuickTask()}>+ Task</button>
            </div>
            <TasksTab
              filteredTasks={app.filteredTasks}
              goals={app.state.goals}
              projects={app.state.projects}
              statusLabel={app.statusLabel}
              formatDateTime={formatDateTime}
              onManage={(task) => setPopup({ type: "task", id: task.id })}
            />
          </section>
        )}

        {app.tab === "today" && (
          <TodayTab
            completedTodayCount={app.completedTodayCount}
            routinesTodayCount={app.routinesTodayCount}
            activeNoteCount={app.state.notes.filter((n) => n.status === "active").length}
            todayTop3={app.todayTop3}
            routines={app.state.routines}
            completions={app.state.completions}
            logicalDay={app.logicalDay}
            completeTask={app.completeTask}
            postponeTask={app.postponeTask}
            completeRoutine={app.completeRoutine}
          />
        )}

        {app.tab === "more" && (
          <MoreTab
            moreTab={app.moreTab}
            setMoreTab={app.setMoreTab}
            filteredRoutines={app.filteredRoutines}
            filteredGoals={app.filteredGoals}
            goals={app.state.goals}
            projects={app.state.projects}
            tasks={app.state.tasks}
            routines={app.state.routines}
            reviews={app.state.reviews}
            logs={app.state.logs}
            statusLabel={app.statusLabel}
            addQuickRoutine={app.addQuickRoutine}
            addQuickGoal={app.addQuickGoal}
            primaryMetric={app.primaryMetric}
            saveWeeklyReview={app.saveWeeklyReview}
            renderFilterControl={renderFilterControl}
            formatDateTime={formatDateTime}
            onManageRoutine={(routine) => setPopup({ type: "routine", id: routine.id })}
            onManageGoal={(goal) => setPopup({ type: "goal", id: goal.id })}
          />
        )}

        {app.tab === "projects" && (
          <section>
            <div className="section-head">
              <h2>Projects</h2>
              {renderFilterControl("projects")}
            </div>
            <div className="actions">
              <button onClick={() => void app.addQuickProject()}>+ Project</button>
            </div>
            <ProjectsTab
              filteredProjects={app.filteredProjects}
              goals={app.state.goals}
              statusLabel={app.statusLabel}
              formatDateTime={formatDateTime}
              onManage={(project) => setPopup({ type: "project", id: project.id })}
            />
          </section>
        )}
      </main>

      {app.tab === "notes" && (
        <form ref={app.noteComposerRef} onSubmit={handleAddNoteSubmit} className="notes-composer">
          <div className="row">
            <textarea
              ref={app.noteTextareaRef}
              value={app.noteInput}
              onChange={(e) => app.setNoteInput(e.target.value)}
              placeholder="Add a note..."
              rows={1}
            />
            <button type="submit">Add</button>
          </div>
        </form>
      )}

      {app.showSettingsPopup && (
        <SettingsModal
          showDebugTools={app.showDebugTools}
          setShowDebugTools={(next) => app.setShowDebugTools(next)}
          swVersion={app.swVersion}
          logicalDay={app.logicalDay}
          isCheckingUpdate={app.isCheckingUpdate}
          isApplyingUpdate={app.isApplyingUpdate}
          closeSettingsPopup={app.closeSettingsPopup}
          checkForUpdates={app.checkForUpdates}
          decrementLogicalDay={app.decrementLogicalDay}
          incrementLogicalDay={app.incrementLogicalDay}
          resetLogicalDayToToday={app.resetLogicalDayToToday}
          setLogicalDay={app.setLogicalDay}
        />
      )}

      {popup && (
        <ManageModal
          popupType={popup.type}
          selectedNote={selectedNote}
          selectedTask={selectedTask}
          selectedRoutine={selectedRoutine}
          selectedProject={selectedProject}
          selectedGoal={selectedGoal}
          logicalDay={app.logicalDay}
          linkableGoals={app.linkableGoals}
          linkableProjects={app.linkableProjects}
          setPrimaryGoalMetric={app.setPrimaryGoalMetric}
          removeGoalMetric={app.removeGoalMetric}
          editGoalMetric={app.editGoalMetric}
          addGoalMetric={app.addGoalMetric}
          addQuickRoutine={app.addQuickRoutine}
          goalMetrics={app.goalMetrics}
          updateEntity={app.updateEntity}
          triageNote={app.triageNote}
          editTitle={app.editTitle}
          editDescription={app.editDescription}
          recoverEntity={app.recoverEntity}
          discardEntity={app.discardEntity}
          permanentDelete={app.permanentDelete}
          completeTask={app.completeTask}
          postponeTask={app.postponeTask}
          close={() => setPopup(null)}
        />
      )}

      <BottomTabs tab={app.tab} setTab={app.setTab} />
    </div>
  );
}

export default App;
