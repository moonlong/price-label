import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../core/store.js';

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

const TWO_CUSTOMERS = JSON.stringify({
  version: 1,
  customers: [{ no: 1, name: 'ナオミ' }, { no: 2, name: 'NOE' }],
});

function fresh(no = 2) {
  const s = new Store(mem());
  s.importConfig(TWO_CUSTOMERS);
  s.selectCustomer(no);
  return s;
}

test('累加与撤销', () => {
  const s = fresh();
  assert.equal(s.addEntry('100+200').subtotal, 300);
  assert.equal(s.addEntry('50').subtotal, 350);
  const u = s.undo();
  assert.equal(u.ok, true);
  assert.equal(u.removed.value, 50);
  assert.equal(u.subtotal, 300);
});

test('取消打印不标记已打印：finishGroup 不改变状态', () => {
  const s = fresh();
  s.addEntry('1000');
  const r = s.finishGroup();
  assert.equal(r.action, 'done');
  assert.equal(s.groupStatus(1), 'in-progress'); // 未确认打印，仍进行中
  assert.equal(s.currentGroup(), 1);
  s.addEntry('500'); // 取消后仍可继续累加
  assert.equal(s.currentSubtotal(), 1500);
});

test('结束本组（≤3件）确认打印后推进，且可自由切回已完成枚目追加', () => {
  const s = fresh();
  s.addEntry('1000');
  const r = s.finishGroup();
  assert.equal(r.action, 'done');
  assert.equal(r.groupNo, 1);
  s.commitGroup(1); // 确认打印
  assert.equal(s.currentGroup(), 2);
  assert.equal(s.groupStatus(1), 'done');

  assert.equal(s.setGroup(1).ok, true);
  assert.equal(s.currentGroup(), 1);
  s.addEntry('500');
  assert.equal(s.groupStatus(1), 'dirty');
  assert.deepEqual(s.dirtyGroups(), [1]);
  const r2 = s.finishGroup();
  assert.equal(r2.action, 'done');
  assert.equal(r2.groupTotal, 1500);
  s.commitGroup(1); // 重打确认
  assert.equal(s.groupStatus(1), 'done');
  assert.deepEqual(s.dirtyGroups(), []);
});

test('场景：计算 3枚目 时切回 2枚目 追加并重打，3枚目状态保留', () => {
  const s = fresh();
  s.setGroup(1); s.addEntry('1000'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('2000'); s.commitGroup(s.finishGroup().groupNo); // 2枚目 2000
  s.addEntry('3000'); // 3枚目 进行中

  s.setGroup(2);
  assert.equal(s.currentSubtotal(), 2000);
  s.addEntry('400');
  assert.equal(s.groupStatus(2), 'dirty');
  s.commitGroup(s.finishGroup().groupNo); // 重打 2枚目
  assert.equal(s.groupStatus(2), 'done');

  s.setGroup(3);
  assert.equal(s.currentSubtotal(), 3000);
  assert.equal(s.grandTotal(), 1000 + 2400); // 不含进行中的 3枚目
  s.commitGroup(s.finishGroup().groupNo); // 完成 3枚目
  assert.equal(s.grandTotal(), 1000 + 2400 + 3000);
});

test('阈值：≤3件免核对，>3件进入双录核对', () => {
  const a = fresh();
  a.addEntry('100'); a.addEntry('200'); a.addEntry('300');
  assert.equal(a.finishGroup().action, 'done');

  const b = fresh();
  b.addEntry('100'); b.addEntry('200'); b.addEntry('300'); b.addEntry('400');
  assert.equal(b.finishGroup().action, 'reenter');
});

test('双录核对：>3件先记录基线，一致才完成（两遍可故意不同）', () => {
  const s = fresh();
  s.addEntry('100'); s.addEntry('200'); s.addEntry('300'); s.addEntry('400');
  const first = s.finishGroup();
  assert.equal(first.action, 'reenter');
  assert.equal(first.baseline, 1000);
  assert.equal(s.currentVerification().active, true);
  assert.equal(s.currentSubtotal(), 0);

  s.addEntry('250*4');
  const second = s.finishGroup();
  assert.equal(second.action, 'done');
  assert.equal(second.groupTotal, 1000);
  assert.equal(s.currentVerification().active, false);
  s.commitGroup(1);
  assert.equal(s.groupStatus(1), 'done');
});

test('双录核对：不一致时提示差额并重录，直到最近两次一致', () => {
  const s = fresh();
  s.addEntry('100'); s.addEntry('200'); s.addEntry('300'); s.addEntry('400');
  assert.equal(s.finishGroup().action, 'reenter');

  s.addEntry('100'); s.addEntry('200'); s.addEntry('300'); s.addEntry('500');
  const m1 = s.finishGroup();
  assert.equal(m1.action, 'mismatch');
  assert.equal(m1.diff, 100);

  s.addEntry('1100');
  const done = s.finishGroup();
  assert.equal(done.action, 'done');
  assert.equal(done.groupTotal, 1100);
});

test('核对中：summary 不显示、grandTotal 不计入', () => {
  const s = fresh();
  s.addEntry('100'); s.addEntry('200'); s.addEntry('300'); s.addEntry('400');
  s.finishGroup(); // reenter
  assert.equal(s.summary().length, 0);
  assert.equal(s.grandTotal(), 0);
});

test('合计：totalLabel + finalizeTotal 归档并清空', () => {
  const s = fresh();
  s.addEntry('1000'); const g1 = s.finishGroup(); s.commitGroup(g1.groupNo);
  s.addEntry('2000'); const g2 = s.finishGroup();
  assert.equal(s.grandTotal(), 1000); // 不含进行中的 2枚目
  const label = s.totalLabel(g2.groupNo, g2.groupTotal);
  assert.equal(label.grandTotal, 3000); // 含当前组
  const r = s.finalizeTotal(g2.groupNo, g2.groupTotal);
  assert.equal(r.grandTotal, 3000);
  assert.equal(s.summary().length, 0);
  assert.equal(s.lastOrder.grandTotal, 3000);
  assert.equal(s.hasAnyData(), false);
});

test('合计扣除：前金/返金/前回残高 → 残金/残高', () => {
  const s = fresh();
  s.addEntry('1000'); s.commitGroup(s.finishGroup().groupNo); // 1枚目 1000
  s.addEntry('2000'); const g2 = s.finishGroup(); // 总 3000
  const linesOf = (d) => s.totalLabel(g2.groupNo, g2.groupTotal, d).lines.map((l) => l.text);

  assert.deepEqual(linesOf(null), ['NOE様', '2枚目: 2,000円', '合計: 3,000円']);

  assert.deepEqual(linesOf({ type: 'maekin', amount: 1000 }), [
    'NOE様', '2枚目: 2,000円', '合計: 3,000円', '前金: -1,000円', '残金: 2,000円',
  ]);
  assert.deepEqual(linesOf({ type: 'maekin', amount: 3000 }), [
    'NOE様', '2枚目: 2,000円', '合計: 3,000円', '前金: -3,000円', '残金: 0円',
  ]);
  assert.deepEqual(linesOf({ type: 'maekin', amount: 5000 }), [
    'NOE様', '2枚目: 2,000円', '合計: 3,000円', '前金: -5,000円', '残高: 2,000円',
  ]);

  assert.equal(linesOf({ type: 'henkin', amount: 500 })[3], '返金: -500円');
  assert.equal(linesOf({ type: 'zandaka', amount: 500 })[3], '前回残高: -500円');
});

test('单组 + 扣除：枚目行仍省略，扣除行正常', () => {
  const s = fresh();
  s.addEntry('1000'); const g1 = s.finishGroup();
  const lines = s.totalLabel(g1.groupNo, g1.groupTotal, { type: 'maekin', amount: 600 }).lines.map((l) => l.text);
  assert.deepEqual(lines, ['NOE様', '合計: 1,000円', '前金: -600円', '残金: 400円']);
});

test('历史记录：合计后追加（含时间），导出 CSV', () => {
  const s = fresh();
  s.addEntry('1000'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('2000'); const g2 = s.finishGroup();
  s.finalizeTotal(g2.groupNo, g2.groupTotal);
  const hist = s.getHistory();
  assert.equal(hist.length, 1);
  assert.equal(hist[0].customer, 'NOE');
  assert.equal(hist[0].total, 3000);
  assert.ok(hist[0].time);
  const csv = s.exportHistoryCsv();
  assert.equal(csv.split('\n')[0], 'date,customer,total');
  assert.ok(csv.includes('NOE,3000'));
});

test('历史筛选：recent24 只含最近24小时，all 全部', () => {
  const s = fresh();
  s.addEntry('1000'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('2000'); const g2 = s.finishGroup();
  s.finalizeTotal(g2.groupNo, g2.groupTotal);
  // 模拟一条 25 小时前的记录
  s.history[0].ts = Date.now() - 25 * 3600 * 1000;
  assert.equal(s.getHistory('recent24').length, 0);
  assert.equal(s.getHistory('all').length, 1);
  assert.equal(s.exportHistoryCsv('recent24').split('\n').length, 1); // 仅表头
  assert.equal(s.exportHistoryCsv('all').split('\n').length, 2);
});

test('历史含组明细；restoreOrder 恢复后可改某组并重算合计', () => {
  const s = fresh();
  s.setGroup(1); s.addEntry('1000'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('2000'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('3000'); const g3 = s.finishGroup();
  s.finalizeTotal(g3.groupNo, g3.groupTotal);

  // 历史存了组明细
  const h = s.getHistory()[0];
  assert.deepEqual(h.groups.map((g) => g.subtotal), [1000, 2000, 3000]);
  assert.equal(h.customerNo, 2);

  // 恢复
  const r = s.restoreOrder(h.index);
  assert.equal(r.ok, true);
  assert.equal(s.session.customerNo, 2);
  assert.equal(s.grandTotal(), 6000);
  assert.equal(s.groupStatus(1), 'done');
  assert.equal(s.groupStatus(2), 'done');
  assert.equal(s.groupStatus(3), 'done');

  // 漏件归第2组：追加 300 → 2300
  s.setGroup(2);
  s.addEntry('300');
  assert.equal(s.groupStatus(2), 'dirty');
  s.commitGroup(s.finishGroup().groupNo);
  assert.equal(s.groupStatus(2), 'done');

  // 新合计 = 1000 + 2300 + 3000 = 6300（第3组不变）
  assert.equal(s.grandTotal(), 6300);
});

test('锁定：完成一组后才锁定（仅录入不锁定）', () => {
  const s = fresh();
  s.addEntry('100'); // 仅录入，未打印
  assert.equal(s.hasSettledGroup(), false);
  s.commitGroup(s.finishGroup().groupNo); // 完成一组
  assert.equal(s.hasSettledGroup(), true);
  s.clearAll();
  assert.equal(s.hasSettledGroup(), false);
});

test('清空全部 / 合计 后客户取消选中（回到默认）', () => {
  const a = fresh();
  a.addEntry('100');
  a.clearAll();
  assert.equal(a.session.customerNo, null);

  const b = fresh();
  b.addEntry('100'); const g1 = b.finishGroup(); b.commitGroup(g1.groupNo);
  b.addEntry('200'); const g2 = b.finishGroup();
  b.finalizeTotal(g2.groupNo, g2.groupTotal);
  assert.equal(b.session.customerNo, null);
});

test('isLastSettledGroup：仅最大编号的已结算组为最后一组', () => {
  const s = fresh();
  s.setGroup(1); s.addEntry('100'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('200'); s.commitGroup(s.finishGroup().groupNo); // 2枚目
  assert.equal(s.isLastSettledGroup(1), false);
  assert.equal(s.isLastSettledGroup(2), true);
});

test('星标与排序：星标在前，最近使用其次，其余按编号', () => {
  const s = new Store(mem());
  s.importConfig(JSON.stringify({ version: 1, customers: [{ no: 1, name: 'A' }, { no: 2, name: 'B' }, { no: 3, name: 'C' }] }));
  s.selectCustomer(3); // C 最近使用
  s.toggleFavorite(2); // B 星标
  assert.deepEqual(s.sortedCustomers().map((c) => c.no), [2, 3, 1]);
});

test('清空当前枚目 / 重做 / 清空全部', () => {
  const s = fresh();
  s.addEntry('100'); s.commitGroup(s.finishGroup().groupNo);
  s.addEntry('200');
  assert.equal(s.clearCurrentGroup().ok, true);
  assert.equal(s.currentSubtotal(), 0);
  assert.equal(s.groupStatus(1), 'done');

  assert.equal(s.redoGroup(1).ok, true);
  assert.equal(s.currentGroup(), 1);
  assert.equal(s.groupStatus(1), 'in-progress');

  s.addEntry('50');
  s.clearAll();
  assert.equal(s.hasAnyData(), false);
  assert.equal(s.currentGroup(), 1);
});

test('持久化：新实例恢复进行中状态', () => {
  const m = mem();
  const s1 = new Store(m);
  s1.importConfig(TWO_CUSTOMERS);
  s1.selectCustomer(2);
  s1.addEntry('1234');
  const s2 = new Store(m);
  assert.equal(s2.session.customerNo, 2);
  assert.equal(s2.currentSubtotal(), 1234);
});

test('导入后当前客户不存在则重置会话', () => {
  const s = fresh(2);
  s.addEntry('100');
  const cfg = JSON.stringify({ version: 1, customers: [{ no: 1, name: 'ナオミ' }] });
  assert.equal(s.importConfig(cfg).ok, true);
  assert.equal(s.session.customerNo, null);
  assert.equal(s.hasAnyData(), false);
});
