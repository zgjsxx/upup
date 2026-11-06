import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * 双窗口分别构建（UPUP_PAGE=main | reminder）。
 * 原因：Vite 多入口会抽取共享 chunk，而第二个 HTML 拿到的
 * modulepreload 不一定覆盖全部依赖，导致提醒窗白屏。
 * 分开构建后每个页面都是自包含的，互不影响。
 */
const page = process.env.UPUP_PAGE === "reminder" ? "reminder" : "main";
const outDir = resolve(__dirname, "dist");

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5199,
    strictPort: true,
    host: "127.0.0.1",
    watch: { ignored: ["**/src/main/**", "**/dist-electron/**", "**/dist/**"] },
  },
  build: {
    target: "chrome122",
    outDir,
    emptyOutDir: page === "main",
    sourcemap: false,
    assetsDir: "assets",
    rollupOptions: {
      input: resolve(__dirname, page === "reminder" ? "reminder.html" : "index.html"),
      output: {
        entryFileNames: `assets/${page}-[hash].js`,
        chunkFileNames: `assets/${page}-chunk-[hash].js`,
        assetFileNames: `assets/${page}-[hash][extname]`,
        // 单页面构建，不做跨页共享拆分
        manualChunks: undefined,
      },
    },
  },
});