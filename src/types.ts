export type EntityType = "note" | "task" | "project" | "goal" | "routine";

export type ItemStatus = "active" | "in_progress" | "completed" | "discarded";

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
}

export interface Goal extends BaseEntity {
  metricName: string;
  metricCurrent: number;
  metricTarget: number;
  metrics?: GoalMetric[];
  primaryMetricId?: string;
  isActive: boolean;
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
  importance: number;
  isActive: boolean;
}

export interface Task extends BaseEntity {
  goalId?: string;
  projectId?: string;
  deadline?: string;
  priority: number;
  postponedCount: number;
  lastPostponedAt?: string;
}

export interface Routine extends BaseEntity {
  goalId?: string;
  cadence: "daily";
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
