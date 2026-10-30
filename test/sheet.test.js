import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRows } from '../src/ledger.js';
import { headerRow, lastDataRow, rangeEnd, monthSpend, dayEntries, hasSame } from '../src/sheet.js';
import { ROWS, LOTTE } from './fixtures.js';

test('headerRow → 3', () => {
  assert.equal(headerRow(ROWS), 3);
  assert.equal(headerRow([['month']]), 1);
  assert.equal(headerRow([['x']]), -1);
});

test('lastDataRow ignores F-only rows → 10', () => {
  assert.equal(lastDataRow(ROWS), 10);
  assert.equal(lastDataRow(ROWS.slice(0, 3)), 3);
});

test('rangeEnd parses $A$3:$A$12074 → 12074', () => {
  const f = "=-SUMPRODUCT((('1.Transaction'!$A$3:$A$12074)=E$4)*(('1.Transaction'!$C$3:$C$12074)=$C33),(('1.Transaction'!$E$3:$E$12074)))";
  assert.equal(rangeEnd(f), 12074);
  assert.equal(rangeEnd('=1+1'), null);
});

test('monthSpend: 8월 total 7600 (미분류·월급 제외)', () => {
  assert.deepEqual(monthSpend(ROWS, 8), { total: 7600, byDay: { 18: 7600 } });
});

test('dayEntries 8/18 → 식비 + 집계 안 됨', () => {
  assert.deepEqual(dayEntries(ROWS, 8, 18), [
    { merchant: '서브웨이 에그마요', cat: '식비', pay: '롯데카드A', amount: 7600, counted: true },
    { merchant: '?', cat: '미분류', pay: '현금', amount: 3000, counted: false },
  ]);
});

test('dayEntries 8/19 (수입) → []', () => {
  assert.deepEqual(dayEntries(ROWS, 8, 19), []);
});

test('monthSpend after lotte rows: 10월 15780', () => {
  const rows = [...ROWS, ...toRows(LOTTE)];
  assert.deepEqual(monthSpend(rows, 10), { total: 15780, byDay: { 26: 15780 } });
});

test('dayEntries lotte → one entry', () => {
  assert.deepEqual(dayEntries([...ROWS, ...toRows(LOTTE)], 10, 26), [
    { merchant: '롯데백화점 본점', cat: '식비', pay: '삼성카드', amount: 15780, counted: true }]);
});

test('dayEntries multi-category label', () => {
  const rows = [[10, 1, '식비', '', 5000, '', 'a'], [10, 1, '쇼핑', '', 2000, '', 'b'], [10, 1, '', '현금', '', 7000, '마트']];
  assert.deepEqual(dayEntries(rows, 10, 1), [{ merchant: '마트', cat: '식비 외 1', pay: '현금', amount: 7000, counted: true }]);
});

test('hasSame detects same day/pay/amount', () => {
  const rows = [...ROWS, ...toRows(LOTTE)];
  assert.equal(hasSame(rows, LOTTE), true);
  assert.equal(hasSame(rows, { ...LOTTE, amount: 1 }), false);
});
