/**
 * 以生产模式直接运行已构建的应用（不启动 Vite）。
 * 会剔除 ELECTRON_RUN_AS_NODE，避免 Electron 退化为纯 Node 进程。
 */
import { spawn } from "node:child_process";
import electronPath from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;
delete env.VITE_DEV_SERVER_URL;

const child = spawn(electronPath, [".", ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("close", (code) => process.exit(code ?? 0));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill();
    process.exit(0);
  });
}