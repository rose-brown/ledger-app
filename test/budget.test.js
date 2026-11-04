import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUDGET, parseBudget, budgetValues, budgetMonth } from '../src/budget.js';
import { CATS } from '../src/ledger.js';

const line = (name, group, m, v) => {
  const months = Array(12).fill(0); months[m - 1] = v;
  return { name, group, months, total: v };
};
const stmt = rows => ({ expense: { rows } });

test('기본 예산은 15개 카테고리 모두 있고 생활비(옛 데이트 통장)는 350,000원', () => {
  assert.deepEqual(Object.keys(DEFAULT_BUDGET), CATS);
  assert.ok(!CATS.includes('데이트 통장'));
  assert.equal(DEFAULT_BUDGET['생활비'], 350000);
  assert.equal(DEFAULT_BUDGET['식비'], 184000);
});

test('예산 시트: 머리글은 건너뛰고, 모르는 카테고리·빈 금액은 무시하고 없는 카테고리는 0', () => {
  const b = parseBudget([['카테고리', '월 예산'], ['식비', 200000], ['쇼핑', ''], ['없는것', 5], ['교통비', '70,000']]);
  assert.equal(b['식비'], 200000);
  assert.equal(b['교통비'], 70000);
  assert.equal(b['쇼핑'], 0);
  assert.equal(b['없는것'], undefined);
  assert.deepEqual(Object.keys(b), CATS);
});

test('budgetValues는 머리글 + 카테고리 15줄', () => {
  const v = budgetValues(DEFAULT_BUDGET);
  assert.deepEqual(v[0], ['카테고리', '월 예산']);
  assert.equal(v.length, 16);
  assert.deepEqual(v[7], ['식비', 184000]);
});

test('카테고리별 쓴 돈·남은 돈, 초과한 것이 맨 앞, 고정·변동 나눔', () => {
  const st = stmt([
    line('주거비', '고정', 11, -100000),
    line('식비', '변동', 11, -150000),
    line('쇼핑', '변동', 11, -120000),
    line('여가비', '변동', 11, 0),
  ]);
  const r = budgetMonth(st, { ...DEFAULT_BUDGET, 식비: 184000, 쇼핑: 90000, 여가비: 157000, 주거비: 149000 }, 11);
  assert.deepEqual(r.variable.map(x => x.name), ['쇼핑', '식비', '여가비']);
  assert.equal(r.variable[0].left, -30000);
  assert.equal(r.fixed[0].left, 49000);
  assert.equal(r.spent, 370000);
});

test('예산 0원이고 쓴 돈도 0원인 카테고리는 숨기고, 예산 0원이어도 쓰면 보인다', () => {
  const st = stmt([line('생활비', '변동', 3, 0), line('교육', '변동', 3, -5000)]);
  const r = budgetMonth(st, { ...DEFAULT_BUDGET, 생활비: 0, 교육: 0 }, 3);
  assert.deepEqual(r.variable.map(x => x.name), ['교육']);
  assert.equal(r.variable[0].left, -5000);
});

test('총예산은 0이 아닌 예산 합, 남은 돈 = 총예산 − 쓴 돈', () => {
  const r = budgetMonth(stmt([line('식비', '변동', 1, -84000)]), DEFAULT_BUDGET, 1);
  const total = Object.values(DEFAULT_BUDGET).reduce((a, b) => a + b, 0);
  assert.equal(r.budget, total);
  assert.equal(r.left, total - 84000);
});

test('하루 권장액: 이번 달이면 남은 변동비 예산 ÷ 오늘 포함 남은 날, 아니면 null', () => {
  const st = stmt([line('식비', '변동', 11, -84000), line('주거비', '고정', 11, -149000)]);
  const b = { ...Object.fromEntries(CATS.map(c => [c, 0])), 식비: 184000, 주거비: 149000 };
  // 11월은 30일, 오늘 21일 → 남은 날 10일, 남은 변동비 100,000
  assert.equal(budgetMonth(st, b, 11, { day: 21, days: 30 }).daily, 10000);
  assert.equal(budgetMonth(st, b, 11).daily, null);
  // 변동비를 이미 넘었으면 0
  const over = stmt([line('식비', '변동', 11, -200000)]);
  assert.equal(budgetMonth(over, b, 11, { day: 21, days: 30 }).daily, 0);
});

test('환불로 쓴 돈이 음수가 되면 그대로 반영해 남은 돈이 늘어난다', () => {
  const r = budgetMonth(stmt([line('쇼핑', '변동', 5, 10000)]), DEFAULT_BUDGET, 5);
  assert.equal(r.variable.find(x => x.name === '쇼핑').spent, -10000);
});
