import { contextBridge, ipcRenderer } from "electron";
import type { NavigateTarget, Settings, Snapshot, UpUpApi } from "../shared/types";
import { IPC } from "../shared/ipc";

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: UpUpApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(IPC.updateSettings, patch),
  startMove: () => ipcRenderer.invoke(IPC.startMove),
  finishMove: () => ipcRenderer.invoke(IPC.finishMove),
  cancelMove: () => ipcRenderer.invoke(IPC.cancelMove),
  snooze: (minutes?: number) => ipcRenderer.invoke(IPC.snooze, minutes ?? null),
  skip: () => ipcRenderer.invoke(IPC.skip),
  resetTimer: () => ipcRenderer.invoke(IPC.reset),
  pause: (minutes?: number | null) => ipcRenderer.invoke(IPC.pause, minutes ?? null),
  resume: () => ipcRenderer.invoke(IPC.resume),
  clearStats: () => ipcRenderer.invoke(IPC.clearStats),
  dismissReminder: () => ipcRenderer.invoke(IPC.dismissReminder),
  openMain: (target?: NavigateTarget) => ipcRenderer.invoke(IPC.openMain, target ?? null),
  closeReminderWindow: () => ipcRenderer.invoke(IPC.closeReminder),
  markTrayHintShown: () => ipcRenderer.invoke(IPC.markTrayHintShown),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  playCompletionSound: async () => {
    playChime();
  },
  debugAdvance: (minutes: number) => ipcRenderer.invoke(IPC.debugAdvance, minutes),

  minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
  hideWindow: () => ipcRenderer.invoke(IPC.windowHideMain),
  openDataDir: () => ipcRenderer.invoke(IPC.openDataDir),

  onSnapshot: (cb: (s: Snapshot) => void) => subscribe(IPC.evSnapshot, cb),
  onNavigate: (cb: (t: NavigateTarget) => void) => subscribe(IPC.evNavigate, cb),
  onMoveCompleted: (cb: () => void) => subscribe(IPC.evMoveCompleted, cb),
  onTrayHint: (cb: () => void) => subscribe(IPC.evTrayHint, cb),
  onSettingsChanged: (cb: (s: Settings) => void) => subscribe(IPC.evSettingsChanged, cb),
  onReminderShown: (cb: () => void) => subscribe(IPC.evReminderShown, cb),
  onPlayChime: (cb: () => void) => subscribe(IPC.evPlayChime, cb),
};

/**
 * 完成音效：用 WebAudio 合成一段柔和的四音琶音。
 * 不依赖任何音频文件，零额外体积，且不涉及自动播放限制
 * （Electron 中渲染进程默认允许无用户手势播放）。
 */
function playChime(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);

    // C5 E5 G5 C6 —— 温暖的大三和弦上行
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.9);
    });

    setTimeout(() => void ctx.close(), 1600);
  } catch (err) {
    console.error("[upup] 播放提示音失败", err);
  }
}

contextBridge.exposeInMainWorld("upup", api);