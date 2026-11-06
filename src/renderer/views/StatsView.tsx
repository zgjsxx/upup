import { useMemo } from "react";
import { ArrowLeft, CalendarCheck, Clock, Flame, Footprints, SkipForward, Target } from "lucide-react";
import type { Snapshot } from "../../shared/types";

interface Props {
  snap: Snapshot;
  onBack(): void;
}

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function StatsView({ snap, onBack }: Props) {
  const week = snap.week;
  const totalCompleted = week.reduce((s, d) => s + d.completed, 0);
  const totalMinutes = Math.round(week.reduce((s, d) => s + d.moveSeconds, 0) / 60);
  const totalSkipped = week.reduce((s, d) => s + d.skipped, 0);
  const reachedDays = week.filter((d) => d.completed >= snap.goal).length;

  const max = Math.max(snap.goal, ...week.map((d) => d.completed), 1);

  // 环形汇总
  const ring = useMemo(() => {
    const size = 132;
    const stroke = 9;
    const r = (size - stroke) / 2 - 4;
    const c = 2 * Math.PI * r;
    const ratio = Math.min(1, snap.today.completed / Math.max(1, snap.goal));
    return { size, stroke, r, c, ratio };
  }, [snap.today.completed, snap.goal]);

  return (
    <div className="h-full overflow-y-auto px-7 pb-8 pt-1" style={{ scrollbarGutter: "stable" }}>
      <div className="mb-4 flex items-center gap-2">
        <button className="btn btn-quiet btn-sm" onClick={onBack} style={{ color: "var(--mute)" }}>
          <ArrowLeft size={14} />
          返回
        </button>
      </div>

      {/* 今日 + 连续 */}
      <div className="flex gap-4">
        <div className="card flex flex-1 items-center gap-5 px-5 py-4">
          <div className="relative flex-none" style={{ width: ring.size, height: ring.size }}>
            <svg width={ring.size} height={ring.size} className="-rotate-90">
              <circle
                cx={ring.size / 2}
                cy={ring.size / 2}
                r={ring.r}
                fill="none"
                stroke="var(--track)"
                strokeWidth={ring.stroke}
              />
              <circle
                cx={ring.size / 2}
                cy={ring.size / 2}
                r={ring.r}
                fill="none"
                stroke="var(--mint)"
                strokeWidth={ring.stroke}
                strokeLinecap="round"
                strokeDasharray={ring.c}
                strokeDashoffset={ring.c * (1 - ring.ratio)}
                style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="num text-[26px] font-semibold leading-none" style={{ color: "var(--ink)" }}>
                {snap.today.completed}
              </span>
              <span className="mt-1 text-[11px]" style={{ color: "var(--mute-2)" }}>
                目标 {snap.goal}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--mint-strong)" }}>
              <Target size={13} />
              今日目标
            </div>
            <div className="mt-1 text-[15px] font-semibold">
              {snap.today.completed >= snap.goal ? "今日目标已达成 🎉" : `还差 ${snap.goal - snap.today.completed} 次`}
            </div>
            <div className="mt-1.5 text-[12px]" style={{ color: "var(--mute)" }}>
              累计活动 {Math.round((snap.today.moveSeconds ?? 0) / 60)} 分钟 · 跳过{" "}
              {snap.today.skipped} 次
            </div>
          </div>
        </div>

        <div className="card flex w-[186px] flex-none flex-col justify-center px-5 py-4">
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "#B87329" }}>
            <Flame size={13} />
            连续达成
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="num text-[30px] font-semibold leading-none" style={{ color: "var(--ink)" }}>
              {snap.streak}
            </span>
            <span className="text-[12px]" style={{ color: "var(--mute-2)" }}>
              天
            </span>
          </div>
          <div className="mt-1.5 text-[11.5px]" style={{ color: "var(--mute-2)" }}>
            {snap.streak > 0 ? "保持住，习惯正在形成" : "今天达成目标即可开启"}
          </div>
        </div>
      </div>

      {/* 7 天图表 */}
      <div className="card mt-4 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13.5px] font-semibold">最近 7 天</div>
          <div className="flex items-center gap-3 text-[11.5px]" style={{ color: "var(--mute-2)" }}>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: "var(--mint)" }} />
              达成
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: "var(--mint-soft)" }} />
              未达成
            </span>
          </div>
        </div>

        <div className="flex h-[132px] items-end justify-between gap-2">
          {week.map((d, i) => {
            const date = new Date(`${d.date}T00:00:00`);
            const isToday = i === week.length - 1;
            // 用像素而非百分比：父容器为 auto 高度，百分比高度无法解析
            const barPx = d.completed === 0 ? 4 : Math.max(10, Math.round((d.completed / max) * 104));
            const reached = d.completed >= snap.goal;
            return (
              <div key={d.date} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
                <span
                  className="num text-[10.5px] font-medium"
                  style={{ color: reached ? "var(--mint-strong)" : "var(--mute-2)", height: 14 }}
                >
                  {d.completed > 0 ? d.completed : ""}
                </span>
                <div
                  className="w-full max-w-[34px] rounded-md transition-all"
                  style={{
                    height: barPx,
                    background: reached ? "var(--mint)" : d.completed > 0 ? "var(--mint-soft)" : "var(--track)",
                    outline: isToday ? "1.5px solid var(--mint)" : "none",
                    outlineOffset: 2,
                  }}
                  title={`${d.date}：活动 ${d.completed} 次，跳过 ${d.skipped} 次，${Math.round(d.moveSeconds / 60)} 分钟`}
                />
                <span
                  className="text-[10.5px]"
                  style={{
                    color: isToday ? "var(--mint-strong)" : "var(--mute-2)",
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {isToday ? "今天" : WEEKDAY[date.getDay()]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 汇总 */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <SummaryCard icon={<Footprints size={13} />} label="7 天活动" value={`${totalCompleted}`} unit="次" />
        <SummaryCard icon={<Clock size={13} />} label="累计时长" value={`${totalMinutes}`} unit="分钟" />
        <SummaryCard icon={<CalendarCheck size={13} />} label="达成天数" value={`${reachedDays}`} unit={`/${week.length} 天`} />
        <SummaryCard icon={<SkipForward size={13} />} label="跳过提醒" value={`${totalSkipped}`} unit="次" />
      </div>

      <div
        className="mt-4 rounded-xl px-4 py-3 text-[11.5px] leading-relaxed"
        style={{ background: "var(--bg-inset)", color: "var(--mute-2)" }}
      >
        统计数据仅保存在本机，不会上传任何服务器。可在「设置 → 数据」中随时清空。
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--mute-2)" }}>
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5">
        <span className="num text-[20px] font-semibold" style={{ color: "var(--ink)" }}>
          {value}
        </span>
        <span className="text-[11px]" style={{ color: "var(--mute-2)" }}>
          {unit}
        </span>
      </div>
    </div>
  );
}