import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 几何辅助 ---------------- */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;

/** 点到线段的距离 */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
}

/** 圆角矩形有符号距离（<0 内部） */
function roundRectDist(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hw = (x1 - x0) / 2 - r;
  const hh = (y1 - y0) / 2 - r;
  const qx = Math.abs(px - cx) - hw;
  const qy = Math.abs(py - cy) - hh;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/* ---------------- 图案 ----------------
 * 画布为 0..1 单位坐标。
 * 圆角方块底 + 白色向上箭头（寓意「起身」）。
 */

const BG_TOP = [0x5c, 0xc4, 0xa2];
const BG_BOTTOM = [0x3b, 0x8d, 0x72];
const ARROW_STROKE = 0.118;

function drawMark(size, { mono = false, padding = 0, background = true } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 4; // 4x4 超采样抗锯齿
  const s = size;
  const inset = padding;
  const x0 = inset;
  const y0 = inset;
  const x1 = 1 - inset;
  const y1 = 1 - inset;
  const radius = (x1 - x0) * 0.245;

  // 箭头几何（相对单位坐标）
  const tipY = 0.295;
  const armY = 0.485;
  const armX = 0.208;
  const stemBottom = 0.735;
  const stroke = ARROW_STROKE;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let bgCov = 0;
      let arrowCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / s;
          const py = (y + (sy + 0.5) / SS) / s;

          if (background) {
            const d = roundRectDist(px, py, x0, y0, x1, y1, radius);
            if (d < 0) bgCov += 1;
          }

          const dStem = segDist(px, py, 0.5, tipY, 0.5, stemBottom);
          const dLeft = segDist(px, py, 0.5, tipY, 0.5 - armX, armY);
          const dRight = segDist(px, py, 0.5, tipY, 0.5 + armX, armY);
          const dArrow = Math.min(dStem, dLeft, dRight);
          if (dArrow < stroke / 2) arrowCov += 1;
        }
      }
      const n = SS * SS;
      const aBg = bgCov / n;
      const aArrow = arrowCov / n;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (background) {
        const t = clamp((y / s - 0.05) / 0.9, 0, 1);
        r = mix(BG_TOP[0], BG_BOTTOM[0], t);
        g = mix(BG_TOP[1], BG_BOTTOM[1], t);
        b = mix(BG_TOP[2], BG_BOTTOM[2], t);
        a = aBg;
      }

      if (aArrow > 0) {
        const fg = mono ? [0, 0, 0] : [255, 255, 255];
        if (background && aBg > 0) {
          const k = aArrow / Math.max(aBg, 1e-6);
          r = mix(r, fg[0], Math.min(k, 1));
          g = mix(g, fg[1], Math.min(k, 1));
          b = mix(b, fg[2], Math.min(k, 1));
          a = Math.max(aBg, aArrow);
        } else if (!background) {
          r = fg[0];
          g = fg[1];
          b = fg[2];
          a = aArrow;
        } else {
          r = mix(r, fg[0], aArrow);
          g = mix(g, fg[1], aArrow);
          b = mix(b, fg[2], aArrow);
          a = Math.max(aBg, aArrow);
        }
      }

      const i = (y * s + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  return encodePNG(size, size, buf);
}

function write(rel, data) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log("✓", rel, `${(data.length / 1024).toFixed(1)} KB`);
}

// 应用图标（electron-builder 会据此生成 .ico / .icns）
write("build/icon.png", drawMark(1024, { padding: 0.045 }));

// 托盘图标：带底色（Windows / Linux）
write("resources/tray-32.png", drawMark(32, { padding: 0.02 }));
write("resources/tray-64.png", drawMark(64, { padding: 0.02 }));

// 托盘图标：纯黑模板（macOS template image）
write("resources/trayTemplate.png", drawMark(22, { mono: true, background: false, padding: 0.06 }));
write(
  "resources/trayTemplate@2x.png",
  drawMark(44, { mono: true, background: false, padding: 0.06 })
);

// 提醒窗口/关于页用的小标志
write("resources/mark-128.png", drawMark(128, { padding: 0.04 }));