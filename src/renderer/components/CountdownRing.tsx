import { useMemo } from "react";
import type { Snapshot } from "../../shared/types";
import { countdownText } from "../../shared/time";

interface Props {
  snap: Snapshot;
  /** 本地时间，用于两次快照之间平滑插值 */
  now: number;
  reduceMotion: boolean;
  /** 活动刚完成时的庆祝动效 */
  celebrate: boolean;
}

const SIZE = 286;
const STROKE = 10;
const R = (SIZE - STROKE) / 2 - 6;
const C = 2 * Math.PI * R;

/**
 * 倒计时圆环
 * 进度基于主进程快照 + 本地时间插值，避免 500ms 一跳的颗粒感。
 */
export function CountdownRing({ snap, now, reduceMotion, celebrate }: Props) {
  const { display, progress, workedMinutes } = useMemo(() => {
    const drift = Math.max(0, Math.min(now - snap.now, 5000));
    let remaining = snap.remainingMs;

    if (snap.phase === "working" && snap.snoozeUntil === null) {
      remaining = Math.max(0, snap.remainingMs - drift);
    } else if (snap.phase === "moving") {
      remaining = Math.max(0, snap.moveRemainingMs - drift);
    } else if (snap.phase === "paused" && !snap.pauseIsManual) {
      remaining = Math.max(0, snap.remainingMs - drift);
    } else if (snap.phase === "offduty") {
      remaining = Math.max(0, snap.remainingMs - drift);
    }

    let p = snap.progress;
    if (snap.phase === "working" && snap.intervalMs > 0) {
      p = Math.min(1, Math.max(0, snap.progress + drift / snap.intervalMs));
    } else if (snap.phase === "moving" && snap.moveTotalMs > 0) {
      p = Math.min(1, Math.max(0, snap.progress + drift / snap.moveTotalMs));
    } else if (snap.phase === "reminding") {
      // 提醒态不铺满整圈，避免视觉过重
      p = 0.86;
    }

    const worked =
      snap.phase === "working"
        ? Math.floor((snap.sessionMs + (snap.snoozeUntil === null ? drift : 0)) / 60000)
        : 0;

    return { display: remaining, progress: p, workedMinutes: worked };
  }, [snap, now]);

  const isMoving = snap.phase === "moving";
  const isPaused = snap.phase === "paused";
  const isOff = snap.phase === "offduty";
  const isReminding = snap.phase === "reminding";

  const arcColor = isMoving ? "var(--sun)" : isPaused || isOff ? "var(--mute-2)" : "var(--mint)";
  const animated = !reduceMotion;

  const caption = (() => {
    switch (snap.phase) {
      case "working":
        return snap.snoozeUntil !== null ? "稍后提醒还有" : "下次提醒还有";
      case "moving":
        return "活动中 · 剩余";
      case "paused":
        return snap.pauseIsManual ? "已暂停" : "暂停剩余";
      case "offduty":
        return "距离工作时段开始";
      default:
        return "提醒已触发";
    }
  })();

  const bigText =
    snap.phase === "paused" && snap.pauseIsManual
      ? "手动恢复"
      : isReminding
        ? "该起身"
        : countdownText(display);

  const hint = (() => {
    if (isOff) return `${snap.workStart}–${snap.workEnd} 之外不提醒`;
    if (isPaused) return "暂停期间不会打扰你";
    if (isMoving) return `共 ${Math.round(snap.moveTotalMs / 60000)} 分钟 · 起身动一动`;
    if (isReminding) return "看下提醒卡片";
    return `已专注 ${workedMinutes} 分钟 / ${Math.round(snap.intervalMs / 60000)} 分钟`;
  })();

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      {animated && !isPaused && !isOff && (
        <div
          className="pointer-events-none absolute inset-5 rounded-full animate-breathe"
          style={{
            background: `radial-gradient(circle, ${
              isMoving ? "rgba(255,184,107,0.18)" : "rgba(76,175,143,0.15)"
            } 0%, transparent 68%)`,
          }}
        />
      )}
      {celebrate && animated && (
        <div
          className="pointer-events-none absolute inset-0 rounded-full animate-pop-in"
          style={{
            background: "radial-gradient(circle, rgba(255,184,107,0.3) 0%, transparent 62%)",
          }}
        />
      )}

      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--track)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke={arcColor}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          style={{
            transition: animated
              ? "stroke-dashoffset 0.5s cubic-bezier(0.22,1,0.36,1), stroke 0.4s ease"
              : "none",
            opacity: isOff ? 0.32 : 1,
          }}
        />
        {progress > 0.005 && progress < 0.995 && (
          <circle
            cx={SIZE / 2 + R * Math.cos(2 * Math.PI * progress)}
            cy={SIZE / 2 + R * Math.sin(2 * Math.PI * progress)}
            r={4}
            fill={arcColor}
            style={{ transition: animated ? "all 0.5s cubic-bezier(0.22,1,0.36,1)" : "none" }}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[11.5px] font-medium tracking-wide" style={{ color: "var(--mute)" }}>
          {caption}
        </div>
        <div
          className="num mt-1 font-semibold"
          style={{
            fontSize: bigText.length > 5 ? 27 : 52,
            lineHeight: 1.08,
            color: isReminding ? "var(--mint)" : "var(--ink)",
            letterSpacing: bigText.length > 5 ? "0.01em" : "-0.035em",
          }}
        >
          {bigText}
        </div>
        <div
          className="mt-1.5 max-w-[180px] text-center text-[11px] leading-snug"
          style={{ color: "var(--mute-2)" }}
        >
          {hint}
        </div>
      </div>
    </div>
  );
}