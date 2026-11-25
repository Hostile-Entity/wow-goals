import {
  FormEvent,
  PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { BottomTabs } from "./components/BottomTabs";
import { ConversionContext, ConversionNotice } from "./components/ConversionNotice";
import { EntityEditorModal } from "./components/EntityEditorModal";
import { FilterControl } from "./components/FilterControl";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";
import { ProjectDetailModal } from "./components/ProjectDetailModal";
import { GoalDetailModal } from "./components/GoalDetailModal";
import { EntityType, Note } from "./types";
import { MoreTab } from "./features/MoreTab";
import { NotesTab } from "./features/NotesTab";
import { ProjectsTab } from "./features/ProjectsTab";
import { SearchTab } from "./features/SearchTab";
import { buildSearchResults, SearchResultItem } from "./state/search";
import { TasksTab } from "./features/TasksTab";
import { TodayTab } from "./features/TodayTab";
import { FilterKey, useAppData } from "./state/useAppData";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/features.css";

type EditorTarget = {
  mode: "create" | "edit";
  type: EntityType;
  id?: string;
  detail?: boolean;
  returnToNote?: string;
} | null;

type ConversionResult = { type: Exclude<EntityType, "note">; id: string; noteId: string };

function App() {
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [lastConversion, setLastConversion] = useState<ConversionResult | null>(null);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isLogView, setIsLogView] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#/logs",
  );
  const app = useAppData(isLogView);
  function editNote(id: string) {
    setEditor({ mode: "edit", type: "note", id });
  }
  function closeEditor() {
    if (editor?.returnToNote) editNote(editor.returnToNote);
    else setEditor(null);
  }
  function advanceInbox(id: string) {
    const next = app.nextInboxNote(id);
    if (next) editNote(next.id);
    else setEditor(null);
  }
  function handleConverted(type: ConversionResult["type"], id: string, note: Note) {
    setLastConversion({ type, id, noteId: note.id });
    if (note.status === "inbox") advanceInbox(note.id);
    else setEditor({ mode: "edit", type, id, detail: type === "project" || type === "goal" });
  }
  const viewingResult = !!lastConversion && editor?.type === lastConversion.type && editor.id === lastConversion.id;
  const reviewing = app.tab === "more" && app.moreTab === "review";
  const conversion: ConversionContext | undefined = lastConversion ? {
    open: viewingResult ? undefined : () => setEditor({
      mode: "edit",
      type: lastConversion.type,
      id: lastConversion.id,
      detail: lastConversion.type === "project" || lastConversion.type === "goal",
      returnToNote: editor?.type === "note" ? editor.id : undefined,
    }),
    back: () => {
      setLastConversion(null);
      if (viewingResult) {
        setEditor(null);
        if (!reviewing) {
          app.setTab("notes");
          app.selectFilter("notes", "inbox");
        }
      }
    },
    backLabel: reviewing ? "Back to Review" : undefined,
    undo: async () => {
      await app.undoTriage(lastConversion.noteId);
      setLastConversion(null);
      if (viewingResult) {
        closeEditor();
        if (!reviewing) app.setTab("notes");
      }
    },
  } : undefined;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);
  function openEntity(type: EntityType, id: string) {
    setLastConversion(null);
    setEditor({
      mode: "edit",
      type,
      id,
      detail: type === "project" || type === "goal",
    });
  }

  const selectedNote =
    editor?.type === "note" && editor.id
      ? app.state.notes.find((n) => n.id === editor.id)
      : undefined;
  const selectedTask =
    editor?.type === "task" && editor.id
      ? app.state.tasks.find((t) => t.id === editor.id)
      : undefined;
  const selectedProject =
    editor?.type === "project" && editor.id
      ? app.state.projects.find((p) => p.id === editor.id)
      : undefined;
  const selectedRoutine =
    editor?.type === "routine" && editor.id
      ? app.state.routines.find((r) => r.id === editor.id)
      : undefined;
  const selectedGoal =
    editor?.type === "goal" && editor.id
      ? app.state.goals.find((g) => g.id === editor.id)
      : undefined;
  const selectedEntity =
    selectedNote ??
    selectedTask ??
    selectedProject ??
    selectedGoal ??
    selectedRoutine;
  useEffect(() => {
    if (editor?.mode === "edit" && app.loaded && !selectedEntity)
      closeEditor();
  }, [selectedEntity, editor, app.loaded]);
  const { notes, tasks, projects, goals, routines } = app.state;
  const searchResults = useMemo(
    () => buildSearchResults({ notes, tasks, projects, goals, routines }, debouncedSearchQuery),
    [notes, tasks, projects, goals, routines, debouncedSearchQuery],
  );
  const logRowVirtualizer = useVirtualizer({
    count: app.state.logs.length,
    getScrollElement: () => logScrollRef.current,
    getItemKey: (index) => app.state.logs[index]?.id ?? index,
    estimateSize: () => 96,
    overscan: 8,
  });
  const logVirtualItems = logRowVirtualizer.getVirtualItems();

  useEffect(() => {
    const handleHashChange = () =>
      setIsLogView(window.location.hash === "#/logs");
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

    const timer = window.setTimeout(
      () => window.requestAnimationFrame(tryScroll),
      45,
    );
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
        onToggle={() =>
          app.setOpenFilterMenu((prev) => (prev === key ? null : key))
        }
        onSelect={(option) => {
          app.selectFilter(key, option);
          app.setOpenFilterMenu(null);
        }}
      />
    );
  }

  async function handleAddNoteSubmit(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    if (isAddingNote) return;
    setIsAddingNote(true);
    try {
      await app.addNote();
    } catch {
      /* The state hook displays a retryable error and retains the draft. */
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
      app.revealFilter("notes");
      return;
    }
    if (result.type === "task") {
      app.setTab("tasks");
      app.revealFilter("tasks");
      return;
    }
    if (result.type === "project") {
      app.setTab("projects");
      app.revealFilter("projects");
      return;
    }
    if (result.type === "goal") {
      app.setTab("more");
      app.setMoreTab("goals");
      app.revealFilter("goals");
      return;
    }

    app.setTab("more");
    app.setMoreTab("routines");
    app.revealFilter("routines");
  }

  async function handleSaveTask(
    input: Parameters<typeof app.createTask>[0],
    revision?: string,
  ): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity(
        "task",
        editor.id,
        (t) => ({ ...t, ...input }),
        revision,
      );
      return;
    }
    await app.createTask(input);
  }

  async function handleSaveProject(
    input: Parameters<typeof app.createProject>[0],
    revision?: string,
  ): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity(
        "project",
        editor.id,
        (p) => ({ ...p, ...input }),
        revision,
      );
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

  async function handleSaveGoal(
    input: Parameters<typeof app.createGoal>[0],
    revision?: string,
  ): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity(
        "goal",
        editor.id,
        (g) => {
          const nextMetrics =
            input.metrics && input.metrics.length > 0
              ? input.metrics.map((metric) => ({
                  id:
                    metric.id ||
                    `metric_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                  name: metric.name.trim() || "Metric",
                  current: Number.isFinite(metric.current) ? metric.current : 0,
                  target: Number.isFinite(metric.target) ? metric.target : 10,
                }))
              : [
                  {
                    id: "metric_default",
                    name: "Progress",
                    current: 0,
                    target: 10,
                  },
                ];
          const primaryMetric =
            nextMetrics.find((metric) => metric.id === input.primaryMetricId) ??
            nextMetrics[0];

          return {
            ...g,
            title: input.title,
            description: input.description ?? "",
            metrics: nextMetrics,
            primaryMetricId: primaryMetric.id,
          };
        },
        revision,
      );
      return;
    }
    await app.createGoal(input);
  }

  async function handleSaveRoutine(
    input: Parameters<typeof app.createRoutine>[0],
    revision?: string,
  ): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity(
        "routine",
        editor.id,
        (r) => ({ ...r, ...input }),
        revision,
      );
      return;
    }
    await app.createRoutine(input);
  }

  async function handleSaveNote(
    input: { title: string; description: string },
    revision?: string,
  ): Promise<void> {
    if (editor?.mode === "edit" && editor.id) {
      await app.updateEntity(
        "note",
        editor.id,
        (n) => ({ ...n, title: input.title, description: input.description }),
        revision,
      );
    }
  }

  if (!app.loaded)
    return (
      <div className="loading" aria-busy={!app.error} aria-label="Opening WowGoals">
        {app.error && (
          <section role="alert">
            <p>{app.error}</p>
            <p>
              Your local data has not been reset. Close other app windows if
              the upgrade is blocked.
            </p>
            <button onClick={() => void app.reloadAll()}>
              Retry opening data
            </button>
          </section>
        )}
      </div>
    );

  if (isLogView) {
    return (
      <div className="log-view-page">
        <section className="log-view-shell">
          <div className="card-top">
            <h2>Complete Log</h2>
            <button onClick={handleCloseLogView}>Close</button>
          </div>
          <div className="log-view-list cards" ref={logScrollRef}>
            {!app.logsReady && <p className="meta" role="status">{app.error || "Loading history…"}</p>}
            <div
              style={{
                height: logRowVirtualizer.getTotalSize(),
                position: "relative",
              }}
            >
              {logVirtualItems.map((virtualRow) => {
                const log = app.state.logs[virtualRow.index];
                if (!log) return null;
                return (
                  <div
                    key={virtualRow.key}
                    ref={logRowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="log-virtual-row"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <article className="card log">
                      <div className="title">{log.action}</div>
                      <div className="tags">
                        {log.at.slice(0, 19).replace("T", " ")} |{" "}
                        {log.entityType} {log.entityId ?? ""}
                      </div>
                      <div>{log.detail}</div>
                    </article>
                  </div>
                );
              })}
            </div>
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
            {app.error && (
              <div className="action-error" role="alert">
                {app.error}
                <button onClick={() => app.setError("")}>Dismiss</button>
              </div>
            )}
            {!editor && <ConversionNotice context={conversion} />}
            {app.tab === "notes" && (
              <section>
                <div className="section-head sticky-head">
                  <h2>Capture &amp; Triage</h2>
                  {renderFilterControl("notes")}
                </div>
                <NotesTab
                  filteredNotes={app.filteredNotes}
                  showStatus={app.showStatus}
                  statusLabel={app.statusLabel}
                  ensureVisibleItemId={scrollTargetId}
                  onManage={(note) => editNote(note.id)}
                />
              </section>
            )}

            {app.tab === "tasks" && (
              <section>
                <div className="section-head sticky-head">
                  <button
                    onClick={() => setEditor({ mode: "create", type: "task" })}
                  >
                    + Task
                  </button>
                  {renderFilterControl("tasks")}
                </div>
                <TasksTab
                  filteredTasks={app.filteredTasks}
                  goals={app.state.goals}
                  projects={app.state.projects}
                  logicalDay={app.logicalDay}
                  showStatus={app.showStatus}
                  statusLabel={app.statusLabel}
                  onManage={(task) =>
                    setEditor({ mode: "edit", type: "task", id: task.id })
                  }
                  onComplete={app.completeTask}
                />
              </section>
            )}

            {app.tab === "today" && (
              <TodayTab app={app} openTask={(id) => openEntity("task", id)} />
            )}

            {app.tab === "more" && (
              <MoreTab
                activeNoteCount={app.activeNoteCount}
                onReviewInbox={() => {
                  const next = app.nextInboxNote();
                  if (next) editNote(next.id);
                }}
                activeProjects={app.activeProjects}
                nextProjectTasks={app.nextProjectTasks}
                onOpen={openEntity}
                moreTab={app.moreTab}
                setMoreTab={app.setMoreTab}
                filteredRoutines={app.filteredRoutines}
                filteredGoals={app.filteredGoals}
                showStatus={app.showStatus}
                goals={app.state.goals}
                projects={app.state.projects}
                tasks={app.state.tasks}
                routines={app.state.routines}
                completions={app.state.completions}
                reviews={app.state.reviews}
                reviewReady={app.reviewReady}
                logs={app.state.logs}
                logicalDay={app.logicalDay}
                dayStartHour={app.dayStartHour}
                statusLabel={app.statusLabel}
                onCreateRoutine={() =>
                  setEditor({ mode: "create", type: "routine" })
                }
                onCreateGoal={() => setEditor({ mode: "create", type: "goal" })}
                primaryMetric={app.primaryMetric}
                weeklyReviewDrafts={app.weeklyReviewDrafts}
                toggleRoutineCompletionForDay={
                  app.toggleRoutineCompletionForDay
                }
                renderFilterControl={renderFilterControl}
                onManageRoutine={(routine) =>
                  setEditor({ mode: "edit", type: "routine", id: routine.id })
                }
                onManageGoal={(goal) => openEntity("goal", goal.id)}
              />
            )}

            {app.tab === "projects" && (
              <section>
                <div className="section-head sticky-head">
                  <button
                    onClick={() =>
                      setEditor({ mode: "create", type: "project" })
                    }
                  >
                    + Project
                  </button>
                  {renderFilterControl("projects")}
                </div>
                <ProjectsTab
                  filteredProjects={app.filteredProjects}
                  goals={app.state.goals}
                  logicalDay={app.logicalDay}
                  showStatus={app.showStatus}
                  statusLabel={app.statusLabel}
                  nextProjectTasks={app.nextProjectTasks}
                  onOpenTask={(id) => openEntity("task", id)}
                  onManage={(project) => openEntity("project", project.id)}
                />
              </section>
            )}
          </main>
        </>
      )}

      {app.tab === "notes" && !isSearchMode && (
        <form
          ref={app.noteComposerRef}
          onSubmit={handleAddNoteSubmit}
          className="notes-composer"
        >
          <div className="row">
            <textarea
              ref={app.noteTextareaRef}
              value={app.noteInput}
              onChange={(e) => app.setNoteInput(e.target.value)}
              placeholder="Add a note..."
              aria-label="Add a note..."
              rows={1}
            />
            <button
              className="button-primary add-note-btn"
              type="button"
              onPointerDown={handleAddNotePointerDown}
              onClick={(event) => {
                if (event.detail === 0 && !isAddingNote)
                  event.currentTarget.form?.requestSubmit();
              }}
              disabled={isAddingNote}
            >
              {isAddingNote ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {app.showSettingsPopup && (
        <SettingsModal
          lastBackupAt={app.settings.lastBackupAt}
          backupDue={app.backupDue}
          exportSafetySnapshot={app.exportSafetySnapshot}
          showDebugTools={app.showDebugTools}
          setShowDebugTools={(next) => app.setShowDebugTools(next)}
          swVersion={app.swVersion}
          logicalDay={app.logicalDay}
          logicalOffset={app.logicalOffset}
          dayStartHour={app.dayStartHour}
          soundVolume={app.soundVolume}
          showStatus={app.showStatus}
          theme={app.theme}
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
          setSoundVolume={app.setSoundVolume}
          setShowStatus={app.setShowStatus}
          setTheme={app.setTheme}
          openCompleteLog={handleOpenCompleteLog}
        />
      )}

      {editor?.detail && selectedProject && (
        <ProjectDetailModal
          key={selectedProject.id}
          project={selectedProject}
          app={app}
          close={closeEditor}
          conversion={viewingResult ? conversion : undefined}
          edit={() => setEditor({ ...editor, detail: false })}
          openTask={(id) => openEntity("task", id)}
        />
      )}
      {editor?.detail && selectedGoal && (
        <GoalDetailModal
          key={selectedGoal.id}
          goal={selectedGoal}
          app={app}
          close={closeEditor}
          conversion={viewingResult ? conversion : undefined}
          edit={() => setEditor({ ...editor, detail: false })}
          open={openEntity}
        />
      )}
      {editor && !editor.detail && (
        <EntityEditorModal
          key={`${editor.mode}-${editor.type}-${editor.id ?? "new"}`}
          app={app}
          onOpen={openEntity}
          conversion={viewingResult || (selectedNote && !selectedNote.triagedTo) ? conversion : undefined}
          onConverted={handleConverted}
          onInboxResolved={advanceInbox}
          onCreateSeparateTask={(id) => setEditor({ mode: "create", type: "task", returnToNote: id })}
          mode={editor.mode}
          type={editor.type}
          entity={
            selectedNote ??
            selectedTask ??
            selectedProject ??
            selectedGoal ??
            selectedRoutine
          }
          goals={app.linkableGoals}
          projects={app.linkableProjects}
          onSaveNote={handleSaveNote}
          onSaveTask={handleSaveTask}
          onSaveProject={handleSaveProject}
          onSaveGoal={handleSaveGoal}
          onSaveRoutine={handleSaveRoutine}
          close={closeEditor}
        />
      )}

      {!isSearchMode && <BottomTabs tab={app.tab} setTab={(next) => {
        if (next !== app.tab) setLastConversion(null);
        app.setTab(next);
      }} />}
    </div>
  );
}

export default App;
