import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

/**
 * 跨平台开机自启实现：
 *  - Windows / Linux：Electron 内置 app.setLoginItemSettings
 *    （Linux 在部分桌面环境下不生效，补一份 ~/.config/autostart/.desktop）
 *  - macOS：setLoginItemSettings(openAtLogin)
 */

const APP_NAME = "UpUp";

function linuxAutostartPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(app.getPath("home"), ".config");
  return path.join(configHome, "autostart", "upup.desktop");
}

function linuxDesktopEntry(): string {
  const exe = process.execPath;
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Version=1.0",
    `Name=${APP_NAME}`,
    "Comment=轻量级久坐提醒工具",
    `Exec="${exe}" --hidden`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "StartupNotify=false",
    "",
  ].join("\n");
}

function writeLinuxAutostart(enable: boolean): boolean {
  const p = linuxAutostartPath();
  try {
    if (enable) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, linuxDesktopEntry(), "utf8");
    } else if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
    return true;
  } catch (err) {
    console.error("[upup] 写入 Linux 自启项失败", err);
    return false;
  }
}

export function isAutostartEnabled(): boolean {
  if (process.platform === "linux") {
    return fs.existsSync(linuxAutostartPath());
  }
  try {
    return app.getLoginItemSettings({ args: ["--hidden"] }).openAtLogin;
  } catch {
    return false;
  }
}

export function setAutostart(enable: boolean): boolean {
  try {
    if (process.platform === "linux") {
      return writeLinuxAutostart(enable);
    }
    if (process.platform === "win32") {
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath,
        args: app.isPackaged ? ["--hidden"] : [app.getAppPath(), "--hidden"],
      });
    } else {
      // macOS 13+ 使用 SMAppService，openAsHidden 已废弃但仍向后兼容
      app.setLoginItemSettings({
        openAtLogin: enable,
        openAsHidden: true,
        args: ["--hidden"],
      });
    }
    return true;
  } catch (err) {
    console.error("[upup] 设置开机自启失败", err);
    return false;
  }
}

/** 部分 Linux 桌面环境需要额外的 --hidden 处理；此处仅做兜底检测 */
export function detectHiddenLaunch(argv: string[]): boolean {
  return argv.includes("--hidden") || argv.includes("--silent");
}

/** 打开系统通知/自启设置（可选便捷入口，Windows 用） */
export function openSystemStartupSettings(): void {
  if (process.platform !== "win32") return;
  execFile("cmd", ["/c", "start", "ms-settings:startupapps"], (err) => {
    if (err) console.error("[upup] 打开系统启动项设置失败", err.message);
  });
}