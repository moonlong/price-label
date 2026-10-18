import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePacket,
  u16be,
  buildConnectPacket,
  buildPrinterInfoPacket,
  buildStatusPacket,
  buildSetDensityPacket,
  buildSetLabelTypePacket,
  buildPrintStartPacket,
  buildPageStartPacket,
  buildSetPageSizePacket,
  buildPageEndPacket,
  buildPrintStatusPacket,
  buildPrintEndPacket,
} from '../core/niimbot.js';

function hex(arr) {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

test('完整包结构 + 校验和(XOR)：Connect/PrinterInfo/Status', () => {
  assert.equal(hex(buildConnectPacket()), '55 55 c1 01 01 c1 aa aa');
  assert.equal(hex(buildPrinterInfoPacket()), '55 55 40 00 40 aa aa');
  assert.equal(hex(buildStatusPacket()), '55 55 a5 00 a5 aa aa');
});

test('校验和 = CMD ^ LEN ^ DATA 逐字节 XOR', () => {
  const p = encodePacket(0x99, [0x01, 0x02]);
  // body = [99, 02, 01, 02]，checksum = 99^02^01^02 = 98
  assert.equal(p.length, 9);
  assert.equal(p[0], 0x55);
  assert.equal(p[1], 0x55);
  assert.equal(p[2], 0x99);
  assert.equal(p[3], 0x02);
  assert.equal(p[4], 0x01);
  assert.equal(p[5], 0x02);
  assert.equal(p[6], 0x98); // checksum
  assert.equal(p[7], 0xaa);
  assert.equal(p[8], 0xaa);
});

test('u16 大端编码', () => {
  assert.deepEqual(u16be(0), [0x00, 0x00]);
  assert.deepEqual(u16be(1), [0x00, 0x01]);
  assert.deepEqual(u16be(240), [0x00, 0xf0]);
  assert.deepEqual(u16be(320), [0x01, 0x40]);
  assert.deepEqual(u16be(384), [0x01, 0x80]);
});

test('打印控制命令（依据 niimbluelib 逐字节）', () => {
  assert.equal(hex(buildSetDensityPacket(5)), '55 55 21 01 05 25 aa aa');
  assert.equal(hex(buildSetLabelTypePacket(1)), '55 55 23 01 01 23 aa aa');
  // PrintStart 7 字节：totalPages=1, pageColor=0
  assert.equal(hex(buildPrintStartPacket(1, 0)), '55 55 01 07 00 01 00 00 00 00 00 07 aa aa');
  assert.equal(hex(buildPageStartPacket()), '55 55 03 01 01 03 aa aa');
  // SetPageSize 6 字节：rows=240, cols=320, copies=1
  assert.equal(hex(buildSetPageSizePacket(240, 320, 1)), '55 55 13 06 00 f0 01 40 00 01 a5 aa aa');
  assert.equal(hex(buildPageEndPacket()), '55 55 e3 01 01 e3 aa aa');
  assert.equal(hex(buildPrintStatusPacket()), '55 55 a3 01 01 a3 aa aa');
  assert.equal(hex(buildPrintEndPacket()), '55 55 f3 01 01 f3 aa aa');
});
