// TSPL + 位图打印：CT221B 实测 TSPL 可用，日文用位图规避固件编码问题。
// 命令：SIZE / GAP / CLS / DIRECTION / BITMAP / PRINT
// BITMAP x,y,width(字节),height(点),mode,<二进制位图数据>

import { renderLabelBitmap, printToDots } from './raster.js';

export function buildTsplRaster(label, labelSize = { widthMm: 50, heightMm: 50 }, print = {}) {
  const bmp = renderLabelBitmap(label, labelSize, printToDots(print));
  const wMm = labelSize.widthMm || 50;
  const hMm = labelSize.heightMm || 50;
  // 内容偏移已在 renderLabelBitmap 内部完成，位图原点固定在 0,0
  const head = `SIZE ${wMm} mm,${hMm} mm\r\nGAP 0 mm,0 mm\r\nCLS\r\nDIRECTION 1\r\nBITMAP 0,0,${bmp.widthBytes},${bmp.height},0,`;
  const tail = `\r\nPRINT 1\r\n`;

  const headBytes = new TextEncoder().encode(head);
  const tailBytes = new TextEncoder().encode(tail);
  const out = new Uint8Array(headBytes.length + bmp.data.length + tailBytes.length);
  out.set(headBytes, 0);
  out.set(bmp.data, headBytes.length);
  out.set(tailBytes, headBytes.length + bmp.data.length);
  return out;
}
