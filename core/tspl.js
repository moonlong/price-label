// TSPL 标签命令（TSC 兼容）。CT221B 已实测可用。
// 正文使用字体 "4"（24×32）、日期使用 "1"（8×12），水平居中。
// 注意：字体 1~5 为内置 ASCII 字体，日文（枚目/円/合計/片假名）能否正常显示取决于固件，
// 若出现乱码需改用「位图方式」打印（见 core/escpos.js 的思路）。

const FONTS = {
  '1': { w: 8, h: 12 },
  '2': { w: 12, h: 20 },
  '3': { w: 16, h: 24 },
  '4': { w: 24, h: 32 },
  '5': { w: 32, h: 48 },
};

function textWidthDots(text, fontW, xMul) {
  let ascii = 0;
  let full = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x7f) full += 1;
    else ascii += 1;
  }
  return (ascii + full * 2) * fontW * xMul;
}

export function buildTspl(label, labelSize = { widthMm: 50, heightMm: 50 }) {
  const dpi = 203;
  const width = Math.round((labelSize.widthMm || 50) / 25.4 * dpi);
  const height = Math.round((labelSize.heightMm || 50) / 25.4 * dpi);

  const out = [];
  out.push(`SIZE ${labelSize.widthMm || 50} mm,${labelSize.heightMm || 50} mm`);
  out.push('GAP 0 mm,0 mm');
  out.push('CLS');
  out.push('DIRECTION 1');

  const main = label.lines.map((l) => l.text);
  const mainFont = '4';
  const mainW = FONTS['4'].w;
  const lineH = 40;
  const dateFont = '1';

  const totalH = main.length * lineH + 12 + 20;
  let y = Math.max(6, Math.floor((height - totalH) / 2));

  for (const text of main) {
    const x = Math.max(0, Math.floor((width - textWidthDots(text, mainW, 1)) / 2));
    out.push(`TEXT ${x},${y},"${mainFont}",0,1,1,"${text}"`);
    y += lineH;
  }
  y += 4;
  const dx = Math.max(0, Math.floor((width - textWidthDots(label.date, FONTS['1'].w, 1)) / 2));
  out.push(`TEXT ${dx},${y},"${dateFont}",0,1,1,"${label.date}"`);

  out.push('PRINT 1');
  return out.join('\r\n') + '\r\n';
}
