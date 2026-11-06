/**
 * 打包前清空输出目录。
 *
 * electron-builder 在某些情况下无法清空自己上次的输出目录（文件被占用 / 权限），
 * 会直接报错退出。这里提前用逐个文件删除 + 截断大文件的方式清理，
 * 避免依赖系统的批量删除，也避免因残留文件导致打包失败。
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

const files = collect(root);
let removed = 0;
const stuck = [];

for (const f of files) {
  // 大文件先截断，即使删不掉也已经释放磁盘空间
  try {
    if (fs.statSync(f).size > 1_000_000) {
      const fd = fs.openSync(f, "r+");
      fs.ftruncateSync(fd, 0);
      fs.closeSync(fd);
    }
  } catch {
    /* 忽略 */
  }
  try {
    fs.unlinkSync(f);
    removed += 1;
  } catch {
    stuck.push(f);
  }
}

// 自底向上删空目录
function pruneEmpty(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const e of entries) {
    if (e.isDirectory() && pruneEmpty(path.join(dir, e.name))) {
      try {
        fs.rmdirSync(path.join(dir, e.name));
      } catch {
        empty = false;
      }
    } else {
      empty = false;
    }
  }
  return empty;
}

if (stuck.length === 0) {
  try {
    fs.rmdirSync(root);
    console.log(`✓ 已清空 ${target}/（${removed} 个文件）`);
  } catch {
    console.log(`✓ 已删除 ${target}/ 内 ${removed} 个文件（根目录保留）`);
  }
} else {
  pruneEmpty(root);
  console.log(`⚠ ${target}/ 内 ${removed} 个文件已删除，${stuck.length} 个被占用（多为 0 字节残留）`);
  for (const f of stuck.slice(0, 5)) console.log(`   ${path.relative(process.cwd(), f)}`);
  // 不阻断打包：electron-builder 会自行处理已清空的目录
  process.exit(0);
}