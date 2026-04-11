import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { BottomTabs } from "./components/BottomTabs";
import { EntityEditorModal } from "./components/EntityEditorModal";
import { FilterControl } from "./components/FilterControl";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";
import { MoreTab } from "./features/MoreTab";
import { NotesTab } from "./features/NotesTab";
import { ProjectsTab } from "./features/ProjectsTab";
import { SearchResultItem, SearchTab } from "./features/SearchTab";
import { TasksTab } from "./features/TasksTab";
import { TodayTab } from "./features/TodayTab";
import { FilterKey, formatDateTime, useAppData } from "./state/useAppData";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/features.css";

type EditorTarget = { mode: "create" | "edit"; type: "note" | "task" | "project" | "goal" | "routine"; id?: string } | null;

function getMatchRank(source: string, query: string, index: number): number {
  if (source === query) return 0;
  if (source.startsWith(query)) return 1;
  const prev = source[index - 1];
  if (prev && /[\s_\-.,/]/.test(prev)) return 2;
  return 3;
}

function buildSearchResults(app: ReturnType<typeof useAppData>, query: string): SearchResultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const rows = [
    ...app.state.notes.map((item) => ({ ...item, type: "note" as const })),
    ...app.state.tasks.map((item) => ({ ...item, type: "task" as const })),
    ...app.state.projects.map((item) => ({ ...item, type: "project" as const })),
    ...app.state.goals.map((item) => ({ ...item, type: "goal" as const })),
    ...app.state.routines.map((item) => ({ ...item, type: "routine" as const })),
  ];

  return rows
    .map((item) => {
      const title = item.title ?? "";
      const description = item.description ?? "";
      const titleLower = title.toLowerCase();
      const descLower = description.toLowerCase();
      const titleMatch = titleLower.indexOf(q);
      const descMatch = descLower.indexOf(q);
      if (titleMatch < 0 && descMatch < 0) return null;

      const matchedField: "title" | "description" = titleMatch >= 0 ? "title" : "description";
      const fieldRank = matchedField === "title" ? 0 : 1;
      const index = matchedField === "title" ? titleMatch : descMatch;
      const source = matchedField === "title" ? titleLower : descLower;

      return {
        id: item.id,
        type: item.type,
        title,
        description,
        matchedField,
        fieldRank,
        matchRank: getMatchRank(source, q, index),
        matchIndex: index,
        updatedAt: item.updatedAt,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      if (a.fieldRank !== b.fieldRank) return a.fieldRank - b.fieldRank;
      if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
      if (a.matchIndex !== b.matchIndex) return a.matchIndex - b.matchIndex;
      return b.updatedAt.localeCompare(a.updatedAt);
    })
    .map(({ fieldRank, matchRank, matchIndex, updatedAt, ...result }) => result);
}

function App() {
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isLogView, setIsLogView] = useState(() => typeof window !== "undefined" && window.location.hash === "#/logs");
  const app = useAppData();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedNote = editor?.type === "note" && editor.id ? app.state.notes.find((n) => n.id === editor.id) : undefined;
  const selectedTask = editor?.type === "task" && editor.id ? app.state.tasks.find((t) => t.id === editor.id) : undefined;
  const selectedProject =
    editor?.type === "project" && editor.id ? app.state.projects.find((p) => p.id === editor.id) : undefined;
  const selectedRoutine =
    editor?.type === "routine" && editor.id ? app.state.routines.find((r) => r.id === editor.id) : undefined;
  const selectedGoal = editor?.type === "goal" && editor.id ? app.state.goals.find((g) => g.id === editor.id) : undefined;
  const searchResults = useMemo(() => buildSearchResults(app, debouncedSearchQuery), [app, debouncedSearchQuery]);

  useEffect(() => {
    const handleHashChange = () => setIsLogView(window.location.hash === "#/logs");
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!isSearchMode) return;
    const timer = window.setTimeout(() => {
      if (!searchInputRef.current) return;
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isSearchMode]);

  useEffect(() => {
    if (!isSearchMode) {
      setDebouncedSearchQuery("");
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [isSearchMode, searchQuery]);

  useEffect(() => {
    if (!scrollTargetId || isSearchMode) return;

    let attempts = 0;
    let cancelled = false;

    const tryScroll = () => {
      if (cancelled) return;
      const target = document.getElementById(scrollTargetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setScrollTargetId(null);
        return;
      }

      attempts += 1;
      if (attempts < 12) {
        window.requestAnimationFrame(tryScroll);
      } else {
        setScrollTargetId(null);
      }
    };

    const timer = window.setTimeout(() => window.requestAnimationFrame(tryScroll), 45);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    scrollTargetId,
    isSearchMode,
    app.tab,
    app.moreTab,
    app.filteredNotes,
    app.filteredTasks,
    app.filteredProjects,
    app.filteredGoals,
    app.filteredRoutines,
  ]);

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
    if (isAddingNote) return;
    setIsAddingNote(true);
    try {
      await app.addNote();
    } finally {
      setIsAddingNote(false);
    }
  }

  function handleAddNotePointerDown(e: PointerEvent<HTMLButtonElement>): void {
    e.preventDefault();
    if (isAddingNote) return;
    e.currentTarget.form?.requestSubmit();
  }

  function handleOpenSearch(): void {
    app.setOpenFilterMenu(null);
    setSearchQuery("");
    setIsSearchMode(true);
  }

  function handleCloseSearch(): void {
    setIsSearchMode(false);
  }

  function handleSearchSelect(result: SearchResultItem): void {
    setIsSearchMode(false);
    setScrollTargetId(`item-${result.type}-${result.id}`);

    if (result.type === "note") {
      app.setTab("notes");
      app.setFilters((prev) => ({ ...prev, notes: "all" }));
      return;
    }
    if (result.type === "task") {
      app.setTab("tasks");
      app.setFilters((prev) => ({ ...prev, tasks: "all" }));
      return;
    }
    if (result.type === "project") {
      app.setTab("projects");
      app.setFilters((prev) => ({ ...prev, projects: "all" }));
      return;
    }
    if (result.type === "goal") {
      app.setTab("more");
      app.setMoreTab("goals");
      app.setFilters((prev) => ({ ...prev, goals: "all" }));
      return;
    }

    app.setTab("more");
    app.setMoreTab("routines");
    app.setFilters((prev) => ({ ...prev, routines: "all" }));
  }

  async function handleSaveTask(input: Parameters<typeof app.createTask>[0]): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity("task", editor.id, (t) => ({ ...t, ...input }));
      return;
    }
    await app.createTask(input);
  }

  async function handleSaveProject(input: Parameters<typeof app.createProject>[0]): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity("project", editor.id, (p) => ({ ...p, ...input }));
      return;
    }
    await app.createProject(input);
  }

  function handleOpenCompleteLog(): void {
    const url = new URL(window.location.href);
    url.hash = "/logs";
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  function handleCloseLogView(): void {
    window.close();
    window.location.hash = "";
  }

  async function handleSaveGoal(input: Parameters<typeof app.createGoal>[0]): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity("goal", editor.id, (g) => {
        const nextMetrics =
          input.metrics && input.metrics.length > 0
            ? input.metrics.map((metric) => ({
                id: metric.id || `metric_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                name: metric.name.trim() || "Metric",
                current: Number.isFinite(metric.current) ? metric.current : 0,
                target: Number.isFinite(metric.target) ? metric.target : 10,
              }))
            : [{ id: "legacy_primary", name: g.metricName, current: g.metricCurrent, target: g.metricTarget }];
        const primaryMetric = nextMetrics.find((metric) => metric.id === input.primaryMetricId) ?? nextMetrics[0];

        return {
          ...g,
          title: input.title,
          description: input.description ?? "",
          metrics: nextMetrics,
          primaryMetricId: primaryMetric.id,
          metricName: primaryMetric.name,
          metricCurrent: primaryMetric.current,
          metricTarget: primaryMetric.target,
        };
      });
      return;
    }
    await app.createGoal(input);
  }

  async function handleSaveRoutine(input: Parameters<typeof app.createRoutine>[0]): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity("routine", editor.id, (r) => ({ ...r, ...input }));
      return;
    }
    await app.createRoutine(input);
  }

  async function handleSaveNote(input: { title: string; description: string }): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity("note", editor.id, (n) => ({ ...n, title: input.title, description: input.description }));
    }
  }

  if (!app.loaded) return <div className="loading">Loading control deck...</div>;

  if (isLogView) {
    return (
      <div className="log-view-page">
        <section className="log-view-shell">
          <div className="card-top">
            <h2>Complete Log</h2>
            <button onClick={handleCloseLogView}>Close</button>
          </div>
          <div className="cards">
            {app.state.logs.map((log) => (
              <article key={log.id} className="card log">
                <div className="title">{log.action}</div>
                <div className="tags">
                  {log.at.slice(0, 19).replace("T", " ")} | {log.entityType} {log.entityId ?? ""}
                </div>
                <div>{log.detail}</div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`app ${app.tab === "notes" && !isSearchMode ? "notes-mode" : ""} ${app.tab === "notes" && app.isKeyboardVisible ? "keyboard-open" : ""} ${isSearchMode ? "search-mode" : ""}`}
    >
      {isSearchMode ? (
        <SearchTab
          query={searchQuery}
          results={searchResults}
          inputRef={searchInputRef}
          onQueryChange={setSearchQuery}
          onBack={handleCloseSearch}
          onSelect={handleSearchSelect}
        />
      ) : (
        <>
          <TopBar
            logicalDay={app.logicalDay}
            onOpenSearch={handleOpenSearch}
            onOpenSettings={() => app.setShowSettingsPopup(true)}
          />

          <main className="main">
            {app.tab === "notes" && (
              <section>
                <div className="section-head sticky-head">
                  <h2>Capture &amp; Triage</h2>
                  {renderFilterControl("notes")}
                </div>
                <NotesTab
                  filteredNotes={app.filteredNotes}
                  statusLabel={app.statusLabel}
                  formatDateTime={formatDateTime}
                  ensureVisibleItemId={scrollTargetId}
                  onManage={(note) => setEditor({ mode: "edit", type: "note", id: note.id })}
                />
              </section>
            )}

            {app.tab === "tasks" && (
              <section>
                <div className="section-head sticky-head">
                  <button onClick={() => setEditor({ mode: "create", type: "task" })}>+ Task</button>
                  {renderFilterControl("tasks")}
                </div>
                <TasksTab
                  filteredTasks={app.filteredTasks}
                  goals={app.state.goals}
                  projects={app.state.projects}
                  statusLabel={app.statusLabel}
                  formatDateTime={formatDateTime}
                  onManage={(task) => setEditor({ mode: "edit", type: "task", id: task.id })}
                />
              </section>
            )}

            {app.tab === "today" && (
              <TodayTab
                completedTodayCount={app.completedTodayCount}
                routinesTodayCount={app.routinesTodayCount}
                activeNoteCount={app.activeNoteCount}
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
                completions={app.state.completions}
                reviews={app.state.reviews}
                logs={app.state.logs}
                logicalDay={app.logicalDay}
                dayStartHour={app.dayStartHour}
                statusLabel={app.statusLabel}
                onCreateRoutine={() => setEditor({ mode: "create", type: "routine" })}
                onCreateGoal={() => setEditor({ mode: "create", type: "goal" })}
                primaryMetric={app.primaryMetric}
                saveWeeklyReview={app.saveWeeklyReview}
                toggleRoutineCompletionForDay={app.toggleRoutineCompletionForDay}
                renderFilterControl={renderFilterControl}
                formatDateTime={formatDateTime}
                onManageRoutine={(routine) => setEditor({ mode: "edit", type: "routine", id: routine.id })}
                onManageGoal={(goal) => setEditor({ mode: "edit", type: "goal", id: goal.id })}
              />
            )}

            {app.tab === "projects" && (
              <section>
                <div className="section-head sticky-head">
                  <button onClick={() => setEditor({ mode: "create", type: "project" })}>+ Project</button>
                  {renderFilterControl("projects")}
                </div>
                <ProjectsTab
                  filteredProjects={app.filteredProjects}
                  goals={app.state.goals}
                  statusLabel={app.statusLabel}
                  onToggleTodo={(projectId, lineIndex, checked) => {
                    void app.toggleProjectTodo(projectId, lineIndex, checked);
                  }}
                  formatDateTime={formatDateTime}
                  onManage={(project) => setEditor({ mode: "edit", type: "project", id: project.id })}
                />
              </section>
            )}
          </main>
        </>
      )}

      {app.tab === "notes" && !isSearchMode && (
        <form ref={app.noteComposerRef} onSubmit={handleAddNoteSubmit} className="notes-composer">
          <div className="row">
            <textarea
              ref={app.noteTextareaRef}
              value={app.noteInput}
              onChange={(e) => app.setNoteInput(e.target.value)}
              placeholder="Add a note..."
              rows={1}
            />
            <button type="button" onPointerDown={handleAddNotePointerDown} disabled={isAddingNote}>
              {isAddingNote ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {app.showSettingsPopup && (
        <SettingsModal
          showDebugTools={app.showDebugTools}
          setShowDebugTools={(next) => app.setShowDebugTools(next)}
          swVersion={app.swVersion}
          logicalDay={app.logicalDay}
          logicalOffset={app.logicalOffset}
          dayStartHour={app.dayStartHour}
          isCheckingUpdate={app.isCheckingUpdate}
          isApplyingUpdate={app.isApplyingUpdate}
          closeSettingsPopup={app.closeSettingsPopup}
          checkForUpdates={app.checkForUpdates}
          exportData={app.exportData}
          importData={app.importData}
          deleteAllData={app.deleteAllData}
          decrementLogicalDay={app.decrementLogicalDay}
          incrementLogicalDay={app.incrementLogicalDay}
          resetLogicalDayToToday={app.resetLogicalDayToToday}
          setLogicalDay={app.setLogicalDay}
          setDayStartHour={app.setDayStartHour}
          openCompleteLog={handleOpenCompleteLog}
        />
      )}

      {editor && (
        <EntityEditorModal
          mode={editor.mode}
          type={editor.type}
          entity={selectedNote ?? selectedTask ?? selectedProject ?? selectedGoal ?? selectedRoutine}
          goals={app.linkableGoals}
          projects={app.linkableProjects}
          onSaveNote={handleSaveNote}
          onSaveTask={handleSaveTask}
          onSaveProject={handleSaveProject}
          onSaveGoal={handleSaveGoal}
          onSaveRoutine={handleSaveRoutine}
          onTriageNote={app.triageNote}
          onDoneTask={app.completeTask}
          onPostponeTask={app.postponeTask}
          onSetStatus={(type, id, status) => app.updateEntity(type, id, (row) => ({ ...row, status }))}
          onDiscard={app.discardEntity}
          onRecover={app.recoverEntity}
          onDelete={app.permanentDelete}
          close={() => setEditor(null)}
        />
      )}

      {!isSearchMode && <BottomTabs tab={app.tab} setTab={app.setTab} />}
    </div>
  );
}

export default App;
