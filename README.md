# 영수증 가계부

휴대폰으로 영수증을 찍으면 Claude가 품목·할인·결제수단을 읽고, 확인·수정 후 연도별 Google 시트 `1.Transaction`에 복식부기 행을 추가합니다. 첫 화면은 토스식 캘린더이며, 월 합계는 `3. Income Statement` 22행(지출 합계)과 같은 식으로 계산합니다.

- 서버 없는 정적 사이트(GitHub Pages). 시트는 Google 로그인으로, 영수증 인식은 Claude API로 브라우저가 직접 부릅니다.
- Claude API 키는 저장소에 넣지 않습니다. 앱 설정 화면에서 입력하면 **그 기기 브라우저에만** 저장됩니다.
- 설계: `../docs/superpowers/specs/2026-10-30-receipt-ledger-mvp-design.md`

## 시트에 쓰는 행

영수증 1장 = 품목마다 차변 행 + 품목 할인 대변 행 + 쿠폰 배분 대변 행 + 결제 대변 1행 (A~G만, F는 숫자). 차변 합 ≠ 대변 합이면 저장하지 않습니다. 새 행은 A열(월)에 값이 있는 마지막 행 바로 다음에 씁니다.

예: 롯데백화점 2026-10-26 영수증 → 9행, 차변 22,780 = 대변 22,780, 10월 식비 −15,780.

## 처음 설정 (한 번만)

### 1. 영수증 인식 — Claude 앱(구독) 또는 API 키

**기본 (API 키 없음)**: 앱의 **🧾 영수증 넣기** → **질문 복사** → Claude 앱에서 영수증 사진 첨부 + 질문 붙여넣기 → Claude 답을 통째로 복사해 앱에 붙여넣고 **불러오기** → 확인 화면. Pro 구독은 API에 쓸 수 없어 이렇게 사람이 옮깁니다.

**API 키 (선택)**: 넣으면 사진만 찍어도 바로 읽습니다.
1. https://platform.claude.com/settings/keys 에서 이 앱 전용 키를 만듭니다.
2. Billing에서 결제 수단을 등록하고, Limits에서 월 지출 한도를 낮게(예: $5) 걸어 둡니다. 영수증 1장은 1원 안팎입니다(claude-haiku-5-5).
3. 키는 앱 **설정** 화면에 붙여 넣습니다.

### 2. Google OAuth 클라이언트

1. https://console.cloud.google.com 에서 프로젝트를 만듭니다.
2. **API 및 서비스 → 라이브러리**에서 **Google Sheets API**를 사용 설정합니다.
3. **OAuth 동의 화면**: 사용자 유형 **외부**, 앱 이름 입력, 범위는 비워 두고, **테스트 사용자에 본인 Gmail**을 추가합니다. (게시하지 않아도 테스트 사용자는 쓸 수 있습니다.)
4. **사용자 인증 정보 → OAuth 클라이언트 ID 만들기**: 유형 **웹 애플리케이션**, **승인된 JavaScript 원본**에 `https://<GitHub 아이디>.github.io` 를 넣습니다. (로컬 확인용으로 `http://localhost:8000` 도 추가 가능)
5. 만들어진 클라이언트 ID를 `config.js`의 `GOOGLE_CLIENT_ID`에 넣고 커밋합니다. 클라이언트 ID는 공개돼도 되는 값입니다.

회사 Google Workspace 계정이라면 관리자 정책 때문에 외부 앱 로그인이 막힐 수 있습니다. 가계부 시트를 가진 개인 Gmail 계정으로 진행하세요.

### 3. 시트 연결 — 먼저 사본으로

1. Google Drive에서 `재푸제표(2026)` 시트를 **사본 만들기** 합니다. (xlsx라면 Google 시트로 열어 저장)
2. 앱 **설정 → 연도별 시트**에 `2026` + 사본 URL을 추가합니다.
3. 아래 "확인 방법"이 맞으면, 설정에서 사본을 지우고 원본 URL을 연결합니다.
4. 작년 날짜 영수증을 저장하려면 그 연도 시트도 추가합니다.

### 4. GitHub Pages

```bash
git remote add origin https://github.com/<아이디>/ledger-app.git
git push -u origin main
```

저장소 **Settings → Pages → Build and deployment**: Source `Deploy from a branch`, Branch `main` / `/(root)`. 몇 분 뒤 `https://<아이디>.github.io/ledger-app/` 에서 열립니다. 휴대폰 브라우저에서 열고 홈 화면에 추가해 두면 앱처럼 쓸 수 있습니다.

## 확인 방법 (사본으로)

1. 앱에서 `../img/1.jpg`(롯데백화점 영수증)를 찍거나 앨범에서 고릅니다.
2. 확인 화면: 품목 4개, 할인 3,000/1,500/1,900/600, 결제수단 삼성카드, 결제금액 15,780, "차변 22,780 · 대변 22,780".
3. 저장 → "2026년 시트 1105~1113행에 저장했어요" (사본 데이터가 1104행에서 끝날 때).
4. 사본 `3. Income Statement` 10월(N열): 식비(33행)·지출(22행)·Surplus/Loss(50행)가 각각 −15,780 바뀌고 다른 달은 그대로.
5. 앱 캘린더 10월 합계 = Income Statement N22.

## 개발

```bash
npm test          # node --test, 순수 모듈(src/ledger·receipt·sheet·save·claude) 단위 테스트
python -m http.server 8000   # 로컬에서 열기 → http://localhost:8000
```

| 파일 | 역할 |
|---|---|
| `src/ledger.js` | 카테고리 15개, 결제수단 기본값, 쿠폰 배분, 행 만들기, 저장 전 검사 |
| `src/receipt.js` | Claude 응답 스키마·프롬프트, 응답 → 초안, 결제수단 매핑 |
| `src/sheet.js` | 머리글·마지막 행, Income Statement 범위, 월·일 지출, 그날 거래 묶기 |
| `src/save.js` | 중복 없는 저장 순서 (기기 저장 기록 pending/done) |
| `src/claude.js` | Messages API 호출 (`claude-haiku-5-5`, 구조화 출력) |
| `src/google.js` | Google 로그인 + Sheets API (브라우저 전용) |
| `app.js` | 화면: 캘린더 · 영수증 확인 · 설정 |

## 알아둘 점

- 저장 기록(중복 방지)은 기기별입니다. 같은 영수증을 다른 기기에서 다시 찍으면 확인 화면에 "같은 날짜·결제수단·금액 거래가 있어요" 경고가 뜹니다.
- 카테고리는 Income Statement에 집계되는 15개만 고를 수 있습니다(`미분류`·`잡비`·`병원` 불가). 기존 시트의 `미분류` 거래는 캘린더에 "집계 안 됨"으로 보이고 합계에서는 빠집니다.
- 나눠 결제(카드 + 상품권·포인트)는 상품권·포인트 금액을 "쿠폰·포인트·상품권" 칸에 넣습니다.
- 앱은 `1.Transaction` A~G 외에는 쓰지 않습니다. Income Statement 수식 범위(2026: 12074행)를 넘으면 저장을 멈추고 알려 줍니다.
