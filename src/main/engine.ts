import type { DayStat, Phase, ReminderView, Settings, Snapshot } from "../shared/types";
import { isWorkTime, nextWorkStart } from "../shared/time";

/**
 * 计时状态机
 * ─────────────────────────────────────────────
 *   WORKING ⇄ REMINDING → MOVING → WORKING
 *      ↓          ↓
 *   PAUSED     (snooze / skip)
 *      ↓
 *  OFF_DUTY（非工作时段）
 *
 * 所有计时均以「真实时间戳差」计算，不依赖 setInterval 累加：
 *  - 应用最小化/后台：Electron 主进程定时器不受渲染进程节流影响
 *  - 系统休眠：两次 tick 的时间差超过阈值时，这段时间不计入工作时长
 *  - 应用重启：状态与 lastTick 都落盘，恢复时按时间差补偿
 *  - 系统时间前后跳变：负差值按 0 处理，不会倒退或暴增
 */

/** 单次 tick 间隔超过此值，视为系统休眠/挂起，该段时间不计入工作时长 */
const SLEEP_GAP_MS = 30_000;

/** 系统时间回拨的容忍上限，超过则重新对齐而不做任何累计 */
const CLOCK_BACK_MS = 5 * 60_000;

export interface EngineState {
  phase: Phase;
  /** 本轮已累计工作时长（毫秒） */
  sessionMs: number;
  /** 上次 tick 的墙钟时间 */
  lastTick: number;
  /** 活动倒计时截止时间 */
  moveDeadline: number | null;
  moveStartedAt: number | null;
  moveTotalMs: number;
  /** 稍后提醒时间点 */
  snoozeUntil: number | null;
  /** 暂停截止时间；null + phase=paused 表示手动恢复型暂停 */
  pauseUntil: number | null;
  reminder: ReminderView | null;
  /** 提醒序号，用于保证同一时刻只存在一个提醒 */
  reminderSeq: number;
  inWindow: boolean;
}

export interface StatsState {
  days: Record<string, DayStat>;
}

export type TickEvent =
  | { type: "none" }
  | { type: "reminder"; reminder: ReminderView }
  | { type: "move-completed"; stat: DayStat }
  | { type: "window-changed"; inWindow: boolean };

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyDay(date: string): DayStat {
  return { date, completed: 0, skipped: 0, moveSeconds: 0, reminded: 0 };
}

export function initialState(settings: Settings, now = Date.now()): EngineState {
  return {
    phase: isWorkTime(settings, new Date(now)) ? "working" : "offduty",
    sessionMs: 0,
    lastTick: now,
    moveDeadline: null,
    moveStartedAt: null,
    moveTotalMs: 0,
    snoozeUntil: null,
    pauseUntil: null,
    reminder: null,
    reminderSeq: 0,
    inWindow: isWorkTime(settings, new Date(now)),
  };
}

const REMINDER_TITLES: Array<[string, string]> = [
  ["🌱", "该起来伸展一下啦！"],
  ["🪑", "椅子也需要休息一会儿。"],
  ["💧", "喝点水，顺便走两步。"],
  ["🚶", "起来走走，换个状态。"],
  ["✨", "已经专注很久了，活动一下吧！"],
  ["🌤️", "起身两分钟，肩膀会谢谢你。"],
  ["🍃", "换个姿势，也换个心情。"],
  ["☕", "眼睛和腰都该歇会儿了。"],
];

const ACTIVITIES = ["站起来伸展", "走动两三分钟", "肩颈放松", "手腕活动", "远眺窗外", "接杯水"];

let lastPick = -1;

function pickIndex(len: number, salt: number): number {
  // 避免连续两次相同文案
  for (let attempt = 0; attempt < 8; attempt++) {
    const i = Math.floor(Math.random() * len);
    if (i !== lastPick || len === 1) {
      lastPick = i;
      return i;
    }
  }
  return Math.floor(Math.random() * len);
  void salt;
}

export function makeReminder(settings: Settings, workedMs: number, seq: number): ReminderView {
  const [emoji, title] = REMINDER_TITLES[pickIndex(REMINDER_TITLES.length, seq)];
  const activity = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
  return {
    seq,
    emoji,
    title,
    activity,
    workedMinutes: Math.max(1, Math.round(workedMs / 60_000)),
    moveMinutes: settings.moveMinutes,
  };
}

export class Engine {
  settings: Settings;
  state: EngineState;
  stats: StatsState;
  /** 统计变化后由外部置位，用于决定是否落盘 */
  dirty = false;

  constructor(settings: Settings, state: EngineState, stats: StatsState) {
    this.settings = settings;
    this.state = state;
    this.stats = stats;
  }

  private today(): DayStat {
    const key = todayKey();
    if (!this.stats.days[key]) {
      this.stats.days[key] = emptyDay(key);
      this.dirty = true;
    }
    return this.stats.days[key];
  }

  /** 推进状态机，返回本次 tick 产生的事件（可能没有） */
  tick(now = Date.now(), opts: { creditWhilePaused?: boolean } = {}): TickEvent {
    const st = this.state;
    const settings = this.settings;
    const prevPhase = st.phase;
    const prevInWindow = st.inWindow;

    const inWindow = isWorkTime(settings, new Date(now));
    st.inWindow = inWindow;

    // ── 时间跳变处理 ────────────────────────────
    const delta = now - st.lastTick;
    if (delta < -CLOCK_BACK_MS) {
      // 系统时间被大幅回拨：重新对齐，不累计
      st.lastTick = now;
      return { type: "none" };
    }
    const effectiveDelta = delta > 0 ? Math.min(delta, SLEEP_GAP_MS) : 0;
    const slept = delta > SLEEP_GAP_MS;
    st.lastTick = now;

    // ── 工作时段边界 ────────────────────────────
    if (!inWindow) {
      if (st.phase === "working" || st.phase === "reminding") {
        st.phase = "offduty";
        st.snoozeUntil = null;
        st.reminder = null;
        this.dirty = true;
      }
      // 非工作时段不保留工作计时（暂停态除外，暂停有独立计时）
      if (st.phase === "offduty" && st.sessionMs !== 0) {
        st.sessionMs = 0;
        this.dirty = true;
      }
    } else if (st.phase === "offduty") {
      st.phase = "working";
      st.sessionMs = 0;
      st.snoozeUntil = null;
      this.dirty = true;
    }

    // ── 暂停到期自动恢复 ────────────────────────
    if (st.phase === "paused" && st.pauseUntil !== null && now >= st.pauseUntil) {
      st.phase = inWindow ? "working" : "offduty";
      st.pauseUntil = null;
      st.sessionMs = 0;
      this.dirty = true;
    }

    // ── 活动倒计时完成 ──────────────────────────
    if (st.phase === "moving" && st.moveDeadline !== null && now >= st.moveDeadline) {
      // 按真实起始时间结算，避免统计为 0
      const stat = this.completeMove(st.moveStartedAt, st.moveDeadline);
      return { type: "move-completed", stat };
    }

    // ── 工作计时与提醒 ──────────────────────────
    if (st.phase === "working") {
      if (st.snoozeUntil !== null) {
        if (now >= st.snoozeUntil) {
          st.snoozeUntil = null;
          return this.enterReminder(now);
        }
      } else {
        // 休眠后不补通知；醒来重新从 0 开始更符合直觉
        if (slept) {
          st.sessionMs = Math.min(st.sessionMs, 0);
          this.dirty = true;
        } else {
          st.sessionMs += effectiveDelta;
        }
        if (st.sessionMs >= settings.intervalMinutes * 60_000) {
          return this.enterReminder(now);
        }
      }
    } else if (st.phase === "paused" && opts.creditWhilePaused) {
      // 预留：暂停期间是否需要计时（当前不需要）
    }

    if (prevPhase !== st.phase) this.dirty = true;
    if (prevInWindow !== inWindow) return { type: "window-changed", inWindow };
    return { type: "none" };
  }

  private enterReminder(now: number): TickEvent {
    const st = this.state;
    const settings = this.settings;
    st.phase = "reminding";
    st.reminderSeq += 1;
    st.reminder = makeReminder(settings, st.sessionMs, st.reminderSeq);
    st.snoozeUntil = null;
    const day = this.today();
    day.reminded += 1;
    this.dirty = true;
    void now;
    return { type: "reminder", reminder: st.reminder };
  }

  /** 记录一次活动完成 */
  private completeMove(startedAt: number | null, endedAt: number): DayStat {
    const st = this.state;
    const elapsed = Math.max(0, endedAt - (startedAt ?? endedAt));
    const day = this.today();
    day.completed += 1;
    day.moveSeconds += Math.round(elapsed / 1000);
    st.phase = isWorkTime(this.settings, new Date(endedAt)) ? "working" : "offduty";
    st.sessionMs = 0;
    st.moveDeadline = null;
    st.moveStartedAt = null;
    st.moveTotalMs = 0;
    st.snoozeUntil = null;
    st.reminder = null;
    this.dirty = true;
    return day;
  }

  // ── 用户操作 ─────────────────────────────────

  startMove(now = Date.now()): boolean {
    const st = this.state;
    if (st.phase === "moving") return false;
    const total = this.settings.moveMinutes * 60_000;
    st.phase = "moving";
    st.moveStartedAt = now;
    st.moveDeadline = now + total;
    st.moveTotalMs = total;
    st.sessionMs = 0;
    st.snoozeUntil = null;
    st.reminder = null;
    st.pauseUntil = null;
    this.dirty = true;
    return true;
  }

  /** 提前结束活动（按实际时长记录一次完成） */
  finishMoveEarly(now = Date.now()): boolean {
    const st = this.state;
    if (st.phase !== "moving") return false;
    this.completeMove(st.moveStartedAt, now);
    return true;
  }

  /** 放弃本次活动，不计入统计 */
  cancelMove(now = Date.now()): boolean {
    const st = this.state;
    if (st.phase !== "moving") return false;
    st.phase = isWorkTime(this.settings, new Date(now)) ? "working" : "offduty";
    st.sessionMs = 0;
    st.moveDeadline = null;
    st.moveStartedAt = null;
    st.moveTotalMs = 0;
    st.reminder = null;
    this.dirty = true;
    return true;
  }

  /** 稍后提醒：不重置本轮工作计时 */
  snooze(minutes?: number, now = Date.now()): boolean {
    const st = this.state;
    if (st.phase !== "reminding" && st.phase !== "working") return false;
    const mins = minutes ?? this.settings.snoozeMinutes;
    st.phase = isWorkTime(this.settings, new Date(now)) ? "working" : "offduty";
    st.snoozeUntil = now + Math.max(1, mins) * 60_000;
    if (st.phase === "offduty") st.snoozeUntil = null;
    st.reminder = null;
    this.dirty = true;
    return true;
  }

  /** 跳过本次：记录跳过 + 重新开始计时 */
  skip(now = Date.now()): boolean {
    const st = this.state;
    if (st.phase === "moving") return this.cancelMove(now);
    if (st.phase !== "reminding" && st.phase !== "working") return false;
    const day = this.today();
    day.skipped += 1;
    st.phase = isWorkTime(this.settings, new Date(now)) ? "working" : "offduty";
    st.sessionMs = 0;
    st.snoozeUntil = null;
    st.reminder = null;
    this.dirty = true;
    return true;
  }

  reset(now = Date.now()): boolean {
    const st = this.state;
    st.sessionMs = 0;
    st.snoozeUntil = null;
    st.reminder = null;
    if (st.phase === "reminding") {
      st.phase = isWorkTime(this.settings, new Date(now)) ? "working" : "offduty";
    }
    this.dirty = true;
    return true;
  }

  /** minutes=null 表示手动恢复型暂停 */
  pause(minutes: number | null, now = Date.now()): boolean {
    const st = this.state;
    if (st.phase === "moving") return false;
    st.pauseUntil = minutes === null ? null : now + Math.max(1, minutes) * 60_000;
    st.phase = "paused";
    st.snoozeUntil = null;
    st.reminder = null;
    this.dirty = true;
    return true;
  }

  resume(now = Date.now()): boolean {
    const st = this.state;
    if (st.phase !== "paused") return false;
    st.phase = isWorkTime(this.settings, new Date(now)) ? "working" : "offduty";
    st.pauseUntil = null;
    st.sessionMs = 0;
    this.dirty = true;
    return true;
  }

  applySettings(next: Settings, now = Date.now()): void {
    const prevInterval = this.settings.intervalMinutes;
    this.settings = next;
    const st = this.state;
    if (st.phase === "working" && next.intervalMinutes < prevInterval) {
      // 缩短间隔后若已超时则立即提醒，但不叠加
      if (st.sessionMs >= next.intervalMinutes * 60_000 && st.snoozeUntil === null) {
        this.enterReminder(now);
      }
    }
    if (st.phase === "moving") {
      // 活动时长修改只影响下一次
      st.moveTotalMs = next.moveMinutes * 60_000;
    }
    this.dirty = true;
  }

  clearStats(): void {
    this.stats = { days: {} };
    this.dirty = true;
  }

  streak(goal: number, now = new Date()): number {
    let count = 0;
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    const todayDone = (this.stats.days[todayKey(now)]?.completed ?? 0) >= goal;
    if (!todayDone) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 400; i++) {
      const key = todayKey(cursor);
      const d = this.stats.days[key];
      if (d && d.completed >= goal) {
        count += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }

  recent(n: number, now = new Date()): DayStat[] {
    const out: DayStat[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      out.push(this.stats.days[key] ?? emptyDay(key));
    }
    return out;
  }

  snapshot(now = Date.now()): Snapshot {
    const st = this.state;
    const settings = this.settings;
    const intervalMs = settings.intervalMinutes * 60_000;
    const inWindow = isWorkTime(settings, new Date(now));

    let remainingMs = 0;
    let progress = 0;
    let moveRemaining = 0;

    switch (st.phase) {
      case "working": {
        remainingMs =
          st.snoozeUntil !== null
            ? Math.max(0, st.snoozeUntil - now)
            : Math.max(0, intervalMs - st.sessionMs);
        progress = Math.min(1, Math.max(0, st.sessionMs / intervalMs));
        break;
      }
      case "reminding":
        remainingMs = 0;
        progress = 1;
        break;
      case "moving": {
        moveRemaining = Math.max(0, (st.moveDeadline ?? now) - now);
        remainingMs = moveRemaining;
        progress =
          st.moveTotalMs > 0 ? Math.min(1, Math.max(0, 1 - moveRemaining / st.moveTotalMs)) : 0;
        break;
      }
      case "paused":
        remainingMs = st.pauseUntil === null ? -1 : Math.max(0, st.pauseUntil - now);
        break;
      case "offduty":
        remainingMs = Math.max(0, (nextWorkStart(settings, new Date(now)) ?? now) - now);
        break;
    }

    const ws = nextWorkStart(settings, new Date(now));
    return {
      phase: st.phase,
      now,
      remainingMs,
      progress,
      sessionMs: Math.round(st.sessionMs),
      intervalMs,
      moveTotalMs: st.moveTotalMs,
      moveRemainingMs: moveRemaining,
      snoozeUntil: st.snoozeUntil,
      pauseUntil: st.pauseUntil,
      pauseIsManual: st.phase === "paused" && st.pauseUntil === null,
      inWindow,
      nextWorkStart: ws,
      workStart: settings.workStart,
      workEnd: settings.workEnd,
      reminder: st.phase === "reminding" ? st.reminder : null,
      today: this.stats.days[todayKey()] ?? emptyDay(todayKey()),
      goal: settings.dailyGoal,
      streak: this.streak(settings.dailyGoal, new Date(now)),
      week: this.recent(7, new Date(now)),
    };
  }

  /** 供落盘使用：裁剪 120 天前的数据 */
  prune(days = 120): void {
    const keys = Object.keys(this.stats.days).sort();
    if (keys.length <= days) return;
    for (const k of keys.slice(0, keys.length - days)) delete this.stats.days[k];
  }
}