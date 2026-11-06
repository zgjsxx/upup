import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BellOff,
  Coffee,
  Footprints,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { NavigateTarget, Snapshot } from "../../shared/types";
import { CountdownRing } from "../components/CountdownRing";
import { PAUSE_PRESETS } from "../../shared/defaults";
import { humanDuration } from "../../shared/time";
import { cx } from "../lib/hooks";

interface Props {
  snap: Snapshot;
  now: number;
  reduceMotion: boolean;
  onNavigate(t: NavigateTarget): void;
  celebration: boolean;
}

export function HomeView({ snap, now, reduceMotion, onNavigate, celebration }: Props) {
  const [pauseMenu, setPauseMenu] = useState(false);
  const status = useMemo(() => statusOf(snap), [snap]);
  const isMoving = snap.phase === "moving";
  const isPaused = snap.phase === "paused";
  const isOff = snap.phase === "offduty";

  return (
    <div className="flex h-full flex-col px-7 pb-5 pt-3">
      {/* 上半：圆环 + 状态与操作 */}
      <div className="flex flex-1 items-center gap-9">
        <div className="relative flex flex-none items-center justify-center">
          <CountdownRing snap={snap} now={now} reduceMotion={reduceMotion} celebrate={celebration} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
              style={{ background: status.bg, color: status.fg }}
            >
              <span
                className={cx(
                  "h-1.5 w-1.5 rounded-full",
                  !reduceMotion && snap.phase === "working" && "animate-pulse",
                )}
                style={{ background: status.fg }}
              />
              {status.label}
            </span>
            {snap.streak > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "var(--sun-soft)", color: "#B87329" }}
              >
                🔥 连续 {snap.streak} 天
              </span>
            )}
            {!snap.inWindow && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px]"
                style={{ background: "var(--bg-inset)", color: "var(--mute)" }}
              >
                <Coffee size={11.5} />
                非工作时段
              </span>
            )}
          </div>

          <h1
            className="mt-3 text-[23px] font-semibold leading-snug tracking-tight"
            style={{ color: "var(--ink)" }}
          >
            {status.headline}
          </h1>
          <p className="mt-1.5 max-w-[380px] text-[13px] leading-relaxed" style={{ color: "var(--mute)" }}>
            {status.sub}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {isMoving ? (
              <>
                <button className="btn btn-primary" onClick={() => void window.upup.finishMove()}>
                  <Sparkles size={15} />
                  完成活动
                </button>
                <button className="btn btn-ghost" onClick={() => void window.upup.cancelMove()}>
                  放弃本次
                </button>
              </>
            ) : isPaused ? (
              <>
                <button className="btn btn-primary" onClick={() => void window.upup.resume()}>
                  <Play size={15} />
                  恢复提醒
                </button>
                <span className="text-[12px]" style={{ color: "var(--mute-2)" }}>
                  {snap.pauseIsManual ? "手动暂停中" : `还剩 ${humanDuration(snap.remainingMs)}`}
                </span>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => void window.upup.startMove()}>
                  <Footprints size={15} />
                  立即活动
                </button>

                <div className="relative">
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPauseMenu((v) => !v)}
                    aria-expanded={pauseMenu}
                    aria-haspopup="menu"
                  >
                    <Pause size={14} />
                    暂停提醒
                  </button>
                  {pauseMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPauseMenu(false)} />
                      <div
                        role="menu"
                        className="absolute left-0 top-[calc(100%+6px)] z-20 w-[196px] overflow-hidden rounded-xl animate-slide-down"
                        style={{
                          background: "var(--bg-raised)",
                          border: "1px solid var(--line)",
                          boxShadow: "var(--shadow-card)",
                        }}
                      >
                        {PAUSE_PRESETS.map((m) => (
                          <button
                            key={m}
                            role="menuitem"
                            className="flex w-full items-center justify-between px-3.5 py-2 text-[12.5px] transition-colors"
                            style={{ color: "var(--ink-soft)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-inset)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            onClick={() => {
                              void window.upup.pause(m);
                              setPauseMenu(false);
                            }}
                          >
                            <span>暂停 {m >= 60 ? `${m / 60} 小时` : `${m} 分钟`}</span>
                            <span className="num text-[11px]" style={{ color: "var(--mute-2)" }}>
                              {m}m
                            </span>
                          </button>
                        ))}
                        <div style={{ borderTop: "1px solid var(--line)" }} />
                        <button
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-3.5 py-2 text-[12.5px]"
                          style={{ color: "var(--mute)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-inset)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            void window.upup.pause(null);
                            setPauseMenu(false);
                          }}
                        >
                          <BellOff size={13} />
                          暂停直至手动恢复
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  className="btn btn-quiet btn-sm"
                  title="重新开始本轮计时"
                  onClick={() => void window.upup.resetTimer()}
                >
                  <RotateCcw size={13.5} />
                  重置
                </button>
              </>
            )}
          </div>

          {/* 今日概览 */}
          <div
            className="mt-6 flex items-center gap-4 rounded-xl px-4 py-2.5"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--line)" }}
          >
            <Metric
              icon={<Footprints size={12.5} />}
              value={snap.today.completed}
              unit={`/${snap.goal}`}
              label="今日活动"
              accent
            />
            <div className="h-7 w-px" style={{ background: "var(--line)" }} />
            <Metric
              icon={<Timer size={12.5} />}
              value={Math.round(snap.today.moveSeconds / 60)}
              unit="分钟"
              label="活动时长"
            />
            <div className="h-7 w-px" style={{ background: "var(--line)" }} />
            <Metric icon={<BellOff size={12.5} />} value={snap.today.skipped} unit="次" label="今日跳过" />
          </div>

          {/* 活动建议（PRD 3.8）：每次进入提醒/活动时给一条轻量建议 */}
          <TipLine snap={snap} />
        </div>
      </div>

      {/* 下半：最近 7 天 */}
      <div className="card mt-4 flex items-center gap-5 px-5 py-4">
        <div className="flex-none">
          <div
            className="flex items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: "var(--ink)" }}
          >
            <Activity size={13} style={{ color: "var(--mint-strong)" }} />
            最近 7 天
          </div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--mute-2)" }}>
            {snap.week.reduce((s, d) => s + d.completed, 0)} 次活动 · 目标 {snap.goal}/天
          </div>
        </div>

        <div className="flex flex-1 items-end justify-between gap-1">
          {snap.week.map((d, i) => {
            const date = new Date(`${d.date}T00:00:00`);
            const dayIdx = (date.getDay() + 6) % 7;
            const isToday = i === snap.week.length - 1;
            const reached = d.completed >= snap.goal;
            const maxVal = Math.max(snap.goal, ...snap.week.map((x) => x.completed), 1);
            const h = d.completed === 0 ? 5 : Math.max(10, Math.round((d.completed / maxVal) * 52));
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${d.date} · 活动 ${d.completed} 次`}
              >
                <span
                  className="num text-[9.5px] leading-none"
                  style={{ color: reached ? "var(--mint-strong)" : "var(--mute-2)", height: 10 }}
                >
                  {d.completed > 0 ? d.completed : ""}
                </span>
                <div
                  className="w-full max-w-[28px] rounded-[4px]"
                  style={{
                    height: h,
                    background: reached
                      ? "var(--mint)"
                      : d.completed > 0
                        ? "var(--mint-soft)"
                        : "var(--track)",
                    outline: isToday ? "1.5px solid var(--mint)" : "none",
                    outlineOffset: 2,
                  }}
                />
                <span
                  className="text-[10px] leading-none"
                  style={{
                    color: isToday ? "var(--mint-strong)" : "var(--mute-2)",
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {["一", "二", "三", "四", "五", "六", "日"][dayIdx]}
                </span>
              </div>
            );
          })}
        </div>

        <button
          className="btn btn-quiet btn-sm flex-none"
          onClick={() => onNavigate("stats")}
          style={{ color: "var(--mute)" }}
        >
          <TrendingUp size={13.5} />
          统计
          <ArrowRight size={12.5} />
        </button>
      </div>

      {isOff && (
        <div
          className="mt-2.5 flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px]"
          style={{ background: "var(--bg-inset)", color: "var(--mute)" }}
        >
          <Coffee size={12.5} />
          现在是休息时间，{snap.workStart}–{snap.workEnd} 之外不会提醒。
        </div>
      )}
    </div>
  );
}

function statusOf(snap: Snapshot): {
  label: string;
  headline: string;
  sub: string;
  bg: string;
  fg: string;
} {
  switch (snap.phase) {
    case "working":
      return {
        label: snap.snoozeUntil ? "稍后提醒" : "工作中",
        headline: snap.snoozeUntil ? "好，稍后再叫你" : "专注模式进行中",
        sub: snap.snoozeUntil
          ? "这段时间不会打扰你，到点会再提醒一次。"
          : "保持节奏，到点我会温柔地提醒你起身活动。",
        bg: "var(--mint-soft)",
        fg: "var(--mint-strong)",
      };
    case "reminding":
      return {
        label: "提醒中",
        headline: "该起身活动啦",
        sub: "看看右下角的提醒卡片，选择开始活动，或稍后再提醒。",
        bg: "var(--sun-soft)",
        fg: "#B87329",
      };
    case "moving":
      return {
        label: "活动中",
        headline: "站起来了，很好 ✨",
        sub: "动一动肩颈、看看远处，让身体换个状态。",
        bg: "var(--sun-soft)",
        fg: "#B87329",
      };
    case "paused":
      return {
        label: "已暂停",
        headline: "提醒已暂停",
        sub: snap.pauseIsManual
          ? "需要你手动恢复，才会重新开始计时。"
          : "专注处理手上的事，到点会自动恢复计时。",
        bg: "var(--bg-inset)",
        fg: "var(--mute)",
      };
    default:
      return {
        label: "休息中",
        headline: "现在是非工作时段",
        sub: `下一个工作时段 ${snap.workStart} 开始，到时候会自动接管。`,
        bg: "var(--bg-inset)",
        fg: "var(--mute)",
      };
  }
}

function Metric({
  icon,
  value,
  unit,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  unit: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-0.5">
      <div
        className="flex items-center gap-1.5 text-[11px] whitespace-nowrap"
        style={{ color: "var(--mute-2)" }}
      >
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-0.5">
        <span
          className="num text-[17px] font-semibold leading-none"
          style={{ color: accent ? "var(--mint)" : "var(--ink)" }}
        >
          {value}
        </span>
        <span className="text-[11px]" style={{ color: "var(--mute-2)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

/** 小建议条：提醒/活动时给出具体动作，平时给一句轻量提示 */
const TIPS = [
  "站起来伸展一下，双手向上举过头顶，深呼吸三次。",
  "接一杯水，顺便走动两三分钟。",
  "肩颈放松：缓慢转肩，前后各 8 圈。",
  "手腕活动：双手握拳再张开，重复 10 次。",
  "看看窗外远处，让眼睛休息 20 秒。",
  "靠墙站一会儿，让腰部放松下来。",
];

function TipLine({ snap }: { snap: Snapshot }) {
  const tip = useMemo(() => {
    if (snap.phase === "moving" || snap.phase === "reminding") {
      return snap.reminder?.activity
        ? `建议：${snap.reminder.activity}，活动 ${snap.reminder.moveMinutes} 分钟。`
        : TIPS[0];
    }
    if (snap.phase === "paused") return "暂停中：需要时点上面的按钮恢复提醒即可。";
    if (snap.phase === "offduty") return "现在是休息时间，好好放松一下，到点会自动开始。";
    // 工作中：按剩余时间给出不同提示
    const idx = Math.floor((snap.sessionMs / 60000) % TIPS.length);
    return TIPS[idx] ?? TIPS[0];
  }, [snap]);

  return (
    <div
      className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed"
      style={{ color: "var(--mute-2)" }}
    >
      <Sparkles size={12.5} className="mt-[2px] flex-none" style={{ color: "var(--mint)" }} />
      <span>{tip}</span>
    </div>
  );
}