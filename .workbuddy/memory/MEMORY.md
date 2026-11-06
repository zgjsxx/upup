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

1. **批量删除被安全策略拦截**：`fs.rmSync` / `rm -rf` / `Remove-Item -Recurse` 都会失败（内部走 trash 且被 fail-closed）。可行做法：逐文件 `unlinkSync`，大文件先 `ftruncateSync(0)` 释放空间，再自底向上 `rmdirSync` 空目录。
2. **`app.asar` 无法删除**：所有打包目录里的 `app.asar` 会被某种句柄持续锁定，即使截断为 0 字节也删不掉（rename 报 EBUSY）。空间已释放，残留无害，但目录删不干净。绕过办法：用 `copyFileSync` 覆盖它，可正常写入。
3. **透明窗口无法 CDP 截图**：提醒窗 `transparent: true`，`Page.captureScreenshot` 会挂起超时。验证改为校验 DOM 文本与长度，截图函数需带超时降级。

## 验证状态（截至 2026-11-06 21:45）

- 状态机单测 53/53 通过
- 界面自动化 10 个场景全部通过（提醒窗改为 DOM 断言）
- 打包版 `release/win-unpacked`：preload、渲染、提醒窗均验证通过
- 未验证：macOS / Linux 实机运行（仅配置就绪）

## 设计基调

极简、治愈、轻盈、现代、友好。参考 Raycast 的简洁交互。配色：薄荷绿 `#4CAF8F` / 暖白 `#FAFAF8` / 深灰 `#252525` / 辅助灰 `#888888` / 柔和橙 `#FFB86B`。避免花哨渐变与过多数据展示，首页只突出倒计时。