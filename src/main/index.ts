import { app, ipcMain, nativeTheme, Notification, powerMonitor, shell } from "electron";
import path from "node:path";
import type { NavigateTarget, Settings, Snapshot } from "../shared/types";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../shared/defaults";
import { IPC } from "../shared/ipc";
import { Engine, initialState, todayKey, type EngineState, type StatsState } from "./engine";
import { readJson, writeJson, getDataDir } from "./store";
import { countdownText, humanDuration, isWorkTime } from "../shared/time";
import { detectHiddenLaunch, isAutostartEnabled, setAutostart } from "./autostart";
import { createTray, destroyTray, rebuildMenu, setTrayTitle, type TrayView } from "./tray";
import {
  createMainWindow,
  createReminderWindow,
  getMainWindow,
  getReminderWindow,
  hideReminderWindow,
  isDevMode,
  showMainWindow,
  showReminderWindow,
} from "./windows";

/* ───────────────────────── 应用级状态 ───────────────────────── */

let engine: Engine;
let quitting = false;
let tickTimer: NodeJS.Timeout | null = null;
let reminderVisible = false;

const TICK_INTERVAL = 500;
const SAVE_INTERVAL = 15_000;

/* ───────────────────────── 持久化 ───────────────────────── */

function loadSettings(): Settings {
  const raw = readJson<Partial<Settings>>("settings.json", {});
  const merged = sanitizeSettings(raw, DEFAULT_SETTINGS);
  return merged;
}

function loadState(settings: Settings): EngineState {
  const now = Date.now();
  const fallback = initialState(settings, now);
  const raw = readJson<Partial<EngineState> | null>("state.json", null);
  if (!raw || typeof raw !== "object") return fallback;

  const st: EngineState = {
    ...fallback,
    ...raw,
    // 提醒内容不在重启后恢复，避免弹出过期提醒
    reminder: null,
  };

  if (st.phase === "reminding") {
    st.phase = isWorkTime(settings, new Date(now)) ? "working" : "offduty";
    st.sessionMs = Math.min(st.sessionMs, 0);
  }
  if (st.phase === "moving") {
    if (!st.moveDeadline || st.moveDeadline <= now) {
      st.phase = isWorkTime(settings, new Date(now)) ? "working" : "offduty";
      st.moveDeadline = null;
      st.moveStartedAt = null;
    }
  }
  if (st.phase === "paused" && st.pauseUntil !== null && st.pauseUntil <= now) {
    st.phase = isWorkTime(settings, new Date(now)) ? "working" : "offduty";
    st.pauseUntil = null;
  }
  if (!isWorkTime(settings, new Date(now)) && st.phase === "working") {
    st.phase = "offduty";
    st.sessionMs = 0;
  }

  // 单次休眠补偿：若上次 tick 距今很久，醒来后重新计时而非立刻提醒
  if (now - st.lastTick > 30_000) {
    st.sessionMs = Math.min(st.sessionMs, 0);
  }
  st.lastTick = now;
  return st;
}

function loadStats(): StatsState {
  const raw = readJson<Partial<StatsState>>("stats.json", {});
  if (!raw || typeof raw.days !== "object" || raw.days === null) return { days: {} };
  return { days: raw.days };
}

function saveAll(): void {
  if (!engine) return;
  writeJson("settings.json", engine.settings);
  writeJson("state.json", engine.state);
  writeJson("stats.json", engine.stats);
}

function saveIfDirty(): void {
  if (!engine || !engine.dirty) return;
  engine.dirty = false;
  saveAll();
}

/* ───────────────────────── 广播 ───────────────────────── */

function currentSnapshot(): Snapshot {
  return engine.snapshot(Date.now());
}

function broadcastSnapshot(): void {
  const snap = currentSnapshot();
  for (const win of [getMainWindow(), getReminderWindow()]) {
    if (win && !win.isDestroyed()) win.webContents.send(IPC.evSnapshot, snap);
  }
  updateTray(snap);
}

function broadcastSettings(): void {
  for (const win of [getMainWindow(), getReminderWindow()]) {
    if (win && !win.isDestroyed()) win.webContents.send(IPC.evSettingsChanged, engine.settings);
  }
}

function emitNavigate(target: NavigateTarget): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(IPC.evNavigate, target);
}

/* ───────────────────────── 托盘 ───────────────────────── */

function trayView(snap: Snapshot): TrayView {
  let label: string;
  switch (snap.phase) {
    case "working":
      label =
        snap.snoozeUntil !== null
          ? `稍后提醒 · ${countdownText(snap.remainingMs)}`
          : `下次提醒 · ${countdownText(snap.remainingMs)}`;
      break;
    case "reminding":
      label = "该起身活动啦";
      break;
    case "moving":
      label = `活动中 · 还剩 ${countdownText(snap.moveRemainingMs)}`;
      break;
    case "paused":
      label = snap.pauseIsManual ? "已暂停 · 手动恢复" : `已暂停 · ${countdownText(snap.remainingMs)}`;
      break;
    default:
      label = `非工作时段 · ${humanDuration(snap.remainingMs)}后开始`;
      break;
  }
  return {
    countdown: countdownText(snap.remainingMs),
    label,
    paused: snap.phase === "paused",
    moving: snap.phase === "moving",
    tooltip: `起一会 · ${label}`,
  };
}

function updateTray(snap: Snapshot): void {
  rebuildMenu(trayView(snap));
  if (snap.phase === "working" || snap.phase === "moving") {
    setTrayTitle(countdownText(snap.phase === "moving" ? snap.moveRemainingMs : snap.remainingMs));
  } else {
    setTrayTitle(snap.phase === "paused" ? "⏸" : "");
  }
}

/* ───────────────────────── 提醒 ───────────────────────── */

function showReminder(snap: Snapshot): void {
  if (!snap.reminder) return;

  if (reminderVisible) {
    // 同一时间只允许一个提醒存在
    getReminderWindow()?.webContents.send(IPC.evSnapshot, snap);
    return;
  }
  reminderVisible = true;

  createReminderWindow();
  const win = getReminderWindow();
  if (!win) return;
  const send = () => {
    win.webContents.send(IPC.evSnapshot, snap);
    win.webContents.send(IPC.evReminderShown, null);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
  showReminderWindow();

  if (engine.settings.desktopNotification) {
    showSystemNotification(snap);
  }
  updateTray(snap);
}

function showSystemNotification(snap: Snapshot): void {
  if (!Notification.isSupported() || !snap.reminder) return;
  const r = snap.reminder;
  const n = new Notification({
    title: `${r.emoji} ${r.title}`,
    body: `你已经连续工作 ${r.workedMinutes} 分钟啦，活动 ${r.moveMinutes} 分钟换个好状态。`,
    silent: !engine.settings.soundEnabled,
    urgency: "normal",
    timeoutType: "never",
  });
  n.on("click", () => {
    showReminderWindow();
    getReminderWindow()?.focus();
  });
  n.show();
}

function closeReminder(): void {
  reminderVisible = false;
  hideReminderWindow();
}

/* ───────────────────────── 主循环 ───────────────────────── */

function startTicker(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const now = Date.now();
    const event = engine.tick(now);

    if (event.type === "reminder") {
      const snap = currentSnapshot();
      showReminder(snap);
      broadcastSnapshot();
      if (engine.settings.soundEnabled) {
        getReminderWindow()?.webContents.send(IPC.evPlayChime, null);
        getMainWindow()?.webContents.send(IPC.evPlayChime, null);
      }
      return;
    }

    if (event.type === "move-completed") {
      closeReminder();
      broadcastSnapshot();
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(IPC.evMoveCompleted, null);
      if (engine.settings.soundEnabled && win) win.webContents.send(IPC.evPlayChime, null);
      if (process.platform === "darwin") app.dock?.bounce("informational");
      return;
    }

    if (event.type === "window-changed") {
      if (!event.inWindow) closeReminder();
      broadcastSnapshot();
      return;
    }

    // 每 500ms 只推送轻量快照，保证 UI 流畅
    broadcastSnapshot();
  }, TICK_INTERVAL);

  setInterval(saveIfDirty, SAVE_INTERVAL);
}

/* ───────────────────────── IPC ───────────────────────── */

function registerIpc(): void {
  ipcMain.handle(IPC.getSnapshot, () => currentSnapshot());

  ipcMain.handle(IPC.getSettings, () => {
    const s = { ...engine.settings };
    s.autostart = isAutostartEnabled();
    return s;
  });

  ipcMain.handle(IPC.updateSettings, (_e, patch: Partial<Settings>) => {
    const prev = engine.settings;
    const next = sanitizeSettings(patch, prev);
    if (next.autostart !== prev.autostart) {
      setAutostart(next.autostart);
      next.autostart = isAutostartEnabled();
    }
    engine.applySettings(next);
    saveAll();
    broadcastSettings();
    broadcastSnapshot();
    return engine.settings;
  });

  ipcMain.handle(IPC.startMove, () => {
    const ok = engine.startMove();
    if (ok) {
      closeReminder();
      broadcastSnapshot();
    }
    return ok;
  });

  ipcMain.handle(IPC.finishMove, () => {
    const ok = engine.finishMoveEarly();
    if (ok) {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) win.webContents.send(IPC.evMoveCompleted, null);
      broadcastSnapshot();
    }
    return ok;
  });

  ipcMain.handle(IPC.cancelMove, () => {
    const ok = engine.cancelMove();
    if (ok) broadcastSnapshot();
    return ok;
  });

  ipcMain.handle(IPC.snooze, (_e, minutes: number | null) => {
    const ok = engine.snooze(minutes ?? undefined);
    if (ok) {
      closeReminder();
      broadcastSnapshot();
    }
    return ok;
  });

  ipcMain.handle(IPC.skip, () => {
    const ok = engine.skip();
    if (ok) {
      closeReminder();
      broadcastSnapshot();
    }
    return ok;
  });

  ipcMain.handle(IPC.reset, () => {
    const ok = engine.reset();
    broadcastSnapshot();
    return ok;
  });

  ipcMain.handle(IPC.pause, (_e, minutes: number | null) => {
    const ok = engine.pause(minutes ?? null);
    if (ok) {
      closeReminder();
      broadcastSnapshot();
    }
    return ok;
  });

  ipcMain.handle(IPC.resume, () => {
    const ok = engine.resume();
    broadcastSnapshot();
    return ok;
  });

  ipcMain.handle(IPC.clearStats, () => {
    engine.clearStats();
    saveAll();
    broadcastSnapshot();
  });

  ipcMain.handle(IPC.dismissReminder, () => {
    // 关闭提醒 = 未完成活动，按设置稍后再次提醒
    closeReminder();
    engine.snooze(undefined);
    broadcastSnapshot();
  });

  ipcMain.handle(IPC.openMain, (_e, target: NavigateTarget | null) => {
    showMainWindow();
    if (target) setTimeout(() => emitNavigate(target), 60);
  });

  ipcMain.handle(IPC.closeReminder, () => closeReminder());

  ipcMain.handle(IPC.markTrayHintShown, () => {
    if (!engine.settings.trayHintShown) {
      engine.settings.trayHintShown = true;
      saveAll();
      broadcastSettings();
    }
  });

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    dataDir: getDataDir(),
  }));

  ipcMain.handle(IPC.debugAdvance, (_e, minutes: number) => {
    if (!isDevMode() && !process.env.UPUP_ALLOW_DEBUG) return false;
    engine.state.sessionMs += Math.max(0, minutes) * 60_000;
    engine.dirty = true;
    broadcastSnapshot();
    return true;
  });

  ipcMain.handle("upup:open-data-dir", () => {
    void shell.openPath(getDataDir());
  });

  ipcMain.handle(IPC.windowMinimize, () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle(IPC.windowHideMain, () => {
    getMainWindow()?.hide();
  });
}

/* ───────────────────────── 生命周期 ───────────────────────── */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showMainWindow();
  });

  // 隐藏启动（开机自启）：不弹窗，只驻留托盘
  const hiddenLaunch = detectHiddenLaunch(process.argv);

  app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("com.upup.qiqihui");
    if (process.platform === "darwin") app.dock?.hide();

    const settings = loadSettings();
    const state = loadState(settings);
    const stats = loadStats();
    engine = new Engine(settings, state, stats);
    engine.prune();

    registerIpc();

    createTray({
      onShowMain: () => showMainWindow(),
      onTogglePause: () => {
        if (engine.state.phase === "paused") engine.resume();
        else engine.pause(null);
        broadcastSnapshot();
      },
      onStartMove: () => {
        if (engine.startMove()) {
          closeReminder();
          showMainWindow();
          broadcastSnapshot();
        }
      },
      onReset: () => {
        engine.reset();
        closeReminder();
        broadcastSnapshot();
      },
      onSettings: () => {
        showMainWindow();
        setTimeout(() => emitNavigate("settings"), 80);
      },
      onQuit: () => {
        quitting = true;
        saveAll();
        app.quit();
      },
    });

    // 提醒窗预创建，保证首次弹出无白屏
    createReminderWindow();

    createMainWindow();
    if (hiddenLaunch) {
      setTimeout(() => getMainWindow()?.hide(), 800);
    }

    startTicker();

    // ── 休眠 / 唤醒 ─────────────────────────────
    powerMonitor.on("suspend", () => {
      // 休眠前落盘，唤醒后据此恢复
      saveAll();
    });
    powerMonitor.on("resume", () => {
      const now = Date.now();
      // 唤醒后重置计时基准，避免一次性补算休眠时长
      if (engine.state.phase === "moving" && engine.state.moveDeadline !== null) {
        if (engine.state.moveDeadline <= now) {
          engine.tick(now);
        } else {
          const remain = engine.state.moveDeadline - now;
          engine.state.moveDeadline = now + remain;
        }
      }
      engine.state.sessionMs = Math.min(engine.state.sessionMs, 0);
      engine.state.lastTick = now;
      engine.dirty = true;
      broadcastSnapshot();
    });
    powerMonitor.on("lock-screen", () => saveAll());
    powerMonitor.on("unlock-screen", () => {
      engine.state.lastTick = Date.now();
      engine.state.sessionMs = Math.min(engine.state.sessionMs, 0);
      broadcastSnapshot();
    });

    // 主题跟随系统
    nativeTheme.on("updated", () => {
      for (const win of [getMainWindow(), getReminderWindow()]) {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.evSettingsChanged, engine.settings);
        }
      }
    });

    // 每分钟兜底落盘
    setInterval(saveAll, 60_000);
  });

  app.on("window-all-closed", () => {
    // 常驻托盘：不退出
    if (process.platform === "darwin") {
      // macOS 同样保持后台运行
    }
  });

  app.on("before-quit", () => {
    quitting = true;
    if (tickTimer) clearInterval(tickTimer);
    saveAll();
  });

  app.on("will-quit", () => {
    destroyTray();
  });

  app.on("activate", () => {
    showMainWindow();
  });

  process.on("SIGINT", () => {
    quitting = true;
    saveAll();
    app.quit();
  });
}

export { quitting, todayKey, path as _path };