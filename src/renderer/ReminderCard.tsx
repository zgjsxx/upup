import { ArrowRight, BellOff, SkipForward, Timer, X } from "lucide-react";
import type { Snapshot } from "../shared/types";

interface Props {
  snap: Snapshot;
  soundEnabled: boolean;
  onStart(): void;
  onSnooze(): void;
  onSkip(): void;
  onClose(): void;
}

/**
 * 提醒悬浮卡片
 * 视觉：圆角、轻盈、淡入；不抢焦点（由主进程 showInactive 保证）
 */
export function ReminderCard({ snap, onStart, onSnooze, onSkip, onClose }: Props) {
  const r = snap.reminder;
  if (!r) return null;

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden animate-fade-up"
      style={{
        background: "var(--bg-raised)",
        borderRadius: 20,
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      {/* 顶部柔光 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -30%, rgba(76,175,143,0.16) 0%, transparent 70%)",
        }}
      />

      <button
        aria-label="关闭提醒"
        onClick={onClose}
        className="no-drag absolute right-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-lg transition-colors"
        style={{ color: "var(--mute-2)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-inset)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <X size={15} />
      </button>

      <div className="relative px-6 pt-6">
        <div className="flex items-start gap-3.5">
          <div
            className="grid h-11 w-11 flex-none place-items-center rounded-xl text-[22px]"
            style={{ background: "var(--mint-soft)" }}
          >
            {r.emoji}
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[16.5px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
              {r.title}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--mute)" }}>
              已连续专注 {r.workedMinutes} 分钟 · 建议{r.activity}
            </p>
          </div>
        </div>

        <div
          className="mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
          style={{ background: "var(--bg-inset)" }}
        >
          <Timer size={14} style={{ color: "var(--mint)" }} />
          <span className="text-[12.5px]" style={{ color: "var(--ink-soft)" }}>
            起身活动 <b className="font-semibold">{r.moveMinutes}</b> 分钟，换个好状态
          </span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 px-6 pb-5 pt-4">
        <button onClick={onStart} className="btn btn-primary w-full" autoFocus>
          开始活动
          <ArrowRight size={15} />
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onSnooze} className="btn btn-ghost btn-sm">
            <BellOff size={13.5} />
            {r.moveMinutes} 分钟后
          </button>
          <button onClick={onSkip} className="btn btn-quiet btn-sm">
            <SkipForward size={13.5} />
            跳过本次
          </button>
        </div>
      </div>
    </div>
  );
}