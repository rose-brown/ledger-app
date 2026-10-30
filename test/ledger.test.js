import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alloc, balance, toRows, check, DEFAULT_PAYS } from '../src/ledger.js';
import { LOTTE, EMART } from './fixtures.js';

test('toRows: lotte receipt → 9 rows', () => {
  const r = toRows(LOTTE);
  assert.equal(r.length, 9);
  assert.deepEqual(r[0], [10, 26, '식비', '', 9980, '', '백설 알룰로스 분말 400']);
  assert.deepEqual(r[1], [10, 26, '', '식비', '', 3000, '백설 알룰로스 분말 400 할인']);
  assert.deepEqual(r[8], [10, 26, '', '삼성카드', '', 15780, '롯데백화점 본점']);
});

test('balance: lotte 22780 = 22780', () => {
  assert.deepEqual(balance(LOTTE), { debit: 22780, credit: 22780, diff: 0 });
});

test('alloc: emart coupon → 식비 1599 / 쇼핑 401', () => {
  assert.deepEqual(alloc(EMART.items, 2000), { 식비: 1599, 쇼핑: 401 });
});

test('toRows: emart → 7 rows, coupon rows 식비 1599 쇼핑 401', () => {
  const r = toRows(EMART);
  assert.equal(r.length, 7);
  const coupon = r.filter(x => x[6] === '쿠폰 할인 배분').map(x => [x[3], x[5]]);
  assert.deepEqual(coupon, [['식비', 1599], ['쇼핑', 401]]);
  const dr = r.reduce((a, x) => a + (x[4] || 0), 0), cr = r.reduce((a, x) => a + (x[5] || 0), 0);
  assert.equal(dr, 23400); assert.equal(cr, 23400);
});

test('toRows: zero coupon share is skipped', () => {
  const d = { ...EMART, coupon: 1, amount: 10000, items: [
    { name: 'a', amt: 10000, disc: 0, cat: '식비' }, { name: 'b', amt: 1, disc: 0, cat: '쇼핑' }] };
  const coupon = toRows(d).filter(x => x[6] === '쿠폰 할인 배분');
  assert.deepEqual(coupon.map(x => [x[3], x[5]]), [['식비', 1]]);
});

test('check: lotte ok', () => {
  assert.deepEqual(check(LOTTE, DEFAULT_PAYS), []);
});

test('check: forbidden/unknown category → BAD_CAT', () => {
  for (const cat of ['미분류', '병원', '']) {
    const d = { ...LOTTE, items: [{ ...LOTTE.items[0], cat }, ...LOTTE.items.slice(1)] };
    assert.ok(check(d, DEFAULT_PAYS).includes('BAD_CAT'), cat);
  }
});

test('check: pay not in list → NO_PAY', () => {
  assert.ok(check({ ...LOTTE, pay: '신한카드' }, DEFAULT_PAYS).includes('NO_PAY'));
  assert.ok(check({ ...LOTTE, pay: '' }, DEFAULT_PAYS).includes('NO_PAY'));
});

test('check: zero amount → BAD_AMOUNT', () => {
  const d = { ...LOTTE, items: [{ name: 'x', amt: 0, disc: 0, cat: '식비' }], amount: 0 };
  assert.ok(check(d, DEFAULT_PAYS).includes('BAD_AMOUNT'));
});

test('check: unbalanced → BAD_BALANCE', () => {
  assert.ok(check({ ...LOTTE, amount: 15000 }, DEFAULT_PAYS).includes('BAD_BALANCE'));
});
