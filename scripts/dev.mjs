import { spawn } from "node:child_process";
import { createServer } from "vite";
import { build } from "esbuild";
import electronPath from "electron";

/**
 * 某些终端环境（包括部分 IDE 集成终端）会注入 ELECTRON_RUN_AS_NODE=1，
 * 这会让 Electron 以纯 Node 模式运行（无 GUI），必须剔除。
 */
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  return env;
}

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
  sourcemap: "inline",
  logLevel: "warning",
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
};

async function bundle() {
  await build({ ...common, entryPoints: ["src/main/index.ts"], outfile: "dist-electron/main.js" });
  await build({ ...common, entryPoints: ["src/preload/index.ts"], outfile: "dist-electron/preload.js" });
}

await bundle();

const server = await createServer({ configFile: "vite.config.ts" });
await server.listen();
const info = server.config.server;
const url = `http://localhost:${info.port}`;
server.printUrls();

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...cleanEnv(), VITE_DEV_SERVER_URL: url, NODE_ENV: "development" },
});

child.on("close", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill();
    process.exit(0);
  });
}