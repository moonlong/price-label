// 表达式求值：仅整数、无括号，支持 + - * / 以及 × ÷ −（全角/Unicode 符号）。
// 标准优先级（先乘除后加减）。除法四舍五入到整数（round half up）。
// 全程用整数精确运算，避免 JS 浮点误差（0.1 + 0.2 之类问题）。

const MAX_DIGITS = 12;

function addSafe(a, b) {
  const v = a + b;
  if (!Number.isSafeInteger(v)) throw new RangeError('结果过大');
  return v;
}

function subSafe(a, b) {
  const v = a - b;
  if (!Number.isSafeInteger(v)) throw new RangeError('结果过大');
  return v;
}

function mulSafe(a, b) {
  const v = a * b;
  if (!Number.isSafeInteger(v)) throw new RangeError('结果过大');
  return v;
}

// 四舍五入到整数：0.5 向上取整，负数按“远离 0”方向取整。纯整数运算，无浮点。
function divideRoundHalfUp(a, b) {
  const neg = (a < 0) !== (b < 0);
  const aa = Math.abs(a);
  const bb = Math.abs(b);
  const q = Math.floor(aa / bb);
  const r = aa - q * bb;
  let mag = q;
  if (r * 2 >= bb) mag += 1;
  const v = neg ? -mag : mag;
  if (!Number.isSafeInteger(v)) throw new RangeError('结果过大');
  return v;
}

/**
 * 求值一个金额算式。
 * @param {string|number} input 用户输入，例如 "1000+520*10+3800"
 * @returns {{ok:true, value:number}|{ok:false, error:string}}
 */
export function evaluateExpression(input) {
  const src = String(input ?? '').replace(/\s+/g, '');
  if (src.length === 0) return { ok: false, error: '请输入金额或算式' };

  let pos = 0;
  const peek = () => src[pos];

  function parseNumber() {
    const start = pos;
    while (pos < src.length && src[pos] >= '0' && src[pos] <= '9') pos += 1;
    if (start === pos) return null;
    const digits = src.slice(start, pos);
    if (digits.length > MAX_DIGITS) throw new Error('数字过大');
    const v = Number(digits);
    if (!Number.isSafeInteger(v)) throw new Error('数字过大');
    return v;
  }

  function parseFactor() {
    const v = parseNumber();
    if (v === null) throw new Error('算式不完整');
    return v;
  }

  function parseTerm() {
    let v = parseFactor();
    for (;;) {
      const c = peek();
      if (c === '*' || c === '×' || c === '/' || c === '÷') {
        pos += 1;
        const rhs = parseFactor();
        if (c === '*' || c === '×') {
          v = mulSafe(v, rhs);
        } else {
          if (rhs === 0) throw new Error('不能除以 0');
          v = divideRoundHalfUp(v, rhs);
        }
      } else {
        return v;
      }
    }
  }

  function parseExpr() {
    let v = parseTerm();
    for (;;) {
      const c = peek();
      if (c === '+') {
        pos += 1;
        v = addSafe(v, parseTerm());
      } else if (c === '-' || c === '−') {
        pos += 1;
        v = subSafe(v, parseTerm());
      } else {
        return v;
      }
    }
  }

  try {
    const value = parseExpr();
    if (pos !== src.length) {
      const rest = src[pos];
      if (rest >= '0' && rest <= '9') throw new Error('算式格式有误');
      throw new Error('包含不支持的字符');
    }
    if (!Number.isSafeInteger(value)) throw new Error('结果过大');
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : '算式格式有误' };
  }
}
