import { app, Menu, nativeImage, Tray } from "electron";
import path from "node:path";

let tray: Tray | null = null;
let lastTooltip = "";

export interface TrayHandlers {
  onShowMain(): void;
  onTogglePause(): void;
  onStartMove(): void;
  onReset(): void;
  onSettings(): void;
  onQuit(): void;
}

export interface TrayView {
  countdown: string;
  label: string;
  paused: boolean;
  moving: boolean;
  tooltip: string;
}

let handlers: TrayHandlers | null = null;

function iconPath(file: string): string {
  // 开发环境：资源在项目根 resources/；打包后：resources 被 asar 收录
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "resources", file)
    : path.join(__dirname, "..", "resources", file);
}

export function createTray(h: TrayHandlers): void {
  handlers = h;
  const isMac = process.platform === "darwin";
  const img = nativeImage.createFromPath(iconPath(isMac ? "trayTemplate.png" : "tray-32.png"));
  if (isMac) img.setTemplateImage(true);

  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("起一会 · 该起身啦");
  if (process.platform === "win32") tray.setIgnoreDoubleClickEvents(true);

  tray.on("click", () => {
    handlers?.onShowMain();
  });
  tray.on("double-click", () => handlers?.onShowMain());

  rebuildMenu({
    countdown: "计算中",
    label: "下次提醒 · 计算中",
    paused: false,
    moving: false,
    tooltip: "起一会",
  });
}

export function rebuildMenu(view: TrayView): void {
  if (!tray) return;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: view.label,
      enabled: false,
    },
    { type: "separator" },
    {
      label: view.moving ? "活动进行中…" : "立即开始活动",
      enabled: !view.moving,
      click: () => handlers?.onStartMove(),
    },
    {
      label: view.paused ? "恢复提醒" : "暂停提醒",
      enabled: !view.moving,
      click: () => handlers?.onTogglePause(),
    },
    {
      label: "重置本轮计时",
      enabled: !view.moving,
      click: () => handlers?.onReset(),
    },
    { type: "separator" },
    { label: "打开主窗口", click: () => handlers?.onShowMain() },
    { label: "打开设置…", click: () => handlers?.onSettings() },
    { type: "separator" },
    { label: "退出起一会", click: () => handlers?.onQuit() },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));

  if (view.tooltip !== lastTooltip) {
    lastTooltip = view.tooltip;
    tray.setToolTip(view.tooltip);
  }
  if (process.platform !== "darwin") {
    tray.setTitle("");
  }
}

/** macOS 菜单栏文字倒计时 */
export function setTrayTitle(text: string): void {
  if (!tray || process.platform !== "darwin") return;
  tray.setTitle(text);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}