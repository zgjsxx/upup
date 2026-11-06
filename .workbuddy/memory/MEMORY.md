# 起一会 UpUp — 项目长期记忆

## 项目定位

轻量级久坐提醒桌面工具。目标：可长期后台运行、流程完整的最小可用产品（PRD V1.0 MVP）。用户明确要求「跨端」，最终采用 **Electron 33**（非 PRD 原推荐的 Tauri）。

## 技术栈（固定，勿随意更换）

- Electron 33 + React 18 + TypeScript
- Vite 6（渲染进程）+ esbuild（主进程/preload）
- Tailwind CSS 3 + CSS 变量主题
- Lucide 图标；无 UI 组件库（手写轻量组件）
- electron-builder 打包

## 关键约定

1. **启动脚本必须剔除 `ELECTRON_RUN_AS_NODE`** — 该环境变量会让 Electron 退化为 Node 进程。见 scripts/dev.mjs、verify.mjs。
2. **双页面分开构建** — `UPUP_PAGE` 环境变量控制，避免 Vite 多入口共享 chunk 导致白屏。
3. **计时逻辑放主进程** — 渲染进程只做展示与插值。状态机 `src/main/engine.ts` 必须保持无 Electron 依赖，便于单测。
4. **所有计时基于真实时间戳**，禁止用 setInterval 累加。
5. **窗口无边框自绘**（`frame: false`），标题栏用 `.drag` / `.no-drag` 控制拖拽区；macOS 需给红绿灯留 72px。
6. **提醒窗不抢焦点** — 用 `showInactive()`，不用 `show()`。
7. npm 使用 `.npmrc` 中的镜像源（官方源在此环境极慢）。

## 常用命令

```bash
npm run dev            # 开发（Vite + Electron 热更新）
npm run build          # 类型检查 + 构建
npm test               # 状态机单测（53 项）
npm run verify         # CDP 界面自动化验证 + 截图到 _shots/
npm run clean          # 清空 release/ 打包产物
npm run dist:win       # 打包 Windows（自动修缓存 + 清空旧产物）
```

## 目录约定（重要）

- **打包产物只会出现在 `release/`**。`dist:win` 等命令会先跑 `clean-output.mjs` 清空旧产物。
- 前端产物在 `dist/`，主进程在 `dist-electron/`，验证截图在 `_shots/`，均不入库。

## 环境限制（已确认，勿反复尝试）

1. **删除文件必须用 `fs.rmSync`，不是 `unlinkSync`**：本环境里 `unlinkSync` 会被拦截并转交「移入回收站」，处理大文件（如 27MB 的 `app.asar`）时回收站流程超时失败（`genie-trash ETIMEDOUT`），错误信息会误导成「文件被占用」。`fs.rmSync(f,{force:true})` 走直接删除路径，可靠。`clean-output.mjs` 已按此实现（rmSync 优先，unlinkSync 兜底）。
2. **不要对 `release/` 做破坏性测试**：曾为了验证清理脚本直接清空有效产物，导致 72 个文件被删到 13 个。测试破坏性脚本一律用临时目录。
3. **透明窗口无法 CDP 截图**：提醒窗 `transparent: true`，`Page.captureScreenshot` 会挂起超时。验证改为校验 DOM 文本与长度，截图函数需带超时降级。
4. **打包需加 `--config.win.signAndEditExecutable=false`**：否则 electron-builder 解压 winCodeSign 时因符号链接权限失败（普通用户无创建符号链接权限）。`fix-builder-cache.mjs` 可修复缓存，但打包命令仍需该参数。

## 验证状态（截至 2026-11-06 22:15）

- 状态机单测 53/53 通过
- 界面自动化 10 个场景全部通过（提醒窗改为 DOM 断言）
- 打包版 `release/win-unpacked`：preload、渲染、提醒窗均验证通过
- 未验证：macOS / Linux 实机运行（仅配置就绪）

## 设计基调

极简、治愈、轻盈、现代、友好。参考 Raycast 的简洁交互。配色：薄荷绿 `#4CAF8F` / 暖白 `#FAFAF8` / 深灰 `#252525` / 辅助灰 `#888888` / 柔和橙 `#FFB86B`。避免花哨渐变与过多数据展示，首页只突出倒计时。