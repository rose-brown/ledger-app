import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, visible, amountOf, EXPENSE_ROWS } from '../src/statement.js';

// 실제 시트처럼 1-based 행에 값을 꽂는다 (A~P, 월은 E~P).
function sheet() {
  const v = Array.from({ length: 50 }, () => []);
  const put = (r, c, x) => { v[r - 1][c] = x; };
  put(8, 4, 3000000); put(8, 5, 3100000);
  put(11, 2, '월급'); put(11, 4, 3000000); put(11, 5, 3000000);
  put(22, 4, -500000); put(22, 5, '#REF!');
  put(33, 1, '변동'); put(33, 2, '식비'); put(33, 4, -300000); put(33, 5, -200000.5);
  put(35, 1, '변동'); put(35, 2, '여가비');
  put(41, 2, '이월금'); put(41, 4, -200000);
  put(50, 4, 2500000);
  return v;
}

test('수익·지출·Surplus 줄을 읽고 합계는 월 합이다', () => {
  const s = parseStatement(sheet());
  assert.equal(s.income.sum.months[0], 3000000);
  assert.equal(s.income.sum.total, 6100000);
  assert.equal(s.expense.sum.months[0], -500000);
  assert.equal(s.surplus.months[0], 2500000);
});

test('오류·문자 값은 0으로 본다', () => {
  assert.equal(parseStatement(sheet()).expense.sum.months[1], 0);
});

test('계정 이름이 없는 줄은 빼고, 대분류를 붙인다', () => {
  const s = parseStatement(sheet());
  assert.deepEqual(s.expense.rows.map(r => r.name), ['식비', '여가비', '이월금']);
  assert.equal(s.expense.rows[0].group, '변동');
  assert.deepEqual(s.income.rows.map(r => r.name), ['월급']);
});

test('visible은 해당 월이 0원인 줄을 숨기고 all은 합계로 판단한다', () => {
  const s = parseStatement(sheet());
  assert.deepEqual(visible(s.expense.rows, 1).map(r => r.name), ['식비', '이월금']);
  assert.deepEqual(visible(s.expense.rows, 3).map(r => r.name), []);
  assert.equal(amountOf(s.expense.rows[0], 'all'), -500000.5);
});

test('빈 시트도 죽지 않는다', () => {
  const s = parseStatement([]);
  assert.equal(s.surplus.total, 0);
  assert.equal(s.expense.rows.length, 0);
  assert.ok(EXPENSE_ROWS.includes(33));
});
