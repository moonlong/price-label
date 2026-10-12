// 便签内容：千分位、日元单位、日语（枚目/合計/様）、日期格式 YYYY/MM/DD。

/** 客户名 + 敬称「様」（仅用于打印便签，界面仍显示原名）。 */
export function honorific(name) {
  return `${name}様`;
}

/** 千分位格式化（整数，含负号处理）。 */
export function formatMoney(value) {
  const n = Math.trunc(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const s = String(Math.abs(n));
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 日期：日本常用 2026/10/09 形式。 */
export function formatDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 时间：HH:MM（用于结算历史列表，不进入打印便签）。 */
export function formatTime(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** 本组便签：客户名 + N枚目: 价格（无合计行）。 */
export function buildGroupLabel(customerName, groupNo, groupTotal, date = formatDate()) {
  return {
    kind: 'group',
    customerName,
    groupNo,
    groupTotal,
    date,
    lines: [
      { role: 'customer', text: honorific(customerName) },
      { role: 'group', text: `${groupNo}枚目: ${formatMoney(groupTotal)}円` },
    ],
  };
}

/** 合计便签：客户名 + N枚目: 价格 + 合計: 总额。
 *  当 opts.singleGroup 为真（本单只有一个枚目）时，省略「N枚目」行——数值与合计相同，避免重复。 */
export function buildTotalLabel(customerName, groupNo, groupTotal, grandTotal, date = formatDate(), opts = {}) {
  const lines = [{ role: 'customer', text: honorific(customerName) }];
  if (!opts.singleGroup) {
    lines.push({ role: 'group', text: `${groupNo}枚目: ${formatMoney(groupTotal)}円` });
  }
  lines.push({ role: 'total', text: `合計: ${formatMoney(grandTotal)}円` });
  return {
    kind: 'total',
    customerName,
    groupNo,
    groupTotal,
    grandTotal,
    date,
    singleGroup: !!opts.singleGroup,
    lines,
  };
}

/** 纯文本形式（供打印占位与测试使用）。 */
export function labelToPlainText(label) {
  return label.lines.map((l) => l.text).join('\n') + '\n' + label.date;
}
