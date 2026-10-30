// 영수증 1건 저장. 같은 clientId는 몇 번 불러도 시트에 한 번만 들어간다.
import { toRows, check } from './ledger.js';
import { lastDataRow, rangeEnd } from './sheet.js';

export const TX = "'1.Transaction'";
export const IS_CELL = "'3. Income Statement'!E33";

const same = (a, b) => a.length === b.length &&
  a.every((r, i) => b[i].every((v, k) => String(v ?? '') === String((r || [])[k] ?? '')));

export async function saveReceipt({ draft, clientId, sheets, store, yearIds, pays }) {
  const bad = check(draft, pays);
  if (bad.length) return { ok: false, error: 'INVALID', detail: bad };
  const year = Number(draft.date.slice(0, 4));
  const id = yearIds[year];
  if (!id) return { ok: false, error: 'YEAR_FILE_MISSING', detail: year };

  const rows = toRows(draft), count = rows.length;
  const rec = store.get(clientId);
  if (rec && rec.status === 'done') return { ok: true, year: rec.year, start: rec.start, count: rec.count, already: true };

  const write = async start => {
    const end = start + count - 1;
    store.set(clientId, { status: 'pending', year, start, count, draft });
    await sheets.setValues(id, `${TX}!A${start}:G${end}`, rows);
    store.set(clientId, { status: 'done', year, start, count });
    return { ok: true, year, start, count, already: false };
  };

  // 끝났는지 모르는 이전 저장: 그때 쓴 연도 파일·자리를 본다. 비어 있으면 처음부터 다시.
  if (rec && rec.status === 'pending') {
    const prevId = yearIds[rec.year];
    const got = prevId ? await sheets.getValues(prevId, `${TX}!A${rec.start}:G${rec.start + rec.count - 1}`) : [];
    // F열은 미리 채워진 수식(값 0)이 있으니 빈 줄 판정에서 뺀다.
    const empty = got.every(r => !r || r.every((v, k) => k === 5 || v === '' || v == null));
    if (!empty) {
      if (rec.year === year && same(got, rows)) {
        store.set(clientId, { status: 'done', year, start: rec.start, count });
        return { ok: true, year, start: rec.start, count, already: true };
      }
      return { ok: false, error: 'PENDING_CONFLICT', detail: rec.start };
    }
  }

  const limit = rangeEnd(await sheets.getFormula(id, IS_CELL));
  if (!limit) return { ok: false, error: 'IS_RANGE_UNKNOWN' };
  const start = lastDataRow(await sheets.getValues(id, `${TX}!A1:G${limit}`)) + 1;
  if (start + count - 1 > limit) return { ok: false, error: 'SHEET_RANGE_EXCEEDED', detail: limit };
  return write(start);
}
