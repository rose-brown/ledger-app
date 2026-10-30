// 1.Transaction 값(A~G 2차원 배열, 1행부터)을 읽어 계산. 행 번호는 1-based.
import { CATS, FORBIDDEN } from './ledger.js';

const num = v => (typeof v === 'number' ? v : Number(v) || 0);
const isNum = v => v !== '' && v != null && !isNaN(Number(v));

export function headerRow(rows) {
  for (let i = 0; i < Math.min(10, rows.length); i++) if ((rows[i] || [])[0] === 'month') return i + 1;
  return -1;
}

// F열 수식(값 0)만 있는 미리 채워진 행은 데이터가 아니다 → A열(월)이 숫자인 마지막 행.
export function lastDataRow(rows) {
  const h = Math.max(0, headerRow(rows));
  let last = h;
  for (let i = h; i < rows.length; i++) if (isNum((rows[i] || [])[0])) last = i + 1;
  return last;
}

export function rangeEnd(formula) {
  const m = /\$A\$\d+:\$A\$(\d+)/.exec(formula || '');
  return m ? Number(m[1]) : null;
}

// Income Statement 지출 칸과 같은 식(차변 카테고리 E − 대변 카테고리 F), 지출을 양수로.
export function monthSpend(rows, month) {
  const byDay = {};
  let total = 0;
  for (const r of rows.slice(Math.max(0, headerRow(rows)))) {
    if (!r || num(r[0]) !== month) continue;
    const v = (CATS.includes(r[2]) ? num(r[4]) : 0) - (CATS.includes(r[3]) ? num(r[5]) : 0);
    if (!v) continue;
    total += v;
    byDay[num(r[1])] = (byDay[num(r[1])] || 0) + v;
  }
  for (const d in byDay) if (!byDay[d]) delete byDay[d];
  return { total, byDay };
}

// 그날 행을 위에서부터 읽어 결제 대변 행(C 빈 칸, D가 카테고리 아님)에서 끊어 거래로 묶는다.
export function dayEntries(rows, month, day) {
  const out = [];
  let group = [];
  const flush = payRow => {
    const net = {}, off = {};
    for (const r of group) {
      if (CATS.includes(r[2])) net[r[2]] = (net[r[2]] || 0) + num(r[4]);
      if (CATS.includes(r[3])) net[r[3]] = (net[r[3]] || 0) - num(r[5]);
      if (FORBIDDEN.includes(r[2])) off[r[2]] = (off[r[2]] || 0) + num(r[4]);
    }
    const counted = Object.keys(net).length > 0;
    const map = counted ? net : off;
    const cats = Object.keys(map).sort((a, b) => map[b] - map[a]);
    if (cats.length) out.push({
      merchant: String((payRow && payRow[6]) || group[0][6] || ''),
      cat: cats[0] + (cats.length > 1 ? ` 외 ${cats.length - 1}` : ''),
      pay: payRow ? payRow[3] : '',
      amount: cats.reduce((a, c) => a + map[c], 0),
      counted,
    });
    group = [];
  };
  for (const r of rows.slice(Math.max(0, headerRow(rows)))) {
    if (!r || num(r[0]) !== month || num(r[1]) !== day) continue;
    group.push(r);
    if (!r[2] && r[3] && !CATS.includes(r[3])) flush(r);
  }
  if (group.length) flush(null);
  return out;
}

export function hasSame(rows, d) {
  const m = Number(d.date.slice(5, 7)), day = Number(d.date.slice(8, 10));
  return rows.some(r => r && num(r[0]) === m && num(r[1]) === day && r[3] === d.pay && num(r[5]) === d.amount);
}
