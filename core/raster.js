// 把便签渲染成 1-bit 位图（供 TSPL BITMAP / ESC-POS GS v 0 使用）。
// 用浏览器画布渲染：日文等任意文字都能正确成像，排版完全可控。
// 排版规则（按需求）：
//   - 文字尽量填满标签，四周仅留少量间距
//   - 「客户名 / N枚目 / 合計」为一组，组内紧凑
//   - 日期为独立一组，与上面留出更大间距

export const LABEL_DPI = 203;

export const FONT_STACK =
  '"Hiragino Sans", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", "Meiryo", "MS Gothic", sans-serif';

export function mmToDots(mm) {
  return Math.round((mm / 25.4) * LABEL_DPI);
}

/** 打印设置（毫米）→ 点偏移，供渲染与预览共用。 */
export function printToDots(print = {}) {
  return {
    offsetX: mmToDots(print.offsetXmm ?? 0),
    offsetY: mmToDots(print.offsetYmm ?? 0),
  };
}

/**
 * 纯计算排布（不依赖画布，便于单元测试）。
 * @param {string[]} mainTexts 正文各行（客户名 / N枚目 / 合計）
 * @param {number} W 标签宽（点）
 * @param {number} H 标签高（点）
 * @param {object} opts
 * @param {(text:string,size:number)=>number} measure 测量函数：给定字号返回该行像素宽
 */
export function computeLayout(mainTexts, W, H, opts, measure) {
  const marginX = opts.marginX ?? Math.round(W * 0.06);
  const marginTop = opts.marginTop ?? Math.round(H * 0.045);
  const marginBottom = opts.marginBottom ?? Math.round(H * 0.03);
  const lineGap = opts.lineGap ?? Math.round(H * 0.02);
  const dateGap = opts.dateGap ?? Math.round(H * 0.075);
  const growCap = opts.growCap ?? 1.35;

  const availW = W - marginX * 2;
  const dateSize = Math.max(12, Math.round(H * 0.085));
  const dateLineH = Math.round(dateSize * 1.2);
  const availH = H - marginTop - marginBottom - dateLineH - dateGap;

  // 每行「刚好填满可用宽度」的字号，再用倍率上限保持各行视觉一致
  const REF = 100;
  const fitSizes = mainTexts.map((t) => {
    const w = measure(t, REF);
    return w > 0 ? (availW / w) * REF : REF;
  });
  const sizeW = Math.min(...fitSizes);
  let sizes = fitSizes.map((s) => Math.min(s, sizeW * growCap));
  let lineHs = sizes.map((s) => Math.round(s * 1.18));

  const blockHeight = (hs) => hs.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, hs.length - 1);
  let blockH = blockHeight(lineHs);

  if (blockH > availH) {
    const k = availH / blockH;
    sizes = sizes.map((s) => s * k);
    lineHs = sizes.map((s) => Math.round(s * 1.18));
    blockH = blockHeight(lineHs);
  }

  // 剩余高度分摊到顶部与行间距，让内容饱满而不留大片空白
  const extra = Math.max(0, availH - blockH);
  const n = sizes.length;
  const padTop = Math.round(extra * 0.35);
  const gapExtra = n > 1 ? Math.round((extra * 0.45) / (n - 1)) : 0;

  const positions = [];
  let y = marginTop + padTop;
  for (let i = 0; i < n; i++) {
    positions.push(y);
    y += lineHs[i];
    if (i < n - 1) y += lineGap + gapExtra;
  }

  return {
    marginX,
    marginTop,
    marginBottom,
    availW,
    availH,
    dateSize,
    dateLineH,
    dateY: H - marginBottom - dateLineH,
    dateGap,
    sizes,
    lineHs,
    positions,
    blockH,
    blockBottom: y,
    extra,
  };
}

/**
 * 渲染便签到 1-bit 位图。
 * @returns {{width:number,height:number,widthBytes:number,data:Uint8Array,layout:object}}
 */
export function renderLabelBitmap(label, labelSize = { widthMm: 50, heightMm: 50 }, opts = {}) {
  const W = mmToDots(labelSize.widthMm || 50);
  const H = mmToDots(labelSize.heightMm || 50);
  const threshold = opts.threshold ?? 150;
  const ox = opts.offsetX ?? 0;
  const oy = opts.offsetY ?? 0;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const measure = (text, size) => {
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    // 安全系数：字体实际渲染常比 measureText 略宽，乘 1.08 防止溢出
    return ctx.measureText(text).width * 1.08;
  };

  const mainTexts = label.lines.map((l) => l.text);
  const layout = computeLayout(mainTexts, W, H, opts, measure);

  for (let i = 0; i < mainTexts.length; i++) {
    ctx.font = `bold ${layout.sizes[i]}px ${FONT_STACK}`;
    const boxH = layout.lineHs[i];
    ctx.fillText(mainTexts[i], W / 2 + ox, layout.positions[i] + oy + Math.max(0, (boxH - layout.sizes[i]) / 2));
  }

  ctx.font = `${layout.dateSize}px ${FONT_STACK}`;
  ctx.fillText(
    label.date,
    W / 2 + ox,
    layout.dateY + oy + Math.max(0, (layout.dateLineH - layout.dateSize) / 2),
  );

  // 取像素 → 1-bit（MSB 在左）
  // 位约定（与本打印机一致）：bit=1 → 白（不打印），bit=0 → 黑（打印）
  const img = ctx.getImageData(0, 0, W, H).data;
  const widthBytes = Math.ceil(W / 8);
  const data = new Uint8Array(widthBytes * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      if (img[i] >= threshold) data[py * widthBytes + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }
  return { width: W, height: H, widthBytes, data, layout };
}

/** 把 1-bit 位图还原成可见画布，用于界面预览（与实际打印逐像素一致）。 */
export function bitmapToCanvas(bmp) {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(bmp.width, bmp.height);
  for (let py = 0; py < bmp.height; py++) {
    for (let px = 0; px < bmp.width; px++) {
      const bit = (bmp.data[py * bmp.widthBytes + (px >> 3)] >> (7 - (px & 7))) & 1;
      const i = (py * bmp.width + px) * 4;
      const v = bit ? 255 : 0; // bit=1 → 白，bit=0 → 黑
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
