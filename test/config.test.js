import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig, validateConfig } from '../core/config.js';

test('默认配置：客户为空（干净版），标签 50×50', () => {
  const c = createDefaultConfig();
  assert.equal(c.customers.length, 0);
  assert.deepEqual(c.label, { widthMm: 50, heightMm: 50 });
});

test('默认打印偏移与自定义偏移', () => {
  const c = createDefaultConfig();
  assert.deepEqual(c.print, { offsetXmm: -1.5, offsetYmm: 0 });
  const res = validateConfig({ customers: [{ no: 1, name: 'A' }], print: { offsetXmm: -3, offsetYmm: 1 } });
  assert.equal(res.ok, true);
  assert.deepEqual(res.config.print, { offsetXmm: -3, offsetYmm: 1 });
});

test('合法配置校验通过', () => {
  const res = validateConfig({ version: 1, label: { widthMm: 50, heightMm: 40 }, customers: [{ no: 1, name: 'A' }] });
  assert.equal(res.ok, true);
  assert.equal(res.config.label.widthMm, 50);
});

test('标签尺寸缺省回退默认 50×50', () => {
  const res = validateConfig({ customers: [{ no: 1, name: 'A' }] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.config.label, { widthMm: 50, heightMm: 50 });
});

test('编号：老编号保留，缺失编号自动分配（仅新用户追加）', () => {
  const res = validateConfig({ customers: [{ no: 5, name: 'A' }, { name: 'B' }, { no: 2, name: 'C' }] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.config.customers.map((c) => [c.no, c.name]), [[5, 'A'], [6, 'B'], [2, 'C']]);
});

test('编号重复报错', () => {
  const res = validateConfig({ customers: [{ no: 1, name: 'A' }, { no: 1, name: 'B' }] });
  assert.equal(res.ok, false);
});

test('非法配置被拒绝', () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig('x').ok, false);
  assert.equal(validateConfig({ customers: 'x' }).ok, false);
  assert.equal(validateConfig({ customers: [] }).ok, false);
  assert.equal(validateConfig({ customers: [{ no: 1 }] }).ok, false);
});
