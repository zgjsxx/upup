import type { Settings } from "../shared/types";

/** "HH:MM" → 当天分钟数 */
export function parseHhmm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

export function formatHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO 星期：周一 = 1 … 周日 = 7 */
export function isoWeekday(d: Date): number {
  const js = d.getDay(); // 0=Sun
  return js === 0 ? 7 : js;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export interface WorkWindow {
  start: number;
  end: number;
}

/** 返回给定日期所在「工作日窗口」；若该日不是工作日则返回 null */
export function windowForDate(settings: Settings, date: Date): WorkWindow | null {
  const s = parseHhmm(settings.workStart);
  const e = parseHhmm(settings.workEnd);
  if (s === null || e === null || s === e) return null;
  if (!settings.workDays.includes(isoWeekday(date))) return null;

  const base = startOfDay(date);
  if (s < e) {
    const start = new Date(base);
    start.setMinutes(s);
    const end = new Date(base);
    end.setMinutes(e);
    return { start: start.getTime(), end: end.getTime() };
  }
  // 跨夜：22:00 → 次日 06:00
  const start = new Date(base);
  start.setMinutes(s);
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  end.setMinutes(e);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * 判断此刻是否在工作时间内。
 * 跨夜时段时，凌晨部分归属于「前一天」的工作日，需要向前多查一天。
 */
export function activeWindow(settings: Settings, now: Date): WorkWindow | null {
  const t = now.getTime();
  for (const offset of [0, -1, 1]) {
    const w = windowForDate(settings, addDays(now, offset));
    if (!w) continue;
    if (t >= w.start && t < w.end) return w;
  }
  return null;
}

export function isWorkTime(settings: Settings, now: Date = new Date()): boolean {
  return activeWindow(settings, now) !== null;
}

/** 下一个工作窗口开始时间戳 */
export function nextWorkStart(settings: Settings, now: Date = new Date()): number | null {
  for (let i = 0; i <= 14; i++) {
    const w = windowForDate(settings, addDays(now, i));
    if (w && w.start > now.getTime()) return w.start;
  }
  return null;
}

/** 当前窗口的结束时间戳；不在窗口内则 null */
export function currentWindowEnd(settings: Settings, now: Date = new Date()): number | null {
  const w = activeWindow(settings, now);
  return w ? w.end : null;
}

export function humanDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分钟`;
  return `${totalSec} 秒`;
}

/** 倒计时 → mm:ss，超过 1 小时用 h:mm:ss */
export function countdownText(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}