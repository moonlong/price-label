// 商品标签：40×30mm，2 行（客户名 / 价格[/数量单位]），无日期、无「様」、价格不带「円」。
// 复用 raster 渲染管线，只做内容与批量状态（纯逻辑，可单测）。

import { renderLabelBitmap } from './raster.js';

/**
 * 生成商品标签内容。
 *  - 第 1 行：客户名（不带「様」）
 *  - 第 2 行：仅价格 → "540"；价格+数量 → "540/20p"
 * @param {string} name 客户名
 * @param {number|string} price 价格
 * @param {string|null} qty 数量（可空）
 * @param {string} unit 数量单位（默认 p）
 */
export function buildProductLabel(name, price, qty, unit = 'p') {
  const priceStr = String(price);
  const hasQty = qty != null && String(qty).trim() !== '';
  const line2 = hasQty ? `${priceStr}/${qty}${unit}` : priceStr;
  return {
    kind: 'product',
    name,
    price,
    qty: hasQty ? qty : null,
    unit,
    date: '',
    lines: [
      { role: 'name', text: String(name) },
      { role: 'price', text: line2 },
    ],
  };
}

/** 渲染商品标签位图（复用 raster：默认 40×30、无日期）。 */
export function renderProductLabelBitmap(name, price, qty, unit = 'p', labelSize = { widthMm: 40, heightMm: 30 }, opts = {}) {
  const label = buildProductLabel(name, price, qty, unit);
  return renderLabelBitmap(label, labelSize, { ...opts, noDate: true });
}

/** 商品标签批量：最多 max 条，可增删。 */
export class ProductLabelBatch {
  constructor(max = 10) {
    this.max = max;
    this.items = [];
  }

  /** 添加一条。name 必填；price 必填正整数；qty 可空，非空必须为正整数。 */
  add(name, price, qty) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, error: '请先选择客户' };
    const p = Number(price);
    if (!Number.isInteger(p) || p <= 0) return { ok: false, error: '价格必须为正整数' };
    let q = null;
    if (qty != null && String(qty).trim() !== '') {
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) return { ok: false, error: '数量必须为正整数' };
      q = String(n);
    }
    if (this.items.length >= this.max) return { ok: false, error: `最多 ${this.max} 张` };
    const item = { name: nm, price: p, qty: q };
    this.items.push(item);
    return { ok: true, item };
  }

  remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return { ok: false, error: '该条不存在' };
    this.items.splice(index, 1);
    return { ok: true };
  }

  /** 复制指定条目（客户/价格/数量完全相同），插在原条后面。 */
  copy(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return { ok: false, error: '该条不存在' };
    if (this.items.length >= this.max) return { ok: false, error: `最多 ${this.max} 张` };
    const src = this.items[index];
    const item = { name: src.name, price: src.price, qty: src.qty };
    this.items.splice(index + 1, 0, item);
    return { ok: true, item };
  }

  /** 更新指定条目的内容（用于编辑）。 */
  replace(index, name, price, qty) {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return { ok: false, error: '该条不存在' };
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, error: '请先选择客户' };
    const p = Number(price);
    if (!Number.isInteger(p) || p <= 0) return { ok: false, error: '价格必须为正整数' };
    let q = null;
    if (qty != null && String(qty).trim() !== '') {
      const n = Number(qty);
      if (!Number.isInteger(n) || n <= 0) return { ok: false, error: '数量必须为正整数' };
      q = String(n);
    }
    this.items[index] = { name: nm, price: p, qty: q };
    return { ok: true };
  }

  clear() {
    this.items = [];
    return { ok: true };
  }

  list() { return this.items.slice(); }
  get count() { return this.items.length; }
}
