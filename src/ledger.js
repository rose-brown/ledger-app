// 영수증 초안 → 1.Transaction 행. 프로토타입 alloc()/balance()/rows()에서 옮김.

export const CATS = ['통신비', '보험료', '교통비', '주거비', '기부금', '세금과공과', '식비', '경조사비',
  '여가비', '쇼핑', '데이트 통장', '병원비', '교육', '이월금', '기타 지출'];
export const FORBIDDEN = ['미분류', '잡비', '병원'];
export const DEFAULT_PAYS = ['롯데카드', '롯데카드A', '롯데카드B', '우리카드', '예금(토스뱅크)', '현금', '삼성카드'];

// 쿠폰을 카테고리별 순액 비례로 나누고, 내림으로 남는 원은 가장 큰 카테고리에.
export function alloc(items, coupon) {
  const byCat = {};
  items.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + x.amt - x.disc; });
  const cats = Object.keys(byCat).filter(c => byCat[c] > 0);
  const out = {};
  if (!coupon || !cats.length) return out;
  const net = cats.reduce((a, c) => a + byCat[c], 0);
  let given = 0;
  cats.forEach(c => { out[c] = Math.floor(coupon * byCat[c] / net); given += out[c]; });
  const big = cats.slice().sort((a, b) => byCat[b] - byCat[a])[0];
  out[big] += coupon - given;
  return out;
}

export function balance(d) {
  const debit = d.items.reduce((a, x) => a + x.amt, 0);
  const credit = d.items.reduce((a, x) => a + x.disc, 0) + d.coupon + d.amount;
  return { debit, credit, diff: debit - credit };
}

// [월, 일, 차변, 대변, 차변금액, 대변금액, 메모] — 쓰지 않는 칸은 ''.
export function toRows(d) {
  const m = Number(d.date.slice(5, 7)), day = Number(d.date.slice(8, 10));
  const dr = (cat, e, memo) => [m, day, cat, '', e, '', memo];
  const cr = (acct, f, memo) => [m, day, '', acct, '', f, memo];
  const R = [];
  d.items.forEach(x => {
    R.push(dr(x.cat, x.amt, x.name));
    if (x.disc) R.push(cr(x.cat, x.disc, x.name + ' 할인'));
  });
  const a = alloc(d.items, d.coupon);
  for (const c in a) if (a[c]) R.push(cr(c, a[c], '쿠폰 할인 배분'));
  R.push(cr(d.pay, d.amount, d.merchant));
  return R;
}

export function check(d, pays) {
  const err = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) err.push('BAD_DATE');
  if (!d.items.length) err.push('NO_ITEMS');
  if (d.items.some(x => !(x.amt > 0) || x.disc < 0 || x.disc > x.amt) || !(d.amount > 0) || d.coupon < 0) err.push('BAD_AMOUNT');
  if (d.items.some(x => !CATS.includes(x.cat))) err.push('BAD_CAT');
  if (!pays.includes(d.pay)) err.push('NO_PAY');
  if (balance(d).diff !== 0) err.push('BAD_BALANCE');
  return err;
}
