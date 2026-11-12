export type EntityType = "note" | "task" | "project" | "goal" | "routine";

export type ItemStatus =
  | "inbox"
  | "reference"
  | "processed"
  | "open"
  | "doing"
  | "done"
  | "planned"
  | "active"
  | "paused"
  | "enabled"
  | "achieved"
  | "discarded";

export interface BaseEntity {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: ItemStatus;
}

export interface Note extends BaseEntity {
  triagedTo?: EntityType;
  triagedId?: string;
  triagePreviousStatus?: ItemStatus;
}

export interface Goal extends BaseEntity {
  metrics: GoalMetric[];
  primaryMetricId: string;
}

export interface GoalMetric {
  id: string;
  name: string;
  current: number;
  target: number;
}

export interface Project extends BaseEntity {
  goalId?: string;
  deadline?: string;
  /** Description remains the original newline TODO source; summary is prose. */
  summary: string;
  completedAt?: string;
}

export interface Task extends BaseEntity {
  goalId?: string;
  projectId?: string;
  deadline?: string;
  priority: number;
  postponedCount: number;
  lastPostponedAt?: string;
  scheduledFor?: string;
  legacyPriority?: number;
}

export interface Routine extends BaseEntity {
  goalId?: string;
}

export interface DailyCompletion {
  id: string;
  entityType: "task" | "routine";
  entityId: string;
  date: string;
  completedAt: string;
}

export interface WeeklyReview {
  id: string;
  weekKey: string;
  inboxCleared: boolean;
  tasksPrioritized: boolean;
  weekPlanned: boolean;
  goalsChecked: boolean;
  note: string;
  createdAt: string;
}

export interface EventLog {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId?: string;
  detail: string;
}

export interface AppSettings {
  id: "settings";
  dayOffset: number;
  dayStartHour: number;
  soundVolume: number;
  showStatus: boolean;
  theme: "light" | "wow";
  listDensity: "comfortable";
  focusTaskIds: string[];
  lastBackupAt?: string;
}

export interface AppStateData {
  notes: Note[];
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  routines: Routine[];
  completions: DailyCompletion[];
  reviews: WeeklyReview[];
  logs: EventLog[];
  settings: AppSettings;
}
