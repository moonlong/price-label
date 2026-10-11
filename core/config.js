// 配置：客户名单（编号 + 名字 + 星标）+ 标签尺寸 + 打印偏移。支持 JSON 导入/导出（整体替换）。

export const DEFAULT_LABEL = Object.freeze({ widthMm: 40, heightMm: 30 });
// 打印微调：offsetXmm 负=左移、正=右移；offsetYmm 负=上移、正=下移（默认整体略左移 1.5mm）
export const DEFAULT_PRINT = Object.freeze({ offsetXmm: -1.5, offsetYmm: 0 });

// 50 个常用日文姓氏（编号 1~50）
const DEFAULT_NAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '前田', '藤田',
  '後藤', '小川', '岡田', '村上', '長谷川', '近藤', '石井', '斉藤', '坂本', '遠藤',
  '青木', '藤井', '西村', '福田', '太田', '三浦', '藤原', '岡本', '松田', '中川',
];

export function createDefaultConfig() {
  return {
    version: 1,
    label: { ...DEFAULT_LABEL },
    print: { ...DEFAULT_PRINT },
    customers: DEFAULT_NAMES.map((name, i) => ({ no: i + 1, name, favorite: false })),
  };
}

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  return fallback;
}

function toNumber(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return fallback;
}

/**
 * 校验并规范化配置对象。
 * 客户编号规则：已有编号原样保留；缺失/非法编号按「最大编号+1」依次自动分配；重复编号报错。
 * @param {*} raw 已 JSON.parse 的对象
 * @returns {{ok:true, config:object}|{ok:false, error:string}}
 */
export function validateConfig(raw) {
  const err = (message) => ({ ok: false, error: message });

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return err('配置必须是 JSON 对象');
  }

  const labelRaw = raw.label && typeof raw.label === 'object' ? raw.label : {};
  const widthMm = toPositiveNumber(labelRaw.widthMm, DEFAULT_LABEL.widthMm);
  const heightMm = toPositiveNumber(labelRaw.heightMm, DEFAULT_LABEL.heightMm);

  const printRaw = raw.print && typeof raw.print === 'object' ? raw.print : {};
  const offsetXmm = toNumber(printRaw.offsetXmm, DEFAULT_PRINT.offsetXmm);
  const offsetYmm = toNumber(printRaw.offsetYmm, DEFAULT_PRINT.offsetYmm);

  if (!Array.isArray(raw.customers)) return err('customers 必须是数组');

  // 第一遍：收集显式编号，检测重复，确定自动分配起点
  const explicit = new Set();
  let maxNo = 0;
  for (const item of raw.customers) {
    const no = item && item.no;
    if (Number.isInteger(no) && no >= 1) {
      if (explicit.has(no)) return err(`客户编号重复：${no}`);
      explicit.add(no);
      if (no > maxNo) maxNo = no;
    }
  }

  // 第二遍：缺失编号的客户自动分配
  let nextNo = maxNo + 1;
  const customers = [];
  for (const item of raw.customers) {
    const name = String(item && item.name != null ? item.name : '').trim();
    if (!name) return err('存在缺少 name 的客户');
    let no = item && item.no;
    if (!Number.isInteger(no) || no < 1) {
      no = nextNo;
      nextNo += 1;
    }
    customers.push({ no, name, favorite: item && item.favorite === true });
  }
  if (customers.length === 0) return err('至少需要一个客户');

  return {
    ok: true,
    config: {
      version: 1,
      label: { widthMm, heightMm },
      print: { offsetXmm, offsetYmm },
      customers,
    },
  };
}
