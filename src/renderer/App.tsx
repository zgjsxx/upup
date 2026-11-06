import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, Footprints, Settings2 } from "lucide-react";
import { useNavigate, useNow, useSettings, useSnapshot, useTheme, cx } from "./lib/hooks";
import { HomeView } from "./views/HomeView";
import { SettingsView } from "./views/SettingsView";
import { StatsView } from "./views/StatsView";
import { TitleBar, WindowControls } from "./components/TitleBar";
import type { AppInfo, NavigateTarget } from "../shared/types";

const TABS: Array<{ id: NavigateTarget; label: string; icon: React.ReactNode }> = [
  { id: "home", label: "首页", icon: <Footprints size={14} /> },
  { id: "stats", label: "统计", icon: <BarChart3 size={14} /> },
  { id: "settings", label: "设置", icon: <Settings2 size={14} /> },
];

export default function App() {
  const snap = useSnapshot();
  const [settings, updateSettings] = useSettings();
  const navigate = useNavigate();
  const [tab, setTab] = useState<NavigateTarget>("home");
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [trayHint, setTrayHint] = useState(false);
  const [celebration, setCelebration] = useState(false);

  const isMac = useMemo(() => (appInfo?.platform ?? navigator.platform.toLowerCase()).includes("mac") || navigator.userAgent.includes("Mac"), [appInfo]);
  const reduceMotion = settings?.reduceMotion ?? false;
  const now = useNow(Boolean(snap), 200);

  useTheme(settings?.theme, reduceMotion);

  useEffect(() => setTab(navigate), [navigate]);

  useEffect(() => {
    void window.upup.getAppInfo().then(setAppInfo);
  }, []);

  // 关闭窗口时的托盘说明（仅首次）
  useEffect(() => {
    const off = window.upup.onTrayHint(() => {
      setTrayHint(true);
      window.setTimeout(() => setTrayHint(false), 6000);
    });
    return off;
  }, []);

  // 首次提示展示后立刻落盘，避免下次关闭窗口时重复打扰
  useEffect(() => {
    if (!trayHint) return;
    void window.upup.markTrayHintShown();
  }, [trayHint]);

  // 活动完成 → 播放庆祝动效
  useEffect(() => {
    const off = window.upup.onMoveCompleted(() => {
      setCelebration(true);
      window.setTimeout(() => setCelebration(false), 1600);
    });
    return off;
  }, []);

  // 主进程要求播放提示音
  useEffect(() => {
    const off = window.upup.onPlayChime(() => {
      void window.upup.playCompletionSound();
    });
    return off;
  }, []);

  // 用户点击「开始活动」时如果主窗口可见，切到首页
  useEffect(() => {
    if (snap?.phase === "moving" && tab !== "home") setTab("home");
  }, [snap?.phase, tab]);

  const clearStats = async () => {
    await window.upup.clearStats();
  };

  return (
    <div className="shell">
      <TitleBar
        isMac={isMac}
        left={
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--ink)" }}>
                起一会
              </div>
              <div className="text-[10.5px]" style={{ color: "var(--mute-2)" }}>
                UpUp · 久坐提醒
              </div>
            </div>
          </div>
        }
        right={
          <>
            <nav className="seg mr-2" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={cx("seg-item flex items-center gap-1.5", tab === t.id && "seg-item-active")}
                  onClick={() => setTab(t.id)}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
            <WindowControls isMac={isMac} />
          </>
        }
      />

      <main className="min-h-0 flex-1">
        {!snap || !settings ? (
          <Skeleton />
        ) : tab === "settings" ? (
          <SettingsView
            settings={settings}
            appInfo={appInfo}
            update={updateSettings}
            onClearStats={clearStats}
          />
        ) : tab === "stats" ? (
          <StatsView snap={snap} onBack={() => setTab("home")} />
        ) : (
          <HomeView
            snap={snap}
            now={now}
            reduceMotion={reduceMotion}
            onNavigate={setTab}
            celebration={celebration}
          />
        )}
      </main>

      {snap?.phase === "reminding" && tab !== "home" && (
        <ReminderBanner onClick={() => setTab("home")} />
      )}

      {trayHint && (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2.5 text-[12px] animate-fade-up"
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <Bell size={12} className="mr-1.5 inline" />
          已缩小到托盘，计时继续在后台运行。右键托盘图标可快速操作。
        </div>
      )}
    </div>
  );
}

function ReminderBanner({ onClick }: { onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="no-drag absolute bottom-4 right-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12px] font-medium animate-fade-up"
      style={{
        background: "var(--mint)",
        color: "#fff",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
      </span>
      有一条待处理的起身提醒
    </button>
  );
}

function Logo() {
  return (
    <div
      className="grid h-8 w-8 flex-none place-items-center rounded-[9px]"
      style={{
        background: "linear-gradient(160deg, #5CC4A2 0%, #3B8D72 100%)",
        boxShadow: "0 1px 2px rgba(37,37,37,0.12), 0 4px 10px -4px rgba(59,141,114,0.6)",
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 19.5V6.2M12 6.2L5.4 12.6M12 6.2L18.6 12.6"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex h-full items-center justify-center gap-3 text-[12.5px]" style={{ color: "var(--mute-2)" }}>
      <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--mint)" }} />
      正在读取计时状态…
    </div>
  );
}