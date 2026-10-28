import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductLabel, buildProductNameLabel, ProductLabelBatch } from '../core/label-product.js';
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

test('buildProductNameLabel：仅一行用户名，无价格', () => {
  const l = buildProductNameLabel('山田太郎');
  assert.equal(l.lines.length, 1);
  assert.equal(l.lines[0].role, 'name');
  assert.equal(l.lines[0].text, '山田太郎');
  assert.equal(l.price, null);
  assert.equal(l.qty, null);
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
  assert.equal(b.clear().ok, true);
  assert.equal(b.count, 0);
  assert.equal(b.list().length, 0);
});

test('ProductLabelBatch：copy 复制同款条目，插在原条后，受上限约束', () => {
  const b = new ProductLabelBatch(10);
  b.add('佐藤', 540, '20');
  b.add('田中', 300, null);
  const r = b.copy(0);
  assert.equal(r.ok, true);
  assert.equal(b.count, 3);
  // 插在原条后面
  assert.equal(b.list()[1].name, '佐藤');
  assert.equal(b.list()[1].price, 540);
  assert.equal(b.list()[1].qty, '20');
  // 原第二条后移
  assert.equal(b.list()[2].name, '田中');
  assert.equal(b.copy(999).ok, false);
});

test('ProductLabelBatch：replace 更新指定条目，校验同 add', () => {
  const b = new ProductLabelBatch(10);
  b.add('佐藤', 540, null);
  b.add('田中', 300, null);
  const r = b.replace(0, '鈴木', 700, '10');
  assert.equal(r.ok, true);
  assert.equal(b.list()[0].name, '鈴木');
  assert.equal(b.list()[0].price, 700);
  assert.equal(b.list()[0].qty, '10');
  assert.equal(b.list()[1].name, '田中'); // 第二条不受影响
  assert.equal(b.replace(999, 'x', 1, null).ok, false); // 越界
  assert.equal(b.replace(0, '', 1, null).ok, false); // 客户名空
  assert.equal(b.replace(0, 'x', 0, null).ok, false); // 价格0
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
