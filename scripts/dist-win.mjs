/**
 * Windows 打包脚本。
 *
 * 为什么要自己写一层：
 * 1. electron-builder 在 Windows 上解压 winCodeSign 时会因为符号链接权限失败，
 *    必须加 --config.win.signAndEditExecutable=false 才能打包成功；
 * 2. 但该参数同时会跳过 exe 的版本信息与图标注入，产物不合格；
 * 3. 输出目录 release/ 里的 app.asar 经常被残留句柄锁住（验证脚本启动过应用后），
 *    导致 electron-builder 清空目录失败、直接报错。
 *
 * 策略：先打包到一个全新的临时目录（保证干净），再用 rcedit 补齐品牌信息，
 * 最后同步进 release/。整个过程不依赖「能删掉 release 里的旧文件」。
 *
 * 用法：node scripts/dist-win.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const staging = path.join(root, `_dist-${stamp}`);
const finalDir = path.join(root, "release");
const winUnpackedName = "win-unpacked";
const productName = "起一会";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} 退出码 ${r.status}`);
  }
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

let exitCode = 0;
let keepStaging = false;

try {
  // 1) 构建前端与主进程
  step("构建 frontend / main");
  run("npm", ["run", "build"]);

  // 2) 修复 winCodeSign 缓存（符号链接缺失时补齐）
  step("准备打包工具缓存");
  try {
    execFileSync(process.execPath, [path.join(root, "scripts", "fix-builder-cache.mjs")], { stdio: "inherit", cwd: root });
  } catch {
    console.log("  （缓存修复跳过，继续打包）");
  }

  // 3) 打包到全新临时目录，绕开 release/ 的锁
  step(`打包到 ${path.basename(staging)}/`);
  run("npx", [
    "electron-builder",
    "--win",
    "--dir",
    `--config.directories.output=${path.basename(staging)}`,
    "--config.win.signAndEditExecutable=false",
  ]);

  const stagingUnpacked = path.join(staging, winUnpackedName);
  const exePath = path.join(stagingUnpacked, `${productName}.exe`);
  if (!fs.existsSync(exePath)) throw new Error("打包产物缺失: " + path.relative(root, exePath));

  // 4) 补齐 exe 品牌信息与图标
  step("修复 exe 版本信息与图标");
  try {
    execFileSync(process.execPath, [path.join(root, "scripts", "fix-exe-meta.mjs"), path.basename(staging)], {
      stdio: "inherit",
      cwd: root,
    });
  } catch (err) {
    console.log("  ⚠ 品牌信息修复失败:", err.message);
    console.log("  产物可用，但 exe 显示的是 Electron 默认信息。");
  }

  // 5) 同步到 release/
  step("同步到 release/");
  fs.mkdirSync(finalDir, { recursive: true });
  const dst = path.join(finalDir, winUnpackedName);

  // 先尽量清空目标目录（清不掉也无妨，后面覆盖写入即可）
  try {
    execFileSync(process.execPath, [path.join(root, "scripts", "clean-output.mjs"), "release"], {
      stdio: "inherit",
      cwd: root,
    });
  } catch {
    console.log("  （release/ 清理未完全成功，继续覆盖写入）");
  }
  fs.mkdirSync(dst, { recursive: true });

  let copied = 0;
  const stuckCopy = [];
  function copyTree(src, target) {
    fs.mkdirSync(target, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name);
      const d = path.join(target, e.name);
      if (e.isDirectory()) copyTree(s, d);
      else {
        try {
          fs.copyFileSync(s, d);
          copied += 1;
        } catch {
          stuckCopy.push(path.relative(root, d));
        }
      }
    }
  }
  copyTree(stagingUnpacked, dst);

  console.log(`  已复制 ${copied} 个文件到 release/${winUnpackedName}/`);
  if (stuckCopy.length) {
    console.log(`  ⚠ ${stuckCopy.length} 个文件未能覆盖（多为被占用的旧文件）`);
    for (const f of stuckCopy.slice(0, 3)) console.log(`     ${f}`);
  }

  // 6) 清理临时打包目录
  step("清理临时目录");
  try {
    fs.rmSync(staging, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    console.log(`  已删除 ${path.basename(staging)}/`);
  } catch {
    keepStaging = true;
    console.log(`  ${path.basename(staging)}/ 有文件被占用，保留待手动删除`);
  }

  console.log(`\n✅ 打包完成: release/${winUnpackedName}/${productName}.exe`);
} catch (err) {
  exitCode = 1;
  keepStaging = true;
  console.log(`\n❌ 打包失败: ${err.message}`);
  if (keepStaging) console.log(`   临时目录保留以便排查: ${path.basename(staging)}/`);
}

process.exit(exitCode);