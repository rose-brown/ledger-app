// '3. Income Statement' 값(A1:P50, 2차원 배열)을 읽어 화면용 구조로 바꾼다. 읽기 전용.
// 열: B=대분류(고정/변동), C=계정, D=Total, E~P=1~12월. 지출은 음수, 수익은 양수.
export const IS_SHEET = "'3. Income Statement'";
export const IS_RANGE = `${IS_SHEET}!A1:P50`;

export const INCOME_ROWS = [11, 12, 13, 14, 15, 18, 19];
export const EXPENSE_ROWS = [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 44];
const SUMMARY = { income: 8, expense: 22, surplus: 50 };

const text = (values, r, c) => String(((values[r - 1] || [])[c]) ?? '').trim();
const cell = (values, r, c) => {
  const v = (values[r - 1] || [])[c];
  return typeof v === 'number' ? v : 0; // 빈 칸·문자·#REF! 같은 오류 값은 0
};

function line(values, r, name, group = '') {
  const months = Array.from({ length: 12 }, (_, i) => cell(values, r, 4 + i));
  return { row: r, name, group, months, total: months.reduce((a, b) => a + b, 0) };
}

export function parseStatement(values) {
  const detail = rows => rows
    .map(r => ({ r, name: text(values, r, 2) }))
    .filter(x => x.name)
    .map(x => line(values, x.r, x.name, text(values, x.r, 1)));
  return {
    income: { sum: line(values, SUMMARY.income, '수익'), rows: detail(INCOME_ROWS) },
    expense: { sum: line(values, SUMMARY.expense, '지출'), rows: detail(EXPENSE_ROWS) },
    surplus: line(values, SUMMARY.surplus, 'Surplus / Loss'),
  };
}

// 월 보기에서 0원 줄은 숨긴다. month는 1~12, 'all'이면 합계.
export const amountOf = (ln, month) => (month === 'all' ? ln.total : ln.months[month - 1]);
export const visible = (rows, month) => rows.filter(r => amountOf(r, month) !== 0);
