import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS, DEFAULT_PAYS, check, toRows } from '../src/ledger.js';
import { tossPrompt, normalizeToss, tossDraft, payKey } from '../src/toss.js';

const CTX = { cats: CATS, pays: DEFAULT_PAYS, today: '2026-11-01', payMap: {} };
// 8월 18일 토스 캡처 (일부)
const SHOT = { transactions: [
  { date: '08-18', merchant: '자판기_KOCES', payment: '삼성카드 & MILEAGE PLATINUM (스카이패스)', amount: -1350, kind: 'spend', category: '식비' },
  { date: '08-18', merchant: '내 케이뱅크계좌 → 후불교통대금', payment: '', amount: -1, kind: 'transfer', category: '교통비' },
  { date: '08-18', merchant: '티머니', payment: 'K-패스 신용', amount: -1485, kind: 'spend', category: '교통비' },
] };

test('normalizeToss: spend checked, transfer unchecked, pay mapped', () => {
  const r = normalizeToss(SHOT, CTX);
  assert.equal(r.ok, true);
  const [a, b, c] = r.list;
  assert.deepEqual(a, { date: '2026-08-18', merchant: '자판기_KOCES', payText: '삼성카드 & MILEAGE PLATINUM (스카이패스)', pay: '삼성카드', amount: 1350, cat: '식비', on: true });
  assert.equal(b.on, false);
  assert.equal(c.pay, ''); assert.equal(c.on, true); assert.equal(c.cat, '교통비');
});

test('remembered pay mapping wins', () => {
  const ctx = { ...CTX, payMap: { [payKey('K-패스 신용')]: '우리카드' } };
  assert.equal(normalizeToss(SHOT, ctx).list[2].pay, '우리카드');
});

test('income (+) unchecked, future month → last year, bad category emptied', () => {
  const r = normalizeToss({ transactions: [
    { date: '12-24', merchant: '환불', payment: '', amount: 5000, kind: 'income', category: '미분류' },
  ] }, CTX);
  const [x] = r.list;
  assert.equal(x.on, false); assert.equal(x.date, '2025-12-24'); assert.equal(x.cat, '');
});

test('bad date → today', () => {
  assert.equal(normalizeToss({ transactions: [{ ...SHOT.transactions[0], date: '02-30' }] }, CTX).list[0].date, '2026-11-01');
});

test('empty transactions → NOT_TOSS', () => {
  assert.deepEqual(normalizeToss({ transactions: [] }, CTX), { ok: false, error: 'NOT_TOSS' });
});

test('tossDraft → 2 balanced rows', () => {
  const x = normalizeToss(SHOT, CTX).list[0];
  const d = tossDraft(x);
  assert.deepEqual(check(d, DEFAULT_PAYS), []);
  assert.deepEqual(toRows(d), [
    [8, 18, '식비', '', 1350, '', '자판기_KOCES'],
    [8, 18, '', '삼성카드', '', 1350, '자판기_KOCES'],
  ]);
});

test('tossPrompt mentions transactions keys', () => {
  const p = tossPrompt(CATS);
  for (const k of ['transactions', 'date', 'merchant', 'payment', 'amount', 'kind', 'category']) assert.match(p, new RegExp(`"${k}"`));
});
