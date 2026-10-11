import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression } from '../core/expression.js';

test('标准优先级：先乘除后加减', () => {
  assert.equal(evaluateExpression('1000+520*10+3800').value, 10000);
  assert.equal(evaluateExpression('2+3*4').value, 14);
  assert.equal(evaluateExpression('2*3+4').value, 10);
  assert.equal(evaluateExpression('100-20*2').value, 60);
});

test('乘除与 Unicode 符号（× ÷ −）', () => {
  assert.equal(evaluateExpression('8×2').value, 16);
  assert.equal(evaluateExpression('8÷2').value, 4);
  assert.equal(evaluateExpression('7−2').value, 5);
  assert.equal(evaluateExpression('7-2').value, 5);
});

test('除法四舍五入到整数（round half up）', () => {
  assert.equal(evaluateExpression('5/2').value, 3);
  assert.equal(evaluateExpression('100/3').value, 33);
  assert.equal(evaluateExpression('1/2').value, 1);
  assert.equal(evaluateExpression('4/2').value, 2);
  assert.equal(evaluateExpression('10/4').value, 3);
});

test('负数与空格', () => {
  assert.equal(evaluateExpression('100-200').value, -100);
  assert.equal(evaluateExpression(' 1000 + 2 ').value, 1002);
});

test('非法输入返回错误', () => {
  for (const bad of ['', '5+', '+5', '5++3', '5a', '5.5', '()', '5/0']) {
    const r = evaluateExpression(bad);
    assert.equal(r.ok, false, `应拒绝: ${bad}`);
    assert.ok(r.error, `应给出错误信息: ${bad}`);
  }
});

test('超大数字被拒绝', () => {
  assert.equal(evaluateExpression('9999999999999').ok, false);
});
