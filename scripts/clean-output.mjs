/**
 * 打包前清空输出目录。
 *
 * electron-builder 打包时会先清空自己的输出目录，但某些文件（典型是
 * win-unpacked/resources/app.asar）在被验证脚本启动过应用后会残留句柄，
 * 导致 "The process cannot access the file" 直接打包失败。
 *
 * 这里的策略是「删不掉的就不删，直接把整个目录改名挪开，再建一个空目录」：
 *   - 能删就删（正常情况，一次搞定）
 *   - 删不掉就 rename 到 .trash-<时间戳>，原路径变成全新空目录
 *   - 改名也失败时，退化为尽力清理 + 明确告知哪几个文件残留
 *
 * 用法：node scripts/clean-output.mjs [目录名，默认 release]
 */
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2] || "release";
const root = path.join(process.cwd(), target);

if (!fs.existsSync(root)) {
  console.log(`${target}/ 不存在，无需清理`);
  process.exit(0);
}

function collect(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else out.push(p);
  }
  return out;
}

/** 删除单个文件：rmSync 优先（走直删路径），unlinkSync 兜底 */
function removeFile(f) {
  for (const attempt of [
    () => fs.rmSync(f, { force: true, maxRetries: 2, retryDelay: 100 }),
    () => fs.unlinkSync(f),
  ]) {
    try {
      attempt();
      return true;
    } catch {
      /* 换下一种方式 */
    }
  }
  return false;
}

// ── 第一步：常规清理 ──────────────────────────────
const files = collect(root);
let removed = 0;
const stuck = [];

for (const f of files) {
  // 大文件先截断（必定成功），即使删不掉也能立刻释放磁盘空间
  try {
    if (fs.statSync(f).size > 1_000_000) {
      const fd = fs.openSync(f, "r+");
      fs.ftruncateSync(fd, 0);
      fs.closeSync(fd);
    }
  } catch {
    /* 忽略 */
  }
  if (removeFile(f)) removed += 1;
  else stuck.push(f);
}

if (stuck.length === 0) {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    console.log(`✓ 已清空 ${target}/（${removed} 个文件）`);
  } catch {
    console.log(`✓ 已删除 ${target}/ 内 ${removed} 个文件（根目录保留）`);
  }
  process.exit(0);
}

// ── 第二步：有文件删不掉 → 整目录改名挪开 ──────────
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const trashPath = `${root}.trash-${stamp}`;

try {
  fs.renameSync(root, trashPath);
  fs.mkdirSync(root, { recursive: true });
  console.log(`✓ ${target}/ 内有 ${stuck.length} 个文件被占用，已整体移动到：`);
  console.log(`    ${path.basename(trashPath)}/`);
  console.log(`  原路径已重建为空目录，打包可正常继续。`);
  console.log(`  （该目录可在关闭应用后手动删除）`);
  process.exit(0);
} catch {
  /* 改名也失败，继续降级 */
}

// ── 第三步：降级——尽力清空子目录，保留最小结构 ────
for (const d of ["win-unpacked/resources", "win-unpacked"]) {
  try {
    fs.rmSync(path.join(root, d), { recursive: true, force: true });
  } catch {
    /* 非空则保留 */
  }
}

console.log(`⚠ ${target}/ 内 ${removed} 个文件已删除，${stuck.length} 个无法删除且目录无法改名：`);
for (const f of stuck.slice(0, 5)) console.log(`   ${path.relative(process.cwd(), f)}`);
console.log(`  请关闭所有运行中的实例后重试打包。`);
process.exit(1);