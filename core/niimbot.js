// 精臣 B1 打印协议（依据 @mmote/niimbluelib 0.47.0 源码逐字节对齐）。
// 包结构：55 55 + CMD + LEN + DATA + CHECKSUM + AA AA
// 校验和 = CMD ^ LEN ^ DATA[0..]（逐字节 XOR）
// u16 字段一律【大端】（高字节在前）。
import { renderLabelBitmap, printToDots, mmToDots } from './raster.js';

export const NIIMBOT_CMD = {
  CONNECT: 0xc1,
  PRINTER_INFO: 0x40,
  STATUS: 0xa5, // PrinterStatusData
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  PRINT_START: 0x01,
  PAGE_START: 0x03,
  SET_PAGE_SIZE: 0x13,
  PRINT_BITMAP_ROW: 0x85, // 满行
  PRINT_BITMAP_ROW_INDEXED: 0x83, // 稀疏行（黑点≤6）
  PRINT_EMPTY_ROW: 0x84, // 空行
  PAGE_END: 0xe3,
  PRINT_STATUS: 0xa3,
  PRINT_END: 0xf3,
};

/** B1 打印头宽度（像素），203 dpi。 */
export const PRINTHEAD_PIXELS = 384;

function xorBytes(arr) {
  let r = 0;
  for (const b of arr) r ^= b;
  return r & 0xff;
}

/** 组一个完整包：55 55 CMD LEN DATA CHECKSUM AA AA */
export function encodePacket(cmd, data = []) {
  const body = [cmd, data.length, ...data];
  const checksum = xorBytes(body);
  return new Uint8Array([0x55, 0x55, ...body, checksum, 0xaa, 0xaa]);
}

/** u16 → 大端字节 [hi, lo] */
export function u16be(n) {
  return [(n >> 8) & 0xff, n & 0xff];
}

// ---------- 连接 / 信息（诊断用） ----------

export function buildConnectPacket() {
  return encodePacket(NIIMBOT_CMD.CONNECT, [0x01]);
}
export function buildPrinterInfoPacket() {
  return encodePacket(NIIMBOT_CMD.PRINTER_INFO, []);
}
export function buildStatusPacket() {
  return encodePacket(NIIMBOT_CMD.STATUS, []);
}

// ---------- 打印控制命令 ----------

export function buildSetDensityPacket(density = 5) {
  return encodePacket(NIIMBOT_CMD.SET_DENSITY, [density & 0x0f]);
}
export function buildSetLabelTypePacket(type = 1) {
  return encodePacket(NIIMBOT_CMD.SET_LABEL_TYPE, [type & 0xff]);
}
/** PrintStart：7 字节 [totalPages u16be, 00,00,00,00, pageColor] */
export function buildPrintStartPacket(totalPages = 1, pageColor = 0) {
  return encodePacket(NIIMBOT_CMD.PRINT_START, [...u16be(totalPages), 0x00, 0x00, 0x00, 0x00, pageColor]);
}
export function buildPageStartPacket() {
  return encodePacket(NIIMBOT_CMD.PAGE_START, [0x01]);
}
/** SetPageSize：6 字节 [rows u16be, cols u16be, copiesCount u16be] */
export function buildSetPageSizePacket(rows, cols, copiesCount = 1) {
  return encodePacket(NIIMBOT_CMD.SET_PAGE_SIZE, [...u16be(rows), ...u16be(cols), ...u16be(copiesCount)]);
}
export function buildPageEndPacket() {
  return encodePacket(NIIMBOT_CMD.PAGE_END, [0x01]);
}
export function buildPrintStatusPacket() {
  return encodePacket(NIIMBOT_CMD.PRINT_STATUS, [0x01]);
}
export function buildPrintEndPacket() {
  return encodePacket(NIIMBOT_CMD.PRINT_END, [0x01]);
}

// ---------- 位图编码 ----------

function popcount8(b) {
  let c = 0;
  for (let i = 0; i < 8; i++) if (b & (1 << i)) c++;
  return c;
}

function u8ArraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 把整行位图拆成 3 块黑点数（打印头 384 像素 = 48 字节 = 3 块 × 16 字节）。
 * 行数据 ≤ 48 字节时始终用「分块」模式。
 */
function countParts(rowData) {
  const chunkSize = Math.floor(PRINTHEAD_PIXELS / 8 / 3); // 16
  const parts = [0, 0, 0];
  for (let i = 0; i < rowData.length; i++) {
    const chunkIdx = Math.floor(i / chunkSize);
    if (chunkIdx > 2) break;
    parts[chunkIdx] += popcount8(rowData[i]);
  }
  return parts;
}

/** 黑点位置索引（大端 u16），用于稀疏行。 */
function indexPixels(data) {
  const out = [];
  for (let bytePos = 0; bytePos < data.length; bytePos++) {
    const b = data[bytePos];
    for (let bitPos = 0; bitPos < 8; bitPos++) {
      if (b & (1 << (7 - bitPos))) out.push(...u16be(bytePos * 8 + bitPos));
    }
  }
  return out;
}

function buildBitmapRowPacket(pos, repeat, rowData) {
  return encodePacket(NIIMBOT_CMD.PRINT_BITMAP_ROW, [...u16be(pos), ...countParts(rowData), repeat, ...rowData]);
}
function buildBitmapRowIndexedPacket(pos, repeat, rowData) {
  return encodePacket(NIIMBOT_CMD.PRINT_BITMAP_ROW_INDEXED, [...u16be(pos), ...countParts(rowData), repeat, ...indexPixels(rowData)]);
}
function buildEmptyRowPacket(pos, repeat) {
  return encodePacket(NIIMBOT_CMD.PRINT_EMPTY_ROW, [...u16be(pos), repeat]);
}

/**
 * 把 renderLabelBitmap 的位图（bit=1=白）转成精臣位图（bit=1=黑），
 * 并按「空行 / 稀疏行 / 满行 + 相同行合并」规则生成打印行命令。
 */
function encodeBitmapRows(bmp) {
  const widthBytes = bmp.widthBytes;
  const rows = []; // { dataType:'void'|'pixels', rowNumber, repeat, rowData, blackCount }
  for (let y = 0; y < bmp.height; y++) {
    const src = bmp.data.slice(y * widthBytes, (y + 1) * widthBytes);
    // 反转：精臣 bit=1 表示黑（打印）；renderLabelBitmap 是 bit=1=白。
    const rowData = new Uint8Array(widthBytes);
    let blackCount = 0;
    for (let i = 0; i < widthBytes; i++) {
      rowData[i] = src[i] ^ 0xff;
      blackCount += popcount8(rowData[i]);
    }
    const dataType = blackCount === 0 ? 'void' : 'pixels';
    const part = { dataType, rowNumber: y, repeat: 1, rowData, blackCount };

    const last = rows[rows.length - 1];
    if (last && last.dataType === part.dataType) {
      let same = part.dataType === 'void';
      if (!same) same = u8ArraysEqual(last.rowData, part.rowData);
      if (same) {
        last.repeat++;
        continue;
      }
    }
    rows.push(part);
  }
  return rows;
}

/**
 * 生成「发送阶段」的完整命令序列（不含 PrintStatus 轮询与 PrintEnd，这两步由打印流程处理）。
 * 流程：SetDensity → SetLabelType → PrintStart → PageStart → SetPageSize → 逐行位图 → PageEnd
 */
export function buildNiimbotCommands(label, labelSize = { widthMm: 40, heightMm: 30 }, print = {}, opts = {}) {
  const W = mmToDots(labelSize.widthMm || 40);
  const H = mmToDots(labelSize.heightMm || 30);
  // 商品标签排版（日本本土化：四周留白、上下居中、价格略大于客户名）
  // 仅一行（NameOnly）时用大字号单行布局
  const singleLine = (label.lines || []).length === 1;
  const productLayout = {
    fixedSizes: singleLine ? [Math.round(H * 0.30)] : [Math.round(H * 0.19), Math.round(H * 0.26)],
    marginX: Math.round(W * 0.12),
    marginTop: Math.round(H * 0.12),
    marginBottom: Math.round(H * 0.12),
    lineGap: Math.round(H * 0.10),
    center: true,
    frame: 'sakura',
  };
  const bmp = renderLabelBitmap(label, labelSize, { ...printToDots(print), ...opts, ...productLayout });
  const cols = bmp.widthBytes * 8; // 补齐到 8 的倍数
  const cmds = [];
  cmds.push(encodePacket(NIIMBOT_CMD.SET_DENSITY, [0x05])); // 浓度
  cmds.push(encodePacket(NIIMBOT_CMD.SET_LABEL_TYPE, [0x01])); // 有间隙标签
  cmds.push(encodePacket(NIIMBOT_CMD.PRINT_START, [...u16be(1), 0x00, 0x00, 0x00, 0x00, 0x00])); // 1 页，单色
  cmds.push(encodePacket(NIIMBOT_CMD.PAGE_START, [0x01]));
  cmds.push(encodePacket(NIIMBOT_CMD.SET_PAGE_SIZE, [...u16be(bmp.height), ...u16be(cols), ...u16be(1)]));
  for (const r of encodeBitmapRows(bmp)) {
    if (r.dataType === 'void') {
      cmds.push(buildEmptyRowPacket(r.rowNumber, r.repeat));
    } else if (r.blackCount <= 6) {
      cmds.push(buildBitmapRowIndexedPacket(r.rowNumber, r.repeat, r.rowData));
    } else {
      cmds.push(buildBitmapRowPacket(r.rowNumber, r.repeat, r.rowData));
    }
  }
  cmds.push(encodePacket(NIIMBOT_CMD.PAGE_END, [0x01]));
  return cmds;
}
