import { useEffect, useRef, useState } from "react";
import type { NavigateTarget, Settings, Snapshot, ThemeMode } from "../../shared/types";

/** 订阅主进程快照；渲染层用本地 100ms 插值让倒计时平滑 */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;
    void window.upup.getSnapshot().then((s) => {
      if (alive) setSnap(s);
    });
    const off = window.upup.onSnapshot((s) => setSnap(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  return snap;
}

export function useSettings(): [Settings | null, (patch: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    void window.upup.getSettings().then((s) => {
      if (alive) setSettings(s);
    });
    const off = window.upup.onSettingsChanged((s) => setSettings(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const next = await window.upup.updateSettings(patch);
    setSettings(next);
  };

  return [settings, update];
}

/** 每秒刷新的「本地时间偏移量」，用于在两次快照间插值 */
export function useNow(active: boolean, tickMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [active, tickMs]);
  return now;
}

export function useNavigate(): NavigateTarget {
  const [target, setTarget] = useState<NavigateTarget>("home");
  useEffect(() => {
    const off = window.upup.onNavigate((t) => setTarget(t));
    return off;
  }, []);
  return target;
}

/** 应用主题：跟随系统 / 浅色 / 深色 */
export function useTheme(mode: ThemeMode | undefined, reduceMotion: boolean | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = mode === "dark" || (mode !== "light" && mq.matches);
      root.classList.toggle("dark", dark);
      root.classList.toggle("reduce-motion", Boolean(reduceMotion));
      // 让主窗体背景跟随主题（避免透明窗白边）
      document.body.style.background = dark ? "#161715" : "#FAFAF8";
    };

    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode, reduceMotion]);
}

/** 完成庆祝动画触发（一次性） */
export function usePulseOn(event: () => () => void): number {
  const [n] = useState(0);
  const ref = useRef(event);
  ref.current = event;
  useEffect(() => {
    const off = ref.current();
    return off;
  }, []);
  return n;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}