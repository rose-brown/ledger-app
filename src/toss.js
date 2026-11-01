// 토스 지출 캡처(거래 여러 건) → 거래 목록. 1건 = 차변 1행 + 대변 1행.
import { validDate } from './ledger.js';
import { mapPay } from './receipt.js';

export function tossPrompt(cats) {
  const example = { transactions: [{ date: 'MM-DD', merchant: '', payment: '', amount: -1000, kind: 'spend', category: '' }] };
  return [
    '첨부한 토스 소비·지출 내역 캡처를 가계부에 넣을 수 있게 정해진 JSON 형식으로 답하세요.',
    '- 화면에 보이는 거래를 위에서부터 모두 transactions에 넣으세요. 날짜별 합계 숫자(달력 아래 금액)는 거래가 아니에요.',
    '- date: MM-DD. 목록에 날짜 머리글이 있으면 그 날짜, 없으면 화면 위 월과 강조된 날짜.',
    '- merchant: "|" 앞 가맹점·내용. payment: "|" 뒤 결제수단 그대로, 없으면 빈 문자열.',
    '- amount: 화면 금액 정수, 부호 그대로 (지출 음수, 입금 양수).',
    '- kind: 지출은 spend, 입금·환불은 income, 내 계좌끼리 이동·카드대금·후불교통대금 납부·충전은 transfer.',
    '- category: 반드시 이 중 하나: ' + cats.join(', '),
    '- 식료품·음료·카페·외식·자판기는 식비, 버스·지하철·티머니·택시·기차는 교통비, 생활용품·옷·화장품은 쇼핑, 영화·공연·구독·취미는 여가비, 약국·병원은 병원비.',
    '- 설명 없이 아래 형식의 JSON 하나만 답하세요.',
    JSON.stringify(example),
  ].join('\n');
}

// 기억한 결제수단 짝의 키: 공백 무시.
export const payKey = s => String(s || '').replace(/\s/g, '');

export function normalizeToss(j, ctx) {
  const txs = Array.isArray(j?.transactions) ? j.transactions : [];
  if (!txs.length) return { ok: false, error: 'NOT_TOSS' };
  const [ty, tm] = ctx.today.split('-').map(Number);
  const list = txs.map(x => {
    const [m, d] = String(x.date || '').split('-').map(Number);
    const ymd = `${m > tm ? ty - 1 : ty}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const signed = Math.round(Number(String(x.amount ?? '').replace(/[^\d.-]/g, '')) || 0);
    const payText = String(x.payment || '').trim();
    const remembered = ctx.payMap[payKey(payText)];
    return {
      date: validDate(ymd) ? ymd : ctx.today,
      merchant: String(x.merchant || '').trim().slice(0, 40) || '가맹점',
      payText,
      pay: ctx.pays.includes(remembered) ? remembered : mapPay(payText, ctx.pays).pay,
      amount: Math.abs(signed),
      cat: ctx.cats.includes(x.category) ? x.category : '',
      on: x.kind === 'spend' && signed < 0,
    };
  });
  return { ok: true, list };
}

export const tossDraft = x => ({
  merchant: x.merchant, date: x.date, pay: x.pay, coupon: 0, amount: x.amount,
  items: [{ name: x.merchant, amt: x.amount, disc: 0, cat: x.cat }],
});
