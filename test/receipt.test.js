import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS, DEFAULT_PAYS, balance, check } from '../src/ledger.js';
import { normalize, mapPay, receiptSchema, receiptPrompt, chatPrompt, parseAnswer } from '../src/receipt.js';
import { LOTTE } from './fixtures.js';

const CTX = { cats: CATS, pays: DEFAULT_PAYS, today: '2026-10-30' };
const LOTTE_JSON = {
  not_receipt: false, merchant: '롯데백화점 본점', date: '2026-10-26', payment: '삼성카드', coupon: 0, total: 15780,
  items: LOTTE.items.map(x => ({ name: x.name, amount: x.amt, discount: x.disc, category: x.cat, unsure: false })),
};

test('normalize: lotte json → draft equal to LOTTE + flags', () => {
  const r = normalize(LOTTE_JSON, CTX);
  assert.equal(r.ok, true);
  const { payUnsure, items, ...rest } = r.draft;
  assert.equal(payUnsure, false);
  assert.deepEqual(items.map(({ unsure, ...x }) => x), LOTTE.items);
  assert.ok(items.every(x => x.unsure === false));
  const { items: _i, ...lotteRest } = LOTTE;
  assert.deepEqual(rest, lotteRest);
});

test('unknown payment stays empty', () => {
  const r = normalize({ ...LOTTE_JSON, payment: '신한카드' }, CTX);
  assert.equal(r.draft.pay, ''); assert.equal(r.draft.payUnsure, true);
});

test('lotte card family is unsure', () => {
  assert.deepEqual(mapPay('롯데카드', DEFAULT_PAYS), { pay: '롯데카드', unsure: true });
  assert.deepEqual(mapPay('삼성카드 A 3791****', DEFAULT_PAYS), { pay: '삼성카드', unsure: false });
  assert.deepEqual(mapPay('', DEFAULT_PAYS), { pay: '', unsure: true });
});

test('category outside list → empty + unsure', () => {
  const j = { ...LOTTE_JSON, items: [{ ...LOTTE_JSON.items[0], category: '미분류' }] };
  const it = normalize(j, CTX).draft.items[0];
  assert.equal(it.cat, ''); assert.equal(it.unsure, true);
});

test('double-counted coupon leaves a balance gap', () => {
  const d = normalize({ ...LOTTE_JSON, coupon: 7000 }, CTX).draft;
  assert.equal(balance(d).diff, -7000);
  assert.ok(check(d, DEFAULT_PAYS).includes('BAD_BALANCE'));
});

test('bad date → today', () => {
  assert.equal(normalize({ ...LOTTE_JSON, date: '' }, CTX).draft.date, '2026-10-30');
});

test('not_receipt → NOT_RECEIPT', () => {
  assert.deepEqual(normalize({ ...LOTTE_JSON, not_receipt: true }, CTX), { ok: false, error: 'NOT_RECEIPT' });
});

test('receiptSchema has no numeric constraints', () => {
  const s = receiptSchema(CATS);
  assert.ok(!JSON.stringify(s).includes('minimum'));
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.items.items.additionalProperties, false);
  assert.deepEqual(s.properties.items.items.properties.category.enum, CATS);
});

test('receiptPrompt mentions 자사할인 rule', () => {
  assert.match(receiptPrompt(CATS), /자사할인/);
});

test('impossible date → today', () => {
  assert.equal(normalize({ ...LOTTE_JSON, date: '2026-02-30' }, CTX).draft.date, '2026-10-30');
});

test('missing total → amount 0 so double-counted coupon cannot balance itself', () => {
  const d = normalize({ ...LOTTE_JSON, coupon: 7000, total: 0 }, CTX).draft;
  assert.equal(d.amount, 0);
  assert.ok(check(d, DEFAULT_PAYS).includes('BAD_AMOUNT'));
});

test('parseAnswer: json in code block with text around', () => {
  const text = '영수증을 읽었어요.\n```json\n' + JSON.stringify(LOTTE_JSON, null, 2) + '\n```\n확인해 주세요.';
  assert.deepEqual(parseAnswer(text), { ok: true, json: LOTTE_JSON });
});

test('parseAnswer: no json → BAD_JSON', () => {
  assert.deepEqual(parseAnswer('사진이 흐려요'), { ok: false, error: 'BAD_JSON' });
  assert.deepEqual(parseAnswer('{oops}'), { ok: false, error: 'BAD_JSON' });
});

test('chatPrompt: rules + every schema key', () => {
  const p = chatPrompt(CATS);
  assert.ok(p.startsWith(receiptPrompt(CATS)));
  for (const k of ['not_receipt', 'merchant', 'date', 'payment', 'items', 'coupon', 'total', 'discount', 'category', 'unsure']) assert.match(p, new RegExp(`"${k}"`));
});
