/**
 * 验证打包后的应用（release），而非开发产物。
 * 用法：node scripts/verify-packaged.mjs [可执行文件路径]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const exe =
  process.argv[2] ||
  path.join(process.cwd(), "dist-rel4", "win-unpacked", "起一会.exe");

if (!fs.existsSync(exe)) {
  console.error("找不到可执行文件:", exe);
  process.exit(1);
}

const PORT = 9340;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
delete env.NODE_OPTIONS;
// 生产包默认禁用调试快进，验证时临时打开
env.UPUP_ALLOW_DEBUG = "1";

const child = spawn(exe, [`--remote-debugging-port=${PORT}`, "--remote-allow-origins=*"], {
  stdio: ["ignore", "pipe", "pipe"],
  env,
});
const logs = [];
child.stdout.on("data", (d) => logs.push(d.toString()));
child.stderr.on("data", (d) => logs.push(d.toString()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shotDir = path.join(process.cwd(), "_shots");
fs.mkdirSync(shotDir, { recursive: true });

async function listPages() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    return (await r.json()).filter((p) => p.type === "page" && p.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}

async function attach(hint) {
  for (let i = 0; i < 50; i++) {
    const pages = await listPages();
    const hit = pages.find((p) => p.url.includes(hint));
    if (hit) {
      const ws = new WebSocket(hit.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.addEventListener("open", res, { once: true });
        ws.addEventListener("error", rej, { once: true });
      });
      const pending = new Map();
      const errors = [];
      let id = 0;
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
          pending.get(m.id)(m.result);
          pending.delete(m.id);
        } else if (m.method === "Runtime.exceptionThrown") {
          errors.push(m.params.exceptionDetails.text);
        } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
          errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
        }
      });
      const send = (method, params = {}) =>
        new Promise((r) => {
          const mid = ++id;
          pending.set(mid, r);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      await send("Runtime.enable");
      await send("Page.enable");
      const evaluate = async (expr) => {
        const r = await send("Runtime.evaluate", {
          expression: expr,
          awaitPromise: true,
          returnByValue: true,
        });
        return r?.result?.value;
      };
      const shot = async (name) => {
        const { data } = await send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(shotDir, `${name}.png`), Buffer.from(data, "base64"));
      };
      return { evaluate, shot, errors, url: hit.url };
    }
    await sleep(300);
  }
  throw new Error("无法连接: " + hint);
}

let fail = 0;
try {
  const main = await attach("index.html");
  console.log("页面 URL:", main.url);
  await sleep(1500);

  const info = await main.evaluate(`(() => ({
    api: typeof window.upup,
    rootLen: document.getElementById('root').innerHTML.length,
    text: document.body.innerText.slice(0,120),
    version: window.upup ? null : null
  }))()`);
  console.log("渲染状态:", JSON.stringify(info));

  if (!info.api) {
    console.log("  ✗ preload 未加载");
    fail++;
  } else {
    console.log("  ✓ preload 桥接正常");
  }
  if (info.rootLen < 100) {
    console.log("  ✗ 页面未渲染内容");
    fail++;
  } else {
    console.log("  ✓ 页面渲染正常");
  }

  await main.shot("10-packaged-home");

  // 验证数据目录与版本
  const appInfo = await main.evaluate(`window.upup.getAppInfo()`);
  console.log("应用信息:", JSON.stringify(appInfo));

  // 触发提醒前先把工作时段设为全天，避免当前时间落在非工作时段导致验证失真
  await main.evaluate(
    `window.upup.updateSettings({ workStart: '00:00', workEnd: '23:59', workDays: [1,2,3,4,5,6,7], intervalMinutes: 1 })`,
  );
  await sleep(400);
  await main.evaluate(`window.upup.debugAdvance(2)`);
  await sleep(2200);

  const snap = await main.evaluate(`window.upup.getSnapshot()`);
  console.log("阶段:", snap?.phase);

  if (snap?.phase === "reminding") {
    const rem = await attach("reminder.html");
    await sleep(1200);
    const remInfo = await rem.evaluate(`({ len: document.getElementById('root').innerHTML.length })`);
    if (remInfo.len > 100) {
      console.log("  ✓ 提醒窗渲染正常");
      await rem.shot("11-packaged-reminder");
    } else {
      console.log("  ✗ 提醒窗空白");
      fail++;
    }
    if (rem.errors.length) console.log("  提醒窗错误:", rem.errors);
  } else {
    console.log("  ✗ 未能触发提醒:", snap?.phase);
    fail++;
  }

  // 还原默认设置
  await main.evaluate(
    `window.upup.updateSettings({ intervalMinutes: 45, workStart: '09:00', workEnd: '18:00', workDays: [1,2,3,4,5] })`,
  );
  await main.evaluate(`window.upup.resetTimer()`);

  if (main.errors.length) {
    console.log("主窗口错误:", main.errors);
    fail++;
  }
} catch (err) {
  console.log("验证失败:", err.message);
  fail++;
} finally {
  child.kill();
  await sleep(500);
  if (logs.length) {
    console.log("\n─── 进程输出 ───");
    console.log(logs.join("").slice(0, 1200));
  }
  console.log(fail ? `\n❌ 打包版验证失败（${fail} 项）` : "\n✅ 打包版验证通过");
  process.exit(fail ? 1 : 0);
}