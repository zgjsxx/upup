/**
 * 无头验证脚本：启动 Electron（带远程调试端口），通过 CDP 截图 + 抓控制台错误。
 * 用法：node scripts/verify.mjs [场景...]
 */
import { spawn } from "node:child_process";
import electronPath from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = path.join(root, "_shots");
fs.mkdirSync(shotDir, { recursive: true });

const PORT = 9333;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
delete env.VITE_DEV_SERVER_URL;
// 允许调试命令 + 缩短提醒间隔，便于快速验收
env.UPUP_ALLOW_DEBUG = "1";
env.UPUP_E2E = "1";

const child = spawn(
  electronPath,
  [".", `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*"],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"], env },
);

const logs = [];
child.stdout.on("data", (d) => logs.push(["out", d.toString()]));
child.stderr.on("data", (d) => logs.push(["err", d.toString()]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitTargets(timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const pages = list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (pages.length) return pages;
    } catch {
      /* not up yet */
    }
    await sleep(400);
  }
  throw new Error("CDP 未就绪");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.errors.push(msg.params.exceptionDetails.text + " " + (msg.params.exceptionDetails.exception?.description ?? ""));
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + expression);
    return r.result?.value;
  }
  /**
   * 截图。透明无边框窗口（提醒窗）上 CDP captureScreenshot 会挂起，
   * 因此加超时；失败时返回 null 而非抛错，由调用方决定是否降级。
   */
  async shot(name, timeoutMs = 6000) {
    try {
      const res = await Promise.race([
        this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);
      if (!res || !res.data) {
        console.log("  · 截图跳过（透明窗口不支持 CDP 截图）:", name);
        return null;
      }
      const p = path.join(shotDir, `${name}.png`);
      fs.writeFileSync(p, Buffer.from(res.data, "base64"));
      console.log("📸", path.relative(root, p));
      return p;
    } catch (err) {
      console.log("  · 截图失败:", name, err.message);
      return null;
    }
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const cdp = new Cdp(ws);
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  return cdp;
}

async function findPage(labelHint, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const pages = await waitTargets();
    const hit = pages.find((p) => p.url.includes(labelHint));
    if (hit) return hit;
    await sleep(300);
  }
  throw new Error(`找不到页面 ${labelHint}`);
}

const steps = [];
function step(name, fn) {
  steps.push({ name, fn });
}

/* ───────────── 场景 ───────────── */

step("首页", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await sleep(1200);
  await cdp.shot("01-home-light");
  const info = await cdp.evaluate(`(() => {
    const el = document.querySelector('.num');
    return {
      hasApi: typeof window.upup === 'object',
      text: el ? el.textContent : null,
      bodyText: document.body.innerText.slice(0, 300),
      width: innerWidth, height: innerHeight
    };
  })()`);
  console.log("  首页信息:", JSON.stringify(info, null, 2));
  if (cdp.errors.length) console.log("  ⚠ 控制台错误:", cdp.errors);
  return { cdp, page };
});

step("深色主题", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(`window.upup.updateSettings({ theme: 'dark' })`);
  await sleep(700);
  await cdp.shot("02-home-dark");
  await cdp.evaluate(`window.upup.updateSettings({ theme: 'light' })`);
  await sleep(400);
  return { cdp };
});

step("设置页", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(`window.upup.openMain('settings')`);
  await sleep(900);
  await cdp.shot("03-settings");
  const text = await cdp.evaluate(`document.querySelector('main').innerText.slice(0, 400)`);
  console.log("  设置页文本片段:", text.replace(/\\n/g, " | ").slice(0, 200));
  if (cdp.errors.length) console.log("  ⚠ 错误:", cdp.errors);
  return { cdp };
});

step("统计页", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(`window.upup.openMain('stats')`);
  await sleep(900);
  await cdp.shot("04-stats");
  if (cdp.errors.length) console.log("  ⚠ 错误:", cdp.errors);
  return { cdp };
});

step("触发提醒弹窗", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  // 快进到提醒
  await cdp.evaluate(`window.upup.updateSettings({ intervalMinutes: 1 })`);
  await sleep(300);
  await cdp.evaluate(`window.upup.debugAdvance(2)`);
  await sleep(2000);
  const snap = await cdp.evaluate(`window.upup.getSnapshot()`);
  console.log("  当前阶段:", snap?.phase, "提醒:", JSON.stringify(snap?.reminder));
  await cdp.evaluate(`window.upup.openMain('home')`);
  await sleep(600);
  await cdp.shot("05-home-reminding");
  return { cdp, snap };
});

step("提醒卡片窗口", async () => {
  const page = await findPage("reminder.html");
  const cdp = await connect(page);
  await sleep(900);

  // 透明窗口无法 CDP 截图，改为严格校验渲染内容是否完整
  const text = await cdp.evaluate(`document.body.innerText`);
  const rootLen = await cdp.evaluate(`document.getElementById('root').innerHTML.length`);
  const clean = String(text ?? "").replace(/\n+/g, " | ").trim();
  console.log("  提醒卡片文本:", clean || "(空)");
  console.log("  DOM 长度:", rootLen);

  const okText = clean.includes("开始活动") && clean.includes("跳过本次");
  if (!okText) throw new Error("提醒卡片内容不完整：" + clean.slice(0, 80));
  if (!rootLen || rootLen < 200) throw new Error("提醒卡片 DOM 异常，长度 " + rootLen);

  await cdp.shot("06-reminder-card");
  if (cdp.errors.length) console.log("  ⚠ 错误:", cdp.errors);
  return { cdp };
});

step("开始活动 → 完成", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(`window.upup.startMove()`);
  await sleep(1200);
  const s1 = await cdp.evaluate(`window.upup.getSnapshot()`);
  console.log("  开始活动后阶段:", s1?.phase, "剩余:", s1?.moveRemainingMs);
  await cdp.shot("07-home-moving");
  await cdp.evaluate(`window.upup.finishMove()`);
  await sleep(1200);
  const s2 = await cdp.evaluate(`window.upup.getSnapshot()`);
  console.log("  完成后阶段:", s2?.phase, "今日完成:", s2?.today?.completed);
  await cdp.shot("08-home-completed");
  return { cdp };
});

step("暂停与恢复", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(`window.upup.pause(15)`);
  await sleep(900);
  const p = await cdp.evaluate(`window.upup.getSnapshot()`);
  console.log("  暂停后:", p?.phase, p?.remainingMs);
  await cdp.shot("09-paused");
  await cdp.evaluate(`window.upup.resume()`);
  await sleep(600);
  const r = await cdp.evaluate(`window.upup.getSnapshot()`);
  console.log("  恢复后:", r?.phase);
  return { cdp };
});

step("持久化检查", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  const info = await cdp.evaluate(`window.upup.getAppInfo()`);
  console.log("  数据目录:", info.dataDir);
  for (const f of ["settings.json", "state.json", "stats.json"]) {
    const p = path.join(info.dataDir, f);
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      console.log(`  ✓ ${f} (${size} B)`);
      if (f === "stats.json") console.log("    ", fs.readFileSync(p, "utf8").replace(/\\s+/g, " ").slice(0, 220));
    } else {
      console.log(`  ✗ ${f} 缺失`);
    }
  }
  return { cdp };
});

step("恢复默认设置", async () => {
  const page = await findPage("index.html");
  const cdp = await connect(page);
  await cdp.evaluate(
    `window.upup.updateSettings({ intervalMinutes: 45, theme: 'system', desktopNotification: true })`,
  );
  await cdp.evaluate(`window.upup.resetTimer()`);
  await sleep(500);
  return { cdp };
});

/* ───────────── 执行 ───────────── */

let failed = 0;
try {
  await waitTargets();
  for (const s of steps) {
    try {
      console.log(`\n▶ ${s.name}`);
      await s.fn();
    } catch (err) {
      failed += 1;
      console.log(`  ✗ ${s.name} 失败:`, err.message);
    }
  }
} catch (err) {
  console.log("启动失败:", err.message);
  failed += 1;
} finally {
  console.log("\n──────── 进程日志 ────────");
  const text = logs.map(([k, v]) => `[${k}] ${v}`).join("");
  console.log(text.slice(0, 3000) || "(无输出)");
  child.kill();
  await sleep(600);
  try {
    process.kill(-child.pid);
  } catch {
    /* ignore */
  }
  console.log(failed ? `\n❌ ${failed} 个场景失败` : "\n✅ 全部场景通过");
  process.exit(failed ? 1 : 0);
}