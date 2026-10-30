// Claude 인식 JSON ↔ 영수증 초안.

export function receiptSchema(cats) {
  const str = { type: 'string' }, int = { type: 'integer' }, bool = { type: 'boolean' };
  const item = {
    type: 'object', additionalProperties: false,
    properties: { name: str, amount: int, discount: int, category: { type: 'string', enum: cats }, unsure: bool },
    required: ['name', 'amount', 'discount', 'category', 'unsure'],
  };
  return {
    type: 'object', additionalProperties: false,
    properties: { not_receipt: bool, merchant: str, date: str, payment: str, items: { type: 'array', items: item }, coupon: int, total: int },
    required: ['not_receipt', 'merchant', 'date', 'payment', 'items', 'coupon', 'total'],
  };
}

export function receiptPrompt(cats) {
  return [
    '가계부에 넣을 수 있게 정해진 JSON 형식으로 답하세요.',
    '- merchant: 가맹점 이름. date: 거래 날짜 YYYY-MM-DD, 안 보이면 빈 문자열. payment: 카드사 이름·현금·계좌이체 중 보이는 것, 없으면 빈 문자열.',
    '- items: 품목마다 name(짧게), amount(정가 정수, 수량 반영), discount(이 품목 할인 합계 양수 정수, 없으면 0), category, unsure(카테고리가 애매하면 true).',
    '- coupon: 특정 품목에 붙지 않은 영수증 전체 할인·쿠폰·포인트 사용 합계 양수 정수(없으면 0). total: 실제 결제금액 정수.',
    '- 카테고리는 반드시 이 중 하나: ' + cats.join(', '),
    '- 식료품·음료·외식은 식비, 생활용품·옷·화장품은 쇼핑, 영화·공연·구독·취미는 여가비, 약국·병원은 병원비.',
    '- 품목 정가 합계 − 품목 할인 합계 − coupon = total 이 되게 나누세요. 맞지 않으면 total을 기준으로 coupon을 조정하세요.',
    '- 합계 아래 할인 합계 줄(예: 자사할인)이 품목 할인의 합이면 coupon에 넣지 마세요.',
    '- 부가세, 과세물품가액, 받은 돈, 거스름돈, 포인트 적립 줄은 품목이 아니에요.',
    '- 영수증이 아니면 not_receipt를 true로 하고 나머지는 빈 값으로 두세요.',
  ].join('\n');
}

const toInt = v => Math.round(Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0);
const squash = s => String(s || '').replace(/\s/g, '');

// 영수증 결제 표기 → 결제수단 계정. 이름이 겹치는 계정(롯데카드/롯데카드A)이 있으면 unsure.
export function mapPay(text, pays) {
  const t = squash(text);
  const hit = pays.filter(p => t && t.includes(squash(p))).sort((a, b) => b.length - a.length)[0];
  if (!hit) return { pay: '', unsure: true };
  return { pay: hit, unsure: pays.some(p => p !== hit && p.startsWith(hit)) };
}

export function normalize(j, ctx) {
  if (!j || j.not_receipt || !Array.isArray(j.items) || !j.items.length) return { ok: false, error: 'NOT_RECEIPT' };
  const items = j.items.map(x => {
    const amt = Math.abs(toInt(x.amount));
    const valid = ctx.cats.includes(x.category);
    return {
      name: String(x.name || '').trim().slice(0, 40) || '품목',
      amt, disc: Math.min(amt, Math.abs(toInt(x.discount))),
      cat: valid ? x.category : '', unsure: !!x.unsure || !valid,
    };
  });
  const coupon = Math.abs(toInt(j.coupon));
  const net = items.reduce((a, x) => a + x.amt - x.disc, 0) - coupon;
  const { pay, unsure } = mapPay(j.payment, ctx.pays);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : ctx.today;
  return { ok: true, draft: {
    merchant: String(j.merchant || '').trim().slice(0, 40) || '가맹점',
    date, pay, coupon, amount: toInt(j.total) > 0 ? toInt(j.total) : net, payUnsure: unsure, items,
  } };
}
