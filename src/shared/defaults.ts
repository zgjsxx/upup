import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 45,
  moveMinutes: 3,
  soundEnabled: false,
  desktopNotification: true,
  autostart: false,
  workStart: "09:00",
  workEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  theme: "system",
  language: "zh-CN",
  reduceMotion: false,
  minimizeToTray: true,
  dailyGoal: 4,
  snoozeMinutes: 5,
  trayHintShown: false,
};

export const INTERVAL_PRESETS = [20, 30, 45, 60, 90] as const;
export const MOVE_PRESETS = [1, 3, 5, 10] as const;
export const PAUSE_PRESETS = [15, 30, 60, 120] as const;
export const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeSettings(input: Partial<Settings>, base: Settings): Settings {
  const s: Settings = { ...base, ...input };
  s.intervalMinutes = clamp(s.intervalMinutes, 1, 480);
  s.moveMinutes = clamp(s.moveMinutes, 1, 120);
  s.snoozeMinutes = clamp(s.snoozeMinutes, 1, 60);
  s.dailyGoal = clamp(s.dailyGoal, 1, 30);
  s.workDays = Array.from(new Set((s.workDays ?? []).filter((d) => d >= 1 && d <= 7))).sort(
    (a, b) => a - b,
  );
  if (s.workDays.length === 0) s.workDays = [1, 2, 3, 4, 5];
  if (!/^\d{2}:\d{2}$/.test(s.workStart)) s.workStart = "09:00";
  if (!/^\d{2}:\d{2}$/.test(s.workEnd)) s.workEnd = "18:00";
  if (!["system", "light", "dark"].includes(s.theme)) s.theme = "system";
  if (!["zh-CN", "en-US"].includes(s.language)) s.language = "zh-CN";
  s.soundEnabled = Boolean(s.soundEnabled);
  s.desktopNotification = Boolean(s.desktopNotification);
  s.autostart = Boolean(s.autostart);
  s.reduceMotion = Boolean(s.reduceMotion);
  s.minimizeToTray = Boolean(s.minimizeToTray);
  s.trayHintShown = Boolean(s.trayHintShown);
  return s;
}