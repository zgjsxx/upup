import { useState } from "react";
import {
  Bell,
  Clock3,
  Database,
  ExternalLink,
  Info,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  Power,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { AppInfo, Settings, ThemeMode } from "../../shared/types";
import { INTERVAL_PRESETS, MOVE_PRESETS, WEEKDAY_LABELS } from "../../shared/defaults";
import { cx } from "../lib/hooks";

interface Props {
  settings: Settings;
  appInfo: AppInfo | null;
  update(patch: Partial<Settings>): Promise<void>;
  onClearStats(): Promise<void>;
}

export function SettingsView({ settings, appInfo, update, onClearStats }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="h-full overflow-y-auto px-7 pb-8 pt-1" style={{ scrollbarGutter: "stable" }}>
      <Section icon={<Bell size={13} />} title="提醒设置" desc="决定多久提醒一次、活动多久">
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">久坐提醒间隔</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              连续工作满这个时长后提醒你起身
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="seg">
              {INTERVAL_PRESETS.map((m) => (
                <button
                  key={m}
                  className={cx("seg-item", settings.intervalMinutes === m && "seg-item-active")}
                  onClick={() => void update({ intervalMinutes: m })}
                >
                  {m}
                </button>
              ))}
            </div>
            <Stepper
              value={settings.intervalMinutes}
              min={1}
              max={480}
              onChange={(v) => void update({ intervalMinutes: v })}
              suffix="分"
            />
          </div>
        </div>

        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">每次活动时长</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              活动倒计时的长度
            </div>
          </div>
          <div className="seg">
            {MOVE_PRESETS.map((m) => (
              <button
                key={m}
                className={cx("seg-item", settings.moveMinutes === m && "seg-item-active")}
                onClick={() => void update({ moveMinutes: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">桌面通知</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              系统级通知横幅，即使窗口在后台也能看到
            </div>
          </div>
          <Switch on={settings.desktopNotification} onChange={(v) => void update({ desktopNotification: v })} />
        </div>

        <div className="row">
          <div className="flex items-center gap-2">
            {settings.soundEnabled ? (
              <Volume2 size={14} style={{ color: "var(--mint)" }} />
            ) : (
              <VolumeX size={14} style={{ color: "var(--mute-2)" }} />
            )}
            <div>
              <div className="text-[13.5px] font-medium">提示音</div>
              <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
                提醒时播放一段柔和的提示音
              </div>
            </div>
          </div>
          <Switch on={settings.soundEnabled} onChange={(v) => void update({ soundEnabled: v })} />
        </div>

        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">稍后提醒间隔</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              点击「稍后提醒」后的等待时间
            </div>
          </div>
          <Stepper
            value={settings.snoozeMinutes}
            min={1}
            max={60}
            onChange={(v) => void update({ snoozeMinutes: v })}
            suffix="分"
          />
        </div>
      </Section>

      <Section icon={<Clock3 size={13} />} title="工作时间" desc="仅在设定的时段内提醒（本地时间）">
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">工作日</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              选中的日子才会计时提醒
            </div>
          </div>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((label, i) => {
              const day = i + 1;
              const active = settings.workDays.includes(day);
              return (
                <button
                  key={day}
                  aria-pressed={active}
                  onClick={() => {
                    const next = active
                      ? settings.workDays.filter((d) => d !== day)
                      : [...settings.workDays, day].sort((a, b) => a - b);
                    if (next.length === 0) return; // 至少保留一天
                    void update({ workDays: next });
                  }}
                  className="h-8 w-8 rounded-lg text-[12px] font-medium transition-all"
                  style={{
                    background: active ? "var(--mint)" : "var(--bg-inset)",
                    color: active ? "#fff" : "var(--mute)",
                    border: `1px solid ${active ? "transparent" : "var(--line)"}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">工作时段</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              时段之外自动暂停；支持跨夜（如 22:00–06:00）
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TimeInput value={settings.workStart} onChange={(v) => void update({ workStart: v })} />
            <span style={{ color: "var(--mute-2)" }}>—</span>
            <TimeInput value={settings.workEnd} onChange={(v) => void update({ workEnd: v })} />
          </div>
        </div>
      </Section>

      <Section icon={<Sparkles size={13} />} title="习惯目标" desc="用每天的小目标养成起身习惯">
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">每日活动目标</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              达成后计入连续天数
            </div>
          </div>
          <Stepper
            value={settings.dailyGoal}
            min={1}
            max={30}
            onChange={(v) => void update({ dailyGoal: v })}
            suffix="次"
          />
        </div>
      </Section>

      <Section icon={<Palette size={13} />} title="外观" desc="让界面更符合你的使用环境">
        <div className="row">
          <div className="text-[13.5px] font-medium">主题模式</div>
          <div className="seg">
            {(
              [
                { v: "system", label: "跟随系统", icon: <Monitor size={12.5} /> },
                { v: "light", label: "浅色", icon: <Sun size={12.5} /> },
                { v: "dark", label: "深色", icon: <Moon size={12.5} /> },
              ] as Array<{ v: ThemeMode; label: string; icon: React.ReactNode }>
            ).map((o) => (
              <button
                key={o.v}
                className={cx("seg-item flex items-center gap-1.5", settings.theme === o.v && "seg-item-active")}
                onClick={() => void update({ theme: o.v })}
              >
                {o.icon}
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">减少动画</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              关闭呼吸光晕、淡入等非必要动效
            </div>
          </div>
          <Switch on={settings.reduceMotion} onChange={(v) => void update({ reduceMotion: v })} />
        </div>
      </Section>

      <Section icon={<Power size={13} />} title="应用设置" desc="开机启动与后台行为">
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">开机启动</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              开机后静默驻留托盘，不弹窗打扰
            </div>
          </div>
          <Switch on={settings.autostart} onChange={(v) => void update({ autostart: v })} />
        </div>
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">关闭时最小化到托盘</div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              关闭窗口不退出，计时继续在后台运行
            </div>
          </div>
          <Switch on={settings.minimizeToTray} onChange={(v) => void update({ minimizeToTray: v })} />
        </div>
      </Section>

      <Section icon={<Database size={13} />} title="数据" desc="所有数据仅保存在本机，不上传任何服务器">
        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium">本地数据目录</div>
            <div
              className="max-w-[420px] truncate text-[11.5px]"
              style={{ color: "var(--mute-2)" }}
              title={appInfo?.dataDir}
            >
              {appInfo?.dataDir ?? "—"}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void window.upup.openDataDir()}>
            <ExternalLink size={13} />
            打开目录
          </button>
        </div>

        <div className="row">
          <div>
            <div className="text-[13.5px] font-medium" style={{ color: confirmClear ? "#C0392B" : undefined }}>
              清空统计数据
            </div>
            <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
              删除所有活动记录与连续天数，设置不受影响
            </div>
          </div>
          {confirmClear ? (
            <div className="flex items-center gap-2">
              <button className="btn btn-quiet btn-sm" onClick={() => setConfirmClear(false)}>
                取消
              </button>
              <button
                className="btn btn-sm"
                style={{ background: "#C0392B", color: "#fff" }}
                onClick={async () => {
                  await onClearStats();
                  setConfirmClear(false);
                }}
              >
                <Trash2 size={13} />
                确认清空
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
              <Trash2 size={13} />
              清空
            </button>
          )}
        </div>
      </Section>

      <div
        className="mt-5 flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: "var(--bg-inset)" }}
      >
        <div className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--mute-2)" }}>
          <Info size={13} />
          起一会 UpUp v{appInfo?.version ?? "1.0.0"} · Electron {appInfo?.electron ?? "—"}
          {appInfo?.platform ? ` · ${appInfo.platform}` : ""}
        </div>
        <div className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
          计时与提醒完全离线运行
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex items-center gap-1.5" style={{ color: "var(--mint-strong)" }}>
          {icon}
        </span>
        <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
          {title}
        </h3>
        <span className="text-[11.5px]" style={{ color: "var(--mute-2)" }}>
          {desc}
        </span>
      </div>
      <div className="card px-4">{children}</div>
    </section>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange(v: boolean): void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      data-on={on}
      className="switch"
      onClick={() => onChange(!on)}
    />
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange(v: number): void;
  suffix: string;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg px-1 py-0.5"
      style={{ background: "var(--bg-inset)", border: "1px solid var(--line)" }}
    >
      <button
        className="grid h-7 w-6 place-items-center rounded-md disabled:opacity-30"
        onClick={() => onChange(Math.max(min, value - 5))}
        disabled={value <= min}
        aria-label="减少"
        style={{ color: "var(--mute)" }}
      >
        <Minus size={12} />
      </button>
      <span className="num w-[46px] text-center text-[12.5px] font-medium">
        {value}
        <span className="ml-0.5 text-[10.5px]" style={{ color: "var(--mute-2)" }}>
          {suffix}
        </span>
      </span>
      <button
        className="grid h-7 w-6 place-items-center rounded-md disabled:opacity-30"
        onClick={() => onChange(Math.min(max, value + 5))}
        disabled={value >= max}
        aria-label="增加"
        style={{ color: "var(--mute)" }}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

function TimeInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="no-drag num h-9 rounded-lg px-2.5 text-[12.5px] font-medium outline-none"
      style={{
        background: "var(--bg-inset)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
        colorScheme: "inherit",
      }}
    />
  );
}