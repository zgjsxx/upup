/**
 * 打包后修复 exe 的品牌信息与图标。
 *
 * 背景：
 * electron-builder 在 Windows 上要解压 winCodeSign 工具包来获取 rcedit，
 * 但该压缩包里 darwin/*.dylib 是符号链接。普通用户没有创建符号链接的权限
 * （SeCreateSymbolicLinkPrivilege），7za 解压时这 2 个文件必然失败，
 * 整个解压判定为失败 → rcedit 拿不到 → exe 的版本信息与图标都不会被写入，
 * 最终产物里显示的是 "Electron / GitHub, Inc. / electron.exe"。
 *
 * 用 --config.win.signAndEditExecutable=false 可以跳过这一步让打包成功，
 * 但同样会跳过品牌信息注入，产物不可直接分发。
 *
 * 解法：打包完成后，用缓存里现成的 rcedit 手动补写版本信息和图标。
 * 这一步不依赖符号链接，纯本地写资源段，稳定可用。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const builderConf = JSON.parse(fs.readFileSync(path.join(root, "electron-builder.json"), "utf8"));

const outDir = path.join(root, process.argv[2] || builderConf.directories?.output || "release");
const winUnpacked = path.join(outDir, "win-unpacked");
const exePath = path.join(winUnpacked, `${builderConf.productName || pkg.productName}.exe`);

function fail(msg) {
  console.log(`⚠ ${msg}`);
  process.exit(0); // 不阻断整体打包，仅提示
}

if (process.platform !== "win32") fail("非 Windows 平台，跳过品牌信息修复");
if (!fs.existsSync(exePath)) fail(`找不到 ${path.relative(root, exePath)}，跳过修复`);

/** 在 electron-builder 缓存里找可用的 rcedit */
function findRcedit() {
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
    "electron-builder",
    "Cache",
    "winCodeSign",
  );
  if (!fs.existsSync(cacheRoot)) return null;

  const candidates = [];
  for (const name of fs.readdirSync(cacheRoot)) {
    const p = path.join(cacheRoot, name, "rcedit-x64.exe");
    if (fs.existsSync(p)) candidates.push({ path: p, mtime: fs.statSync(p).mtimeMs });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

/** 找到可用的 ico：优先 electron-builder 生成的，其次 build/icon.ico */
function findIco() {
  const candidates = [
    path.join(outDir, ".icon-ico", "icon.ico"),
    path.join(root, "build", "icon.ico"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 都没有则现场从 png 生成
  const png = path.join(root, "build", "icon.png");
  if (fs.existsSync(png)) {
    try {
      execFileSync(process.execPath, [path.join(root, "scripts", "make-ico.mjs")], { stdio: "inherit" });
      const generated = path.join(root, "build", "icon.ico");
      if (fs.existsSync(generated)) return generated;
    } catch {
      /* 生成失败则跳过图标 */
    }
  }
  return null;
}

const rcedit = findRcedit();
if (!rcedit) {
  fail(
    "缓存中未找到 rcedit-x64.exe。\n" +
      "  可先执行一次打包（即使失败）以触发 winCodeSign 下载，再重试本脚本。",
  );
}

const icon = findIco();
const meta = builderConf.win?.versionStringDefaults || {};
const copyright = builderConf.copyright || `Copyright © ${new Date().getFullYear()} ${pkg.productName}`;

const args = [
  exePath,
  "--set-version-string",
  "ProductName",
  builderConf.productName || pkg.productName,
  "--set-version-string",
  "FileDescription",
  builderConf.productName || pkg.productName,
  "--set-version-string",
  "CompanyName",
  pkg.author || "",
  "--set-version-string",
  "LegalCopyright",
  copyright,
  "--set-version-string",
  "OriginalFilename",
  path.basename(exePath),
  "--set-file-version",
  pkg.version,
  "--set-product-version",
  pkg.version,
];

// 这些默认值若存在则覆盖，避免 electron-builder 写入 Electron 的原始值
for (const [k, v] of Object.entries(meta)) {
  args.push("--set-version-string", k, v);
}

if (icon) {
  args.push("--set-icon", icon);
} else {
  console.log("  · 未找到 .icon-ico/icon.ico，将只写版本信息（图标沿用默认）");
}

try {
  execFileSync(rcedit, args, { stdio: "pipe" });
  console.log(`✓ 已修复 exe 品牌信息${icon ? "与图标" : ""}: ${path.relative(root, exePath)}`);
  console.log(`  ProductName: ${builderConf.productName}`);
  console.log(`  Version:     ${pkg.version}`);
  console.log(`  Copyright:   ${copyright}`);
} catch (err) {
  const detail = err.stderr?.toString() || err.message;
  fail(`rcedit 执行失败: ${detail.slice(0, 300)}`);
}