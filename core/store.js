// 状态机：客户、枚目（1~9）、累加记录、双录核对、结束本组/合计、清空/重做、历史记录、星标、最近使用、持久化。
// 纯逻辑，无 DOM 依赖；storage 可注入（浏览器用 localStorage，测试用内存实现）。

import { createDefaultConfig, validateConfig } from './config.js';
import { evaluateExpression } from './expression.js';
import { buildGroupLabel, buildTotalLabel, formatDate, formatTime } from './label.js';

const KEY_CONFIG = 'price-app.config';
const KEY_SESSION = 'price-app.session';
const KEY_LAST_ORDER = 'price-app.lastOrder';
const KEY_HISTORY = 'price-app.history';
const KEY_RECENTS = 'price-app.recents';

export const MAX_GROUP = 9;
// 条目数超过该值 → 首次结束本组时进入「双录核对」
export const MAX_ITEMS_NO_VERIFY = 3;

function emptySession() {
  return { customerNo: null, group: 1, groups: {}, restoredTotal: null };
}

export class Store {
  /**
   * @param {{getItem,setItem,removeItem}|null} storage
   */
  constructor(storage = null) {
    this.storage = storage;
    this.config = createDefaultConfig();
    this.session = emptySession();
    this.lastOrder = null;
    this.history = [];
    this.recents = {};
    this._load();
  }

  _read(key) {
    if (!this.storage) return null;
    try { return this.storage.getItem(key); } catch { return null; }
  }
  _write(key, value) {
    if (!this.storage) return;
    try { this.storage.setItem(key, value); } catch { /* ignore */ }
  }
  _remove(key) {
    if (!this.storage) return;
    try { this.storage.removeItem(key); } catch { /* ignore */ }
  }

  _load() {
    const cfgRaw = this._read(KEY_CONFIG);
    if (cfgRaw) {
      try {
        const parsed = JSON.parse(cfgRaw);
        const res = validateConfig(parsed);
        if (res.ok) this.config = res.config;
      } catch { /* ignore */ }
    }
    const sesRaw = this._read(KEY_SESSION);
    if (sesRaw) {
      try {
        const parsed = JSON.parse(sesRaw);
        if (parsed && typeof parsed === 'object' && parsed.groups && typeof parsed.groups === 'object') {
          this.session = {
            customerNo: Number.isInteger(parsed.customerNo) ? parsed.customerNo : null,
            group: Number.isInteger(parsed.group) && parsed.group >= 1 && parsed.group <= MAX_GROUP ? parsed.group : 1,
            groups: parsed.groups,
            restoredTotal: Number.isFinite(parsed.restoredTotal) ? parsed.restoredTotal : null,
          };
        }
      } catch { /* ignore */ }
    }
    const loRaw = this._read(KEY_LAST_ORDER);
    if (loRaw) {
      try { this.lastOrder = JSON.parse(loRaw); } catch { this.lastOrder = null; }
    }
    const hisRaw = this._read(KEY_HISTORY);
    if (hisRaw) {
      try {
        const arr = JSON.parse(hisRaw);
        if (Array.isArray(arr)) this.history = arr;
      } catch { this.history = []; }
    }
    const recRaw = this._read(KEY_RECENTS);
    if (recRaw) {
      try {
        const obj = JSON.parse(recRaw);
        if (obj && typeof obj === 'object') this.recents = obj;
      } catch { this.recents = {}; }
    }
  }

  _persist() {
    this._write(KEY_CONFIG, JSON.stringify(this.config));
    this._write(KEY_SESSION, JSON.stringify(this.session));
    this._write(KEY_LAST_ORDER, JSON.stringify(this.lastOrder));
    this._write(KEY_HISTORY, JSON.stringify(this.history));
    this._write(KEY_RECENTS, JSON.stringify(this.recents));
  }

  // ---------- 配置 ----------
  getConfig() { return this.config; }
  getCustomers() { return this.config.customers; }
  getLabel() { return this.config.label; }
  getPrint() { return this.config.print; }
  getProductLabel() { return this.config.productLabel || { widthMm: 40, heightMm: 30 }; }
  getProductPrint() { return this.config.productPrint || { offsetXmm: 0, offsetYmm: 0 }; }

  importConfig(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'JSON 解析失败' }; }
    const res = validateConfig(parsed);
    if (!res.ok) return res;
    this.config = res.config;
    if (this.session.customerNo != null && !this.config.customers.some((c) => c.no === this.session.customerNo)) {
      this.session = emptySession();
    }
    this._persist();
    return { ok: true, config: this.config };
  }

  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  _nextCustomerNo() {
    let max = 0;
    for (const c of this.config.customers) if (c.no > max) max = c.no;
    return max + 1;
  }

  addCustomer(name) {
    const trimmed = String(name).trim();
    if (!trimmed) return { ok: false, error: '客户名不能为空' };
    if (this.config.customers.some((c) => c.name === trimmed)) return { ok: false, error: '客户已存在' };
    const no = this._nextCustomerNo();
    this.config.customers.push({ no, name: trimmed, favorite: false });
    this.recents[no] = Date.now(); // 加入「最近使用」，便于快速找到
    this._persist();
    return { ok: true, no, name: trimmed };
  }

  removeCustomer(no) {
    const before = this.config.customers.length;
    this.config.customers = this.config.customers.filter((c) => c.no !== no);
    if (this.config.customers.length === before) return { ok: false, error: '客户不存在' };
    if (this.session.customerNo === no) this.session = emptySession();
    this._persist();
    return { ok: true };
  }

  toggleFavorite(no) {
    const c = this.config.customers.find((x) => x.no === no);
    if (!c) return { ok: false, error: '客户不存在' };
    c.favorite = !c.favorite;
    this._persist();
    return { ok: true, favorite: c.favorite };
  }

  /** 仅标记「最近使用」（不改会话），供商品标签等场景调用。 */
  markRecent(no) {
    const c = this.config.customers.find((x) => x.no === no);
    if (!c) return { ok: false };
    this.recents[no] = Date.now();
    this._persist();
    return { ok: true };
  }

  /** 客户排序：星标在前（按编号），其次最近使用（最近在前），其余按编号。 */
  sortedCustomers() {
    const fav = this.config.customers.filter((c) => c.favorite).sort((a, b) => a.no - b.no);
    const rest = this.config.customers.filter((c) => !c.favorite);
    const used = rest.filter((c) => this.recents[c.no]);
    const unused = rest.filter((c) => !this.recents[c.no]);
    used.sort((a, b) => (this.recents[b.no] - this.recents[a.no]) || (a.no - b.no));
    unused.sort((a, b) => a.no - b.no);
    return [...fav, ...used, ...unused];
  }

  // ---------- 会话 ----------
  customerName(no = this.session.customerNo) {
    const c = this.config.customers.find((x) => x.no === no);
    return c ? c.name : '';
  }

  _group(n) { return this.session.groups[n] ?? null; }
  _ensureGroup(n) {
    if (!this.session.groups[n]) this.session.groups[n] = { entries: [], status: 'in-progress', verifyBaseline: null, committedCount: 0 };
    return this.session.groups[n];
  }
  _subtotal(group) { return group.entries.reduce((s, e) => s + e.value, 0); }

  hasAnyData() {
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (g && (g.status === 'done' || g.entries.length > 0 || g.verifyBaseline != null)) return true;
    }
    return false;
  }

  /** 是否已完成过至少一组结算（= 存在「已打印」「需重打」「需打印」的组）→ 用于锁定客户。 */
  hasSettledGroup() {
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (g && (g.status === 'done' || g.status === 'dirty' || g.status === 'pending')) return true;
    }
    return false;
  }

  groupStatus(n) {
    const g = this._group(n);
    if (!g) return 'empty';
    return g.status;
  }

  selectCustomer(no) {
    const c = this.config.customers.find((x) => x.no === no);
    if (!c) return { ok: false, error: '客户不存在' };
    this.recents[no] = Date.now();
    if (this.session.customerNo !== no) {
      this.session = emptySession();
      this.session.customerNo = no;
    }
    this._persist();
    return { ok: true };
  }

  setGroup(n) {
    if (!Number.isInteger(n) || n < 1 || n > MAX_GROUP) return { ok: false, error: '枚目必须在 1~9' };
    this.session.group = n;
    this._persist();
    return { ok: true };
  }

  currentGroup() { return this.session.group; }

  addEntry(expr) {
    const g = this._ensureGroup(this.session.group);
    const ev = evaluateExpression(expr);
    if (!ev.ok) return ev;
    if (ev.value === 0) return { ok: false, error: '金额不能为 0' };
    const entry = { expr: String(expr).trim(), value: ev.value };
    g.entries.push(entry);
    if (g.status === 'done') g.status = 'dirty'; // 已打印的枚目追加金额 → 需重打
    else if (g.status === 'pending') g.status = 'in-progress'; // 需打印的枚目追加 → 回到编辑中
    const subtotal = this._subtotal(g);
    this._persist();
    return { ok: true, entry, subtotal };
  }

  undo() {
    const g = this._group(this.session.group);
    if (!g || g.entries.length === 0) return { ok: false, error: '没有可撤销的记录' };
    const removed = g.entries.pop();
    const subtotal = this._subtotal(g);
    this._persist();
    return { ok: true, removed, subtotal };
  }

  /** 删除某枚目里的第 index 条记录（0 起）。已打印的组被改动 → 标「需重打」。 */
  removeEntry(groupNo, index) {
    const g = this._group(groupNo);
    if (!g || !Array.isArray(g.entries)) return { ok: false, error: '该枚目不存在' };
    if (!Number.isInteger(index) || index < 0 || index >= g.entries.length) return { ok: false, error: '该条记录不存在' };
    g.entries.splice(index, 1);
    if (g.status === 'done') g.status = 'dirty'; // 已打印的组删条目 → 需重打
    else if (g.status === 'pending') g.status = 'in-progress'; // 需打印的组删条目 → 回到编辑中
    g.committedCount = Math.min(g.committedCount || 0, g.entries.length);
    const subtotal = this._subtotal(g);
    this._persist();
    return { ok: true, subtotal };
  }

  currentEntries() {
    const g = this._group(this.session.group);
    return g ? g.entries.slice() : [];
  }
  currentSubtotal() {
    const g = this._group(this.session.group);
    return g ? this._subtotal(g) : 0;
  }

  currentVerification() {
    const g = this._group(this.session.group);
    if (!g || g.verifyBaseline == null) return { active: false, baseline: null };
    return { active: true, baseline: g.verifyBaseline };
  }

  /** 汇总：显示 已打印 / 需重打 / 需打印 的组（不显示正在计算/核对中的组）。 */
  summary() {
    const out = [];
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (!g) continue;
      if (g.status === 'done' || g.status === 'dirty' || g.status === 'pending') {
        out.push({ group: n, subtotal: this._subtotal(g), status: g.status, count: g.entries.length });
      }
    }
    return out;
  }

  /** 本单合计 = 已打印 + 需重打 + 需打印 的组之和（不含正在计算/核对中的组）。 */
  grandTotal() {
    let sum = 0;
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (!g) continue;
      if (g.status === 'done' || g.status === 'dirty' || g.status === 'pending') sum += this._subtotal(g);
    }
    return sum;
  }

  dirtyGroups() {
    const out = [];
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (g && g.status === 'dirty') out.push(n);
    }
    return out;
  }

  /** 需打印 / 需重打 的组（合计前需要提醒）。 */
  unprintedGroups() {
    const out = [];
    for (let n = 1; n <= MAX_GROUP; n++) {
      const g = this._group(n);
      if (g && (g.status === 'dirty' || g.status === 'pending')) out.push(n);
    }
    return out;
  }

  /**
   * 结束本组（对应「本组结束」按钮）。仅做核对与生成标签，不改变打印状态。
   * 返回 action：
   *  - 'reenter'  首次录入、条数>3，需再录一遍核对
   *  - 'mismatch' 核对不一致，需重新录入
   *  - 'done'     核对通过/免核对，返回本组标签（尚未标记已打印）
   */
  finishGroup() {
    const g = this._ensureGroup(this.session.group);
    if (g.entries.length === 0) return { ok: false, error: '本组没有金额，无法结束' };
    const subtotal = this._subtotal(g);
    const groupNo = this.session.group;
    const appended = g.entries.length - (g.committedCount || 0); // 只看「本次追加」的条数

    if (g.verifyBaseline != null) {
      const prev = g.verifyBaseline;
      if (subtotal === prev) {
        g.verifyBaseline = null;
        this._persist();
        return { ok: true, action: 'done', groupNo, groupTotal: subtotal, label: buildGroupLabel(this.customerName(), groupNo, subtotal) };
      }
      const diff = subtotal - prev;
      g.verifyBaseline = subtotal;
      g.entries = [];
      this._persist();
      return {
        ok: true,
        action: 'mismatch',
        subtotal,
        baseline: prev,
        diff,
        message: `不一致\n上次：${prev}円\n本次：${subtotal}円\n差额：${diff >= 0 ? '+' : ''}${diff}円\n请再次录入核对`,
      };
    }

    if (appended > MAX_ITEMS_NO_VERIFY) {
      g.verifyBaseline = subtotal;
      g.entries = [];
      this._persist();
      return { ok: true, action: 'reenter', subtotal, baseline: subtotal, message: '已记录，请再次录入核对' };
    }

    return { ok: true, action: 'done', groupNo, groupTotal: subtotal, label: buildGroupLabel(this.customerName(), groupNo, subtotal) };
  }

  /** 标记该枚目为已打印，并推进到下一枚目（在打印确认后调用）。 */
  commitGroup(groupNo) {
    const g = this._group(groupNo);
    if (!g || g.entries.length === 0) return { ok: false, error: '该枚目没有金额' };
    g.status = 'done';
    g.verifyBaseline = null;
    g.committedCount = g.entries.length;
    if (this.session.group === groupNo && this.session.group < MAX_GROUP) this.session.group += 1;
    this._persist();
    return { ok: true };
  }

  /** 仅结束不打印：标记为「需打印」（若已打印过追加则保持「需重打」），并推进到下一枚目。 */
  commitGroupWithoutPrint(groupNo) {
    const g = this._group(groupNo);
    if (!g || g.entries.length === 0) return { ok: false, error: '该枚目没有金额' };
    if (g.status === 'in-progress') g.status = 'pending';
    g.verifyBaseline = null;
    g.committedCount = g.entries.length;
    if (this.session.group === groupNo && this.session.group < MAX_GROUP) this.session.group += 1;
    this._persist();
    return { ok: true };
  }

  /** 补打后标记为已打印。 */
  markPrinted(groupNo) {
    const g = this._group(groupNo);
    if (!g) return { ok: false, error: '该枚目不存在' };
    g.status = 'done';
    this._persist();
    return { ok: true };
  }

  /** 合计预览标签（不改变状态）：本组 + 总额（含当前组）。deduction 可选。 */
  totalLabel(groupNo, groupTotal, deduction = null) {
    const g = this._group(groupNo);
    const counted = g && (g.status === 'done' || g.status === 'dirty' || g.status === 'pending');
    const total = this.grandTotal() + (counted ? 0 : groupTotal);
    const groupCount = this.summary().length + (counted ? 0 : 1);
    return buildTotalLabel(this.customerName(), groupNo, groupTotal, total, formatDate(), { singleGroup: groupCount === 1, deduction });
  }

  /** 合计打印：标记当前组完成、归档最近一单、清空、追加历史（含组明细）。deduction 可选。 */
  finalizeTotal(groupNo, groupTotal, deduction = null) {
    this.commitGroup(groupNo);
    const total = this.grandTotal();
    const customerName = this.customerName();
    const groupSummary = this.summary().map((s) => ({ group: s.group, subtotal: s.subtotal }));
    const label = buildTotalLabel(customerName, groupNo, groupTotal, total, formatDate(), { singleGroup: groupSummary.length === 1, deduction });
    this.lastOrder = {
      customerNo: this.session.customerNo,
      customerName,
      groups: groupSummary,
      grandTotal: total,
      date: formatDate(),
    };
    this.history.push({
      date: formatDate(),
      time: formatTime(),
      customer: customerName,
      customerNo: this.session.customerNo,
      total,
      groups: groupSummary,
      ts: Date.now(),
    });
    this.session = emptySession(); // 取消选中客户，回到默认
    this._persist();
    return { ok: true, groupNo, groupTotal, grandTotal: total, label, lastOrder: this.lastOrder };
  }

  /** 历史记录（按结算先后顺序，附原始下标 index）。filter='recent24' 仅最近 24 小时，'all' 全部。 */
  getHistory(filter = 'all') {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const out = [];
    for (let i = 0; i < this.history.length; i++) {
      const h = this.history[i];
      if (filter === 'recent24' && (h.ts ?? 0) < cutoff) continue;
      out.push({ ...h, index: i });
    }
    return out;
  }

  /** 依据历史记录（含组明细）恢复该单：各组恢复为「已打印」，并选中该客户。 */
  restoreOrder(index) {
    const h = this.history[index];
    if (!h || !Array.isArray(h.groups) || h.groups.length === 0) {
      return { ok: false, error: '该记录没有组明细，无法恢复' };
    }
    const no = h.customerNo;
    const c = this.config.customers.find((x) => x.no === no);
    if (!c) return { ok: false, error: '该客户已不存在，无法恢复' };
    this.session = emptySession();
    this.session.customerNo = no;
    let minGroup = MAX_GROUP;
    for (const g of h.groups) {
      const gn = Number(g.group);
      const st = Number(g.subtotal) || 0;
      if (!Number.isInteger(gn) || gn < 1 || gn > MAX_GROUP || st <= 0) continue;
      this.session.groups[gn] = {
        entries: [{ expr: String(st), value: st }],
        status: 'done',
        verifyBaseline: null,
        committedCount: 1,
      };
      if (gn < minGroup) minGroup = gn;
    }
    this.session.group = minGroup <= MAX_GROUP ? minGroup : 1;
    this.session.restoredTotal = Number(h.total) || 0;
    this._persist();
    return { ok: true, customerName: h.customer };
  }

  /** 导出 CSV：date, customer, total。filter 同上。 */
  exportHistoryCsv(filter = 'all') {
    const list = this.getHistory(filter);
    const lines = ['date,customer,total'];
    for (const h of list) {
      lines.push(`${h.date},${h.customer},${h.total}`);
    }
    return lines.join('\n');
  }

  clearAll() {
    this.session.groups = {};
    this.session.group = 1;
    this.session.customerNo = null; // 取消选中，回到默认
    this._persist();
    return { ok: true };
  }

  clearCurrentGroup() {
    const g = this._group(this.session.group);
    if (!g || (g.entries.length === 0 && g.verifyBaseline == null)) {
      return { ok: false, error: '当前枚目没有可清空的内容' };
    }
    g.entries = [];
    g.status = 'in-progress';
    g.verifyBaseline = null;
    this._persist();
    return { ok: true };
  }

  redoGroup(n) {
    const g = this._group(n);
    if (!g || g.status !== 'done') return { ok: false, error: '该枚目不是已完成状态' };
    g.status = 'in-progress';
    g.entries = [];
    g.verifyBaseline = null;
    this.session.group = n;
    this._persist();
    return { ok: true };
  }

  reprintGroup(n) {
    const g = this._group(n);
    if (!g || (g.status !== 'done' && g.status !== 'pending')) return { ok: false, error: '该枚目没有可补打的内容' };
    return { ok: true, groupNo: n, groupTotal: this._subtotal(g), label: buildGroupLabel(this.customerName(), n, this._subtotal(g)), wasPending: g.status === 'pending' };
  }

  /** 该枚目是否为「最后一组」（已打印/需重打/需打印中的最大编号）。 */
  isLastSettledGroup(n) {
    let max = 0;
    for (let m = 1; m <= MAX_GROUP; m++) {
      const g = this._group(m);
      if (g && (g.status === 'done' || g.status === 'dirty' || g.status === 'pending')) max = m;
    }
    return max === n;
  }

  reprintTotal() {
    if (!this.lastOrder) return { ok: false, error: '没有可补打的合计' };
    const { customerName, grandTotal } = this.lastOrder;
    const last = this.lastOrder.groups[this.lastOrder.groups.length - 1];
    const groupNo = last ? last.group : 1;
    const groupTotal = last ? last.subtotal : 0;
    return { ok: true, label: buildTotalLabel(customerName, groupNo, groupTotal, grandTotal, this.lastOrder.date) };
  }
}
