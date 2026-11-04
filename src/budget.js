// 예산: 가계부 파일의 '예산' 시트(A=카테고리, B=월 예산)와 손익 시트의 그 달 지출을 비교한다.
import { CATS } from './ledger.js';

export const BUDGET_SHEET = '예산';
export const BUDGET_RANGE = `'${BUDGET_SHEET}'!A1:B30`;

// 추천값: 참고자료 2022~2026(8월까지) Income Statement의 카테고리별 월 지출에서
// 가장 많은 달 2개·가장 적은 달 2개를 빼고 낸 평균 (천 원 단위 반올림).
// 생활비는 옛 '데이트 통장' 기록의 평균. 이월금·기타 지출은 기록이 없어 0원.
export const DEFAULT_BUDGET = {
  통신비: 37000, 보험료: 94000, 교통비: 60000, 주거비: 149000, 기부금: 45000, 세금과공과: 20000,
  식비: 184000, 경조사비: 73000, 여가비: 157000, 쇼핑: 90000, 생활비: 350000, 병원비: 82000,
  교육: 43000, 이월금: 0, '기타 지출': 0,
};

const num = v => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0);

export function parseBudget(values) {
  const got = new Map(values.map(r => [String(r?.[0] ?? '').trim(), num(r?.[1])]));
  return Object.fromEntries(CATS.map(c => [c, Math.max(0, Math.round(got.get(c) || 0))]));
}

export const budgetValues = b => [['카테고리', '월 예산'], ...CATS.map(c => [c, b[c] || 0])];

// st: parseStatement 결과, month: 1~12, today: 이번 달이면 { day, days } (하루 권장액용)
export function budgetMonth(st, budget, month, today = null) {
  const items = st.expense.rows.map(r => {
    const b = budget[r.name] || 0, spent = -r.months[month - 1];
    return { name: r.name, fixed: r.group === '고정', budget: b, spent, left: b - spent };
  }).filter(x => x.budget || x.spent);
  const order = list => [...list.filter(x => x.left < 0).sort((a, b) => a.left - b.left), ...list.filter(x => x.left >= 0)];
  const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
  const variable = order(items.filter(x => !x.fixed)), fixed = order(items.filter(x => x.fixed));
  const budgetTotal = Object.values(budget).reduce((a, b) => a + b, 0), spent = sum(items, 'spent');
  const daily = today ? Math.max(0, sum(variable, 'left')) / (today.days - today.day + 1) : null;
  return { budget: budgetTotal, spent, left: budgetTotal - spent, daily, variable, fixed };
}
