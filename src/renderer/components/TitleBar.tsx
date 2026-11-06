import { Minus, X } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  children?: ReactNode;
  /** 左侧标题区 */
  left?: ReactNode;
  /** 右侧（Tabs / 操作） */
  right?: ReactNode;
  /** macOS 上需要给红绿灯留位置 */
  isMac: boolean;
}

/**
 * 无边框自定义标题栏：
 * - 整条可拖拽（.drag），交互元素包在 .no-drag 里
 * - macOS 左侧留出 78px 给系统红绿灯
 */
export function TitleBar({ children, left, right, isMac }: Props) {
  return (
    <header
      className="drag relative flex h-[52px] flex-none items-center justify-between px-5"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <div className="flex items-center gap-3" style={{ paddingLeft: isMac ? 72 : 0 }}>
        {left}
        {children}
      </div>
      <div className="no-drag flex items-center gap-1">{right}</div>
    </header>
  );
}

export function WindowControls({ isMac }: { isMac: boolean }) {
  if (isMac) return null;
  return (
    <div className="no-drag flex items-center">
      <button
        aria-label="最小化"
        title="最小化"
        onClick={() => window.upup.minimize?.()}
        className="grid h-8 w-9 place-items-center rounded-lg transition-colors"
        style={{ color: "var(--mute)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-inset)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Minus size={15} strokeWidth={2} />
      </button>
      <button
        aria-label="关闭到托盘"
        title="关闭到托盘（继续在后台计时）"
        onClick={() => window.upup.hideWindow?.()}
        className="grid h-8 w-9 place-items-center rounded-lg transition-colors hover:bg-[#e81123] hover:text-white"
        style={{ color: "var(--mute)" }}
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}