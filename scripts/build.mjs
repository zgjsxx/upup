import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rmSync } from "node:fs";

rmSync("dist-electron", { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
  sourcemap: false,
  logLevel: "warning",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
};

await esbuild({
  ...common,
  entryPoints: ["src/main/index.ts"],
  outfile: "dist-electron/main.js",
});

await esbuild({
  ...common,
  entryPoints: ["src/preload/index.ts"],
  outfile: "dist-electron/preload.js",
});

console.log("✓ main / preload");

// 两个页面分别构建，保证各自自包含（先清空再逐个产出）
process.env.UPUP_PAGE = "main";
await viteBuild({ configFile: "vite.config.ts", logLevel: "warn" });
process.env.UPUP_PAGE = "reminder";
await viteBuild({ configFile: "vite.config.ts", logLevel: "warn" });

console.log("✓ renderer (main + reminder)");