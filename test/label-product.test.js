import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductLabel, ProductLabelBatch } from '../core/label-product.js';
import { computeLayout, mmToDots } from '../core/raster.js';

// 近似文字宽度模型，用于无画布环境验证排布。
function fakeMeasure(text, size) {
  let w = 0;
  for (const ch of text) w += (ch.charCodeAt(0) > 0x7e ? 1.0 : 0.6) * size;
  return w;
}

test('buildProductLabel：仅价格无数量；价格+数量用 / 分割', () => {
  assert.equal(buildProductLabel('佐藤', 540, null).lines[0].text, '佐藤');
  assert.equal(buildProductLabel('佐藤', 540, null).lines[1].text, '540');
  assert.equal(buildProductLabel('佐藤', 540, '20').lines[1].text, '540/20p');
  assert.equal(buildProductLabel('佐藤', 540, '20', '個').lines[1].text, '540/20個');
});

test('ProductLabelBatch：最多10条、可删、校验', () => {
  const b = new ProductLabelBatch(10);
  assert.equal(b.add('', 100, null).ok, false); // 客户名空拒绝
  assert.equal(b.add('佐藤', 0, null).ok, false); // 价格0拒绝
  assert.equal(b.add('佐藤', 'abc', null).ok, false); // 价格非数字拒绝
  assert.equal(b.add('佐藤', 100, '0').ok, false); // 数量0拒绝
  assert.equal(b.add('佐藤', 100, 'abc').ok, false); // 数量非数字拒绝
  assert.equal(b.add('佐藤', 100, '').ok, true); // 数量为空允许
  assert.equal(b.list()[0].name, '佐藤');

  // 填满到 10
  for (let i = 1; i <= 9; i++) assert.equal(b.add('客户' + i, i * 100, null).ok, true);
  assert.equal(b.count, 10);
  assert.equal(b.add('佐藤', 9999, null).ok, false); // 第11条拒绝

  assert.equal(b.remove(0).ok, true);
  assert.equal(b.count, 9);
  assert.equal(b.remove(999).ok, false);
});

test('computeLayout noDate：不预留日期行，正文可用高度更大', () => {
  const W = mmToDots(40);
  const H = mmToDots(30);
  const withDate = computeLayout(['佐藤', '540/20p'], W, H, {}, fakeMeasure);
  const noDate = computeLayout(['佐藤', '540/20p'], W, H, { noDate: true }, fakeMeasure);
  assert.equal(noDate.dateSize, 0);
  assert.equal(noDate.dateLineH, 0);
  assert.ok(noDate.availH > withDate.availH);
});
