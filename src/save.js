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
    store.set(clientId, { status: 'pending', year, start, count });
    await sheets.setValues(id, `${TX}!A${start}:G${end}`, rows);
    store.set(clientId, { status: 'done', year, start, count });
    return { ok: true, year, start, count, already: false };
  };

  if (rec && rec.status === 'pending') {
    const got = await sheets.getValues(id, `${TX}!A${rec.start}:G${rec.start + count - 1}`);
    if (same(got, rows)) {
      store.set(clientId, { ...rec, status: 'done' });
      return { ok: true, year, start: rec.start, count, already: true };
    }
    if (got.every(r => !r || r[0] === '' || r[0] == null)) return write(rec.start);
    return { ok: false, error: 'PENDING_CONFLICT', detail: rec.start };
  }

  const limit = rangeEnd(await sheets.getFormula(id, IS_CELL));
  if (!limit) return { ok: false, error: 'IS_RANGE_UNKNOWN' };
  const start = lastDataRow(await sheets.getValues(id, `${TX}!A1:G${limit}`)) + 1;
  if (start + count - 1 > limit) return { ok: false, error: 'SHEET_RANGE_EXCEEDED', detail: limit };
  return write(start);
}
