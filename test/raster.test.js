import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mmToDots, computeLayout, LABEL_DPI } from '../core/raster.js';

// 近似的文字宽度模型：全角 1.0em、半角 0.6em，用于在无画布环境下验证排布算法。
function fakeMeasure(text, size) {
  let ascii = 0;
  let full = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x7f) full += 1;
    else ascii += 1;
  }
  return (full + ascii * 0.6) * size;
}

const W = mmToDots(40); // 320
const H = mmToDots(30); // 240

test('毫米转打印点（203dpi）', () => {
  assert.equal(LABEL_DPI, 203);
  assert.equal(mmToDots(25.4), 203);
  assert.equal(W, 320);
  assert.equal(H, 240);
});

test('排版：三行（含合计）填满宽度且不与日期重叠', () => {
  const texts = ['ナオミ', '1枚目: 12,345円', '合計: 30,000円'];
  const L = computeLayout(texts, W, H, {}, fakeMeasure);

  // 1) 每行都不超过可用宽度（不溢出标签）
  texts.forEach((t, i) => {
    const w = fakeMeasure(t, L.sizes[i]);
    assert.ok(w <= L.availW + 1, `第${i + 1}行溢出: ${w} > ${L.availW}`);
  });
  // 2) 至少有一行接近填满（饱满）
  const maxW = Math.max(...texts.map((t, i) => fakeMeasure(t, L.sizes[i])));
  assert.ok(maxW / L.availW > 0.9, `内容过窄，未填满: ${maxW}/${L.availW}`);

  // 3) 字号为正数
  L.sizes.forEach((s) => assert.ok(s > 0));

  // 4) 正文块与日期之间保留不小于 dateGap 的间距
  const gap = L.dateY - L.blockBottom;
  assert.ok(gap >= L.dateGap - 1, `正文与日期间距不足: ${gap} < ${L.dateGap}`);

  // 5) 不超出标签底部
  assert.ok(L.dateY + L.dateLineH <= H);
});

test('排版：两行时把余量分摊到行间距（更饱满）', () => {
  const two = computeLayout(['NOE', '1枚目: 34円'], W, H, {}, fakeMeasure);
  const three = computeLayout(['NOE', '1枚目: 34円', '合計: 34円'], W, H, {}, fakeMeasure);
  // 两行时行间距余量更多
  assert.ok(two.extra > three.extra);
  // 两种情况都不重叠日期
  assert.ok(two.blockBottom < two.dateY);
  assert.ok(three.blockBottom < three.dateY);
});

test('排版：超长内容自动缩小以免溢出', () => {
  const long = ['ナオミ', '1枚目: 9,999,999,999円', '合計: 99,999,999,999円'];
  const L = computeLayout(long, W, H, {}, fakeMeasure);
  long.forEach((t, i) => {
    assert.ok(fakeMeasure(t, L.sizes[i]) <= L.availW + 1, `第${i + 1}行溢出`);
  });
  assert.ok(L.blockBottom <= L.dateY);
});
