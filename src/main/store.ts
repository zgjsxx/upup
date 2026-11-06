import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

let dataDir = "";

export function getDataDir(): string {
  if (!dataDir) {
    dataDir = app.getPath("userData");
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

export function filePath(name: string): string {
  return path.join(getDataDir(), name);
}

/** 读取 JSON；文件不存在或损坏时返回 fallback（损坏文件会被备份） */
export function readJson<T>(name: string, fallback: T): T {
  const p = filePath(name);
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as T;
    if (parsed && typeof parsed === "object") return parsed;
    return fallback;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") {
      console.error(`[upup] 读取 ${name} 失败，使用默认值`, err);
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.renameSync(p, `${p}.broken-${stamp}`);
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}

/** 原子写入：写临时文件 → fsync → rename，避免崩溃导致半截文件 */
export function writeJson(name: string, value: unknown): void {
  const p = filePath(name);
  const tmp = `${p}.tmp`;
  try {
    const data = JSON.stringify(value, null, 2);
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, data, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, p);
  } catch (err) {
    console.error(`[upup] 写入 ${name} 失败`, err);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}