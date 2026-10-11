// CPCL 标签命令生成（40×30mm 热敏标签打印机，203dpi）。
// 说明：这是「首选尝试」协议，不同厂家固件可能有差异，需真机打样调字体与编码。
// 日文等非 ASCII 文本需打印机固件支持对应编码；ASCII（数字、英文名）通常可直接打印。

const DPI = 203;

/**
 * 生成 CPCL 打印命令。
 * @param {object} label 来自 label.js 的标签对象 { lines:[{text}], date }
 * @param {{widthMm:number,heightMm:number}} labelSize
 * @returns {string}
 */
export function buildCpcl(label, labelSize = { widthMm: 40, heightMm: 30 }) {
  const width = Math.round((labelSize.widthMm || 40) / 25.4 * DPI);
  const height = Math.round((labelSize.heightMm || 30) / 25.4 * DPI);

  const out = [];
  // CPCL 头部：! <左边距0> <横向DPI> <纵向DPI> <标签高度dots> <张数1>
  out.push(`! 0 200 200 ${height} 1`);
  out.push(`PAGE-WIDTH ${width}`);
  out.push('CENTER');

  const mainLines = label.lines.map((l) => l.text);
  const allRows = [...mainLines, label.date];

  const top = 8;
  const usable = height - 16;
  const step = Math.max(1, Math.floor(usable / allRows.length));

  allRows.forEach((text, i) => {
    const y = top + i * step;
    if (i < mainLines.length) {
      // 正文：字体 0（24×24）放大 1 倍；字体大小可在真机打样后调大
      out.push(`T 0 1 0 ${y} ${text}`);
    } else {
      // 日期：小字（12×24）
      out.push(`T 1 0 0 ${y} ${text}`);
    }
  });

  out.push('FORM');
  out.push('PRINT');
  return out.join('\r\n') + '\r\n';
}
