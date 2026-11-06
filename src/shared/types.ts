/** 主进程与渲染进程共用的类型定义 */

export type Phase = "working" | "reminding" | "moving" | "paused" | "offduty";

export type ThemeMode = "system" | "light" | "dark";

export interface Settings {
  /** 久坐提醒间隔（分钟） */
  intervalMinutes: number;
  /** 每次活动时长（分钟） */
  moveMinutes: number;
  /** 提示音 */
  soundEnabled: boolean;
  /** 桌面通知 */
  desktopNotification: boolean;
  /** 开机启动 */
  autostart: boolean;
  /** 工作开始时间 "HH:MM" */
  workStart: string;
  /** 工作结束时间 "HH:MM" */
  workEnd: string;
  /** 工作日期，1=周一 … 7=周日 */
  workDays: number[];
  theme: ThemeMode;
  language: "zh-CN" | "en-US";
  /** 关闭非必要动画 */
  reduceMotion: boolean;
  /** 关闭窗口时最小化到托盘 */
  minimizeToTray: boolean;
  /** 每日活动目标（次数） */
  dailyGoal: number;
  /** 稍后提醒间隔（分钟） */
  snoozeMinutes: number;
  /** 是否提示过「已缩小到托盘」 */
  trayHintShown: boolean;
}

export interface DayStat {
  date: string;
  completed: number;
  skipped: number;
  moveSeconds: number;
  reminded: number;
}

export interface ReminderView {
  seq: number;
  title: string;
  emoji: string;
  activity: string;
  workedMinutes: number;
  moveMinutes: number;
}

export interface Snapshot {
  phase: Phase;
  /** 主进程当前时间戳 */
  now: number;
  /** 当前阶段剩余毫秒（工作中=距下次提醒；活动中=活动剩余；暂停=暂停剩余；非工作=距开始） */
  remainingMs: number;
  /** 0..1 进度 */
  progress: number;
  sessionMs: number;
  intervalMs: number;
  moveTotalMs: number;
  moveRemainingMs: number;
  snoozeUntil: number | null;
  pauseUntil: number | null;
  pauseIsManual: boolean;
  inWindow: boolean;
  nextWorkStart: number | null;
  workStart: string;
  workEnd: string;
  reminder: ReminderView | null;
  today: DayStat;
  goal: number;
  streak: number;
  week: DayStat[];
  /** 是否为「后台模拟」的调试状态 */
  debug?: boolean;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  electron: string;
  chrome: string;
  dataDir: string;
}

export type NavigateTarget = "home" | "settings" | "stats";

export interface UpUpApi {
  getSnapshot(): Promise<Snapshot>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  startMove(): Promise<boolean>;
  finishMove(): Promise<boolean>;
  cancelMove(): Promise<boolean>;
  snooze(minutes?: number): Promise<boolean>;
  skip(): Promise<boolean>;
  resetTimer(): Promise<boolean>;
  pause(minutes?: number | null): Promise<boolean>;
  resume(): Promise<boolean>;
  clearStats(): Promise<void>;
  dismissReminder(): Promise<void>;
  openMain(target?: NavigateTarget): Promise<void>;
  closeReminderWindow(): Promise<void>;
  markTrayHintShown(): Promise<void>;
  getAppInfo(): Promise<AppInfo>;
  playCompletionSound(): Promise<void>;
  /** 调试：把计时快进 n 分钟（仅开发环境） */
  debugAdvance(minutes: number): Promise<boolean>;

  /** 窗口操作（无边框窗口自绘按钮） */
  minimize(): Promise<void>;
  hideWindow(): Promise<void>;
  openDataDir(): Promise<void>;

  onSnapshot(cb: (s: Snapshot) => void): () => void;
  onNavigate(cb: (target: NavigateTarget) => void): () => void;
  onMoveCompleted(cb: () => void): () => void;
  onTrayHint(cb: () => void): () => void;
  onSettingsChanged(cb: (s: Settings) => void): () => void;
  onReminderShown(cb: () => void): () => void;
  onPlayChime(cb: () => void): () => void;
}

declare global {
  interface Window {
    upup: UpUpApi;
  }
}