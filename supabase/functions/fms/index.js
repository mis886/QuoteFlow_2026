// FMS edge function — DEPLOYED to Supabase as "fms" (verify_jwt on). Single-file bundle of the
// FMS services (engine, scoring, tasks, workflows, reports, users, settings) for the fms_* tables.
// Everything below this header is exactly what is deployed (checked byte-for-byte on 2026-11-02).
// Do not run 'wrangler' for this; it is a Supabase function, not part of the Cloudflare site.

// index.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// lib/db.ts
import pg from "npm:pg@8.13.1";
var pool = null;
function getPool() {
  if (pool) return pool;
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) throw new Error("SUPABASE_DB_URL is not set.");
  pool = new pg.Pool({
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""),
    max: 3,
    idleTimeoutMillis: 2e4,
    connectionTimeoutMillis: 1e4,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? void 0 : { rejectUnauthorized: false }
  });
  pool.on("error", (e) => console.error("[db] idle client error", e.message));
  return pool;
}
function wrap(c, inTx) {
  const self = {
    async query(sql, params) {
      return (await c.query(sql, params)).rows;
    },
    async exec(sql) {
      await c.query(sql);
    },
    async tx(fn) {
      if (inTx) return fn(self);
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client, true));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
        }
        throw e;
      } finally {
        client.release();
      }
    }
  };
  return self;
}
function getDb() {
  return wrap(getPool(), false);
}

// lib/errors.ts
var AppError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = "AppError";
  }
};
function isPgUnique(e) {
  return typeof e === "object" && e !== null && e.code === "23505";
}
var toMs = (v) => v === null || v === void 0 ? null : new Date(v).getTime();
function need(v, msg = "Not found", status = 404) {
  if (v === null || v === void 0) throw new AppError(msg, status);
  return v;
}
function cleanText(v, label, opts) {
  const s2 = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (opts.required && !s2) throw new AppError(`${label} is required.`);
  if (s2.length > opts.max) throw new AppError(`${label} must be ${opts.max} characters or fewer.`);
  return s2;
}
function cleanMultiline(v, label, max) {
  const s2 = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
  if (s2.length > max) throw new AppError(`${label} must be ${max} characters or fewer.`);
  return s2;
}
function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isValidYmd(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = /* @__PURE__ */ new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// lib/services/authz.ts
var isAdmin = (a) => a.role === "admin";
var canSeeCoordinatorBoard = (a) => a.role === "admin" || a.isCoordinator;
function requireAdmin(a) {
  if (!isAdmin(a)) throw new AppError("Only an admin can do this.", 403);
}
async function downlineIds(db, managerId) {
  const rows = await db.query(
    `with recursive d(id) as (
       select id from fms_users where manager_id = $1
       union
       select u.id from fms_users u join d on u.manager_id = d.id
     ) select id from d where id <> $1`,
    [managerId]
  );
  return rows.map((r) => r.id);
}
async function canViewPerson(db, actor, targetId) {
  if (actor.id === targetId || actor.role === "admin") return true;
  if (actor.role !== "manager") return false;
  return (await downlineIds(db, actor.id)).includes(targetId);
}
async function requireViewPerson(db, actor, targetId) {
  if (!await canViewPerson(db, actor, targetId)) throw new AppError("You do not have access to this person.", 403);
}
async function logActivity(db, actorId, action, entity, entityId, detail) {
  await db.query("insert into fms_activity_log (actor_id, action, entity, entity_id, detail) values ($1,$2,$3,$4,$5)", [
    actorId,
    action,
    entity,
    entityId,
    detail === void 0 ? null : JSON.stringify(detail)
  ]);
}

// lib/pin.ts
import crypto from "node:crypto";
var KEYLEN = 32;
function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pin, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
function validateNewPin(pin) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) throw new AppError("PIN must be exactly 6 digits.");
  if (/^(\d)\1{5}$/.test(pin)) throw new AppError("Choose a PIN that is not the same digit repeated.");
  const d = pin.split("").map(Number);
  const asc = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const desc = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  if (asc || desc) throw new AppError("Choose a PIN that is not a simple run of digits.");
  return pin;
}
function generateTempPin() {
  for (; ; ) {
    const p = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
    try {
      validateNewPin(p);
      return p;
    } catch {
    }
  }
}

// lib/services/users.ts
var USER_COLS = `u.id, u.emp_code, u.name, u.email, u.role, u.is_coordinator, u.can_create_workflows, u.manager_id,
  m.name as manager_name, u.active, u.must_change_pin, u.locked_until, u.last_login_at`;
function mapUser(r) {
  return {
    id: r.id,
    empCode: r.emp_code,
    name: r.name,
    email: r.email,
    role: r.role,
    isCoordinator: r.is_coordinator,
    canCreateWorkflows: r.can_create_workflows,
    managerId: r.manager_id,
    managerName: r.manager_name ?? null,
    active: r.active,
    mustChangePin: r.must_change_pin,
    lockedUntil: toMs(r.locked_until),
    lastLoginAt: toMs(r.last_login_at)
  };
}
function toActor(u) {
  return { id: u.id, name: u.name, empCode: u.empCode, role: u.role, isCoordinator: u.isCoordinator, canCreateWorkflows: u.canCreateWorkflows };
}
async function listUsers(db, opts = {}) {
  const rows = await db.query(
    `select ${USER_COLS} from fms_users u left join fms_users m on m.id = u.manager_id ${opts.activeOnly ? "where u.active" : ""} order by u.active desc, lower(u.name)`
  );
  return rows.map(mapUser);
}
async function getUser(db, id) {
  if (!isUuid(id)) return null;
  const rows = await db.query(`select ${USER_COLS} from fms_users u left join fms_users m on m.id = u.manager_id where u.id = $1`, [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}
var ROLES = ["admin", "manager", "doer"];
function cleanUserInput(input) {
  const empCode = cleanText(input.empCode, "Employee code", { max: 24, required: true });
  if (!/^[A-Za-z0-9._-]{2,24}$/.test(empCode)) throw new AppError("Employee code can use letters, numbers, dot, dash and underscore (2 to 24 characters).");
  const name = cleanText(input.name, "Name", { max: 80, required: true });
  const email = cleanText(input.email ?? "", "Email", { max: 120 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("Enter a valid email address or leave it blank.");
  if (!ROLES.includes(input.role)) throw new AppError("Choose a valid role.");
  const managerId = input.managerId && input.managerId !== "" ? input.managerId : null;
  if (managerId && !isUuid(managerId)) throw new AppError("Choose a valid manager.");
  return { empCode, name, email: email || null, role: input.role, isCoordinator: !!input.isCoordinator, canCreateWorkflows: !!input.canCreateWorkflows, managerId };
}
async function checkManager(db, managerId, selfId) {
  if (!managerId) return;
  const m = await getUser(db, managerId);
  if (!m || !m.active || m.role === "doer") throw new AppError("The reporting manager must be an active manager or admin.");
  if (selfId) {
    if (managerId === selfId) throw new AppError("A person cannot report to themselves.");
    const [hit] = await db.query(
      `with recursive up(id) as (
         select $1::uuid
         union
         select u.manager_id from fms_users u join up on u.id = up.id where u.manager_id is not null
       ) select count(*)::int as n from up where id = $2::uuid`,
      [managerId, selfId]
    );
    if (hit.n > 0) throw new AppError("That would create a reporting loop.");
  }
}
async function createUser(db, actor, raw) {
  requireAdmin(actor);
  const input = cleanUserInput(raw);
  await checkManager(db, input.managerId, null);
  const tempPin = generateTempPin();
  try {
    const [r] = await db.query(
      `insert into fms_users (emp_code, name, email, role, is_coordinator, can_create_workflows, manager_id, pin_hash, must_change_pin)
       values ($1,$2,$3,$4,$5,$6,$7,$8,true) returning id`,
      [input.empCode, input.name, input.email, input.role, input.isCoordinator, input.canCreateWorkflows, input.managerId, hashPin(tempPin)]
    );
    await logActivity(db, actor.id, "user.create", "user", r.id, { empCode: input.empCode, role: input.role });
    return { user: need(await getUser(db, r.id)), tempPin };
  } catch (e) {
    if (isPgUnique(e)) throw new AppError("That employee code or email is already in use.");
    throw e;
  }
}
async function updateUser(db, actor, userId, raw) {
  requireAdmin(actor);
  const input = cleanUserInput(raw);
  return db.tx(async (t) => {
    const cur = need(await getUser(t, userId), "User not found");
    await checkManager(t, input.managerId, cur.id);
    const active = !!raw.active;
    if (cur.id === actor.id) {
      if (!active) throw new AppError("You cannot deactivate your own account.");
      if (input.role !== "admin") throw new AppError("You cannot remove your own admin role.");
    }
    const losingAdmin = cur.role === "admin" && cur.active && (input.role !== "admin" || !active);
    if (losingAdmin) {
      const [{ n }] = await t.query(`select count(*)::int as n from fms_users where role='admin' and active and id <> $1`, [cur.id]);
      if (n === 0) throw new AppError("There must be at least one active admin.");
    }
    if (cur.active && !active) {
      const [{ n }] = await t.query(`select count(*)::int as n from fms_tasks where owner_id = $1 and status in ('open','waiting')`, [cur.id]);
      if (n > 0) throw new AppError(`${cur.name} still has ${n} open or upcoming task${n === 1 ? "" : "s"}. Reassign them before deactivating.`);
      const steps = await t.query(
        `select distinct w.name from fms_workflow_steps s join fms_workflows w on w.id = s.workflow_id where s.owner_id = $1 and w.status = 'active'`,
        [cur.id]
      );
      if (steps.length) throw new AppError(`${cur.name} owns steps in: ${steps.map((s2) => s2.name).join(", ")}. Change the step owner first.`);
      const [{ r }] = await t.query(`select count(*)::int as r from fms_recurring_templates where owner_id = $1 and active`, [cur.id]);
      if (r > 0) throw new AppError(`${cur.name} owns ${r} recurring task${r === 1 ? "" : "s"}. Pause or reassign them first.`);
    }
    try {
      await t.query(
        `update fms_users set emp_code=$2, name=$3, email=$4, role=$5, is_coordinator=$6, can_create_workflows=$7, manager_id=$8, active=$9 where id=$1`,
        [cur.id, input.empCode, input.name, input.email, input.role, input.isCoordinator, input.canCreateWorkflows, input.managerId, active]
      );
    } catch (e) {
      if (isPgUnique(e)) throw new AppError("That employee code or email is already in use.");
      throw e;
    }
    if (!active) await t.query("update fms_users set pin_version = pin_version + 1 where id = $1", [cur.id]);
    await logActivity(t, actor.id, "user.update", "user", cur.id, { role: input.role, active });
    return need(await getUser(t, cur.id));
  });
}

// lib/engine.ts
var IST_OFFSET_MIN = 330;
var MIN = 6e4;
var DAY = 864e5;
var DEFAULT_SETTINGS = {
  workStart: 9 * 60 + 30,
  workEnd: 18 * 60,
  lunchStart: 13 * 60,
  lunchEnd: 13 * 60 + 30,
  weeklyOffs: [0],
  holidays: []
};
function validateSettings(s2) {
  const errs = [];
  if (!Number.isInteger(s2.workStart) || !Number.isInteger(s2.workEnd)) errs.push("Working hours must be whole minutes.");
  if (s2.workStart < 0 || s2.workEnd > 1440 || s2.workStart >= s2.workEnd) errs.push("Opening time must be before closing time.");
  if (s2.lunchStart === null !== (s2.lunchEnd === null)) errs.push("Set both lunch start and end, or neither.");
  if (s2.lunchStart !== null && s2.lunchEnd !== null) {
    if (s2.lunchStart >= s2.lunchEnd) errs.push("Lunch must end after it starts.");
    if (s2.lunchStart < s2.workStart || s2.lunchEnd > s2.workEnd) errs.push("Lunch must fall inside working hours.");
  }
  const offs = new Set(s2.weeklyOffs);
  if (s2.weeklyOffs.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errs.push("Weekly off days must be 0 to 6.");
  if (offs.size >= 7) errs.push("At least one day of the week must be a working day.");
  return errs;
}
function toLocal(ms) {
  return ms + IST_OFFSET_MIN * MIN;
}
function fromLocal(localMs) {
  return localMs - IST_OFFSET_MIN * MIN;
}
function startOfDayIST(ms) {
  const l = toLocal(ms);
  return fromLocal(l - (l % DAY + DAY) % DAY);
}
function istDateString(ms) {
  return new Date(toLocal(ms)).toISOString().slice(0, 10);
}
function istWeekday(ms) {
  return new Date(toLocal(ms)).getUTCDay();
}
function istInstant(date, minuteOfDay = 0) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Bad date: ${date}`);
  return fromLocal(Date.UTC(y, m - 1, d) + minuteOfDay * MIN);
}
function startOfWeekIST(ms) {
  const day0 = startOfDayIST(ms);
  const wd = istWeekday(ms);
  const sinceMonday = (wd + 6) % 7;
  return istInstant(istDateString(day0 - sinceMonday * DAY + 12 * 36e5), 0);
}
function isWorkingDay(dayStartMs, s2, holidaySet) {
  const hs = holidaySet ?? new Set(s2.holidays);
  if (s2.weeklyOffs.includes(istWeekday(dayStartMs))) return false;
  if (hs.has(istDateString(dayStartMs))) return false;
  return true;
}
function dayIntervals(s2) {
  if (s2.lunchStart !== null && s2.lunchEnd !== null) {
    return [
      [s2.workStart, s2.lunchStart],
      [s2.lunchEnd, s2.workEnd]
    ];
  }
  return [[s2.workStart, s2.workEnd]];
}
var MAX_DAYS_SCAN = 800;
function seekWorking(ms, s2, hs) {
  const ivs = dayIntervals(s2);
  let dayStart = startOfDayIST(ms);
  for (let i = 0; i < MAX_DAYS_SCAN; i++) {
    if (isWorkingDay(dayStart, s2, hs)) {
      for (const [a, b] of ivs) {
        const aMs = dayStart + a * MIN;
        const bMs = dayStart + b * MIN;
        if (ms < bMs) {
          return { at: Math.max(ms, aMs), intervalEnd: bMs };
        }
      }
    }
    dayStart = istInstant(istDateString(dayStart + DAY + 12 * 36e5), 0);
    ms = dayStart;
  }
  throw new Error("No working time found: check weekly offs and holidays.");
}
function addWorkingMinutes(startMs, minutes, s2) {
  if (!Number.isFinite(minutes) || minutes < 0) throw new Error("Minutes must be zero or more.");
  const hs = new Set(s2.holidays);
  let cur = seekWorking(startMs, s2, hs);
  let remaining = minutes * MIN;
  if (remaining === 0) return cur.at;
  for (let guard = 0; guard < 1e6; guard++) {
    const avail = cur.intervalEnd - cur.at;
    if (remaining <= avail) return cur.at + remaining;
    remaining -= avail;
    cur = seekWorking(cur.intervalEnd, s2, hs);
  }
  throw new Error("Working time calculation did not converge.");
}
function workingMinutesBetween(aMs, bMs, s2) {
  if (bMs <= aMs) return 0;
  const hs = new Set(s2.holidays);
  const ivs = dayIntervals(s2);
  let total = 0;
  let dayStart = startOfDayIST(aMs);
  for (let i = 0; i < 1e5 && dayStart < bMs; i++) {
    if (isWorkingDay(dayStart, s2, hs)) {
      for (const [x, y] of ivs) {
        const lo = Math.max(dayStart + x * MIN, aMs);
        const hi = Math.min(dayStart + y * MIN, bMs);
        if (hi > lo) total += hi - lo;
      }
    }
    dayStart = istInstant(istDateString(dayStart + DAY + 12 * 36e5), 0);
  }
  return Math.round(total / MIN);
}

// lib/services/settings.ts
async function getSettings(db) {
  const [s2] = await db.query(
    `select work_start, work_end, lunch_start, lunch_end, weekly_offs, mis_green_limit::float8 as green, mis_amber_limit::float8 as amber from fms_app_settings where id = 1`
  );
  if (!s2) throw new Error("app_settings row is missing. Run the migrations.");
  const hs = await db.query(`select to_char(day,'YYYY-MM-DD') as day from fms_holidays order by day`);
  return {
    work: {
      workStart: s2.work_start,
      workEnd: s2.work_end,
      lunchStart: s2.lunch_start,
      lunchEnd: s2.lunch_end,
      weeklyOffs: [...s2.weekly_offs].map(Number),
      holidays: hs.map((h) => h.day)
    },
    misGreenLimit: s2.green,
    misAmberLimit: s2.amber
  };
}
async function listHolidays(db) {
  return db.query(`select to_char(day,'YYYY-MM-DD') as day, name from fms_holidays order by day`);
}
async function recalcOpenDueDates(db) {
  const s2 = await getSettings(db);
  const rows = await db.query(
    `select id, released_at, tat_minutes, due_at from fms_tasks where status = 'open' and tat_minutes is not null`
  );
  let changed = 0;
  for (const r of rows) {
    const due = addWorkingMinutes(new Date(r.released_at).getTime(), r.tat_minutes, s2.work);
    if (due !== new Date(r.due_at).getTime()) {
      await db.query("update fms_tasks set due_at = $2 where id = $1", [r.id, new Date(due)]);
      changed++;
    }
  }
  return changed;
}
async function updateSettings(db, actor, input) {
  requireAdmin(actor);
  const current = await getSettings(db);
  const next = { ...current.work, ...input };
  const errs = validateSettings(next);
  if (!(input.misGreenLimit >= 0 && input.misGreenLimit < input.misAmberLimit && input.misAmberLimit <= 100)) {
    errs.push("Score limits must satisfy: 0 <= green < amber <= 100.");
  }
  if (errs.length) throw new AppError(errs.join(" "));
  return db.tx(async (t) => {
    await t.query(
      `update fms_app_settings set work_start=$1, work_end=$2, lunch_start=$3, lunch_end=$4, weekly_offs=$5::int[], mis_green_limit=$6, mis_amber_limit=$7, updated_at=now() where id=1`,
      [input.workStart, input.workEnd, input.lunchStart, input.lunchEnd, `{${[...new Set(input.weeklyOffs)].sort().join(",")}}`, input.misGreenLimit, input.misAmberLimit]
    );
    const recalculated = await recalcOpenDueDates(t);
    await logActivity(t, actor.id, "settings.update", "settings", "1", { ...input, recalculated });
    return { recalculated };
  });
}
async function addHoliday(db, actor, day, name) {
  requireAdmin(actor);
  if (!isValidYmd(day)) throw new AppError("Enter a valid date.");
  const label = cleanText(name, "Holiday name", { max: 80, required: true });
  return db.tx(async (t) => {
    try {
      await t.query("insert into fms_holidays (day, name) values ($1::date, $2)", [day, label]);
    } catch (e) {
      if (isPgUnique(e)) throw new AppError("That date is already in the holiday list.");
      throw e;
    }
    const recalculated = await recalcOpenDueDates(t);
    await logActivity(t, actor.id, "holiday.add", "holiday", day, { name: label, recalculated });
    return { recalculated };
  });
}
async function removeHoliday(db, actor, day) {
  requireAdmin(actor);
  return db.tx(async (t) => {
    await t.query("delete from fms_holidays where day = $1::date", [day]);
    const recalculated = await recalcOpenDueDates(t);
    await logActivity(t, actor.id, "holiday.remove", "holiday", day, { recalculated });
    return { recalculated };
  });
}

// lib/services/tasks.ts
var TASK_COLS = `
  t.id, t.source, t.title, t.instructions, t.status, t.owner_id, o.name as owner_name, ab.name as assigned_by_name,
  t.counts_in_mis, t.tat_minutes, t.released_at, t.due_at, t.completed_at, t.remarks,
  t.instance_id, i.reference as instance_ref, i.workflow_name, t.seq,
  (select count(*)::int from fms_tasks x where x.instance_id = t.instance_id) as total_steps,
  p.title as prev_title, po.name as prev_owner, p.due_at as prev_due, p.status as prev_status`;
var TASK_FROM = `
  from fms_tasks t
  join fms_users o on o.id = t.owner_id
  left join fms_users ab on ab.id = t.assigned_by
  left join fms_workflow_instances i on i.id = t.instance_id
  left join fms_tasks p on p.instance_id = t.instance_id and p.seq = t.seq - 1
  left join fms_users po on po.id = p.owner_id`;
var TASK_SELECT = TASK_COLS + TASK_FROM;
function mapTask(r) {
  return {
    id: r.id,
    source: r.source,
    title: r.title,
    instructions: r.instructions,
    status: r.status,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    assignedByName: r.assigned_by_name,
    countsInMis: r.counts_in_mis,
    tatMinutes: r.tat_minutes,
    releasedAt: toMs(r.released_at),
    dueAt: toMs(r.due_at),
    completedAt: toMs(r.completed_at),
    remarks: r.remarks,
    instanceId: r.instance_id,
    instanceRef: r.instance_ref,
    workflowName: r.workflow_name,
    seq: r.seq,
    totalSteps: r.total_steps,
    prevTitle: r.prev_title ?? null,
    prevOwnerName: r.prev_owner ?? null,
    prevDueAt: toMs(r.prev_due),
    prevStatus: r.prev_status ?? null
  };
}
async function listMyTasks(db, userId, now = Date.now(), doneDays = 14) {
  const rows = await db.query(
    `select ${TASK_SELECT}
      where t.owner_id = $1 and (t.status in ('open','waiting') or (t.status = 'done' and t.completed_at >= $2))
      order by case t.status when 'open' then 0 when 'waiting' then 1 else 2 end, t.due_at nulls last, t.created_at`,
    [userId, new Date(now - doneDays * 864e5)]
  );
  return rows.map(mapTask);
}
async function getTask(db, id) {
  if (!isUuid(id)) return null;
  const rows = await db.query(`select ${TASK_SELECT} where t.id = $1`, [id]);
  return rows[0] ? mapTask(rows[0]) : null;
}
async function canViewTask(db, actor, task) {
  if (task.ownerId === actor.id) return true;
  if (task.source === "personal") return false;
  if (isAdmin(actor) || actor.isCoordinator) return true;
  return canViewPerson(db, actor, task.ownerId);
}
async function completeTask(db, actor, taskId, remarksRaw, now = Date.now()) {
  if (!isUuid(taskId)) throw new AppError("Task not found", 404);
  const remarks = cleanMultiline(remarksRaw, "Remarks", 1e3);
  const settings = await getSettings(db);
  return db.tx(async (t) => {
    const [task] = await t.query("select id, owner_id, status, instance_id, seq from fms_tasks where id = $1 for update", [taskId]);
    need(task, "Task not found");
    if (task.owner_id !== actor.id) throw new AppError("Only the person this task is assigned to can complete it.", 403);
    if (task.status === "done") return { alreadyDone: true, releasedNext: null, instanceFinished: false };
    if (task.status === "waiting") throw new AppError("This step has not been released to you yet.");
    if (task.status === "cancelled") throw new AppError("This task was cancelled.");
    await t.query(`update fms_tasks set status='done', completed_at=$2, remarks=$3 where id=$1`, [taskId, new Date(now), remarks || null]);
    let releasedNext = null;
    let instanceFinished = false;
    if (task.instance_id) {
      await t.query("select 1 from fms_workflow_instances where id = $1 for update", [task.instance_id]);
      const [next] = await t.query(
        `select t.id, t.tat_minutes, u.name as owner_name from fms_tasks t join fms_users u on u.id = t.owner_id
          where t.instance_id = $1 and t.status = 'waiting' order by t.seq limit 1`,
        [task.instance_id]
      );
      if (next) {
        const due = addWorkingMinutes(now, next.tat_minutes, settings.work);
        await t.query(`update fms_tasks set status='open', released_at=$2, due_at=$3 where id=$1`, [next.id, new Date(now), new Date(due)]);
        releasedNext = { taskId: next.id, ownerName: next.owner_name, dueAt: due };
      } else {
        const [{ n }] = await t.query(`select count(*)::int as n from fms_tasks where instance_id = $1 and status = 'open'`, [task.instance_id]);
        if (n === 0) {
          await t.query(`update fms_workflow_instances set status='completed', completed_at=$2 where id=$1 and status='running'`, [task.instance_id, new Date(now)]);
          instanceFinished = true;
        }
      }
    }
    await logActivity(t, actor.id, "task.complete", "task", taskId);
    return { alreadyDone: false, releasedNext, instanceFinished };
  });
}
function parseDue(dueDate, dueTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? "") || !/^\d{1,2}:\d{2}$/.test(dueTime ?? "")) throw new AppError("Enter a due date and time.");
  const [h, m] = dueTime.split(":").map(Number);
  if (h > 23 || m > 59) throw new AppError("Enter a valid due time.");
  const ms = istInstant(dueDate, h * 60 + m);
  if (Number.isNaN(ms) || istDateString(ms) !== dueDate) throw new AppError("Enter a valid due date.");
  return ms;
}
async function createDelegatedTask(db, actor, input, now = Date.now()) {
  if (actor.role === "doer") throw new AppError("Only managers and admins can assign tasks to others.", 403);
  const title = cleanText(input.title, "Task", { max: 200, required: true });
  const instructions = cleanMultiline(input.instructions, "Instructions", 2e3);
  if (!isUuid(input.ownerId)) throw new AppError("Choose who this task is for.");
  const due = parseDue(input.dueDate, input.dueTime);
  if (due < now - 6e4) throw new AppError("The due time is already in the past.");
  const [owner] = await db.query("select id, active, name from fms_users where id = $1", [input.ownerId]);
  need(owner, "Person not found");
  if (!owner.active) throw new AppError(`${owner.name} is no longer active.`);
  if (owner.id !== actor.id && !isAdmin(actor) && !(await downlineIds(db, actor.id)).includes(owner.id)) {
    throw new AppError("You can only assign tasks to people in your team.", 403);
  }
  const [r] = await db.query(
    `insert into fms_tasks (source, title, instructions, owner_id, assigned_by, status, counts_in_mis, released_at, due_at)
     values ('delegated',$1,$2,$3,$4,'open',true,$5,$6) returning id`,
    [title, instructions || null, owner.id, actor.id, new Date(now), new Date(due)]
  );
  await logActivity(db, actor.id, "task.delegate", "task", r.id, { owner: owner.id });
  return r.id;
}
async function createPersonalTask(db, actor, input, now = Date.now()) {
  const title = cleanText(input.title, "Task", { max: 200, required: true });
  const instructions = cleanMultiline(input.instructions, "Notes", 2e3);
  const due = parseDue(input.dueDate, input.dueTime);
  const [r] = await db.query(
    `insert into fms_tasks (source, title, instructions, owner_id, assigned_by, status, counts_in_mis, released_at, due_at)
     values ('personal',$1,$2,$3,$3,'open',false,$4,$5) returning id`,
    [title, instructions || null, actor.id, new Date(now), new Date(due)]
  );
  return r.id;
}
async function reassignTask(db, actor, taskId, newOwnerId, now = Date.now()) {
  if (!isUuid(taskId) || !isUuid(newOwnerId)) throw new AppError("Choose a person.");
  await db.tx(async (t) => {
    const [task] = await t.query("select id, owner_id, scored_owner_id, status, source, due_at from fms_tasks where id = $1 for update", [taskId]);
    need(task, "Task not found");
    if (task.source === "personal") throw new AppError("Personal tasks cannot be reassigned.");
    if (task.status !== "open" && task.status !== "waiting") throw new AppError("Only open or upcoming tasks can be reassigned.");
    const allowed = isAdmin(actor) || actor.isCoordinator || actor.role === "manager" && (await downlineIds(t, actor.id)).includes(task.owner_id);
    if (!allowed) throw new AppError("You cannot reassign this task.", 403);
    const [u] = await t.query("select active, name from fms_users where id = $1", [newOwnerId]);
    need(u, "Person not found");
    if (!u.active) throw new AppError(`${u.name} is no longer active.`);
    if (task.owner_id === newOwnerId) throw new AppError("That person already owns this task.");
    const overdue = task.status === "open" && task.due_at && toMs(task.due_at) < now;
    const scored = overdue ? task.scored_owner_id ?? task.owner_id : task.scored_owner_id;
    await t.query("update fms_tasks set owner_id = $2, scored_owner_id = $3 where id = $1", [taskId, newOwnerId, scored === newOwnerId ? null : scored]);
    await logActivity(t, actor.id, "task.reassign", "task", taskId, { from: task.owner_id, to: newOwnerId, overdue: !!overdue });
  });
}
async function listRecurring(db, actor) {
  const params = [];
  let where = "";
  if (!isAdmin(actor)) {
    const ids = [actor.id, ...await downlineIds(db, actor.id)];
    params.push(ids);
    where = "where r.owner_id = any($1::uuid[])";
  }
  const rows = await db.query(
    `select r.*, u.name as owner_name from fms_recurring_templates r join fms_users u on u.id = r.owner_id ${where} order by r.active desc, lower(r.title)`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    instructions: r.instructions,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    weekdays: [...r.weekdays].map(Number),
    dueMinute: r.due_minute,
    active: r.active
  }));
}
async function checkRecurringAccess(db, actor, ownerId) {
  if (actor.role === "doer") throw new AppError("Only managers and admins can set up recurring tasks.", 403);
  if (!isAdmin(actor) && ownerId !== actor.id && !(await downlineIds(db, actor.id)).includes(ownerId)) {
    throw new AppError("You can only set up recurring tasks for people in your team.", 403);
  }
}
function cleanRecurring(input) {
  const title = cleanText(input.title, "Task", { max: 200, required: true });
  const instructions = cleanMultiline(input.instructions, "Instructions", 2e3);
  if (!isUuid(input.ownerId)) throw new AppError("Choose who this task is for.");
  const weekdays = [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (weekdays.length === 0) throw new AppError("Choose at least one day.");
  if (!Number.isInteger(input.dueMinute) || input.dueMinute < 0 || input.dueMinute > 1439) throw new AppError("Enter a valid due time.");
  return { title, instructions, ownerId: input.ownerId, weekdays, dueMinute: input.dueMinute };
}
async function saveRecurring(db, actor, id, raw) {
  const input = cleanRecurring(raw);
  await checkRecurringAccess(db, actor, input.ownerId);
  const [o] = await db.query("select active, name from fms_users where id = $1", [input.ownerId]);
  need(o, "Person not found");
  if (!o.active) throw new AppError(`${o.name} is no longer active.`);
  const days = `{${input.weekdays.join(",")}}`;
  if (id) {
    const [cur] = await db.query("select owner_id from fms_recurring_templates where id = $1", [id]);
    need(cur, "Recurring task not found");
    await checkRecurringAccess(db, actor, cur.owner_id);
    await db.query(
      "update fms_recurring_templates set title=$2, instructions=$3, owner_id=$4, weekdays=$5::int[], due_minute=$6 where id=$1",
      [id, input.title, input.instructions || null, input.ownerId, days, input.dueMinute]
    );
    return id;
  }
  const [r] = await db.query(
    `insert into fms_recurring_templates (title, instructions, owner_id, created_by, weekdays, due_minute) values ($1,$2,$3,$4,$5::int[],$6) returning id`,
    [input.title, input.instructions || null, input.ownerId, actor.id, days, input.dueMinute]
  );
  return r.id;
}
async function setRecurringActive(db, actor, id, active) {
  const [cur] = await db.query("select owner_id from fms_recurring_templates where id = $1", [id]);
  need(cur, "Recurring task not found");
  await checkRecurringAccess(db, actor, cur.owner_id);
  await db.query("update fms_recurring_templates set active = $2 where id = $1", [id, active]);
}
async function generateRecurring(db, now = Date.now(), ownerId) {
  const settings = await getSettings(db);
  const today = istDateString(now);
  const weekday = istWeekday(now);
  if (settings.work.weeklyOffs.includes(weekday) || settings.work.holidays.includes(today)) return 0;
  const params = [weekday];
  let extra = "";
  if (ownerId) {
    params.push(ownerId);
    extra = "and r.owner_id = $2";
  }
  const templates = await db.query(
    `select r.id, r.title, r.instructions, r.owner_id, r.created_by, r.due_minute, r.created_at from fms_recurring_templates r join fms_users u on u.id = r.owner_id
      where r.active and u.active and $1 = any(r.weekdays) ${extra}`,
    params
  );
  let created = 0;
  for (const tpl of templates) {
    const due = istInstant(today, tpl.due_minute);
    if (toMs(tpl.created_at) > due) continue;
    const releasedAt = Math.min(now, due);
    const res = await db.query(
      `insert into fms_tasks (source, title, instructions, owner_id, assigned_by, status, counts_in_mis, released_at, due_at, template_id, occurrence_date)
       values ('recurring',$1,$2,$3,$4,'open',true,$5,$6,$7,$8::date) on conflict do nothing returning id`,
      [tpl.title, tpl.instructions, tpl.owner_id, tpl.created_by, new Date(releasedAt), new Date(due), tpl.id, today]
    );
    created += res.length;
  }
  return created;
}
async function assignableUsers(db, actor) {
  if (actor.role === "doer") return [];
  let ids = null;
  if (!isAdmin(actor)) ids = [actor.id, ...await downlineIds(db, actor.id)];
  const rows = await db.query(
    `select id, name, emp_code from fms_users where active ${ids ? "and id = any($1::uuid[])" : ""} order by lower(name)`,
    ids ? [ids] : []
  );
  return rows.map((r) => ({ id: r.id, name: r.name, empCode: r.emp_code }));
}
async function allActivePeople(db) {
  const rows = await db.query(`select id, name, emp_code from fms_users where active order by lower(name)`);
  return rows.map((r) => ({ id: r.id, name: r.name, empCode: r.emp_code }));
}
async function canReassign(db, actor, task) {
  if (task.source === "personal" || task.status !== "open" && task.status !== "waiting") return false;
  if (isAdmin(actor) || actor.isCoordinator) return true;
  return actor.role === "manager" && (await downlineIds(db, actor.id)).includes(task.ownerId);
}

// lib/services/workflows.ts
var MAX_STEPS = 40;
var MAX_TAT_MINUTES = 60 * 24 * 60;
function canEditWorkflow(actor, createdBy) {
  return isAdmin(actor) || actor.canCreateWorkflows && createdBy === actor.id;
}
function canStartWorkflow(actor, wf, starterIds) {
  if (isAdmin(actor) || wf.createdBy === actor.id) return true;
  if (wf.startAccess === "anyone") return true;
  return wf.startAccess === "selected" && starterIds.includes(actor.id);
}
async function listWorkflows(db, actor, opts = {}) {
  const rows = await db.query(
    `select w.id, w.name, w.description, w.status, w.start_access, w.created_by, u.name as created_by_name,
            (select count(*)::int from fms_workflow_steps s where s.workflow_id = w.id) as step_count,
            (select coalesce(sum(tat_minutes),0)::int from fms_workflow_steps s where s.workflow_id = w.id) as total_tat,
            (select count(*)::int from fms_workflow_instances i where i.workflow_id = w.id and i.status = 'running') as running_count,
            coalesce((select array_agg(user_id) from fms_workflow_starters ws where ws.workflow_id = w.id), '{}') as starters
       from fms_workflows w left join fms_users u on u.id = w.created_by
      ${opts.includeArchived ? "" : `where w.status = 'active'`}
      order by w.status, lower(w.name)`
  );
  return rows.map((r) => {
    const base = { startAccess: r.start_access, createdBy: r.created_by };
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      startAccess: base.startAccess,
      createdBy: base.createdBy,
      createdByName: r.created_by_name,
      stepCount: r.step_count,
      totalTatMinutes: r.total_tat,
      runningCount: r.running_count,
      canEdit: canEditWorkflow(actor, base.createdBy),
      canStart: r.status === "active" && canStartWorkflow(actor, base, r.starters ?? [])
    };
  });
}
async function getWorkflow(db, actor, id) {
  if (!isUuid(id)) return null;
  const all = (await listWorkflows(db, actor, { includeArchived: true })).find((w) => w.id === id);
  if (!all) return null;
  const steps = await db.query(
    `select s.id, s.position, s.what, s.how, s.tat_minutes, s.owner_id, u.name as owner_name, u.active as owner_active
       from fms_workflow_steps s join fms_users u on u.id = s.owner_id where s.workflow_id = $1 order by s.position`,
    [id]
  );
  const starters = await db.query("select user_id from fms_workflow_starters where workflow_id = $1", [id]);
  return {
    ...all,
    steps: steps.map((s2) => ({
      id: s2.id,
      position: s2.position,
      what: s2.what,
      how: s2.how,
      tatMinutes: s2.tat_minutes,
      ownerId: s2.owner_id,
      ownerName: s2.owner_name,
      ownerActive: s2.owner_active
    })),
    starterIds: starters.map((s2) => s2.user_id)
  };
}
function cleanSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) throw new AppError("Add at least one step.");
  if (steps.length > MAX_STEPS) throw new AppError(`A workflow can have at most ${MAX_STEPS} steps.`);
  return steps.map((s2, i) => {
    const n = i + 1;
    const what = cleanText(s2.what, `Step ${n}: What`, { max: 200, required: true });
    const how = cleanMultiline(s2.how, `Step ${n}: How`, 2e3);
    if (!Number.isInteger(s2.tatMinutes) || s2.tatMinutes < 0 || s2.tatMinutes > MAX_TAT_MINUTES) throw new AppError(`Step ${n}: enter a valid time allowed.`);
    if (!isUuid(s2.ownerId)) throw new AppError(`Step ${n}: choose who does this step.`);
    return { what, how, tatMinutes: s2.tatMinutes, ownerId: s2.ownerId };
  });
}
async function saveWorkflow(db, actor, workflowId, raw) {
  const name = cleanText(raw.name, "Workflow name", { max: 120, required: true });
  const description = cleanMultiline(raw.description, "Description", 1e3);
  const steps = cleanSteps(raw.steps);
  if (!isAdmin(actor) && !actor.canCreateWorkflows) throw new AppError("You have not been given permission to create workflows. Ask your admin.", 403);
  return db.tx(async (t) => {
    let existing;
    if (workflowId) {
      [existing] = await t.query("select created_by, status from fms_workflows where id = $1 for update", [workflowId]);
      need(existing, "Workflow not found");
      if (!canEditWorkflow(actor, existing.created_by)) throw new AppError("You can only edit workflows you created.", 403);
      if (existing.status === "archived") throw new AppError("Restore this workflow before editing it.");
    }
    const owners = [...new Set(steps.map((s2) => s2.ownerId))];
    const found = await t.query("select id from fms_users where id = any($1::uuid[]) and active", [owners]);
    if (found.length !== owners.length) throw new AppError("Every step needs an active person as its owner.");
    let id = workflowId;
    try {
      if (!id) {
        const [r] = await t.query(
          `insert into fms_workflows (name, description, created_by) values ($1,$2,$3) returning id`,
          [name, description || null, actor.id]
        );
        id = r.id;
      } else {
        await t.query("update fms_workflows set name=$2, description=$3, updated_at=now() where id=$1", [id, name, description || null]);
      }
    } catch (e) {
      if (isPgUnique(e)) throw new AppError("There is already an active workflow with that name.");
      throw e;
    }
    await t.query("delete from fms_workflow_steps where workflow_id = $1", [id]);
    for (let i = 0; i < steps.length; i++) {
      const s2 = steps[i];
      await t.query(
        "insert into fms_workflow_steps (workflow_id, position, what, how, tat_minutes, owner_id) values ($1,$2,$3,$4,$5,$6)",
        [id, i + 1, s2.what, s2.how || null, s2.tatMinutes, s2.ownerId]
      );
    }
    if (isAdmin(actor) && raw.startAccess) await applyStartAccess(t, id, raw.startAccess, raw.starterIds ?? []);
    await logActivity(t, actor.id, workflowId ? "workflow.update" : "workflow.create", "workflow", id, { name, steps: steps.length });
    return id;
  });
}
async function applyStartAccess(t, workflowId, access, starterIds) {
  if (!["admin", "anyone", "selected"].includes(access)) throw new AppError("Choose who may start this workflow.");
  const ids = access === "selected" ? [...new Set(starterIds.filter(isUuid))] : [];
  if (access === "selected" && ids.length === 0) throw new AppError("Pick at least one person who may start this workflow, or choose another option.");
  await t.query("update fms_workflows set start_access = $2 where id = $1", [workflowId, access]);
  await t.query("delete from fms_workflow_starters where workflow_id = $1", [workflowId]);
  if (ids.length) {
    const ok = await t.query("select id from fms_users where id = any($1::uuid[]) and active", [ids]);
    for (const r of ok) await t.query("insert into fms_workflow_starters (workflow_id, user_id) values ($1,$2)", [workflowId, r.id]);
  }
}
async function setStartAccess(db, actor, workflowId, access, starterIds) {
  requireAdmin(actor);
  await db.tx(async (t) => {
    need((await t.query("select 1 from fms_workflows where id = $1", [workflowId]))[0], "Workflow not found");
    await applyStartAccess(t, workflowId, access, starterIds);
    await logActivity(t, actor.id, "workflow.access", "workflow", workflowId, { access, starters: starterIds.length });
  });
}
async function setWorkflowArchived(db, actor, workflowId, archived) {
  const [w] = await db.query("select created_by, name, status from fms_workflows where id = $1", [workflowId]);
  need(w, "Workflow not found");
  if (!canEditWorkflow(actor, w.created_by)) throw new AppError("You can only change workflows you created.", 403);
  try {
    await db.query("update fms_workflows set status = $2, updated_at = now() where id = $1", [workflowId, archived ? "archived" : "active"]);
  } catch (e) {
    if (isPgUnique(e)) throw new AppError("Another active workflow already uses this name. Rename that one first.");
    throw e;
  }
  await logActivity(db, actor.id, archived ? "workflow.archive" : "workflow.restore", "workflow", workflowId);
}
async function startInstance(db, actor, workflowId, referenceRaw, now = Date.now()) {
  const reference = cleanText(referenceRaw, "Reference", { max: 120, required: true });
  const settings = await getSettings(db);
  return db.tx(async (t) => {
    const [w] = await t.query("select id, name, status, start_access, created_by from fms_workflows where id = $1", [workflowId]);
    need(w, "Workflow not found");
    if (w.status !== "active") throw new AppError("This workflow is archived.");
    const starters = (await t.query("select user_id from fms_workflow_starters where workflow_id = $1", [workflowId])).map((s2) => s2.user_id);
    if (!canStartWorkflow(actor, { startAccess: w.start_access, createdBy: w.created_by }, starters)) {
      throw new AppError("You are not allowed to start this workflow. Ask your admin.", 403);
    }
    const steps = await t.query(
      `select s.id, s.position, s.what, s.how, s.tat_minutes, s.owner_id, u.active, u.name as owner_name
         from fms_workflow_steps s join fms_users u on u.id = s.owner_id where s.workflow_id = $1 order by s.position`,
      [workflowId]
    );
    if (steps.length === 0) throw new AppError("This workflow has no steps.");
    const gone = steps.filter((s2) => !s2.active);
    if (gone.length) throw new AppError(`Step ${gone[0].position} is owned by ${gone[0].owner_name}, who is no longer active. Update the workflow first.`);
    const [inst] = await t.query(
      `insert into fms_workflow_instances (workflow_id, workflow_name, reference, started_by, started_at) values ($1,$2,$3,$4,$5) returning id`,
      [workflowId, w.name, reference, actor.id, new Date(now)]
    );
    for (const s2 of steps) {
      const first = s2.position === steps[0].position;
      const due = first ? addWorkingMinutes(now, s2.tat_minutes, settings.work) : null;
      await t.query(
        `insert into fms_tasks (source, title, instructions, owner_id, assigned_by, status, tat_minutes, released_at, due_at, instance_id, step_id, seq)
         values ('workflow',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [s2.what, s2.how, s2.owner_id, actor.id, first ? "open" : "waiting", s2.tat_minutes, first ? new Date(now) : null, due === null ? null : new Date(due), inst.id, s2.id, s2.position]
      );
    }
    await logActivity(t, actor.id, "instance.start", "instance", inst.id, { workflow: w.name, reference });
    return inst.id;
  });
}
async function cancelInstance(db, actor, instanceId, reasonRaw) {
  const reason = cleanText(reasonRaw, "Reason", { max: 300, required: true });
  await db.tx(async (t) => {
    const [i] = await t.query("select id, status, started_by from fms_workflow_instances where id = $1 for update", [instanceId]);
    need(i, "Workflow run not found");
    const allowed = isAdmin(actor) || actor.isCoordinator || i.started_by === actor.id;
    if (!allowed) throw new AppError("Only an admin, the coordinator or the person who started it can cancel a run.", 403);
    if (i.status !== "running") throw new AppError("This run is already finished.");
    await t.query(`update fms_tasks set status = 'cancelled' where instance_id = $1 and status in ('open','waiting')`, [instanceId]);
    await t.query(`update fms_workflow_instances set status='cancelled', cancelled_reason=$2, completed_at=now() where id=$1`, [instanceId, reason]);
    await logActivity(t, actor.id, "instance.cancel", "instance", instanceId, { reason });
  });
}
async function getInstance(db, id) {
  if (!isUuid(id)) return null;
  const [i] = await db.query(
    `select i.*, u.name as started_by_name from fms_workflow_instances i left join fms_users u on u.id = i.started_by where i.id = $1`,
    [id]
  );
  if (!i) return null;
  const steps = await db.query(
    `select t.id, t.seq, t.title, t.instructions, t.owner_id, u.name as owner_name, t.status, t.tat_minutes, t.released_at, t.due_at, t.completed_at, t.remarks
       from fms_tasks t join fms_users u on u.id = t.owner_id where t.instance_id = $1 order by t.seq`,
    [id]
  );
  return {
    id: i.id,
    workflowId: i.workflow_id,
    workflowName: i.workflow_name,
    reference: i.reference,
    status: i.status,
    startedBy: i.started_by,
    startedByName: i.started_by_name,
    startedAt: toMs(i.started_at),
    completedAt: toMs(i.completed_at),
    cancelledReason: i.cancelled_reason,
    steps: steps.map((s2) => ({
      taskId: s2.id,
      seq: s2.seq,
      title: s2.title,
      instructions: s2.instructions,
      ownerId: s2.owner_id,
      ownerName: s2.owner_name,
      status: s2.status,
      tatMinutes: s2.tat_minutes,
      releasedAt: toMs(s2.released_at),
      dueAt: toMs(s2.due_at),
      completedAt: toMs(s2.completed_at),
      remarks: s2.remarks
    }))
  };
}
async function listInstances(db, actor, opts = {}) {
  const status = opts.status ?? "running";
  const limit = Math.min(opts.limit ?? 200, 500);
  const seeAll = isAdmin(actor) || actor.isCoordinator;
  const params = [];
  const where = [];
  if (status !== "all") {
    params.push(status);
    where.push(`i.status = $${params.length}`);
  }
  if (opts.workflowId && isUuid(opts.workflowId)) {
    params.push(opts.workflowId);
    where.push(`i.workflow_id = $${params.length}::uuid`);
  }
  if (opts.id) {
    params.push(opts.id);
    where.push(`i.id = $${params.length}::uuid`);
  }
  if (!seeAll) {
    params.push(actor.id);
    const p = `$${params.length}`;
    if (actor.role === "manager") {
      where.push(`(i.started_by = ${p} or exists (
        with recursive d(id) as (select ${p}::uuid union select u.id from fms_users u join d on u.manager_id = d.id)
        select 1 from fms_tasks t where t.instance_id = i.id and t.owner_id in (select id from d)))`);
    } else {
      where.push(`(i.started_by = ${p} or exists (select 1 from fms_tasks t where t.instance_id = i.id and t.owner_id = ${p}))`);
    }
  }
  const rows = await db.query(
    `select i.id, i.workflow_name, i.reference, i.status, su.name as started_by_name, i.started_at,
            (select count(*)::int from fms_tasks t where t.instance_id = i.id) as total_steps,
            (select count(*)::int from fms_tasks t where t.instance_id = i.id and t.status = 'done') as done_steps,
            cur.title as cur_title, cu.name as cur_owner, cur.due_at as cur_due
       from fms_workflow_instances i
       left join fms_users su on su.id = i.started_by
       left join lateral (select t.title, t.owner_id, t.due_at from fms_tasks t where t.instance_id = i.id and t.status = 'open' order by t.seq limit 1) cur on true
       left join fms_users cu on cu.id = cur.owner_id
      ${where.length ? "where " + where.join(" and ") : ""}
      order by i.started_at desc limit ${limit}`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    workflowName: r.workflow_name,
    reference: r.reference,
    status: r.status,
    startedByName: r.started_by_name,
    startedAt: toMs(r.started_at),
    totalSteps: r.total_steps,
    doneSteps: r.done_steps,
    currentTitle: r.cur_title,
    currentOwner: r.cur_owner,
    currentDueAt: toMs(r.cur_due)
  }));
}
async function canViewInstance(db, actor, instanceId) {
  if (isAdmin(actor) || actor.isCoordinator) return true;
  if (!isUuid(instanceId)) return false;
  return (await listInstances(db, actor, { status: "all", limit: 1, id: instanceId })).length > 0;
}

// lib/scoring.ts
var r2 = (n) => Math.round(n * 100) / 100;
function computeScore(tasks, now, from, to) {
  let doneOnTime = 0;
  let doneLate = 0;
  let notDone = 0;
  for (const t of tasks) {
    if (!t.countsInMis || t.status === "cancelled" || t.status === "waiting" || t.dueAt === null) continue;
    if (from !== void 0 && t.dueAt < from) continue;
    if (to !== void 0 && t.dueAt >= to) continue;
    if (t.status === "done") {
      if (t.completedAt !== null && t.completedAt <= t.dueAt) doneOnTime++;
      else doneLate++;
    } else if (t.dueAt <= now) {
      notDone++;
    }
  }
  const planned = doneOnTime + doneLate + notDone;
  if (planned === 0) {
    return { planned: 0, doneOnTime: 0, doneLate: 0, notDone: 0, wndPct: 0, wndotPct: 0, mis: 0, onTimePct: 0, noData: true };
  }
  const wndPct = r2(notDone / planned * 100);
  const wndotPct = r2(doneLate / planned * 100);
  return {
    planned,
    doneOnTime,
    doneLate,
    notDone,
    wndPct,
    wndotPct,
    mis: r2(-(wndPct + wndotPct)) || 0,
    onTimePct: r2(doneOnTime / planned * 100),
    noData: false
  };
}

// lib/services/reports.ts
var WEEK = 7 * 864e5;
function weekBounds(now, weeksAgo = 0) {
  const from = startOfWeekIST(startOfWeekIST(now) - weeksAgo * WEEK + 12 * 36e5);
  return { from, to: from + WEEK };
}
async function fetchScoreRows(db, userIds, from, to) {
  if (userIds.length === 0) return [];
  const rows = await db.query(
    `select coalesce(scored_owner_id, owner_id) as uid, status, due_at, completed_at, counts_in_mis
       from fms_tasks
      where counts_in_mis and status in ('open','done') and due_at >= $2 and due_at < $3
        and coalesce(scored_owner_id, owner_id) = any($1::uuid[])`,
    [userIds, new Date(from), new Date(to)]
  );
  return rows.map((r) => ({ uid: r.uid, status: r.status, dueAt: toMs(r.due_at), completedAt: toMs(r.completed_at), countsInMis: r.counts_in_mis }));
}
async function scoreHistory(db, userId, weeks = 8, now = Date.now()) {
  const first = weekBounds(now, weeks - 1);
  const last = weekBounds(now, 0);
  const rows = await fetchScoreRows(db, [userId], first.from, last.to);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const b = weekBounds(now, w);
    out.push({ weekStart: b.from, weekEnd: b.to, score: computeScore(rows, now, b.from, b.to) });
  }
  return out;
}
async function scoredTasks(db, userId, from, to, work, now = Date.now()) {
  const rows = await db.query(
    `select ${TASK_SELECT}
      where t.counts_in_mis and t.status in ('open','done') and t.due_at >= $2 and t.due_at < $3
        and coalesce(t.scored_owner_id, t.owner_id) = $1
      order by t.due_at`,
    [userId, new Date(from), new Date(to)]
  );
  const out = [];
  for (const r of rows) {
    const t = mapTask(r);
    if (t.status === "done") {
      const late = t.completedAt > t.dueAt;
      out.push({ ...t, bucket: late ? "late" : "on_time", lateMinutes: late ? workingMinutesBetween(t.dueAt, t.completedAt, work) : 0 });
    } else if (t.dueAt <= now) {
      out.push({ ...t, bucket: "not_done", lateMinutes: workingMinutesBetween(t.dueAt, now, work) });
    }
  }
  return out;
}
async function getDashboard(db, userId, now = Date.now()) {
  const settings = await getSettings(db);
  const tasks = await listMyTasks(db, userId, now);
  const history = await scoreHistory(db, userId, 8, now);
  const today = istDateString(now);
  const wk = weekBounds(now, 0);
  let dueToday = 0, overdue = 0, upcoming = 0, waiting = 0, doneThisWeek = 0;
  for (const t of tasks) {
    if (t.status === "open") {
      if (t.dueAt < now) overdue++;
      else if (istDateString(t.dueAt) === today) dueToday++;
      else upcoming++;
    } else if (t.status === "waiting") waiting++;
    else if (t.status === "done" && t.completedAt >= wk.from) doneThisWeek++;
  }
  return {
    settings,
    tasks,
    counts: { dueToday, overdue, upcoming, waiting, doneThisWeek },
    week: history[history.length - 1].score,
    lastWeek: history[history.length - 2].score,
    history
  };
}
async function teamOverview(db, actor, now = Date.now()) {
  if (actor.role === "doer") throw new AppError("Team scores are visible to managers and admins.", 403);
  let ids;
  if (actor.role === "admin") {
    ids = (await db.query("select id from fms_users where active and id <> $1", [actor.id])).map((r) => r.id);
  } else {
    const d = await downlineIds(db, actor.id);
    ids = d.length ? (await db.query("select id from fms_users where active and id = any($1::uuid[])", [d])).map((r) => r.id) : [];
  }
  if (ids.length === 0) return [];
  const users = await db.query(
    `select u.id, u.name, u.emp_code, u.role, m.name as manager_name from fms_users u left join fms_users m on m.id = u.manager_id where u.id = any($1::uuid[])`,
    [ids]
  );
  const cur = weekBounds(now, 0);
  const prev = weekBounds(now, 1);
  const rows = await fetchScoreRows(db, ids, prev.from, cur.to);
  const counts = await db.query(
    `select owner_id, count(*) filter (where status='open')::int as open, count(*) filter (where status='open' and due_at < $2)::int as overdue
       from fms_tasks where owner_id = any($1::uuid[]) and source <> 'personal' and status = 'open' group by owner_id`,
    [ids, new Date(now)]
  );
  const cmap = new Map(counts.map((c) => [c.owner_id, c]));
  const out = users.map((u) => {
    const mine = rows.filter((r) => r.uid === u.id);
    const c = cmap.get(u.id);
    return {
      userId: u.id,
      name: u.name,
      empCode: u.emp_code,
      role: u.role,
      managerName: u.manager_name,
      week: computeScore(mine, now, cur.from, cur.to),
      lastWeek: computeScore(mine, now, prev.from, prev.to),
      open: c?.open ?? 0,
      overdue: c?.overdue ?? 0
    };
  });
  out.sort((a, b) => a.week.noData === b.week.noData ? a.week.mis - b.week.mis || a.name.localeCompare(b.name) : a.week.noData ? 1 : -1);
  return out;
}
async function personReport(db, actor, personId, now = Date.now()) {
  await requireViewPerson(db, actor, personId);
  const settings = await getSettings(db);
  const history = await scoreHistory(db, personId, 8, now);
  const b = weekBounds(now, 0);
  const b1 = weekBounds(now, 1);
  const [thisWeek, lastWeek] = await Promise.all([
    scoredTasks(db, personId, b.from, b.to, settings.work, now),
    scoredTasks(db, personId, b1.from, b1.to, settings.work, now)
  ]);
  const open = (await listMyTasks(db, personId, now, 7)).filter((t) => actor.id === personId || t.source !== "personal");
  return { settings, history, thisWeek, lastWeek, open };
}
async function coordinatorBoard(db, actor, f = {}, now = Date.now()) {
  if (!canSeeCoordinatorBoard(actor)) throw new AppError("The coordinator board is for the process coordinator and admins.", 403);
  const settings = await getSettings(db);
  const days = [7, 30, 90].includes(f.days ?? 7) ? f.days ?? 7 : 7;
  const LIMIT = 300;
  const build = (base, params) => {
    if (f.workflowId) {
      params.push(f.workflowId);
      base.push(`i.workflow_id = $${params.length}::uuid`);
    }
    if (f.ownerId) {
      params.push(f.ownerId);
      base.push(`t.owner_id = $${params.length}::uuid`);
    }
    return base.join(" and ");
  };
  const p1 = [new Date(now)];
  const w1 = build([`t.status = 'open'`, `t.source <> 'personal'`, `t.due_at < $1`], p1);
  const overdueRows = await db.query(
    `select ${TASK_COLS}, (select count(*)::int from fms_tasks w where w.instance_id = t.instance_id and w.status = 'waiting') as downstream
      ${TASK_FROM}
      where ${w1} order by t.due_at limit ${LIMIT + 1}`,
    p1
  );
  const p2 = [new Date(now - days * 864e5)];
  const w2 = build([`t.status = 'done'`, `t.source <> 'personal'`, `t.completed_at > t.due_at`, `t.completed_at >= $1`], p2);
  const lateRows = await db.query(
    `select ${TASK_COLS}, 0 as downstream ${TASK_FROM} where ${w2} order by t.completed_at desc limit ${LIMIT + 1}`,
    p2
  );
  const p3 = [new Date(now)];
  const w3 = build([`t.status = 'waiting'`, `b.status = 'open'`, `b.due_at < $1`], p3);
  const blockedRows = await db.query(
    `select ${TASK_COLS}, b.title as blocker_title, bo.name as blocker_owner, b.due_at as blocker_due
      ${TASK_FROM}
      join fms_tasks b on b.instance_id = t.instance_id and b.status = 'open'
      join fms_users bo on bo.id = b.owner_id
      where ${w3} order by b.due_at limit ${LIMIT + 1}`,
    p3
  );
  const truncated = overdueRows.length > LIMIT || lateRows.length > LIMIT || blockedRows.length > LIMIT;
  const overdue = overdueRows.slice(0, LIMIT).map((r) => {
    const t = mapTask(r);
    return { ...t, lateMinutes: workingMinutesBetween(t.dueAt, now, settings.work), downstreamWaiting: r.downstream };
  });
  const lateDone = lateRows.slice(0, LIMIT).map((r) => {
    const t = mapTask(r);
    return { ...t, lateMinutes: workingMinutesBetween(t.dueAt, t.completedAt, settings.work), downstreamWaiting: 0 };
  });
  const blocked = blockedRows.slice(0, LIMIT).map((r) => {
    const t = mapTask(r);
    const due = toMs(r.blocker_due);
    return { ...t, blockerTitle: r.blocker_title, blockerOwner: r.blocker_owner, blockerDueAt: due, blockerLateMinutes: workingMinutesBetween(due, now, settings.work) };
  });
  const wf = /* @__PURE__ */ new Map();
  const ow = /* @__PURE__ */ new Map();
  const bump = (m, key, name, field) => {
    const e = m.get(key) ?? { name, overdue: 0, lateDone: 0, blocked: 0 };
    e[field]++;
    m.set(key, e);
  };
  const wfName = (t) => t.workflowName ?? (t.source === "recurring" ? "Recurring tasks" : "Assigned tasks");
  for (const t of overdue) {
    bump(wf, wfName(t), wfName(t), "overdue");
    bump(ow, t.ownerId, t.ownerName, "overdue");
  }
  for (const t of lateDone) {
    bump(wf, wfName(t), wfName(t), "lateDone");
    bump(ow, t.ownerId, t.ownerName, "lateDone");
  }
  for (const t of blocked) bump(wf, wfName(t), wfName(t), "blocked");
  const [{ n }] = await db.query(`select count(*)::int as n from fms_workflow_instances where status = 'running'`);
  return {
    settings,
    overdue,
    lateDone,
    blocked,
    byWorkflow: [...wf.values()].sort((a, b) => b.overdue + b.blocked - (a.overdue + a.blocked)),
    byOwner: [...ow.values()].sort((a, b) => b.overdue + b.lateDone - (a.overdue + a.lateDone)),
    runningRuns: n,
    truncated
  };
}
async function navCounts(db, actor, now = Date.now()) {
  const [mine] = await db.query(`select count(*)::int as n from fms_tasks where owner_id = $1 and status = 'open' and due_at < $2`, [actor.id, new Date(now)]);
  let boardOverdue = 0;
  if (canSeeCoordinatorBoard(actor)) {
    const [b] = await db.query(`select count(*)::int as n from fms_tasks where status = 'open' and source <> 'personal' and due_at < $1`, [new Date(now)]);
    boardOverdue = b.n;
  }
  return { myOverdue: mine.n, boardOverdue };
}

// index.ts
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
var weekArg = (v) => Math.min(7, Math.max(0, Number.parseInt(String(v ?? "0"), 10) || 0));
var s = (v) => typeof v === "string" ? v : v == null ? "" : String(v);
async function emailFromRequest(req) {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}
async function actorForEmail(db, email) {
  const [row] = await db.query("select id from fms_users where lower(email) = $1 and active", [email]);
  if (!row) return null;
  const user = await getUser(db, row.id);
  return { user, actor: toActor(user) };
}
var ops = {
  // ------------------------------------------------------------------ pages
  "page.dashboard": async (db, actor, _a, now) => {
    await generateRecurring(db, now, actor.id);
    const dash = await getDashboard(db, actor.id, now);
    const wk = weekBounds(now, 0);
    const scored = await scoredTasks(db, actor.id, wk.from, wk.to, dash.settings.work, now);
    return { ...dash, scored };
  },
  "page.score": async (db, actor, a, now) => {
    const w = weekArg(a.w);
    const [settings, history] = await Promise.all([getSettings(db), scoreHistory(db, actor.id, 8, now)]);
    const b = weekBounds(now, w);
    return { settings, history, weekOffset: w, tasks: await scoredTasks(db, actor.id, b.from, b.to, settings.work, now) };
  },
  "page.person": async (db, actor, a, now) => {
    const person = await getUser(db, s(a.id));
    if (!person) throw new AppError("Person not found", 404);
    const w = weekArg(a.w);
    const report = await personReport(db, actor, person.id, now);
    const b = weekBounds(now, w);
    return { person, ...report, weekOffset: w, tasks: await scoredTasks(db, person.id, b.from, b.to, report.settings.work, now) };
  },
  "page.taskById": async (db, actor, a) => {
    const task = await getTask(db, s(a.id));
    if (!task || !await canViewTask(db, actor, task)) throw new AppError("Task not found", 404);
    const { work } = await getSettings(db);
    const instance = task.instanceId ? await getInstance(db, task.instanceId) : null;
    const people = await canReassign(db, actor, task) ? await allActivePeople(db) : null;
    return { task, work, instance, people };
  },
  "page.newTask": async (db, actor) => ({ people: await assignableUsers(db, actor) }),
  "page.workflows": async (db, actor) => ({
    workflows: await listWorkflows(db, actor, { includeArchived: true }),
    settings: await getSettings(db)
  }),
  "page.workflow": async (db, actor, a) => {
    const wf = await getWorkflow(db, actor, s(a.id));
    if (!wf) throw new AppError("Workflow not found", 404);
    return {
      workflow: wf,
      settings: await getSettings(db),
      people: await allActivePeople(db),
      runs: await listInstances(db, actor, { status: "running", limit: 8, workflowId: wf.id })
    };
  },
  "page.workflowForm": async (db, actor, a) => {
    const wf = a.id ? await getWorkflow(db, actor, s(a.id)) : null;
    if (a.id && !wf) throw new AppError("Workflow not found", 404);
    return { workflow: wf, settings: await getSettings(db), people: await allActivePeople(db) };
  },
  "page.runs": async (db, actor, a) => {
    const st = ["running", "completed", "cancelled", "all"].includes(a.status) ? a.status : "running";
    return { runs: await listInstances(db, actor, { status: st }), status: st };
  },
  "page.run": async (db, actor, a) => {
    const id = s(a.id);
    if (!await canViewInstance(db, actor, id)) throw new AppError("Workflow run not found", 404);
    const run = await getInstance(db, id);
    if (!run) throw new AppError("Workflow run not found", 404);
    const reassignable = [];
    for (const st of run.steps) {
      if (await canReassign(db, actor, { ownerId: st.ownerId, source: "workflow", status: st.status })) reassignable.push(st.taskId);
    }
    return {
      run,
      settings: await getSettings(db),
      people: reassignable.length ? await allActivePeople(db) : [],
      reassignable,
      canCancel: run.status === "running" && (actor.role === "admin" || actor.isCoordinator || run.startedBy === actor.id)
    };
  },
  "page.recurring": async (db, actor) => {
    if (actor.role === "doer") throw new AppError("Recurring tasks are managed by managers and admins.", 403);
    return { items: await listRecurring(db, actor), people: await assignableUsers(db, actor) };
  },
  "page.team": async (db, actor, _a, now) => ({ team: await teamOverview(db, actor, now), settings: await getSettings(db) }),
  "page.coordinator": async (db, actor, a, now) => {
    const f = {
      workflowId: isUuid(a.workflowId) ? a.workflowId : void 0,
      ownerId: isUuid(a.ownerId) ? a.ownerId : void 0,
      days: [7, 30, 90].includes(Number(a.days)) ? Number(a.days) : 7
    };
    return {
      board: await coordinatorBoard(db, actor, f, now),
      workflows: await listWorkflows(db, actor, { includeArchived: true }),
      people: await allActivePeople(db),
      filters: f
    };
  },
  "page.adminUsers": async (db, actor) => {
    if (actor.role !== "admin") throw new AppError("Only an admin can do this.", 403);
    return { users: await listUsers(db) };
  },
  "page.adminUser": async (db, actor, a) => {
    if (actor.role !== "admin") throw new AppError("Only an admin can do this.", 403);
    const user = a.id ? await getUser(db, s(a.id)) : null;
    if (a.id && !user) throw new AppError("Person not found", 404);
    return { user, managers: (await listUsers(db, { activeOnly: true })).filter((u) => u.role !== "doer") };
  },
  "page.settings": async (db, actor) => {
    if (actor.role !== "admin") throw new AppError("Only an admin can do this.", 403);
    return { settings: await getSettings(db), holidays: await listHolidays(db) };
  },
  // -------------------------------------------------------------- actions
  "task.complete": async (db, actor, a) => completeTask(db, actor, s(a.taskId), s(a.remarks)),
  "task.create": async (db, actor, a) => {
    const input = { title: s(a.title), instructions: s(a.instructions), dueDate: s(a.dueDate), dueTime: s(a.dueTime), ownerId: s(a.ownerId) || void 0 };
    return { id: a.kind === "delegated" ? await createDelegatedTask(db, actor, input) : await createPersonalTask(db, actor, input) };
  },
  "task.reassign": async (db, actor, a) => {
    await reassignTask(db, actor, s(a.taskId), s(a.ownerId));
    return { ok: true };
  },
  "workflow.save": async (db, actor, a) => {
    const steps = (Array.isArray(a.steps) ? a.steps : []).map((st, i) => {
      const h = Number(st.hours ?? 0);
      const m = Number(st.minutes ?? 0);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) throw new AppError(`Step ${i + 1}: enter a valid time allowed.`);
      return { what: s(st.what), how: s(st.how), tatMinutes: Math.round(h * 60 + m), ownerId: s(st.ownerId) };
    });
    const id = await saveWorkflow(db, actor, a.id ? s(a.id) : null, {
      name: s(a.name),
      description: s(a.description),
      steps,
      startAccess: actor.role === "admin" && a.startAccess ? a.startAccess : void 0,
      starterIds: Array.isArray(a.starterIds) ? a.starterIds.map(s) : []
    });
    return { id };
  },
  "workflow.start": async (db, actor, a) => ({ id: await startInstance(db, actor, s(a.workflowId), s(a.reference)) }),
  "workflow.archive": async (db, actor, a) => {
    await setWorkflowArchived(db, actor, s(a.workflowId), !!a.archive);
    return { ok: true };
  },
  "workflow.access": async (db, actor, a) => {
    await setStartAccess(db, actor, s(a.workflowId), a.startAccess, Array.isArray(a.starterIds) ? a.starterIds.map(s) : []);
    return { ok: true };
  },
  "run.cancel": async (db, actor, a) => {
    await cancelInstance(db, actor, s(a.instanceId), s(a.reason));
    return { ok: true };
  },
  "recurring.save": async (db, actor, a) => ({
    id: await saveRecurring(db, actor, a.id ? s(a.id) : null, {
      title: s(a.title),
      instructions: s(a.instructions),
      ownerId: s(a.ownerId),
      weekdays: Array.isArray(a.weekdays) ? a.weekdays.map(Number) : [],
      dueMinute: Number(a.dueMinute)
    })
  }),
  "recurring.toggle": async (db, actor, a) => {
    await setRecurringActive(db, actor, s(a.id), !!a.active);
    return { ok: true };
  },
  "user.save": async (db, actor, a) => {
    const email = s(a.email).trim();
    if (!email) throw new AppError("Enter the EnqBoss login email. It is how this person signs in to FMS.");
    const input = {
      empCode: s(a.empCode),
      name: s(a.name),
      email,
      role: s(a.role),
      isCoordinator: !!a.isCoordinator,
      canCreateWorkflows: !!a.canCreateWorkflows,
      managerId: s(a.managerId) || null
    };
    if (a.id) return { user: await updateUser(db, actor, s(a.id), { ...input, active: !!a.active }) };
    const { user } = await createUser(db, actor, input);
    await db.query("update fms_users set must_change_pin = false where id = $1", [user.id]);
    return { user: { ...user, mustChangePin: false } };
  },
  "settings.update": async (db, actor, a) => updateSettings(db, actor, {
    workStart: Number(a.workStart),
    workEnd: Number(a.workEnd),
    lunchStart: a.lunchStart === null || a.lunchStart === "" ? null : Number(a.lunchStart),
    lunchEnd: a.lunchEnd === null || a.lunchEnd === "" ? null : Number(a.lunchEnd),
    weeklyOffs: Array.isArray(a.weeklyOffs) ? a.weeklyOffs.map(Number) : [],
    misGreenLimit: Number(a.misGreenLimit),
    misAmberLimit: Number(a.misAmberLimit)
  }),
  "holiday.add": async (db, actor, a) => addHoliday(db, actor, s(a.day), s(a.name)),
  "holiday.remove": async (db, actor, a) => removeHoliday(db, actor, s(a.day))
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const op = s(body.op);
  const args = body.args ?? {};
  try {
    const db = getDb();
    if (op === "health") {
      const [r] = await db.query("select count(*)::int as n from fms_users");
      return json({ ok: true, users: r.n });
    }
    const email = await emailFromRequest(req);
    if (!email) return json({ error: "Please sign in to EnqBoss again.", status: 401 });
    const me = await actorForEmail(db, email);
    if (op === "me") {
      if (!me) return json({ registered: false, email });
      return json({ registered: true, email, user: me.user, actor: me.actor, counts: await navCounts(db, me.actor), canSeeBoard: canSeeCoordinatorBoard(me.actor) });
    }
    if (!me) return json({ error: `${email} is not set up in FMS yet. Ask an FMS admin to add you under People.`, status: 403 });
    const h = ops[op];
    if (!h) return json({ error: `Unknown action: ${op}`, status: 400 });
    return json({ data: await h(db, me.actor, args, Date.now()) });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message, status: e.status }, 200);
    console.error("[fms]", op, e);
    return json({ error: "Something went wrong on the server. Try again.", status: 500 });
  }
});
