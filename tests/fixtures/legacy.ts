/** Representative v1 data, including keyless-store compatibility and historical edge cases. */
export function legacyFixture() {
  const at = "2026-10-01T12:00:00.000Z";
  const base = (id: string, status = "active") => ({
    id,
    title: id,
    description: "",
    status,
    createdAt: at,
    updatedAt: at,
  });
  return {
    notes: [
      {
        ...base("note-a", "in_progress"),
        title: "Saved message",
        description: "Line one\nLine two\n🙂",
      },
      { ...base("note-old", "completed"), triagedTo: "task" },
    ],
    tasks: [
      {
        ...base("task-a"),
        title: "Overdue task",
        priority: 9,
        postponedCount: 2,
        lastPostponedAt: "2026-10-10",
        deadline: "2026-10-11",
        projectId: "project-a",
        goalId: "goal-a",
      },
      { ...base("task-b", "in_progress"), priority: 1, postponedCount: 0 },
      { ...base("task-done", "completed"), priority: 2, postponedCount: 0 },
      {
        ...base("task-discarded", "discarded"),
        priority: 3,
        postponedCount: 0,
      },
    ],
    projects: [
      {
        ...base("project-a", "in_progress"),
        title: "Website project",
        description:
          "  Description-like legacy TODO  \n\n[ ] Write introduction\n[X] Research\n",
        goalId: "goal-a",
        isActive: true,
      },
      { ...base("project-paused"), isActive: false },
      { ...base("project-done", "completed"), isActive: true },
    ],
    goals: [
      {
        ...base("goal-a"),
        metrics: [
          { id: "metric-a", name: "Published pages", current: 2, target: 10 },
          { id: "metric-b", name: "Contacts", current: 1, target: 4 },
        ],
        primaryMetricId: "metric-a",
      },
    ],
    routines: [
      {
        ...base("routine-a", "in_progress"),
        title: "Read daily",
        goalId: "goal-a",
      },
      { ...base("routine-discarded", "discarded") },
    ],
    completions: [
      {
        id: "completion-a",
        entityType: "task",
        entityId: "task-done",
        date: "2026-10-11",
        completedAt: "2026-10-12T01:00:00.000Z",
      },
    ],
    reviews: [
      {
        id: "review-a",
        weekKey: "2026-W41",
        inboxCleared: true,
        tasksPrioritized: false,
        weekPlanned: true,
        goalsChecked: true,
        note: "Keep my reflection",
        createdAt: at,
      },
    ],
    logs: [
      {
        id: "log-a",
        action: "project-todo",
        entityType: "project",
        entityId: "project-a",
        at: "2026-10-11T12:00:00.000Z",
        detail: JSON.stringify({
          lineIndex: 1,
          checked: true,
          text: "Write introduction",
        }),
      },
      {
        id: "log-b",
        action: "goal-metric-update",
        entityType: "goal",
        entityId: "goal-a",
        at,
        detail: JSON.stringify({
          metricId: "metric-a",
          metricName: "Published pages",
          from: 1,
          to: 2,
          occurredDay: "2026-10-01",
        }),
      },
    ],
    settings: {
      id: "settings",
      dayOffset: 0,
      dayStartHour: 5,
      soundVolume: 0,
      showStatus: true,
      theme: "light",
    },
  };
}
