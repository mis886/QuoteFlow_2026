// Shapes returned by the FMS edge function (copied from its services).
import type { WorkSettings } from './engine';
import type { Score } from './scoring';
export type { WorkSettings, Score };

export type Role = 'admin' | 'manager' | 'doer';

/** The signed-in person, as seen by the services. */
export interface Actor {
  id: string;
  name: string;
  empCode: string;
  role: Role;
  isCoordinator: boolean;
  canCreateWorkflows: boolean;
}

export type TaskSource = 'workflow' | 'delegated' | 'recurring' | 'personal';
export type TaskStatus = 'waiting' | 'open' | 'done' | 'cancelled';

export interface UserRow {
  id: string;
  empCode: string;
  name: string;
  email: string | null;
  role: Role;
  isCoordinator: boolean;
  canCreateWorkflows: boolean;
  managerId: string | null;
  managerName: string | null;
  active: boolean;
  mustChangePin: boolean;
  lockedUntil: number | null;
  lastLoginAt: number | null;
}

export interface AppSettings {
  work: WorkSettings;
  misGreenLimit: number;
  misAmberLimit: number;
}

export interface Holiday {
  day: string;
  name: string;
}

export interface TaskRow {
  id: string;
  source: TaskSource;
  title: string;
  instructions: string | null;
  status: TaskStatus;
  ownerId: string;
  ownerName: string;
  assignedByName: string | null;
  countsInMis: boolean;
  tatMinutes: number | null;
  releasedAt: number | null;
  dueAt: number | null;
  completedAt: number | null;
  remarks: string | null;
  instanceId: string | null;
  instanceRef: string | null;
  workflowName: string | null;
  seq: number | null;
  totalSteps: number | null;
  /** for waiting workflow tasks: the step it is waiting on */
  prevTitle: string | null;
  prevOwnerName: string | null;
  prevDueAt: number | null;
  prevStatus: TaskStatus | null;
}

export interface CompleteResult {
  alreadyDone: boolean;
  releasedNext: { taskId: string; ownerName: string; dueAt: number } | null;
  instanceFinished: boolean;
}

export interface RecurringRow {
  id: string;
  title: string;
  instructions: string | null;
  ownerId: string;
  ownerName: string;
  weekdays: number[];
  dueMinute: number;
  active: boolean;
}

export type StartAccess = 'admin' | 'anyone' | 'selected';

export interface StepInput {
  what: string;
  how: string;
  /** working minutes allowed */
  tatMinutes: number;
  ownerId: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived';
  startAccess: StartAccess;
  createdBy: string | null;
  createdByName: string | null;
  stepCount: number;
  totalTatMinutes: number;
  runningCount: number;
  canEdit: boolean;
  canStart: boolean;
}

export interface WorkflowStep {
  id: string;
  position: number;
  what: string;
  how: string | null;
  tatMinutes: number;
  ownerId: string;
  ownerName: string;
  ownerActive: boolean;
}

export interface WorkflowDetail extends WorkflowSummary {
  steps: WorkflowStep[];
  starterIds: string[];
}

export interface InstanceStep {
  taskId: string;
  seq: number;
  title: string;
  instructions: string | null;
  ownerId: string;
  ownerName: string;
  status: 'waiting' | 'open' | 'done' | 'cancelled';
  tatMinutes: number | null;
  releasedAt: number | null;
  dueAt: number | null;
  completedAt: number | null;
  remarks: string | null;
}

export interface InstanceDetail {
  id: string;
  workflowId: string | null;
  workflowName: string;
  reference: string;
  status: 'running' | 'completed' | 'cancelled';
  startedBy: string | null;
  startedByName: string | null;
  startedAt: number;
  completedAt: number | null;
  cancelledReason: string | null;
  steps: InstanceStep[];
}

export interface InstanceListRow {
  id: string;
  workflowName: string;
  reference: string;
  status: 'running' | 'completed' | 'cancelled';
  startedByName: string | null;
  startedAt: number;
  totalSteps: number;
  doneSteps: number;
  currentTitle: string | null;
  currentOwner: string | null;
  currentDueAt: number | null;
}

export interface WeekPoint {
  weekStart: number;
  weekEnd: number;
  score: Score;
}

export type ScoredBucket = 'on_time' | 'late' | 'not_done';

export interface ScoredTask extends TaskRow {
  bucket: ScoredBucket;
  /** working minutes late (for late / not done) */
  lateMinutes: number;
}

export interface Dashboard {
  settings: AppSettings;
  tasks: TaskRow[];
  counts: { dueToday: number; overdue: number; upcoming: number; waiting: number; doneThisWeek: number };
  week: Score;
  lastWeek: Score;
  history: WeekPoint[];
}

export interface TeamRow {
  userId: string;
  name: string;
  empCode: string;
  role: string;
  managerName: string | null;
  week: Score;
  lastWeek: Score;
  open: number;
  overdue: number;
}

export interface LateRow extends TaskRow {
  lateMinutes: number;
  downstreamWaiting: number;
}

export interface BlockedRow extends TaskRow {
  blockerTitle: string;
  blockerOwner: string;
  blockerDueAt: number;
  blockerLateMinutes: number;
}

export interface CoordinatorBoard {
  settings: AppSettings;
  overdue: LateRow[];
  lateDone: LateRow[];
  blocked: BlockedRow[];
  byWorkflow: Array<{ name: string; overdue: number; lateDone: number; blocked: number }>;
  byOwner: Array<{ name: string; overdue: number; lateDone: number }>;
  runningRuns: number;
  truncated: boolean;
}

export interface Person {
  id: string;
  name: string;
  empCode: string;
}
