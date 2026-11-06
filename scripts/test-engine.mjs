/**
 * 状态机单元测试（纯逻辑，不依赖 Electron）
 * 覆盖：计时、休眠、暂停、跳过、稍后提醒、工作时间、统计幂等
 */
import { Engine, initialState, todayKey } from "../src/main/engine.ts";
import { DEFAULT_SETTINGS } from "../src/shared/defaults.ts";

let pass = 0;
let fail = 0;
const errors = [];

function ok(cond, name, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    errors.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

function eq(a, b, name) {
  ok(a === b, name, `期望 ${b}，实际 ${a}`);
}

/** 构造一个 24 小时都工作的设置，避免测试受当前时间影响 */
function openSettings(over = {}) {
  return {
    ...DEFAULT_SETTINGS,
    workStart: "00:00",
    workEnd: "23:59",
    workDays: [1, 2, 3, 4, 5, 6, 7],
    intervalMinutes: 30,
    moveMinutes: 3,
    dailyGoal: 4,
    ...over,
  };
}

function newEngine(settings = openSettings(), stats = { days: {} }) {
  const now = Date.now();
  return new Engine(settings, initialState(settings, now), stats);
}

const MIN = 60_000;

console.log("\n▶ 计时与提醒触发");
{
  const e = newEngine();
  const t0 = Date.now();
  e.state.lastTick = t0;

  // 每 500ms tick 一次，模拟真实主循环，推进 29 分钟
  for (let i = 1; i <= 3480; i++) {
    const ev = e.tick(t0 + i * 500);
    if (ev.type === "reminder") break;
  }
  ok(e.state.phase === "working", "29 分钟时仍在工作态");

  let fired = null;
  for (let i = 3481; i <= 3700; i++) {
    const ev = e.tick(t0 + i * 500);
    if (ev.type === "reminder") {
      fired = ev;
      break;
    }
  }
  ok(fired !== null, "达到 30 分钟后触发提醒");
  eq(e.state.phase, "reminding", "触发后进入 reminding 态");
  ok(fired?.reminder?.workedMinutes === 30, "提醒文案中的工作时长正确", String(fired?.reminder?.workedMinutes));
  eq(e.stats.days[todayKey()].reminded, 1, "提醒次数记录 1 次");
}

console.log("\n▶ 提醒不叠加");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 1 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  let count = 0;
  for (let i = 1; i <= 4000; i++) {
    const ev = e.tick(t0 + i * 500);
    if (ev.type === "reminder") count++;
    if (count > 1) break;
  }
  eq(count, 1, "完全处于 reminding 时不会重复触发");
  eq(e.state.reminderSeq, 1, "提醒序号只 +1");
}

console.log("\n▶ 开始活动 → 完成");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 1 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 60_000;
  e.tick(t0 + 500); // 触发提醒
  eq(e.state.phase, "reminding", "先进入提醒");

  e.startMove(t0 + 1000);
  eq(e.state.phase, "moving", "开始活动后进入 moving");

  // 活动未结束前 tick，不统计
  e.tick(t0 + 60_000);
  eq(e.stats.days[todayKey()].completed, 0, "活动未结束时不计完成");

  const start = e.state.moveStartedAt;
  // 倒计时自然结束
  const ev = e.tick(t0 + 1000 + 3 * MIN + 200);
  eq(ev.type, "move-completed", "倒计时结束产生 move-completed 事件");
  eq(e.stats.days[todayKey()].completed, 1, "完成次数 +1");
  ok(e.stats.days[todayKey()].moveSeconds >= 179, "记录活动秒数", String(e.stats.days[todayKey()].moveSeconds));
  eq(e.state.phase, "working", "完成后回到 working");
  eq(e.state.sessionMs, 0, "完成后工作计时归零");
  ok(start !== null, "活动开始时间有记录");
}

console.log("\n▶ 完成统计幂等（不重复记录）");
{
  const e = newEngine();
  e.startMove();
  e.finishMoveEarly();
  eq(e.stats.days[todayKey()].completed, 1, "提前完成记录 1 次");
  e.finishMoveEarly();
  e.finishMoveEarly();
  eq(e.stats.days[todayKey()].completed, 1, "重复调用不会重复记录");
  eq(e.state.phase, "working", "状态回到 working");
}

console.log("\n▶ 跳过与稍后提醒");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 1, snoozeMinutes: 5 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 60_000;
  e.tick(t0 + 100);
  eq(e.state.phase, "reminding", "进入提醒");

  e.snooze(undefined, t0 + 200);
  eq(e.state.phase, "working", "稍后提醒后回到 working");
  ok(e.state.snoozeUntil === t0 + 200 + 5 * MIN, "推迟 5 分钟", String(e.state.snoozeUntil));
  ok(e.state.sessionMs >= 60_000, "稍后提醒不重置工作计时", String(e.state.sessionMs));

  // 到达 snooze 时间后再次提醒
  const ev = e.tick(t0 + 200 + 5 * MIN + 10);
  eq(ev.type, "reminder", "推迟到点后再次提醒");

  e.skip(t0 + 200 + 5 * MIN + 20);
  eq(e.stats.days[todayKey()].skipped, 1, "跳过次数 +1");
  eq(e.state.sessionMs, 0, "跳过后工作计时重置");
  eq(e.state.phase, "working", "跳过后继续工作");
}

console.log("\n▶ 暂停不会触发提醒");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 1 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 60_000;
  e.pause(15, t0);

  let fired = false;
  for (let i = 1; i <= 200; i++) {
    const ev = e.tick(t0 + i * 1000);
    if (ev.type === "reminder") fired = true;
  }
  ok(!fired, "暂停期间不触发提醒");
  eq(e.state.phase, "paused", "保持 paused");

  // 暂停到期自动恢复
  const ev2 = e.tick(t0 + 15 * MIN + 500);
  ok(ev2.type === "window-changed" || e.state.phase === "working", "暂停到期自动恢复");
  eq(e.state.phase, "working", "恢复为 working");
  eq(e.state.pauseUntil, null, "暂停时间被清除");
}

console.log("\n▶ 手动暂停需手动恢复");
{
  const e = newEngine();
  e.pause(null);
  eq(e.state.phase, "paused", "手动暂停");
  ok(e.state.pauseUntil === null, "无到期时间");
  // 长时间 tick 也不会自动恢复
  e.tick(Date.now() + 10 * 60 * MIN);
  eq(e.state.phase, "paused", "手动暂停不会自动恢复");
  e.resume();
  eq(e.state.phase, "working", "手动恢复生效");
}

console.log("\n▶ 系统休眠 / 唤醒");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 30 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 10 * MIN;

  // 休眠 2 小时后唤醒：这段时间不计入工作时长
  const after = t0 + 120 * MIN;
  e.tick(after);
  eq(e.state.phase, "working", "唤醒后仍为 working");
  ok(e.state.sessionMs === 0, "休眠时长不计入有效工作时长", String(e.state.sessionMs));

  // 唤醒后正常累计
  e.tick(after + 1000);
  ok(e.state.sessionMs > 0 && e.state.sessionMs <= 1500, "唤醒后重新开始累计", String(e.state.sessionMs));
}

console.log("\n▶ 系统时间回拨");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 30 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 5 * MIN;

  // 时间回拨 1 小时
  e.tick(t0 - 60 * MIN);
  eq(e.state.sessionMs, 5 * MIN, "时间回拨不改变已累计时长（不倒退）");

  // 正常继续
  e.tick(t0 - 60 * MIN + 1000);
  ok(e.state.sessionMs < 6 * MIN, "回拨后继续累计不会暴增", String(e.state.sessionMs));
}

console.log("\n▶ 非工作时段");
{
  // 只在 09:00-18:00 工作，且只选周一
  const now = new Date();
  const isMonday = (now.getDay() + 6) % 7 === 0;
  const settings = openSettings({
    workStart: "00:00",
    workEnd: "00:01",
    workDays: [1],
    intervalMinutes: 1,
  });
  const e = newEngine(settings);
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 5 * MIN;

  let fired = false;
  for (let i = 1; i <= 200; i++) {
    const ev = e.tick(t0 + i * 1000);
    if (ev.type === "reminder") fired = true;
  }
  const shouldBeOff = !isMonday || now.getHours() !== 0 || now.getMinutes() > 1;
  if (shouldBeOff) {
    ok(!fired, "非工作时段不触发提醒");
    eq(e.state.phase, "offduty", "非工作时段进入 offduty");
    ok(e.state.sessionMs === 0, "非工作时段工作计时归零");
  } else {
    console.log("  · 当前恰好在测试窗口内，跳过此项");
  }
}

console.log("\n▶ 修改设置生效");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 45 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 30 * MIN;

  // 把间隔改成 20 分钟，已超时 → 立即提醒（但不叠加）
  e.applySettings({ ...openSettings(), intervalMinutes: 20 }, t0);
  eq(e.state.phase, "reminding", "缩短间隔后立即提醒");
  eq(e.state.reminderSeq, 1, "只产生一条提醒");
}

console.log("\n▶ 连续天数统计");
{
  const stats = { days: {} };
  const now = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    stats.days[key] = { date: key, completed: 5, skipped: 0, moveSeconds: 600, reminded: 5 };
  }
  const e = newEngine(openSettings({ dailyGoal: 4 }), stats);
  eq(e.streak(4), 3, "连续 3 天达标");

  // 今天未达标，从昨天往前算
  const stats2 = { days: { ...stats.days } };
  stats2.days[todayKey()] = { date: todayKey(), completed: 1, skipped: 0, moveSeconds: 60, reminded: 1 };
  const e2 = newEngine(openSettings({ dailyGoal: 4 }), stats2);
  eq(e2.streak(4), 2, "今天未达标时连击从昨天算");
}

console.log("\n▶ 快照一致性");
{
  const e = newEngine({ ...openSettings(), intervalMinutes: 30 });
  const t0 = Date.now();
  e.state.lastTick = t0;
  e.state.sessionMs = 15 * MIN;
  const snap = e.snapshot(t0);
  eq(snap.phase, "working", "快照阶段正确");
  eq(snap.remainingMs, 15 * MIN, "剩余时间正确");
  ok(Math.abs(snap.progress - 0.5) < 0.001, "进度 50%", String(snap.progress));
  eq(snap.week.length, 7, "7 天数据齐全");
}

console.log("\n▶ 统计裁剪");
{
  const stats = { days: {} };
  const now = new Date();
  for (let i = 0; i < 200; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    stats.days[key] = { date: key, completed: 1, skipped: 0, moveSeconds: 60, reminded: 1 };
  }
  const e = newEngine(openSettings(), stats);
  e.prune(120);
  eq(Object.keys(e.stats.days).length, 120, "只保留最近 120 天");
}

console.log(`\n${fail === 0 ? "✅" : "❌"} 通过 ${pass} 项，失败 ${fail} 项`);
if (fail > 0) {
  console.log("失败项：");
  for (const e of errors) console.log("  -", e);
  process.exit(1);
}