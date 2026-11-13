// Form actions for the FMS screens. Same (prevState, FormData) shape as the
// original Next.js server actions, so the forms are unchanged; each one calls
// the "fms" edge function, then refreshes the open pages or navigates.
import { fms, FmsError, refreshFms } from './api';
import type { ActionState } from './action-types';
import { fmtDateTime } from './format';
import { parseHHMM } from './engine';
import type { CompleteResult } from './types';

export type { ActionState };

let navigateFn: ((to: string) => void) | null = null;
/** Set by the FMS layout so actions can move to another page after saving. */
export function setFmsNavigate(fn: ((to: string) => void) | null) {
  navigateFn = fn;
}
const go = (to: string) => navigateFn?.(to);

const str = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === 'string' ? v : '';
};
const strs = (fd: FormData, k: string): string[] => fd.getAll(k).filter((v): v is string => typeof v === 'string');
const bool = (fd: FormData, k: string): boolean => fd.get(k) === 'on' || fd.get(k) === 'true' || fd.get(k) === '1';

async function safe(fn: () => Promise<Omit<ActionState, 'ok'> | void>): Promise<ActionState> {
  try {
    const r = await fn();
    return { ok: true, ...(r ?? {}), n: Date.now() };
  } catch (e) {
    if (e instanceof FmsError) return { ok: false, error: e.message, n: Date.now() };
    console.error('[fms action]', e);
    return { ok: false, error: 'Something went wrong. Please try again, and tell your admin if it keeps happening.', n: Date.now() };
  }
}

// ------------------------------------------------------------------- tasks
export async function completeTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const r = await fms<CompleteResult>('task.complete', { taskId: str(fd, 'taskId'), remarks: str(fd, 'remarks') });
    refreshFms();
    if (r.alreadyDone) return { message: 'This task was already marked done.' };
    if (r.releasedNext) return { message: `Done. Next step released to ${r.releasedNext.ownerName}, due ${fmtDateTime(r.releasedNext.dueAt)}.` };
    if (r.instanceFinished) return { message: 'Done. That was the last step, so the workflow run is complete.' };
    return { message: 'Marked done.' };
  });
}

export async function createTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('task.create', {
      kind: str(fd, 'kind'),
      title: str(fd, 'title'),
      instructions: str(fd, 'instructions'),
      dueDate: str(fd, 'dueDate'),
      dueTime: str(fd, 'dueTime'),
      ownerId: str(fd, 'ownerId') || undefined,
    });
    refreshFms();
    go('/fms');
  });
}

export async function reassignTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('task.reassign', { taskId: str(fd, 'taskId'), ownerId: str(fd, 'ownerId') });
    refreshFms();
    return { message: 'Task reassigned.' };
  });
}

// --------------------------------------------------------------- workflows
export async function saveWorkflowAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    let steps: unknown;
    try {
      steps = JSON.parse(str(fd, 'steps'));
    } catch {
      throw new FmsError('Could not read the steps. Reload the page and try again.');
    }
    const r = await fms<{ id: string }>('workflow.save', {
      id: str(fd, 'id') || null,
      name: str(fd, 'name'),
      description: str(fd, 'description'),
      steps,
      startAccess: str(fd, 'startAccess') || undefined,
      starterIds: strs(fd, 'starterIds'),
    });
    refreshFms();
    go(`/fms/workflows/${r.id}`);
  });
}

export async function startInstanceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const r = await fms<{ id: string }>('workflow.start', { workflowId: str(fd, 'workflowId'), reference: str(fd, 'reference') });
    refreshFms();
    go(`/fms/runs/${r.id}`);
  });
}

export async function cancelInstanceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('run.cancel', { instanceId: str(fd, 'instanceId'), reason: str(fd, 'reason') });
    refreshFms();
    return { message: 'Run cancelled. Its open and upcoming steps no longer count.' };
  });
}

export async function archiveWorkflowAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const archive = str(fd, 'archive') === '1';
    await fms('workflow.archive', { workflowId: str(fd, 'workflowId'), archive });
    refreshFms();
    return { message: archive ? 'Workflow archived. Runs already started continue.' : 'Workflow restored.' };
  });
}

export async function setStartAccessAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('workflow.access', { workflowId: str(fd, 'workflowId'), startAccess: str(fd, 'startAccess'), starterIds: strs(fd, 'starterIds') });
    refreshFms();
    return { message: 'Who can start this workflow has been updated.' };
  });
}

// --------------------------------------------------------------- recurring
export async function saveRecurringAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const due = parseHHMM(str(fd, 'dueTime'));
    if (due === null) throw new FmsError('Enter a valid due time.');
    const id = str(fd, 'id') || null;
    await fms('recurring.save', {
      id,
      title: str(fd, 'title'),
      instructions: str(fd, 'instructions'),
      ownerId: str(fd, 'ownerId'),
      weekdays: strs(fd, 'weekdays').map(Number),
      dueMinute: due,
    });
    refreshFms();
    go('/fms/recurring');
    return { message: id ? 'Recurring task saved.' : 'Recurring task added.' };
  });
}

export async function toggleRecurringAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('recurring.toggle', { id: str(fd, 'id'), active: bool(fd, 'active') });
    refreshFms();
    return { message: bool(fd, 'active') ? 'Recurring task resumed.' : 'Recurring task paused.' };
  });
}

// ------------------------------------------------------------------ people
function userFields(fd: FormData) {
  return {
    empCode: str(fd, 'empCode'),
    name: str(fd, 'name'),
    email: str(fd, 'email'),
    role: str(fd, 'role'),
    isCoordinator: bool(fd, 'isCoordinator'),
    canCreateWorkflows: bool(fd, 'canCreateWorkflows'),
    managerId: str(fd, 'managerId') || null,
  };
}

export async function createUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const r = await fms<{ user: { name: string; email: string } }>('user.save', userFields(fd));
    refreshFms();
    return { message: `${r.user.name} was added. They open FMS from EnqBoss with their own login (${r.user.email}).` };
  });
}

export async function updateUserAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const r = await fms<{ user: { name: string } }>('user.save', { ...userFields(fd), id: str(fd, 'id'), active: bool(fd, 'active') });
    refreshFms();
    return { message: `${r.user.name} was updated.` };
  });
}

// ---------------------------------------------------------------- settings
export async function updateSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const start = parseHHMM(str(fd, 'workStart'));
    const end = parseHHMM(str(fd, 'workEnd'));
    if (start === null || end === null) throw new FmsError('Enter opening and closing time as HH:MM.');
    const hasLunch = bool(fd, 'hasLunch');
    const ls = parseHHMM(str(fd, 'lunchStart'));
    const le = parseHHMM(str(fd, 'lunchEnd'));
    if (hasLunch && (ls === null || le === null)) throw new FmsError('Enter lunch start and end as HH:MM, or untick the lunch break.');
    const workingDays = new Set(strs(fd, 'workingDays').map(Number));
    const weeklyOffs = [0, 1, 2, 3, 4, 5, 6].filter((d) => !workingDays.has(d));
    const r = await fms<{ recalculated: number }>('settings.update', {
      workStart: start,
      workEnd: end,
      lunchStart: hasLunch ? ls : null,
      lunchEnd: hasLunch ? le : null,
      weeklyOffs,
      misGreenLimit: Number(str(fd, 'misGreen')),
      misAmberLimit: Number(str(fd, 'misAmber')),
    });
    refreshFms();
    return { message: `Settings saved.${r.recalculated ? ` ${r.recalculated} open task due time${r.recalculated === 1 ? ' was' : 's were'} recalculated.` : ''}` };
  });
}

export async function addHolidayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const r = await fms<{ recalculated: number }>('holiday.add', { day: str(fd, 'day'), name: str(fd, 'name') });
    refreshFms();
    return { message: `Holiday added.${r.recalculated ? ` ${r.recalculated} open task due time${r.recalculated === 1 ? ' was' : 's were'} pushed out.` : ''}` };
  });
}

export async function removeHolidayAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    await fms('holiday.remove', { day: str(fd, 'day') });
    refreshFms();
    return { message: 'Holiday removed.' };
  });
}
