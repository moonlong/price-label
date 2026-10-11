import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../core/store.js';
import { labelToPlainText } from '../core/label.js';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const CONFIG = JSON.stringify({
  version: 1,
  label: { widthMm: 40, heightMm: 30 },
  customers: [
    { no: 1, name: 'ナオミ' },
    { no: 2, name: 'NOE' },
  ],
});

test('完整结算流程（客户用例：NOE，三枚目）', () => {
  const s = new Store(mem());
  assert.equal(s.importConfig(CONFIG).ok, true);
  assert.equal(s.selectCustomer(2).ok, true); // NOE
  assert.equal(s.setGroup(1).ok, true);

  // 1枚目：1000+520*10+3800 = 10000
  let r = s.addEntry('1000+520*10+3800');
  assert.equal(r.entry.value, 10000);
  const g1 = s.finishGroup();
  assert.equal(g1.action, 'done');
  assert.equal(g1.groupTotal, 10000);
  assert.equal(labelToPlainText(g1.label), 'NOE 様\n1枚目: 10,000円\n' + g1.label.date);
  s.commitGroup(g1.groupNo);
  assert.equal(s.currentGroup(), 2);

  // 2枚目：440*10+5600 = 10000
  r = s.addEntry('440*10+5600');
  assert.equal(r.entry.value, 10000);
  const g2 = s.finishGroup();
  s.commitGroup(g2.groupNo);
  assert.equal(s.currentGroup(), 3);

  // 3枚目：1000+234 = 1234
  r = s.addEntry('1000+234');
  assert.equal(r.entry.value, 1234);
  const g3 = s.finishGroup();
  assert.equal(g3.groupTotal, 1234);

  // 本单合计 = 已打印的 1、2 枚目（不含进行中的 3枚目）
  assert.equal(s.grandTotal(), 20000);
  const totalLabel = s.totalLabel(g3.groupNo, g3.groupTotal);
  assert.equal(labelToPlainText(totalLabel), 'NOE 様\n3枚目: 1,234円\n合計: 21,234円\n' + totalLabel.date);

  const t = s.finalizeTotal(g3.groupNo, g3.groupTotal);
  assert.equal(t.grandTotal, 21234);
  assert.equal(s.hasAnyData(), false);

  // 历史记录：NOE 21234
  const hist = s.getHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].customer, 'NOE');
  assert.equal(hist[0].total, 21234);

  // 补打合计标签
  const rt = s.reprintTotal();
  assert.equal(rt.ok, true);
  assert.equal(labelToPlainText(rt.label), 'NOE 様\n3枚目: 1,234円\n合計: 21,234円\n' + t.lastOrder.date);
});

test('单组场景：一组直接附合计结束', () => {
  const s = new Store(mem());
  s.importConfig(CONFIG);
  s.selectCustomer(2);
  s.setGroup(1);
  s.addEntry('1000+234'); // 1234
  const g1 = s.finishGroup();
  assert.equal(g1.action, 'done');
  const r = s.finalizeTotal(g1.groupNo, g1.groupTotal);
  assert.equal(r.grandTotal, 1234);
  assert.equal(labelToPlainText(r.label), 'NOE 様\n1枚目: 1,234円\n合計: 1,234円\n' + r.label.date);
  assert.equal(s.hasAnyData(), false);
});

test('防漏加：结束本组前先累加输入框中未回车内容', () => {
  const s = new Store(mem());
  s.importConfig(CONFIG);
  s.selectCustomer(2);
  s.setGroup(1);
  s.addEntry('100');
  const pending = s.addEntry('50');
  assert.equal(pending.ok, true);
  assert.equal(s.currentSubtotal(), 150);
  const r = s.finishGroup();
  assert.equal(r.action, 'done');
  assert.equal(r.groupTotal, 150);
});

test('补打任意已完成枚目', () => {
  const s = new Store(mem());
  s.importConfig(CONFIG);
  s.selectCustomer(2);
  s.addEntry('1000+520*10+3800');
  s.commitGroup(s.finishGroup().groupNo);
  const r = s.reprintGroup(1);
  assert.equal(r.ok, true);
  assert.equal(labelToPlainText(r.label), 'NOE 様\n1枚目: 10,000円\n' + r.label.date);
});
