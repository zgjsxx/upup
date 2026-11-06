import { app, BrowserWindow, screen, shell } from "electron";
import path from "node:path";

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_URL);

export const RENDERER_DIR = path.join(__dirname, "..", "dist");

let mainWindow: BrowserWindow | null = null;
let reminderWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function getReminderWindow(): BrowserWindow | null {
  return reminderWindow && !reminderWindow.isDestroyed() ? reminderWindow : null;
}

function pageUrl(page: string): { url?: string; file?: string } {
  if (isDev) return { url: `${DEV_URL}/${page}` };
  return { file: path.join(RENDERER_DIR, page) };
}

function load(win: BrowserWindow, page: string): void {
  const target = pageUrl(page);
  if (target.url) void win.loadURL(target.url);
  else void win.loadFile(target.file!);
}

export function createMainWindow(): BrowserWindow {
  const existing = getMainWindow();
  if (existing) return existing;

  const win = new BrowserWindow({
    width: 940,
    height: 600,
    minWidth: 880,
    minHeight: 580,
    maxWidth: 1120,
    maxHeight: 900,
    show: false,
    backgroundColor: "#FAFAF8",
    title: "起一会 UpUp",
    frame: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 18, y: 18 },
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "resources", process.platform === "darwin" ? "mark-128.png" : "tray-64.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // 外链一律走系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });

  load(win, "index.html");
  mainWindow = win;

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

export function createReminderWindow(): BrowserWindow {
  const existing = getReminderWindow();
  if (existing) return existing;

  const win = new BrowserWindow({
    width: 424,
    height: 348,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    acceptFirstMouse: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "normal");
  if (process.platform === "darwin") {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  load(win, "reminder.html");
  reminderWindow = win;
  win.on("closed", () => {
    reminderWindow = null;
  });
  return win;
}

/** 计算右下角位置（跟随鼠标所在显示器） */
function reminderPosition(win: BrowserWindow): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const [w, h] = win.getSize();
  const margin = 20;
  return {
    x: Math.round(x + width - w - margin),
    y: Math.round(y + height - h - margin),
  };
}

/**
 * 弹出提醒：不抢键盘焦点，不打断全屏演示。
 *
 * 淡入与上浮动画由渲染进程的 CSS 完成（见 ReminderCard 的 animate-fade-up）。
 * 主进程只负责一次性定位 + showInactive，避免逐帧 setOpacity/setPosition
 * 造成的合成器阻塞（在透明窗口上尤其明显，会导致窗口卡顿甚至截图超时）。
 */
export function showReminderWindow(): void {
  const win = reminderWindow ?? createReminderWindow();
  if (win.isDestroyed()) return;

  const pos = reminderPosition(win);
  win.setPosition(pos.x, pos.y, false);
  win.setOpacity(1);

  if (win.isVisible()) {
    win.focus();
    return;
  }

  win.showInactive();
  win.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "normal");
}

export function hideReminderWindow(): void {
  const win = getReminderWindow();
  if (!win) return;
  win.hide();
}

export function showMainWindow(): void {
  const win = getMainWindow() ?? createMainWindow();
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.moveTop();
  win.focus();
}

export function toggleMainWindow(): void {
  const win = getMainWindow();
  if (!win) {
    createMainWindow();
    return;
  }
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    showMainWindow();
  }
}

export function isDevMode(): boolean {
  return isDev;
}

export function setAppBadge(count: number): void {
  if (process.platform !== "darwin") return;
  if (count > 0) app.setBadgeCount(count);
  else app.setBadgeCount(0);
}