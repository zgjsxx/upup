import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BellRing } from "lucide-react";
import { useSettings, useSnapshot } from "./lib/hooks";
import { ReminderCard } from "./ReminderCard";
import "./styles.css";

function ReminderApp() {
  const snap = useSnapshot();
  const [settings] = useSettings();
  const [closing, setClosing] = useState(false);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setClosing((prev) => {
        if (prev) return prev;
        void fn();
        return true;
      });
    },
    [],
  );

  const startMove = useCallback(() => run(() => window.upup.startMove()), [run]);
  const snooze = useCallback(() => run(() => window.upup.snooze()), [run]);
  const skip = useCallback(() => run(() => window.upup.skip()), [run]);
  const dismiss = useCallback(() => run(() => window.upup.dismissReminder()), [run]);

  // 键盘无障碍：Enter 开始活动，Esc 关闭提醒
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void dismiss();
      else if (e.key === "Enter") void startMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, startMove]);

  // 提醒被主进程关闭后重置状态，保证下次弹出正常
  useEffect(() => {
    if (!snap || snap.phase !== "reminding") {
      const t = window.setTimeout(() => setClosing(false), 260);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [snap]);

  const ready = snap?.reminder ?? null;

  return (
    <div className="h-full w-full p-2">
      <div
        style={{
          height: "100%",
          opacity: closing ? 0 : 1,
          transform: closing ? "scale(0.98)" : "none",
          transition: "opacity 0.15s ease, transform 0.15s ease",
        }}
      >
        {ready && snap ? (
          <ReminderCard
            snap={snap}
            soundEnabled={settings?.soundEnabled ?? false}
            onStart={startMove}
            onSnooze={snooze}
            onSkip={skip}
            onClose={dismiss}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center rounded-[20px]"
            style={{ background: "var(--bg-raised)" }}
          >
            <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--mute)" }}>
              <BellRing size={15} /> 准备提醒…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ReminderApp />
  </StrictMode>,
);