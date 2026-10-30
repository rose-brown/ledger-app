import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRows, DEFAULT_PAYS } from '../src/ledger.js';
import { saveReceipt } from '../src/save.js';
import { ROWS, LOTTE } from './fixtures.js';

// 메모리 시트: { [id]: rows } . 범위는 'A{s}:G{e}' 형태만 다룬다.
function fakeSheets(files, end = 20) {
  const calls = { set: 0 };
  const parse = a1 => a1.match(/A(\d+):G(\d+)/).slice(1).map(Number);
  return {
    calls,
    async getValues(id, a1) {
      const [s, e] = parse(a1);
      return (files[id] || []).slice(s - 1, e).map(r => [...r]);
    },
    async getFormula() { return `=-SUMPRODUCT((('1.Transaction'!$A$3:$A$${end})=E$4))`; },
    async setValues(id, a1, values) {
      calls.set++;
      const [s] = parse(a1);
      values.forEach((r, i) => { files[id][s - 1 + i] = [...r]; });
    },
  };
}
function memStore() { const m = {}; return { get: k => m[k], set: (k, v) => { m[k] = v; }, m }; }
const base = () => ({ A: ROWS.map(r => [...r]) });
const args = (o = {}) => ({ draft: LOTTE, clientId: 'c1', yearIds: { 2026: 'A' }, pays: DEFAULT_PAYS, ...o });

test('lotte saves at row after last data row', async () => {
  const files = base(), sheets = fakeSheets(files), store = memStore();
  const r = await saveReceipt(args({ sheets, store }));
  assert.deepEqual(r, { ok: true, year: 2026, start: 11, count: 9, already: false });
  assert.deepEqual(files.A.slice(10, 19), toRows(LOTTE));
  assert.deepEqual(store.get('c1'), { status: 'done', year: 2026, start: 11, count: 9 });
});

test('same clientId twice writes once', async () => {
  const files = base(), sheets = fakeSheets(files), store = memStore();
  await saveReceipt(args({ sheets, store }));
  const r = await saveReceipt(args({ sheets, store }));
  assert.equal(sheets.calls.set, 1);
  assert.equal(r.already, true); assert.equal(r.start, 11);
});

test('pending with rows present becomes done', async () => {
  const files = base(), sheets = fakeSheets(files), store = memStore();
  toRows(LOTTE).forEach((row, i) => { files.A[10 + i] = row; });
  store.set('c1', { status: 'pending', year: 2026, start: 11, count: 9 });
  const r = await saveReceipt(args({ sheets, store }));
  assert.equal(sheets.calls.set, 0);
  assert.equal(r.ok, true); assert.equal(store.get('c1').status, 'done');
});

test('pending with empty rows rewrites same place', async () => {
  const files = base(), sheets = fakeSheets(files), store = memStore();
  store.set('c1', { status: 'pending', year: 2026, start: 11, count: 9 });
  const r = await saveReceipt(args({ sheets, store }));
  assert.equal(r.start, 11); assert.equal(sheets.calls.set, 1);
  assert.deepEqual(files.A.slice(10, 19), toRows(LOTTE));
});

test('pending with other rows → PENDING_CONFLICT', async () => {
  const files = base(), sheets = fakeSheets(files), store = memStore();
  store.set('c1', { status: 'pending', year: 2026, start: 5, count: 9 });
  const r = await saveReceipt(args({ sheets, store }));
  assert.equal(r.ok, false); assert.equal(r.error, 'PENDING_CONFLICT');
  assert.equal(sheets.calls.set, 0);
});

test("previous-year receipt goes to that year's sheet", async () => {
  const files = { ...base(), B: ROWS.map(r => [...r]) }, sheets = fakeSheets(files), store = memStore();
  const draft = { ...LOTTE, date: '2025-12-31' };
  const r = await saveReceipt(args({ draft, sheets, store, yearIds: { 2025: 'B', 2026: 'A' } }));
  assert.equal(r.year, 2025);
  assert.equal(files.B[10][0], 12); assert.equal(files.B[10][1], 31);
  assert.equal(files.A.length, ROWS.length);
});

test('missing year → YEAR_FILE_MISSING', async () => {
  const r = await saveReceipt(args({ sheets: fakeSheets(base()), store: memStore(), yearIds: {} }));
  assert.deepEqual(r, { ok: false, error: 'YEAR_FILE_MISSING', detail: 2026 });
});

test('write past income statement range is refused', async () => {
  const files = base(), sheets = fakeSheets(files, 15);
  const r = await saveReceipt(args({ sheets, store: memStore() }));
  assert.equal(r.error, 'SHEET_RANGE_EXCEEDED'); assert.equal(sheets.calls.set, 0);
});

test('invalid draft → error codes, no write', async () => {
  const sheets = fakeSheets(base());
  const r = await saveReceipt(args({ draft: { ...LOTTE, pay: '' }, sheets, store: memStore() }));
  assert.equal(r.ok, false); assert.equal(r.error, 'INVALID'); assert.deepEqual(r.detail, ['NO_PAY']);
  assert.equal(sheets.calls.set, 0);
});
