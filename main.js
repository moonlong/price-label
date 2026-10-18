import { Store } from './core/store.js?v=1.47.0';
import { formatMoney, formatDate } from './core/label.js?v=1.47.0';
import { buildCpcl } from './core/cpcl.js?v=1.47.0';
import { buildTspl } from './core/tspl.js?v=1.47.0';
import { buildEscposRaster } from './core/escpos.js?v=1.47.0';
import { buildTsplRaster } from './core/tspl-raster.js?v=1.47.0';
import { renderLabelBitmap, bitmapToCanvas, printToDots } from './core/raster.js?v=1.47.0';
import { buildProductLabel, renderProductLabelBitmap, ProductLabelBatch } from './core/label-product.js?v=1.47.0';
import { buildNiimbotCommands, buildPrintStatusPacket, buildPrintEndPacket } from './core/niimbot.js?v=1.47.0';

const storage = (typeof localStorage !== 'undefined') ? localStorage : null;
const store = new Store(storage);

const $ = (id) => document.getElementById(id);

const el = {
  customerSearch: $('customer-search'),
  customerList: $('customer-pick-list'),
  group: $('group'),
  connect: $('connect'),
  dot: $('connect-dot'),
  connectLabel: $('connect-label'),
  records: $('records'),
  recordsHead: $('records-head'),
  subtotal: $('subtotal'),
  input: $('input'),
  inputCaret: $('input-caret'),
  keypad: $('keypad'),
  accumulate: $('accumulate'),
  undo: $('undo'),
  finish: $('finish'),
  verifyArea: $('verify-area'),
  verifyMsg: $('verify-msg'),
  verifyFill: $('verify-fill'),
  contextBar: $('context-bar'),
  summary: $('summary'),
  grandTotal: $('grand-total'),
  totalWarning: $('total-warning'),
  manage: $('manage'),
  history: $('history'),
  clear: $('clear'),
  dlgPrint: $('dlg-print'),
  printPreview: $('print-preview'),
  printRecords: $('print-records'),
  printVerified: $('print-verified'),
  printVerifiedAmount: $('print-verified-amount'),
  printWarning: $('print-warning'),
  lastGroupToggle: $('last-group-toggle'),
  deductBox: $('deduct-box'),
  deductType: $('deduct-type'),
  deductAmount: $('deduct-amount'),
  printOk: $('print-ok'),
  printCancel: $('print-cancel'),
  printSkip: $('print-skip'),
  dlgClear: $('dlg-clear'),
  clearAll: $('clear-all'),
  clearGroup: $('clear-group'),
  clearCancel: $('clear-cancel'),
  dlgManage: $('dlg-manage'),
  manageCustomerList: $('customer-list'),
  newCustomer: $('new-customer'),
  addCustomer: $('add-customer'),
  exportConfig: $('export-config'),
  importText: $('import-text'),
  importApply: $('import-apply'),
  importFile: $('import-file'),
  clearData: $('clear-data'),
  manageClose: $('manage-close'),
  dlgConfirm: $('dlg-confirm'),
  confirmMsg: $('confirm-msg'),
  confirmOk: $('confirm-ok'),
  confirmCancel: $('confirm-cancel'),
  dlgHistory: $('dlg-history'),
  historyList: $('history-list'),
  historyFilter: $('history-filter'),
  historyExport: $('history-export'),
  historyClose: $('history-close'),
  toast: $('toast'),
  // 视图
  viewHome: $('view-home'),
  viewSettle: $('view-settle'),
  viewLabel: $('view-label'),
  navSettle: $('nav-settle'),
  navLabel: $('nav-label'),
  settleHome: $('settle-home'),
  labelHome: $('label-home'),
  // 商品标签页
  labelContextBar: $('label-context-bar'),
  labelCustomerSearch: $('label-customer-search'),
  labelCustomerList: $('label-customer-list'),
  labelConnect: $('label-connect'),
  labelConnectDot: $('label-connect-dot'),
  labelConnectLabel: $('label-connect-label'),
  labelPrinterStatus: $('label-printer-status'),
  labelBatch: $('label-batch'),
  labelBatchCount: $('label-batch-count'),
  labelPrice: $('label-price'),
  labelQty: $('label-qty'),
  labelUnit: $('label-unit'),
  labelKeypad: $('label-keypad'),
  labelAdd: $('label-add'),
  labelClear: $('label-clear'),
  labelManage: $('label-manage'),
  labelPrint: $('label-print'),
};

let expr = '';
let toastTimer = null;
let verifyNotice = null; // 核对区持久文案（"已记录…"/"不一致…"）
let printContext = null; // { mode, groupNo, groupTotal, groupLabel, isTotal }
let customerSearch = ''; // 客户搜索词
let picking = false; // 是否处于「展开搜索/重选」状态

function toast(msg, duration = 2200) {
  el.toast.textContent = msg;
  if (!el.toast.open) el.toast.show();
  el.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    setTimeout(() => { if (el.toast.open) el.toast.close(); }, 250);
  }, duration);
}

// ---------- 打印服务（真实 BLE 连接 + TSPL 位图写入 + 诊断） ----------
const SERVICE_CANDIDATES = [
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ff03-0000-1000-8000-00805f9b34fb',
  '0000ff04-0000-1000-8000-00805f9b34fb',
  '0000ff05-0000-1000-8000-00805f9b34fb',
  '0000ff06-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae40-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000fe00-0000-1000-8000-00805f9b34fb',
  '0000fef1-0000-1000-8000-00805f9b34fb',
  '0000fef2-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];

const W_CHAR_CANDIDATES = [
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

function charProps(c) {
  const p = c.properties;
  const out = [];
  if (p.read) out.push('read');
  if (p.write) out.push('write');
  if (p.writeWithoutResponse) out.push('writeNR');
  if (p.notify) out.push('notify');
  if (p.indicate) out.push('indicate');
  return out.join(',');
}

function shortUuid(uuid) {
  const s = String(uuid).toLowerCase();
  return s.startsWith('0000') ? s.slice(4, 8) : s.slice(0, 8);
}

class PrintService {
  /** @param {string} printerKey 用于记住「本页默认打印机」的 localStorage key
   *  @param {{setConnect:(ok:boolean)=>void, setStatus:(text:string)=>void}} ui */
  constructor(printerKey, ui) {
    this.printerKey = printerKey;
    this.ui = ui;
    this.device = null;
    this.server = null;
    this.writeChar = null;
    this.connected = false;
  }

  _storedId() {
    if (!storage) return null;
    try { return storage.getItem(this.printerKey); } catch { return null; }
  }
  _storeId(id) {
    if (!storage || !id) return;
    try { storage.setItem(this.printerKey, id); } catch { /* ignore */ }
  }

  async connect() {
    if (!('bluetooth' in navigator)) {
      this.ui.setConnect(false);
      this.ui.setStatus('当前浏览器不支持 Web Bluetooth');
      toast('当前浏览器不支持蓝牙');
      return;
    }
    try {
      this.ui.setStatus('正在尝试重连最近打印机…');
      const device = await this._findRecentDevice();
      if (!device) {
        this.ui.setStatus('未找到可重连设备，请选择打印机');
        this.device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: SERVICE_CANDIDATES,
        });
        this._storeId(this.device.id);
      } else {
        this.device = device;
      }
      this.server = await this.device.gatt.connect();
      this.connected = true;
      this.ui.setConnect(true);
      this.ui.setStatus('已连接，正在发现服务…');
      const infos = await this.discover();
      this.infos = infos;
      console.table(infos);
      this.writeChar = await this.pickWriteChar(infos);
      if (!this.writeChar) {
        this.ui.setStatus(`已连接，但未找到可写特征：${JSON.stringify(infos)}`);
        toast('未找到可写特征，请查看状态栏');
      } else {
        this.ui.setStatus(`打印机就绪 · 写特征 ${shortUuid(this.writeChar.uuid)}`);
        toast('打印机就绪');
      }
    } catch (e) {
      this.connected = false;
      this.ui.setConnect(false);
      this.ui.setStatus(`连接失败：${e && e.message ? e.message : e}`);
      toast('连接失败或已取消');
    }
  }

  /** 优先重连「本页记住的那台」，其次试其它已授权设备；都连不上返回 null。 */
  async _findRecentDevice() {
    if (!navigator.bluetooth.getDevices) return null;
    try {
      const devices = await navigator.bluetooth.getDevices();
      const stored = this._storedId();
      if (stored) {
        const hit = devices.find((d) => d.id === stored);
        if (hit) {
          if (hit.gatt.connected) return hit;
          try { await hit.gatt.connect(); return hit; } catch (e) { /* 不在范围，继续 */ }
        }
      }
      for (const d of devices) {
        if (d.id === stored) continue;
        if (d.gatt.connected) return d;
        try { await d.gatt.connect(); return d; } catch (e) { /* 试下一个 */ }
      }
    } catch (e) { /* getDevices 不可用，忽略 */ }
    return null;
  }

  async discover() {
    const services = await this.server.getPrimaryServices();
    const result = [];
    for (const s of services) {
      const chars = await s.getCharacteristics();
      for (const c of chars) {
        result.push({ service: s.uuid, char: c.uuid, props: charProps(c) });
      }
    }
    return result;
  }

  async pickWriteChar(infos) {
    for (const uuid of W_CHAR_CANDIDATES) {
      const hit = infos.find((i) => i.char.toLowerCase() === uuid && /write/i.test(i.props));
      if (hit) return this._findChar(uuid);
    }
    const writable = infos.find((i) => /write/i.test(i.props));
    if (writable) return this._findChar(writable.char);
    return null;
  }

  async _findChar(uuid) {
    if (!this.server) return null;
    const services = await this.server.getPrimaryServices();
    for (const s of services) {
      const chars = await s.getCharacteristics();
      for (const c of chars) {
        if (c.uuid.toLowerCase() === uuid.toLowerCase()) return c;
      }
    }
    return null;
  }

  /** 打印一张标签。opts: { labelSize, print, noDate, proto }，缺省用结算的尺寸/偏移。 */
  async print(label, opts = {}) {
    if (!this.server || !this.writeChar) {
      throw new Error('打印机未就绪：请先点“连接打印机”');
    }
    const protoEl = document.getElementById('protocol');
    const proto = opts.proto || (protoEl ? protoEl.value : 'tspl-rast') || 'tspl-rast';
    const labelSize = opts.labelSize || store.getLabel();
    const printCfg = opts.print || store.getPrint();
    const noDate = opts.noDate === true;

    if (proto === 'niimbot') {
      const cmds = buildNiimbotCommands(label, labelSize, printCfg, { noDate });
      const acks = [];
      const rawAcks = [];
      const handlers = [];
      // 订阅所有 notify 特征（与诊断一致，避免漏接）
      try {
        const services = await this.server.getPrimaryServices();
        for (const s of services) {
          let chars = [];
          try { chars = await s.getCharacteristics(); } catch (e) { continue; }
          for (const c of chars) {
            if (!c.properties || !c.properties.notify) continue;
            const h = (e) => {
              const bytes = Array.from(new Uint8Array(e.target.value.buffer));
              acks.push(`${shortUuid(c.uuid)}:${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`);
              rawAcks.push(bytes);
            };
            c.addEventListener('characteristicvaluechanged', h);
            handlers.push([c, h]);
            try { await c.startNotifications(); } catch (e) { /* 忽略 */ }
          }
        }
      } catch (e) { /* 忽略 */ }
      try {
        // 1) 发送打印命令（SetDensity … PageEnd），位图行是单向无响应
        for (let i = 0; i < cmds.length; i++) {
          await writeChunks(this.writeChar, cmds[i], 200);
          await new Promise((r) => setTimeout(r, 10));
        }
        // 2) 轮询 PrintStatus，直到 page >= totalPages(1) 或超时
        for (let poll = 0; poll < 12; poll++) {
          await writeChunks(this.writeChar, buildPrintStatusPacket(), 200);
          await new Promise((r) => setTimeout(r, 300));
          let done = false;
          for (let i = rawAcks.length - 1; i >= 0; i--) {
            const b = rawAcks[i];
            if (b.length >= 6 && b[2] === 0xb3) {
              const page = (b[4] << 8) | b[5]; // 大端
              if (page >= 1) { done = true; break; }
              break;
            }
          }
          if (done) break;
        }
        // 3) 结束打印
        await writeChunks(this.writeChar, buildPrintEndPacket(), 200);
        await new Promise((r) => setTimeout(r, 400));
      } finally {
        for (const [c, h] of handlers) c.removeEventListener('characteristicvaluechanged', h);
      }
      // 唯一响应 + 次数摘要（便于复制）
      const counts = new Map();
      for (const a of acks) counts.set(a, (counts.get(a) || 0) + 1);
      const ackHex = Array.from(counts.entries())
        .map(([k, v]) => (v > 1 ? `${k} ×${v}` : k))
        .join(' | ');
      this.ui.setStatus(`已发送 ${cmds.length} 条，ACK(${acks.length}): ${ackHex}`);
      return { ok: true, acks: acks, ackHex };
    }

    let data;
    let chunkSize = 20;
    if (proto === 'tspl-rast') {
      data = buildTsplRaster(label, labelSize, printCfg, { noDate });
      chunkSize = 180;
      console.log('[TSPL 位图]', data.length, 'bytes');
    } else if (proto === 'tspl') {
      const tspl = buildTspl(label, labelSize);
      console.log('[TSPL 文字]', JSON.stringify(tspl));
      data = new TextEncoder().encode(tspl);
    } else if (proto === 'escpos') {
      data = buildEscposRaster(label, labelSize, printCfg);
      chunkSize = 180;
      console.log('[ESC-POS 位图]', data.length, 'bytes');
    } else {
      const cpcl = buildCpcl(label, labelSize);
      console.log('[CPCL]', JSON.stringify(cpcl));
      data = new TextEncoder().encode(cpcl);
    }
    await writeChunks(this.writeChar, data, chunkSize);
    this.ui.setStatus(`已发送 ${data.length} 字节（${proto}）`);
    return { ok: true };
  }
}

async function writeChunks(char, data, chunkSize = 20) {
  const noResponse = char.properties.writeWithoutResponse;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    if (noResponse) await char.writeValueWithoutResponse(chunk);
    else await char.writeValueWithResponse(chunk);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function setConnect(ok) {
  el.dot.classList.toggle('ok', ok);
  el.connectLabel.textContent = ok ? '已连接' : '连接打印机';
}

function setStatus(text) {
  const node = document.getElementById('printer-status');
  if (node) node.textContent = text;
}

// 商品标签页的独立连接状态（另一台打印机）
function setLabelConnect(ok) {
  el.labelConnectDot.classList.toggle('ok', ok);
  el.labelConnectLabel.textContent = ok ? '已连接' : '连接打印机';
}
function setLabelStatus(text) {
  el.labelPrinterStatus.textContent = text;
}

const settlePrint = new PrintService('price-app.settlePrinterId', { setConnect, setStatus });
const labelPrint = new PrintService('price-app.labelPrinterId', { setConnect: setLabelConnect, setStatus: setLabelStatus });

// ---------- 渲染 ----------
function scrollToKeypad() {
  if (el.keypad && el.keypad.scrollIntoView) el.keypad.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function renderContext() {
  const name = store.customerName();
  const group = store.currentGroup();
  el.contextBar.textContent = name ? `🧾 ${name} · ${group}枚目` : '🧾 未选择客户';
}

function renderAll() {
  renderContext();
  renderCustomerPick();
  renderGroup();
  renderRecords();
  renderSubtotal();
  renderVerify();
  renderSummary();
  renderGrandTotal();
  renderInput();
}

function renderCustomerPick() {
  const cur = store.session.customerNo;
  const locked = store.hasSettledGroup();
  const collapsed = cur != null && !picking; // 已选中且未在搜索 → 折叠成当前客户条
  const q = customerSearch.trim().toLowerCase();

  el.customerList.innerHTML = '';

  const matches = (c) => {
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(c.no).startsWith(q);
    return c.name.toLowerCase().includes(q);
  };

  const items = collapsed
    ? store.getCustomers().filter((c) => c.no === cur)
    : store.sortedCustomers().filter(matches);

  for (const c of items) {
    const li = document.createElement('li');
    if (c.no === cur) li.classList.add('selected');
    if (collapsed) li.classList.add('current');

    const noEl = document.createElement('span');
    noEl.className = 'cno';
    noEl.textContent = c.no;
    const nameEl = document.createElement('span');
    nameEl.className = 'cname';
    nameEl.textContent = c.name;
    li.append(noEl, nameEl);

    if (collapsed && locked) {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'lock-icon';
      lockIcon.textContent = '🔒';
      li.append(lockIcon);
    } else if (!collapsed) {
      const star = document.createElement('button');
      star.className = 'star' + (c.favorite ? ' on' : '');
      star.textContent = c.favorite ? '★' : '☆';
      star.type = 'button';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        store.toggleFavorite(c.no);
        renderCustomerPick();
      });
      li.append(star);
    }

    // 用 click 而非 pointerdown：浏览器自动区分「点 vs 滑」，滑动不会误选中
    li.addEventListener('click', () => {
      if (collapsed) {
        if (locked) {
          toast('完成本客户结算，或清空本客户，才能换客户', 5000);
          return;
        }
        picking = true; // 展开重选
        customerSearch = '';
        el.customerSearch.value = '';
        renderCustomerPick();
        return;
      }
      if (locked) return;
      store.selectCustomer(c.no);
      picking = false;
      customerSearch = '';
      el.customerSearch.value = '';
      expr = '';
      renderAll();
      scrollToKeypad();
    });

    el.customerList.appendChild(li);
  }

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-pick';
    li.textContent = store.getCustomers().length === 0
      ? '请先在下方「客户管理 / 导入导出」导入客户名单'
      : '无匹配客户';
    el.customerList.appendChild(li);
  }

  el.customerSearch.disabled = locked;
  el.customerList.classList.toggle('locked', locked);
  if (collapsed) {
    customerSearch = '';
    el.customerSearch.value = '';
  }
}

function renderGroup() {
  const cur = store.currentGroup();
  el.group.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = `${n}枚目`;
    if (n === cur) o.selected = true;
    el.group.appendChild(o);
  }
  // 当前组有数据/核对中时给醒目背景；清空或完结后自动还原
  const active = store.currentSubtotal() > 0 || store.currentVerification().active;
  el.group.classList.toggle('group-active', active);
}

function renderRecords() {
  el.recordsHead.textContent = `当前正在编辑：${store.currentGroup()}枚目`;
  const entries = store.currentEntries();
  const groupNo = store.currentGroup();
  el.records.innerHTML = '';
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '尚未累加';
    el.records.appendChild(li);
    return;
  }
  entries.forEach((e, i) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const s1 = document.createElement('span');
    s1.className = 'expr';
    s1.textContent = e.expr;
    const s2 = document.createElement('span');
    s2.className = 'val';
    s2.textContent = `= ${formatMoney(e.value)}`;
    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.title = '删除此条';
    del.textContent = '×';
    del.onclick = () => {
      const r = store.removeEntry(groupNo, i);
      if (!r.ok) return toast(r.error);
      renderAll();
    };
    li.append(num, s1, s2, del);
    el.records.appendChild(li);
  });
  // 最新一条计入用淡蓝高亮
  const last = el.records.lastElementChild;
  if (last) last.classList.add('latest');
  // 自动滚到底部，始终显示最近几条（列表内部滚动，不推动键盘）
  el.records.scrollTop = el.records.scrollHeight;
}

function renderSubtotal() {
  el.subtotal.textContent = `${formatMoney(store.currentSubtotal())}円`;
}

function renderVerify() {
  const v = store.currentVerification();
  if (!v.active) {
    el.verifyArea.hidden = true;
    return;
  }
  el.verifyArea.hidden = false;
  const B = store.currentSubtotal();
  const base = v.baseline;
  const pct = base > 0 ? Math.min(100, Math.round((B / base) * 100)) : 0;
  el.verifyFill.style.width = pct + '%';
  el.verifyFill.className = verifyNotice && verifyNotice.includes('不一致') ? 'verify-fill bad' : 'verify-fill';
  el.verifyMsg.textContent = verifyNotice || '录入中';
}

function renderSummary() {
  const list = store.summary();
  el.summary.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '暂无已打印枚目';
    el.summary.appendChild(li);
    return;
  }
  for (const s of list) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'gname';
    name.textContent = `${s.group}枚目`;
    const val = document.createElement('span');
    val.className = 'gval';
    val.textContent = `${formatMoney(s.subtotal)}円`;
    li.append(name, val);

    const badge = document.createElement('span');
    if (s.status === 'done') {
      badge.className = 'badge ok';
      badge.textContent = '已打印';
    } else if (s.status === 'pending') {
      li.classList.add('dirty-row');
      badge.className = 'badge warn';
      badge.textContent = '需打印';
    } else if (s.status === 'dirty') {
      li.classList.add('dirty-row');
      badge.className = 'badge warn';
      badge.textContent = '需重打';
    }
    li.append(badge);

    // 已打印 / 需打印 的组可以「补打」
    if (s.status === 'done' || s.status === 'pending') {
      const re = document.createElement('button');
      re.className = 'reprint';
      re.textContent = '补打';
      re.type = 'button';
      re.onclick = () => reprintGroup(s.group);
      li.append(re);
    }
    el.summary.appendChild(li);
  }
}

function renderGrandTotal() {
  el.grandTotal.textContent = `${formatMoney(store.grandTotal())}円`;
  const restored = store.session.restoredTotal;
  el.totalWarning.hidden = !(restored != null && store.grandTotal() !== restored);
}

function renderInput() {
  el.input.value = expr;
  const active = store.session.customerNo != null;
  el.input.classList.toggle('active', active);
  el.inputCaret.hidden = !active;
}

/** 读取扣除选择 → printContext.deduction，并刷新预览。 */
function updateDeduction() {
  if (!printContext) return;
  const type = el.deductType.value;
  const amount = Math.max(0, Math.trunc(Number(el.deductAmount.value) || 0));
  printContext.deduction = (type !== 'none' && amount > 0) ? { type, amount } : null;
  renderPrintPreview();
}

/** 打开打印弹窗时，重置扣除为「无」。 */
function resetDeductionUI() {
  el.deductType.value = 'none';
  el.deductAmount.value = '';
  el.deductAmount.disabled = true;
  el.deductBox.hidden = true;
}

// ---------- 打印预览 ----------
function renderPrintPreview() {
  el.printPreview.innerHTML = '';
  if (!printContext) return;
  let label;
  if (printContext.isTotal) {
    label = store.totalLabel(printContext.groupNo, printContext.groupTotal, printContext.deduction);
  } else {
    label = printContext.groupLabel;
  }
  try {
    const bmp = renderLabelBitmap(label, store.getLabel(), printToDots(store.getPrint()));
    el.printPreview.appendChild(bitmapToCanvas(bmp));
  } catch (e) {
    const d = document.createElement('div');
    d.textContent = '预览渲染失败：' + (e && e.message ? e.message : e);
    el.printPreview.appendChild(d);
  }
  // 只要勾选「最后一组」就提醒（本组结束 / 补打最后一组 都会完成本单）
  el.printWarning.hidden = !printContext.isTotal;
}

async function onPrintOk() {
  // 补打「本组」：只打印；若该组原为「需打印」，补打后标记为已打印
  if (printContext.mode === 'reprint' && !printContext.isTotal) {
    el.dlgPrint.close();
    await doPrint(printContext.groupLabel);
    if (printContext.wasPending) store.markPrinted(printContext.groupNo);
    renderAll();
    return;
  }
  // 其余两种情况都算「合计」并完成本单：
  //   1) 本组结束 + 最后一组
  //   2) 补打 + 最后一组
  if (printContext.isTotal) {
    const unprinted = store.unprintedGroups();
    if (unprinted.length > 0) {
      const ok = await confirmDialog(`${unprinted.join('、')}枚目 需打印/需重打，是否继续合计？`);
      if (!ok) return;
    }
  }
  el.dlgPrint.close();
  let label;
  let doneName = null;
  if (printContext.isTotal) {
    const res = store.finalizeTotal(printContext.groupNo, printContext.groupTotal, printContext.deduction);
    if (!res.ok) return toast(res.error);
    label = res.label;
    doneName = res.lastOrder.customerName;
  } else {
    store.commitGroup(printContext.groupNo);
    label = printContext.groupLabel;
  }
  await doPrint(label);
  if (printContext.isTotal) toast(`${doneName} 结算已完成`, 3500);
  renderAll();
}

function renderPrintRecords(verified) {
  el.printRecords.innerHTML = '';
  const entries = verified ? [] : store.currentEntries();
  const show = entries.length > 0 && entries.length <= 3;
  el.printRecords.hidden = !show;
  if (!show) return;
  const head = document.createElement('div');
  head.className = 'print-records-head';
  head.textContent = '本组记录';
  el.printRecords.appendChild(head);
  for (const e of entries) {
    const li = document.createElement('li');
    li.textContent = `${e.expr} = ${formatMoney(e.value)}円`;
    el.printRecords.appendChild(li);
  }
}

function openFinishPrint(r, verified = false) {
  printContext = { mode: 'finish', groupNo: r.groupNo, groupTotal: r.groupTotal, groupLabel: r.label, isTotal: false, deduction: null };
  el.lastGroupToggle.checked = false;
  el.lastGroupToggle.closest('.last-toggle').style.display = '';
  resetDeductionUI();
  if (verified) {
    el.printVerified.hidden = false;
    el.printVerifiedAmount.textContent = `¥${formatMoney(r.groupTotal)}`;
  } else {
    el.printVerified.hidden = true;
  }
  renderPrintRecords(verified);
  renderPrintPreview();
  el.printOk.onclick = onPrintOk;
  el.printSkip.onclick = onPrintSkip;
  el.printSkip.style.display = '';
  el.printCancel.onclick = () => el.dlgPrint.close();
  el.dlgPrint.showModal();
}

function openReprintPrint(r, showToggle = false) {
  printContext = { mode: 'reprint', groupNo: r.groupNo, groupTotal: r.groupTotal, groupLabel: r.label, isTotal: false, deduction: null, wasPending: r.wasPending };
  el.lastGroupToggle.checked = false;
  el.lastGroupToggle.closest('.last-toggle').style.display = showToggle ? '' : 'none';
  resetDeductionUI();
  el.printVerified.hidden = true;
  el.printSkip.style.display = 'none';
  el.printRecords.hidden = true;
  renderPrintPreview();
  el.printOk.onclick = onPrintOk;
  el.printCancel.onclick = () => el.dlgPrint.close();
  el.dlgPrint.showModal();
}

function onPrintSkip() {
  el.dlgPrint.close();
  store.commitGroupWithoutPrint(printContext.groupNo);
  renderAll();
  toast(`${printContext.groupNo}枚目 已结束（需打印）`, 3500);
}

async function doPrint(label) {
  try {
    await settlePrint.print(label);
    toast('打印完成');
  } catch (e) {
    toast('打印失败：' + (e && e.message ? e.message : e));
  }
}

function reprintGroup(n) {
  const r = store.reprintGroup(n);
  if (!r.ok) return toast(r.error);
  openReprintPrint(r, store.isLastSettledGroup(n)); // 仅最后一组显示「最后一组」开关
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    el.confirmMsg.textContent = message;
    el.confirmOk.onclick = () => { el.dlgConfirm.close(); resolve(true); };
    el.confirmCancel.onclick = () => { el.dlgConfirm.close(); resolve(false); };
    el.dlgConfirm.addEventListener('cancel', () => resolve(false), { once: true });
    el.dlgConfirm.showModal();
  });
}

// ---------- 事件 ----------
function keyTap(key) {
  if (key === 'back') {
    expr = expr.slice(0, -1);
  } else {
    expr += key;
  }
  renderInput();
}

document.querySelectorAll('#keypad .key[data-key]').forEach((btn) => {
  btn.addEventListener('click', () => keyTap(btn.dataset.key));
});

el.accumulate.addEventListener('click', () => {
  if (store.session.customerNo == null) return toast('请先选择客户');
  verifyNotice = null;
  const res = store.addEntry(expr);
  if (!res.ok) return toast(res.error);
  expr = '';
  renderAll();
});

el.undo.addEventListener('click', () => {
  if (expr) return toast('请先计入或清空输入框');
  const res = store.undo();
  if (!res.ok) toast(res.error);
  else renderAll();
});

el.finish.addEventListener('click', () => {
  if (store.session.customerNo == null) return toast('请先选择客户');
  if (expr) return toast('请先计入或清空输入框');
  const wasVerifying = store.currentVerification().active;
  const r = store.finishGroup();
  if (!r.ok) return toast(r.error);
  if (r.action === 'reenter') {
    verifyNotice = '已记录，请再次录入核对';
    renderAll();
    toast('已记录，请再次录入核对');
    return;
  }
  if (r.action === 'mismatch') {
    verifyNotice = r.message;
    renderAll();
    toast(r.message);
    return;
  }
  verifyNotice = null;
  renderAll();
  openFinishPrint(r, wasVerifying); // 核对通过则弹窗顶部显示「两次一致」横幅
});

el.lastGroupToggle.addEventListener('change', () => {
  printContext.isTotal = el.lastGroupToggle.checked;
  if (printContext.isTotal) {
    el.deductBox.hidden = false;
  } else {
    resetDeductionUI();
    printContext.deduction = null;
  }
  renderPrintPreview();
});

el.deductType.addEventListener('change', () => {
  const type = el.deductType.value;
  if (type === 'maekin') {
    el.deductAmount.value = '6000';
    el.deductAmount.disabled = false;
  } else if (type === 'none') {
    el.deductAmount.value = '';
    el.deductAmount.disabled = true;
  } else {
    el.deductAmount.value = '';
    el.deductAmount.disabled = false;
  }
  updateDeduction();
});

el.deductAmount.addEventListener('input', updateDeduction);

el.customerSearch.addEventListener('focus', () => {
  if (store.hasSettledGroup()) return; // 锁定中不可重选
  picking = true;
  customerSearch = '';
  el.customerSearch.value = '';
  renderCustomerPick();
});

el.customerSearch.addEventListener('input', () => {
  picking = true;
  customerSearch = el.customerSearch.value;
  renderCustomerPick();
});

el.customerSearch.addEventListener('blur', (e) => {
  // 焦点移到列表内（如星标按钮）时不折叠；否则延迟折叠，给 click 留出触发时间
  if (e.relatedTarget && el.customerList.contains(e.relatedTarget)) return;
  setTimeout(() => {
    if (picking) {
      picking = false;
      renderCustomerPick();
    }
  }, 150);
});

el.group.addEventListener('change', () => {
  const r = store.setGroup(Number(el.group.value));
  if (!r.ok) toast(r.error);
  renderAll();
  scrollToKeypad();
});

el.connect.addEventListener('click', () => settlePrint.connect());

el.clear.addEventListener('click', () => el.dlgClear.showModal());
el.clearGroup.addEventListener('click', () => {
  const r = store.clearCurrentGroup();
  if (!r.ok) toast(r.error);
  expr = '';
  el.dlgClear.close();
  renderAll();
});
el.clearAll.addEventListener('click', () => {
  store.clearAll();
  expr = '';
  el.dlgClear.close();
  renderAll();
  toast('已清空当前客户全部枚目');
});
el.clearCancel.addEventListener('click', () => el.dlgClear.close());

// ---------- 客户管理 ----------
function renderManageCustomerList() {
  el.manageCustomerList.innerHTML = '';
  for (const c of store.getCustomers()) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${c.no} ${c.name}${c.favorite ? ' ★' : ''}`;
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '删除';
    del.type = 'button';
    del.onclick = () => {
      store.removeCustomer(c.no);
      renderManageCustomerList();
      renderAll();
      renderLabelAll();
    };
    li.append(name, del);
    el.manageCustomerList.appendChild(li);
  }
}

el.manage.addEventListener('click', () => {
  if (store.hasSettledGroup()) return toast('完成本客户结算，或清空本客户，才能操作');
  renderManageCustomerList();
  el.importText.value = '';
  el.dlgManage.showModal();
});

el.manageClose.addEventListener('click', () => el.dlgManage.close());

el.clearData.addEventListener('click', async () => {
  const ok = await confirmDialog('将清空本机全部数据（客户名单、结算历史、星标等），确认？');
  if (!ok) return;
  if (storage) storage.clear();
  location.reload();
});

el.addCustomer.addEventListener('click', () => {
  const r = store.addCustomer(el.newCustomer.value);
  if (!r.ok) toast(r.error);
  else {
    el.newCustomer.value = '';
    renderManageCustomerList();
    renderAll();
    renderLabelAll();
    toast(`已添加「${r.name}」`);
  }
});

el.exportConfig.addEventListener('click', () => {
  const text = store.exportConfig();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'customers.json';
  a.click();
  URL.revokeObjectURL(url);
});

el.importApply.addEventListener('click', () => {
  const r = store.importConfig(el.importText.value);
  if (!r.ok) return toast(r.error);
  el.importText.value = '';
  expr = '';
  renderManageCustomerList();
  renderAll();
  renderLabelAll();
  toast('导入成功');
});

el.importFile.addEventListener('change', () => {
  const file = el.importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const r = store.importConfig(String(reader.result));
    if (!r.ok) toast(r.error);
    else {
      expr = '';
      renderManageCustomerList();
      renderAll();
      renderLabelAll();
      toast('导入成功');
    }
    el.importFile.value = '';
  };
  reader.readAsText(file);
});

// ---------- 结算历史 ----------
function doRestoreOrder(index) {
  const r = store.restoreOrder(index);
  if (!r.ok) return toast(r.error);
  el.dlgHistory.close();
  customerSearch = '';
  el.customerSearch.value = '';
  picking = false;
  renderAll();
  toast(`已恢复 ${r.customerName} 的结算，可修改后重新打印`, 3500);
}

function renderHistory() {
  const list = store.getHistory(el.historyFilter.value);
  el.historyList.innerHTML = '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '暂无历史记录';
    el.historyList.appendChild(li);
    return;
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i];
    const li = document.createElement('li');
    li.onclick = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(`${h.customer} ${h.total}`);
      toast(`已复制：${h.customer} ${h.total}`);
    };
    const d = document.createElement('span');
    d.className = 'hdate';
    d.textContent = `${h.date} ${h.time}`;
    const c = document.createElement('span');
    c.className = 'hcust';
    c.textContent = h.customer;
    const t = document.createElement('span');
    t.className = 'htotal';
    t.textContent = `${h.total}円`;
    li.append(d, c, t);
    if (h.groups && h.groups.length > 0) {
      const btn = document.createElement('button');
      btn.className = 'restore-btn';
      btn.textContent = '重新结算';
      btn.type = 'button';
      btn.onclick = (e) => {
        e.stopPropagation();
        doRestoreOrder(h.index);
      };
      li.append(btn);
    }
    el.historyList.appendChild(li);
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

el.history.addEventListener('click', () => {
  if (store.hasSettledGroup()) return toast('完成本客户结算，或清空本客户，才能操作');
  renderHistory();
  el.dlgHistory.showModal();
});
el.historyFilter.addEventListener('change', renderHistory);
el.historyClose.addEventListener('click', () => el.dlgHistory.close());
el.historyExport.addEventListener('click', () => {
  const filter = el.historyFilter.value;
  const csv = store.exportHistoryCsv(filter);
  if (!csv) return;
  const dateStr = formatDate().replace(/\//g, '');
  downloadText(`客户结算单_${dateStr}.csv`, csv);
  toast('已导出 CSV');
});

// ---------- 商品标签页（独立状态，不碰结算 session/groups/history） ----------
const labelBatch = new ProductLabelBatch(10);
let labelCustomer = null; // { no, name }
let labelPrice = '';
let labelQty = '';
let labelUnit = 'p';
let labelActive = 'price'; // 'price' | 'qty'
let labelSearch = '';
let labelPicking = false;

function renderLabelCustomerPick() {
  // 选中的客户被删除后自动清空
  if (labelCustomer && !store.getCustomers().some((c) => c.no === labelCustomer.no)) {
    labelCustomer = null;
  }
  const cur = labelCustomer;
  const collapsed = cur != null && !labelPicking;
  const q = labelSearch.trim().toLowerCase();
  el.labelCustomerList.innerHTML = '';

  const matches = (c) => {
    if (!q) return true;
    if (/^\d+$/.test(q)) return String(c.no).startsWith(q);
    return c.name.toLowerCase().includes(q);
  };
  const items = collapsed
    ? store.getCustomers().filter((c) => c.no === cur.no)
    : store.sortedCustomers().filter(matches);

  for (const c of items) {
    const li = document.createElement('li');
    if (cur && c.no === cur.no) li.classList.add('selected');
    if (collapsed) li.classList.add('current');
    const noEl = document.createElement('span');
    noEl.className = 'cno';
    noEl.textContent = c.no;
    const nameEl = document.createElement('span');
    nameEl.className = 'cname';
    nameEl.textContent = c.name;
    li.append(noEl, nameEl);
    if (!collapsed) {
      const star = document.createElement('button');
      star.className = 'star' + (c.favorite ? ' on' : '');
      star.textContent = c.favorite ? '★' : '☆';
      star.type = 'button';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        store.toggleFavorite(c.no);
        renderLabelCustomerPick();
      });
      li.append(star);
    }
    li.addEventListener('click', () => {
      if (collapsed) {
        labelPicking = true;
        labelSearch = '';
        el.labelCustomerSearch.value = '';
        renderLabelCustomerPick();
        return;
      }
      labelCustomer = { no: c.no, name: c.name };
      labelPicking = false;
      labelSearch = '';
      el.labelCustomerSearch.value = '';
      renderLabelAll();
      // 选中客户后自动滚动到数字键盘，方便立即输入
      if (el.labelKeypad && el.labelKeypad.scrollIntoView) {
        setTimeout(() => el.labelKeypad.scrollIntoView({ block: 'end', behavior: 'smooth' }), 80);
      }
    });
    el.labelCustomerList.appendChild(li);
  }

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-pick';
    li.textContent = store.getCustomers().length === 0
      ? '请先「客户管理」导入客户名单'
      : '无匹配客户';
    el.labelCustomerList.appendChild(li);
  }
  if (collapsed) {
    labelSearch = '';
    el.labelCustomerSearch.value = '';
  }
}

function renderLabelBatch() {
  el.labelBatch.innerHTML = '';
  const list = labelBatch.list();
  el.labelBatchCount.textContent = list.length ? `（${list.length}/10）` : '';
  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '尚未添加';
    el.labelBatch.appendChild(li);
    return;
  }
  const unit = labelUnit.trim() || 'p';
  list.forEach((item, i) => {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    const nm = document.createElement('span');
    nm.className = 'bname';
    nm.textContent = item.name;
    const txt = document.createElement('span');
    txt.className = 'btxt';
    txt.textContent = item.qty ? `${item.price}/${item.qty}${unit}` : String(item.price);
    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.title = '删除此条';
    del.textContent = '×';
    del.onclick = () => {
      labelBatch.remove(i);
      renderLabelAll();
    };
    li.append(num, nm, txt, del);
    el.labelBatch.appendChild(li);
  });
}

function renderLabelInput() {
  el.labelPrice.value = labelPrice;
  el.labelQty.value = labelQty;
  el.labelPrice.classList.toggle('active', labelActive === 'price');
  el.labelQty.classList.toggle('active', labelActive === 'qty');
}

function renderLabelAll() {
  el.labelContextBar.textContent = labelCustomer ? `🏷️ ${labelCustomer.name}` : '🏷️ 未选择客户';
  renderLabelCustomerPick();
  renderLabelBatch();
  renderLabelInput();
  el.labelPrint.textContent = labelBatch.count > 0 ? `打印 ${labelBatch.count} 张` : '打印';
}

function labelKeyTap(key) {
  const field = labelActive === 'price' ? 'price' : 'qty';
  if (key === 'back') {
    if (field === 'price') labelPrice = labelPrice.slice(0, -1);
    else labelQty = labelQty.slice(0, -1);
  } else if (key === 'clear') {
    if (field === 'price') labelPrice = '';
    else labelQty = '';
  } else {
    if (field === 'price') labelPrice += key;
    else labelQty += key;
  }
  renderLabelInput();
}

async function doLabelPrint() {
  if (labelBatch.count === 0) return toast('请先添加标签');
  const unit = labelUnit.trim() || 'p';
  try {
    let ackHex = '';
    for (const item of labelBatch.list()) {
      const label = buildProductLabel(item.name, item.price, item.qty, unit);
      const res = await labelPrint.print(label, {
        labelSize: store.getProductLabel(),
        print: store.getProductPrint(),
        noDate: true,
        proto: 'niimbot',
      });
      if (res && res.ackHex) ackHex = res.ackHex;
    }
    toast(`已打印 ${labelBatch.count} 张${ackHex ? ' · ACK: ' + ackHex : ''}`, 4000);
  } catch (e) {
    toast('打印失败：' + (e && e.message ? e.message : e));
  }
}

document.querySelectorAll('#label-keypad .key[data-key]').forEach((btn) => {
  btn.addEventListener('click', () => labelKeyTap(btn.dataset.key));
});

el.labelPrice.addEventListener('click', () => { labelActive = 'price'; renderLabelInput(); });
el.labelQty.addEventListener('click', () => { labelActive = 'qty'; renderLabelInput(); });
el.labelClear.addEventListener('click', () => labelKeyTap('clear'));
el.labelUnit.addEventListener('input', () => {
  labelUnit = el.labelUnit.value;
  renderLabelBatch();
});

el.labelAdd.addEventListener('click', () => {
  if (!labelCustomer) return toast('请先选择客户');
  const r = labelBatch.add(labelCustomer.name, labelPrice, labelQty);
  if (!r.ok) return toast(r.error);
  labelPrice = '';
  labelQty = '';
  labelActive = 'price';
  renderLabelAll();
});

el.labelConnect.addEventListener('click', () => labelPrint.connect());
el.labelPrint.addEventListener('click', doLabelPrint);

el.labelManage.addEventListener('click', () => {
  renderManageCustomerList();
  el.importText.value = '';
  el.dlgManage.showModal();
});

el.labelCustomerSearch.addEventListener('focus', () => {
  labelPicking = true;
  labelSearch = '';
  el.labelCustomerSearch.value = '';
  renderLabelCustomerPick();
});
el.labelCustomerSearch.addEventListener('input', () => {
  labelPicking = true;
  labelSearch = el.labelCustomerSearch.value;
  renderLabelCustomerPick();
});
el.labelCustomerSearch.addEventListener('blur', (e) => {
  if (e.relatedTarget && el.labelCustomerList.contains(e.relatedTarget)) return;
  setTimeout(() => {
    if (labelPicking) {
      labelPicking = false;
      renderLabelCustomerPick();
    }
  }, 150);
});

// ---------- 视图切换 ----------
function showView(name) {
  el.viewHome.hidden = name !== 'home';
  el.viewSettle.hidden = name !== 'settle';
  el.viewLabel.hidden = name !== 'label';
  if (name === 'settle') {
    renderAll();
    scrollToKeypad();
  } else if (name === 'label') {
    renderLabelAll();
  }
}

el.navSettle.addEventListener('click', () => showView('settle'));
el.navLabel.addEventListener('click', () => showView('label'));
el.settleHome.addEventListener('click', () => showView('home'));
el.labelHome.addEventListener('click', () => showView('home'));

// 初始化
showView('home');
