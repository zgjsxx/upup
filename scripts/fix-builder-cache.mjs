/**
 * 修复 electron-builder 的 winCodeSign 缓存。
 *
 * 背景：Windows 下 7za 解压 winCodeSign 压缩包时，其中 darwin/10.12/lib 下的
 * libcrypto.dylib / libssl.dylib 是指向同目录 .1.0.0.dylib 的符号链接。
 * 普通用户权限无法创建符号链接，解压会生成 0 字节文件，导致后续打包失败。
 *
 * 这些 .dylib 仅用于 macOS 签名，Windows 打包完全用不到，
 * 因此这里直接用对应的实体文件覆盖空文件即可。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const cacheRoot = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "electron-builder",
  "Cache",
  "winCodeSign",
);

const PAIRS = [
  ["libcrypto.1.0.0.dylib", "libcrypto.dylib"],
  ["libssl.1.0.0.dylib", "libssl.dylib"],
];

if (!fs.existsSync(cacheRoot)) {
  console.log("缓存目录不存在，跳过:", cacheRoot);
  process.exit(0);
}

let fixed = 0;
for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const libDir = path.join(cacheRoot, entry.name, "darwin", "10.12", "lib");
  if (!fs.existsSync(libDir)) continue;

  for (const [src, link] of PAIRS) {
    const srcPath = path.join(libDir, src);
    const linkPath = path.join(libDir, link);
    if (!fs.existsSync(srcPath)) continue;

    const needFix =
      !fs.existsSync(linkPath) || fs.statSync(linkPath).size < fs.statSync(srcPath).size;
    if (needFix) {
      try {
        fs.copyFileSync(srcPath, linkPath);
        console.log(`  ✓ 修复 ${entry.name}/darwin/10.12/lib/${link}`);
        fixed += 1;
      } catch (err) {
        console.log(`  ✗ 修复失败 ${link}:`, err.message);
      }
    }
  }
}

console.log(fixed > 0 ? `\n已修复 ${fixed} 个文件` : "所有缓存文件正常");