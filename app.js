// 화면: 캘린더(첫 화면) · 영수증 확인 · 설정.
import { GOOGLE_CLIENT_ID } from './config.js';
import { CATS, DEFAULT_PAYS, balance, check } from './src/ledger.js';
import { normalize, chatPrompt, parseAnswer } from './src/receipt.js';
import { rangeEnd, monthSpend, dayEntries, hasSame } from './src/sheet.js';
import { saveReceipt, TX, IS_CELL } from './src/save.js';
import { recognize } from './src/claude.js';
import { initGoogle, getToken, signedIn, sheets } from './src/google.js';

const $app = document.getElementById('app');
const $photo = document.getElementById('photo');

// ---------- 저장소 (이 기기 브라우저에만) ----------
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let S = load('ledger.settings', { apiKey: '', years: {}, pays: DEFAULT_PAYS });
const txStore = {
  get: id => load('ledger.tx', {})[id],
  set: (id, rec) => { const m = load('ledger.tx', {}); m[id] = rec; keep('ledger.tx', m); },
  del: id => { const m = load('ledger.tx', {}); delete m[id]; keep('ledger.tx', m); },
  pending: () => Object.entries(load('ledger.tx', {})).find(([, r]) => r.status === 'pending' && r.draft),
};

// ---------- 공용 ----------
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const int = v => Math.max(0, Math.round(Number(String(v).replace(/[^\d.]/g, '')) || 0));
const sheetId = s => (/\/d\/([\w-]+)/.exec(s) || [])[1] || String(s).trim();
const ERR = {
  BAD_DATE: '날짜를 확인해 주세요.', NO_ITEMS: '품목을 하나 이상 넣어 주세요.',
  BAD_AMOUNT: '금액·할인을 확인해 주세요 (0원 품목, 할인이 금액보다 큰 품목).',
  BAD_CAT: '모든 품목의 카테고리를 골라 주세요.', NO_PAY: '결제수단을 골라 주세요.',
  YEAR_FILE_MISSING: y => `${y}년 시트가 연결돼 있지 않아요. 설정에서 추가해 주세요.`,
  SHEET_RANGE_EXCEEDED: n => `Income Statement 수식 범위(${n}행)를 넘어요. 시트에서 범위를 늘린 뒤 다시 저장해 주세요.`,
  PENDING_CONFLICT: n => `이전에 저장하던 자리(${n}행)에 다른 행이 있어요. 시트를 확인해 주세요.`,
  IS_RANGE_UNKNOWN: '3. Income Statement의 E33 수식을 읽지 못했어요.',
};
const errText = (code, detail) => typeof ERR[code] === 'function' ? ERR[code](detail) : (ERR[code] || code);

const U = { screen: 'cal', y: 0, m: 0, d: 0, rows: {}, loading: false, error: '', draft: null, photoUrl: '', busy: '', note: '' };
{ const t = today(); U.y = +t.slice(0, 4); U.m = +t.slice(5, 7); U.d = +t.slice(8, 10); }

const ready = () => GOOGLE_CLIENT_ID && Object.keys(S.years).length;

// ---------- 시트 읽기 ----------
async function loadYear(y, force = false) {
  if (!S.years[y]) return null;
  if (U.rows[y] && !force) return U.rows[y];
  const id = S.years[y];
  const end = rangeEnd(await sheets.getFormula(id, IS_CELL)) || 12074;
  U.rows[y] = await sheets.getValues(id, `${TX}!A1:G${end}`);
  return U.rows[y];
}

async function showCalendar(force = false) {
  U.screen = 'cal'; U.error = '';
  if (!S.years[U.y]) { render(); return; }
  if (!signedIn()) { render(); return; }
  U.loading = true; render();
  try { await loadYear(U.y, force); } catch (e) { U.error = e.message; }
  U.loading = false; render();
}

// ---------- 화면 그리기 ----------
function render() {
  $app.innerHTML = U.screen === 'confirm' ? confirmView() : U.screen === 'settings' ? settingsView() : U.screen === 'paste' ? pasteView() : calView();
  if (U.screen === 'confirm') updateStatus();
}

function calView() {
  const head = `<div class="bar"><button class="ib" data-act="prev" aria-label="이전 달">‹</button>
    <span class="t">${U.y}년 ${U.m}월</span><button class="ib" data-act="next" aria-label="다음 달">›</button>
    <span class="r"><button class="ib" data-act="reload" aria-label="새로고침">↻</button><button class="ib" data-act="settings" aria-label="설정">⚙</button></span></div>`;
  const fab = `<button class="fab" data-act="shoot">${S.apiKey ? '📷 영수증 찍기' : '🧾 영수증 넣기'}</button>`;
  if (!ready()) return head + `<div class="pad"><div class="msg warn">처음 쓰려면 설정이 필요해요.</div><button class="btn p" data-act="settings">설정 열기</button></div>`;
  if (!S.years[U.y]) return head + `<div class="pad"><div class="msg warn">${U.y}년 시트가 연결돼 있지 않아요.</div><button class="btn" data-act="settings">설정에서 추가</button></div>` + fab;
  if (!signedIn()) return head + `<div class="pad"><p class="mut">시트를 보려면 Google 로그인이 필요해요.</p><button class="btn p" data-act="login">Google 로그인</button></div>` + fab;
  if (U.loading) return head + `<div class="spin">시트 읽는 중…</div>`;
  if (U.error) return head + `<div class="pad"><div class="msg err">${esc(U.error)}</div><button class="btn" data-act="reload">다시 시도</button></div>` + fab;

  const rows = U.rows[U.y] || [];
  const { total, byDay } = monthSpend(rows, U.m);
  const first = new Date(U.y, U.m - 1, 1).getDay(), days = new Date(U.y, U.m, 0).getDate();
  const t = today(), isToday = d => t === `${U.y}-${String(U.m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let cells = '일월화수목금토'.split('').map(w => `<span class="w">${w}</span>`).join('');
  for (let i = 0; i < first; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    cells += `<button data-day="${d}" aria-pressed="${d === U.d}" class="${isToday(d) ? 'today' : ''}"><b>${d}</b>${byDay[d] ? `<i>−${fmt(byDay[d])}</i>` : ''}</button>`;
  }
  const list = dayEntries(rows, U.m, U.d);
  const items = list.length ? list.map(e => `<div class="li"><span class="g"><span>${esc(e.merchant || '(메모 없음)')}</span>
      <span class="sm mut">${esc(e.cat)}${e.pay ? ' · ' + esc(e.pay) : ''}${e.counted ? '' : '<span class="badge">집계 안 됨</span>'}</span></span>
      <span class="num">−${fmt(e.amount)}</span></div>`).join('') : `<p class="mut sm">이날 지출이 없어요.</p>`;
  return head + `<div class="pad"><div class="sm mut">이번 달 지출</div><div class="big num">−${fmt(total)}원</div>
    ${U.note ? `<div class="msg ok">${esc(U.note)}</div>` : ''}
    <div class="cal">${cells}</div>
    <div class="list"><div class="sm mut" style="padding:10px 0 0">${U.m}월 ${U.d}일</div>${items}</div></div>` + fab;
}

function confirmView() {
  const d = U.draft;
  const head = `<div class="bar"><button class="ib" data-act="cancel" aria-label="닫기">✕</button><span class="t">영수증 확인</span>
    <span class="r"><button class="ib" data-act="settings" aria-label="설정">⚙</button></span></div>`;
  if (U.busy) return head + `${U.photoUrl ? `<div class="pad"><img class="photo" src="${U.photoUrl}" alt="영수증 사진"></div>` : ''}<div class="spin">${esc(U.busy)}</div>`;
  const opt = (list, v) => `<option value="">선택</option>` + list.map(x => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const items = d.items.map((x, i) => `<div class="item ${x.unsure ? 'unsure' : ''}">
      <input data-it="${i}" data-k="name" value="${esc(x.name)}" placeholder="품목 이름" aria-label="품목 이름">
      <div class="row">
        <label class="f" style="margin:0">금액<input data-it="${i}" data-k="amt" inputmode="numeric" value="${x.amt || ''}"></label>
        <label class="f" style="margin:0">할인<input data-it="${i}" data-k="disc" inputmode="numeric" value="${x.disc || ''}"></label>
      </div>
      <div class="row"><select data-it="${i}" data-k="cat" aria-label="카테고리" class="${x.cat ? '' : 'unsure'}">${opt(CATS, x.cat)}</select>
        <button class="btn s" data-act="delItem" data-i="${i}" style="flex:none">삭제</button></div>
    </div>`).join('');
  return head + `<div class="pad">
    ${U.photoUrl ? `<img class="photo" src="${U.photoUrl}" alt="영수증 사진">` : ''}
    ${U.error ? `<div class="msg warn">${esc(U.error)}</div>` : ''}
    <label class="f">가맹점<input data-f="merchant" value="${esc(d.merchant)}"></label>
    <div class="row"><label class="f">날짜<input type="date" data-f="date" value="${esc(d.date)}"></label>
      <label class="f">결제수단<select data-f="pay" class="${d.pay && !d.payUnsure ? '' : 'unsure'}">${opt(S.pays, d.pay)}</select></label></div>
    <h2>품목</h2>${items}
    <button class="btn s" data-act="addItem">+ 품목 추가</button>
    <div class="row" style="margin-top:8px"><label class="f">쿠폰·포인트·상품권<input data-f="coupon" inputmode="numeric" value="${d.coupon || ''}"></label>
      <label class="f">결제금액<input data-f="amount" inputmode="numeric" value="${d.amount || ''}"></label></div>
  </div>
  <div class="foot"><div id="status"></div><button class="btn p" data-act="save" id="saveBtn">시트에 저장</button></div>`;
}

function updateStatus() {
  const box = document.getElementById('status'), btn = document.getElementById('saveBtn');
  if (!box || !U.draft) return;
  const d = U.draft, b = balance(d), errs = check(d, S.pays);
  const lines = errs.filter(e => e !== 'BAD_BALANCE').map(e => `<div class="sm" style="color:var(--neg-fg)">${esc(errText(e))}</div>`);
  if (errs.includes('BAD_BALANCE')) lines.push(`<div class="sm" style="color:var(--neg-fg)">품목 합계 − 할인 − 쿠폰(${fmt(b.debit - b.credit + d.amount)})과 결제금액(${fmt(d.amount)})이 ${fmt(Math.abs(b.diff))}원 달라요.</div>`);
  const rows = U.rows[+String(d.date).slice(0, 4)];
  if (!errs.length && rows && hasSame(rows, d)) lines.push(`<div class="sm" style="color:var(--warn-fg)">같은 날짜·결제수단·금액 거래가 시트에 이미 있어요. 중복이 아닌지 확인해 주세요.</div>`);
  box.innerHTML = `<div class="sum sm"><span class="mut">차변 ${fmt(b.debit)} · 대변 ${fmt(b.credit)}</span><b class="num">${fmt(d.amount)}원</b></div>` + lines.join('');
  btn.disabled = errs.length > 0 || !!U.saving;
  btn.textContent = U.saving ? '저장 중…' : '시트에 저장';
}

// API 키가 없을 때: Claude 앱(구독)에서 읽힌 답을 붙여넣는다.
function pasteView() {
  return `<div class="bar"><button class="ib" data-act="cancel" aria-label="닫기">✕</button><span class="t">영수증 넣기</span></div><div class="pad">
    ${U.error ? `<div class="msg warn">${esc(U.error)}</div>` : ''}
    <ol class="sm" style="padding-left:20px;line-height:1.7">
      <li><b>질문 복사</b>를 누르세요.</li>
      <li>Claude 앱에서 영수증 사진을 첨부하고 질문을 붙여넣어 보내세요.</li>
      <li>Claude 답을 통째로 복사해 아래에 붙여넣으세요.</li>
    </ol>
    <button class="btn" data-act="copyPrompt" style="width:100%">질문 복사</button>
    <textarea id="answer" placeholder="Claude 답 붙여넣기" style="margin-top:12px">${esc(U.answer)}</textarea>
    <button class="btn p" data-act="loadAnswer" style="width:100%;margin-top:8px">불러오기</button>
    <button class="btn s" data-act="manual" style="width:100%;margin-top:8px">직접 입력</button>
  </div>`;
}

function settingsView() {
  const years = Object.keys(S.years).sort().map(y => `<div class="li"><span class="g"><span>${y}년</span><span class="sm mut">${esc(S.years[y])}</span></span>
    <button class="btn s" data-act="delYear" data-y="${y}">삭제</button></div>`).join('') || '<p class="sm mut">연결된 시트가 없어요.</p>';
  return `<div class="bar"><button class="ib" data-act="back" aria-label="뒤로">‹</button><span class="t">설정</span></div><div class="pad">
    ${GOOGLE_CLIENT_ID ? '' : '<div class="msg err">config.js에 Google OAuth 클라이언트 ID가 없어요. README를 참고해 넣어 주세요.</div>'}
    <h2>Google 계정</h2>
    <p class="sm mut">${signedIn() ? '로그인돼 있어요.' : '로그인 전이에요.'}</p>
    <button class="btn" data-act="login" ${GOOGLE_CLIENT_ID ? '' : 'disabled'}>Google 로그인</button>
    <h2>Claude API 키 (선택)</h2>
    <p class="sm mut">비워 두면 Claude 앱에서 읽힌 답을 붙여넣어요. 넣으면 사진만 찍어도 바로 읽어요(사용량만큼 과금). 이 휴대폰 브라우저에만 저장돼요.</p>
    <input type="password" id="apiKey" value="${esc(S.apiKey)}" placeholder="sk-ant-..." autocomplete="off">
    <h2>연도별 시트</h2>
    <p class="sm mut">개발·확인 중에는 원본이 아닌 <b>사본</b>을 연결하세요.</p>
    <div class="list" style="margin-top:0">${years}</div>
    <div class="row" style="margin-top:8px"><input id="newYear" inputmode="numeric" placeholder="2026" style="flex:0 0 80px"><input id="newSheet" placeholder="시트 URL 또는 ID"></div>
    <button class="btn s" data-act="addYear" style="margin-top:8px">+ 연도 추가</button>
    <h2>결제수단 (시트 계정명, 한 줄에 하나)</h2>
    <textarea id="pays">${esc(S.pays.join('\n'))}</textarea>
    <div style="margin:16px 0"><button class="btn p" data-act="saveSettings" style="width:100%">저장</button></div>
  </div>`;
}

// ---------- 사진 → 인식 ----------
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}

const emptyDraft = () => ({ merchant: '', date: today(), pay: '', payUnsure: true, coupon: 0, amount: 0,
  items: [{ name: '', amt: 0, disc: 0, cat: '', unsure: true }] });

async function onPhoto(file) {
  U.screen = 'confirm'; U.error = ''; U.clientId = crypto.randomUUID(); U.saving = false;
  U.busy = '사진 줄이는 중…'; U.photoUrl = ''; render();
  try {
    U.photoUrl = await shrink(file);
    U.busy = '영수증 읽는 중…'; render();
    const r = await recognize(U.photoUrl.split(',')[1], S.apiKey, CATS);
    const n = r.ok ? normalize(r.json, { cats: CATS, pays: S.pays, today: today() }) : r;
    if (n.ok) U.draft = n.draft;
    else { U.draft = emptyDraft(); U.error = `자동 인식을 못 했어요 (${n.error}). 사진을 보고 직접 채워 주세요.`; }
  } catch (e) {
    U.draft = emptyDraft(); U.error = e.message;
  }
  U.busy = '';
  toConfirm();
}

function toConfirm() {
  U.screen = 'confirm';
  const y = +U.draft.date.slice(0, 4);
  render();
  if (S.years[y] && signedIn() && !U.rows[y]) loadYear(y).then(updateStatus).catch(() => {});
}

function onAnswer(text) {
  const p = parseAnswer(text);
  const n = p.ok ? normalize(p.json, { cats: CATS, pays: S.pays, today: today() }) : p;
  if (!n.ok) { U.answer = text; U.error = n.error === 'NOT_RECEIPT' ? '영수증으로 읽히지 않았어요. 사진을 다시 보내 보세요.' : 'Claude 답에서 JSON을 찾지 못했어요. 답 전체를 복사했는지 확인해 주세요.'; render(); return; }
  U.clientId = crypto.randomUUID(); U.saving = false; U.error = ''; U.answer = ''; U.photoUrl = '';
  U.draft = n.draft; toConfirm();
}

async function save() {
  const draft = U.draft, clientId = U.clientId;
  U.saving = true; updateStatus();
  try {
    await getToken();
    const r = await saveReceipt({ draft, clientId, sheets, store: txStore, yearIds: S.years, pays: S.pays });
    if (!r.ok) {
      U.saving = false;
      U.error = r.error === 'INVALID' ? r.detail.map(e => errText(e)).join(' ') : errText(r.error, r.detail);
      render(); window.scrollTo(0, 0); return;
    }
    const d = draft.date;
    U.y = +d.slice(0, 4); U.m = +d.slice(5, 7); U.d = +d.slice(8, 10);
    U.note = r.already ? '이미 저장된 영수증이에요.' : `${r.year}년 시트 ${r.start}~${r.start + r.count - 1}행에 저장했어요.`;
    U.draft = null; U.photoUrl = ''; U.saving = false;
    await showCalendar(true);
  } catch (e) {
    U.saving = false; U.error = `저장하지 못했어요: ${e.message}. 다시 누르면 이어서 저장해요(중복 없이).`; render();
  }
}

// ---------- 이벤트 ----------
$photo.addEventListener('change', () => { const f = $photo.files[0]; $photo.value = ''; if (f) onPhoto(f); });

$app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-day]');
  if (!t) return;
  if (t.dataset.day) { U.d = +t.dataset.day; U.note = ''; render(); return; }
  const act = t.dataset.act;
  if (U.saving && act !== 'save') return;
  if (act === 'prev' || act === 'next') {
    U.m += act === 'prev' ? -1 : 1;
    if (U.m < 1) { U.m = 12; U.y--; } if (U.m > 12) { U.m = 1; U.y++; }
    U.d = 1; U.note = ''; showCalendar();
  } else if (act === 'reload') showCalendar(true);
  else if (act === 'settings') { U.screen = 'settings'; render(); }
  else if (act === 'back') { if (U.draft) { U.screen = 'confirm'; U.error = ''; render(); } else showCalendar(); }
  else if (act === 'cancel') {
    if (txStore.get(U.clientId)?.status === 'pending') txStore.del(U.clientId);
    U.draft = null; U.photoUrl = ''; U.error = ''; U.answer = ''; showCalendar();
  }
  else if (act === 'shoot') {
    if (!ready()) { U.screen = 'settings'; render(); return; }
    if (S.apiKey) $photo.click(); else { U.screen = 'paste'; U.error = ''; render(); }
  } else if (act === 'copyPrompt') {
    navigator.clipboard.writeText(chatPrompt(CATS)).then(() => { t.textContent = '복사했어요 ✓'; }, () => alert('복사하지 못했어요.'));
  } else if (act === 'loadAnswer') onAnswer(document.getElementById('answer').value);
  else if (act === 'manual') {
    U.clientId = crypto.randomUUID(); U.saving = false; U.error = ''; U.answer = ''; U.photoUrl = '';
    U.draft = emptyDraft(); toConfirm();
  } else if (act === 'login') {
    try { await getToken(true); } catch (err) { alert(err.message); }
    U.screen === 'settings' ? render() : showCalendar(true);
  } else if (act === 'addItem') { U.draft.items.push({ name: '', amt: 0, disc: 0, cat: '', unsure: true }); render(); }
  else if (act === 'delItem') { U.draft.items.splice(+t.dataset.i, 1); render(); }
  else if (act === 'save') save();
  else if (act === 'addYear') {
    const y = int(document.getElementById('newYear').value), id = sheetId(document.getElementById('newSheet').value);
    if (y >= 2000 && id) { S.years[y] = id; keep('ledger.settings', S); U.rows = {}; render(); }
  } else if (act === 'delYear') { delete S.years[t.dataset.y]; keep('ledger.settings', S); render(); }
  else if (act === 'saveSettings') {
    // + 연도 추가를 안 누르고 저장해도 입력한 시트를 연결한다.
    const y = int(document.getElementById('newYear').value), id = sheetId(document.getElementById('newSheet').value);
    if (y >= 2000 && id) { S.years[y] = id; U.rows = {}; }
    S.apiKey = document.getElementById('apiKey').value.trim();
    S.pays = document.getElementById('pays').value.split('\n').map(s => s.trim()).filter(Boolean);
    keep('ledger.settings', S);
    if (U.draft) { U.screen = 'confirm'; U.error = ''; render(); } else showCalendar(true);
  }
});

function onField(e) {
  const t = e.target, d = U.draft;
  if (!d) return;
  if (t.dataset.f) {
    const k = t.dataset.f;
    d[k] = k === 'coupon' || k === 'amount' ? int(t.value) : t.value;
    if (k === 'pay') { d.payUnsure = false; t.classList.toggle('unsure', !t.value); }
  } else if (t.dataset.it) {
    const it = d.items[+t.dataset.it], k = t.dataset.k;
    it[k] = k === 'amt' || k === 'disc' ? int(t.value) : t.value;
    if (k === 'cat') { it.unsure = false; t.classList.toggle('unsure', !t.value); t.closest('.item').classList.remove('unsure'); }
  }
  updateStatus();
}
// iOS Safari는 select·date에서 input 이벤트를 안 낼 때가 있어 change도 듣는다.
$app.addEventListener('input', onField);
$app.addEventListener('change', onField);

// ---------- 시작 ----------
(async () => {
  if (GOOGLE_CLIENT_ID) { try { await initGoogle(GOOGLE_CLIENT_ID); } catch (e) { U.error = e.message; } }
  if (!ready()) { U.screen = 'settings'; render(); return; }
  const p = txStore.pending();
  if (p) {
    [U.clientId, { draft: U.draft }] = p;
    U.screen = 'confirm';
    U.error = '저장이 끝났는지 확인하지 못한 영수증이에요. 저장을 누르면 시트를 확인해 중복 없이 마무리해요. ✕를 누르면 이 기록을 지워요.';
    render(); return;
  }
  showCalendar();
})();
