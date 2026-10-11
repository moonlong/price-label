// ESC/POS 位图打印（GS v 0）：与 TSPL 位图共用同一套渲染，保证任意文字正确。
// 仅作为协议备选；CT221B 已确认走 TSPL。

import { renderLabelBitmap, printToDots } from './raster.js';

export function buildEscposRaster(label, labelSize = { widthMm: 40, heightMm: 30 }, print = {}) {
  const bmp = renderLabelBitmap(label, labelSize, printToDots(print));
  const header = new Uint8Array([
    0x1b, 0x40,
    0x1d, 0x76, 0x30, 0x00,
    bmp.widthBytes & 0xff, (bmp.widthBytes >> 8) & 0xff,
    bmp.height & 0xff, (bmp.height >> 8) & 0xff,
  ]);
  const out = new Uint8Array(header.length + bmp.data.length);
  out.set(header, 0);
  out.set(bmp.data, header.length);
  return out;
}
