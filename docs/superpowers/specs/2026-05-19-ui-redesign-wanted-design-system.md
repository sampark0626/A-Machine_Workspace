# A-Machine UI Redesign — Wanted Design System

**Date:** 2026-05-19  
**Approach:** Option B — Wanted 토큰 시스템 기반 + AI 전화 UI 감성 유지  
**Scope:** `client/src/index.css` 전체 교체 + `PhoneUI.jsx`, `AgentSettings.jsx`, `SmsNotification.jsx` 마크업/클래스 수정

---

## 1. 기반 (Foundation)

### 색상 토큰 (CSS Variables)
Wanted `colors_and_type.css` 에서 가져올 핵심 토큰:

```css
/* Primary */
--color-primary-normal: #0066FF;
--color-primary-strong: #005EEB;
--color-primary-pressed: #0054D1;

/* Label */
--color-label-normal: rgba(46, 47, 51, 0.88);
--color-label-neutral: rgba(55, 56, 60, 0.61);
--color-label-alternative: rgba(55, 56, 60, 0.28);

/* Background */
--color-background-normal: #FFFFFF;
--color-background-alternative: #F7F7F8;

/* Line */
--color-line-normal: rgba(112, 115, 124, 0.22);
--color-line-strong: rgba(112, 115, 124, 0.43);

/* Status */
--color-status-negative: #FF4242;
--color-status-positive: #00BF40;

/* Interaction overlay (for hover/press states) */
--color-interaction-hover: rgba(112, 115, 124, 0.08);
--color-interaction-pressed: rgba(112, 115, 124, 0.12);

/* AI 전화 특화 (Wanted Blue 기반) */
--color-ai-glow: rgba(0, 102, 255, 0.20);
--color-ai-glow-fade: rgba(0, 102, 255, 0.00);
--color-bubble-user: #F7F7F8;
--color-bubble-assistant: rgba(0, 102, 255, 0.08);
--color-bubble-agent: rgba(0, 102, 255, 0.12);
```

### 타이포그래피
- 폰트: `Pretendard Variable` (로컬 woff2 로드, 기존 `@font-face` 방식 유지)
- 기본 body weight: 500
- 레터스페이싱: 크기에 따라 tight(display) → loose(caption) 스케일

| 용도 | 크기 | Weight | Letter-spacing |
|------|------|--------|----------------|
| 수신자명 (Title 3) | 24px | 700 | -2.3% |
| 통화 타이머 (Headline 1) | 18px | 600 | -0.2% |
| 트랜스크립트 (Body 2) | 15px | 500 | +0.96% |
| 버튼 레이블 (Label 1) | 14px | 700 | +1.45% |
| 캡션/메타 (Caption 1) | 12px | 700 | +2.5% |

### 간격 (Spacing)
- 4px base scale: 4, 8, 12, 16, 20, 24, 32px
- 폰 내부 horizontal padding: 16px
- 카드 padding: 16–20px
- 버튼 gap: 12px
- 컨트롤 버튼 간 gap: 16px

### Border Radius
- 폰 쉘: 46px (유지)
- 카드/트랜스크립트: 20px
- 버튼: 8px
- 트랜스크립트 버블: 16px
- 알약 태그: 999px
- 컨트롤 버튼 (원형): 50%

### 그림자
- 폰 쉘: `shadow-emphasize-3` (16px blur + 6px spread, cool near-black)
- 트랜스크립트 카드: `shadow-emphasize-1`
- 통화 요약 카드: `shadow-emphasize-2`

---

## 2. 레이아웃

### 데스크탑 배경
```
background: --color-background-alternative (#F7F7F8)
display: flex; justify-content: center; align-items: center; min-height: 100vh
```

### 폰 쉘
```
width: 393px; height: 852px (iPhone 15 Pro 기준)
background: #FFFFFF
border-radius: 46px
box-shadow: shadow-emphasize-3
```

폰 쉘 내부 구조:
1. Dynamic Island (notch) — 유지, 검정
2. 상태바 — 라이트 (시간, 배터리 아이콘)
3. 스크린 영역 (flex column, overflow hidden)
4. 홈 인디케이터 — 라이트 (#000 @ 0.2)

---

## 3. 화면별 스펙

### Idle 화면
- 배경: `#FFFFFF`
- 탭바: 하단 고정, 4탭 (최근통화, 키패드, 즐겨찾기, 연락처)
  - Active: `#0066FF` 아이콘 + label, 상단 2px `#0066FF` 밑줄
  - Inactive: `label-neutral` 색상
- 최근 통화 목록: `list-cell` 패턴
  - Avatar: 40px circle, `#F7F7F8` 배경
  - Title: Body 1 (16px, weight 700)
  - Meta: Label 2 (13px, `label-neutral`)
  - 구분선: `line-normal` 1px
- 통화 시작 CTA: Solid Primary 버튼, Large size, 하단 16px margin
  - `background: #0066FF; color: #FFF; border-radius: 8px; padding: 14px 24px; font: 16px/1 700`
  - hover: `#005EEB`, press: `#0054D1`

### Connecting 화면
- 배경: `#FFFFFF`
- 아바타: 72px circle, 흰 배경
  - Pulse ring: `#0066FF` @ 20%→0%, scale 1→1.4, 1.5s infinite
- 발신/수신 텍스트: Title 3 (24px, 700), `label-normal`
- 상태 텍스트: Body 2 (15px, 500), `label-neutral`
- 3-dot loader: `#0066FF` dots, bounce animation

### Active Call 화면
- 배경: `#FFFFFF`
- 아바타 영역 (상단 32px margin):
  - 72px circle
  - Speaking 상태: `#0066FF` radial glow, scale 1.0→1.06, `--color-ai-glow` keyframe
  - Idle 상태: 그림자 없음
- 이름: Title 3 (24px, 700)
- 타이머: Headline 1 (18px, 600), `label-neutral`
- Assist 모드 배지: `rgba(0,102,255,0.08)` pill badge, `#0066FF` 텍스트, 12px font
- 트랜스크립트 카드:
  - `background: #FFFFFF; border-radius: 20px; box-shadow: shadow-emphasize-1`
  - 내부 padding: 16px; max-height: 220px; overflow-y: auto
  - 버블 (user): `background: #F7F7F8; border-radius: 16px 16px 4px 16px; padding: 8px 12px`
  - 버블 (assistant/agent): `background: rgba(0,102,255,0.08); border-radius: 16px 16px 16px 4px; padding: 8px 12px`
  - 텍스트: Body 2 (15px, 500), `label-normal`
- 컨트롤 패널 (4버튼):
  - 컨테이너: flex row, gap 16px, justify-center, padding 20px 16px
  - 각 버튼: 64px circle, Outlined Neutral 스타일
    - `background: #FFFFFF; border: 1.5px solid rgba(112,115,124,0.22); border-radius: 50%`
    - hover: `rgba(112,115,124,0.08)` fill
    - 아이콘: 24px, `label-normal` color
  - End Call: `background: #FF4242; border: none; color: #FFFFFF`
  - Active 상태 버튼 (mute/agent): `background: rgba(0,102,255,0.08); border-color: #0066FF`

### Ended 화면
- 요약 카드: `background: #FFFFFF; border-radius: 20px; box-shadow: shadow-emphasize-2; padding: 24px`
- Title: Title 3 (24px, 700)
- 섹션 레이블: Label 1 (14px, 700), `label-neutral`
- 내용 텍스트: Body 2 (15px, 500)
- 돌아가기 버튼: Outlined Neutral, Large

---

## 4. 오버레이 컴포넌트

### AgentSettings 모달
- Backdrop: `rgba(0,0,0,0.4)` (Wanted modal overlay)
- 모달 카드: `background: #FFFFFF; border-radius: 24px 24px 0 0` (bottom sheet 형태)
  - slide-up 애니메이션: `translateY(100%) → 0`, ease-out 250ms
- 섹션 헤더: Headline 2 (17px, 600)
- 토글 스위치: `#0066FF` on / `line-normal` off
- 라디오/체크박스: `#0066FF` accent

### SmsNotification 오버레이
- Full-screen: `rgba(0,0,0,0.85)` backdrop
- 알림 카드: `background: #FFFFFF; border-radius: 20px; padding: 24px; shadow-emphasize-3`
- 헤더: Headline 1 (18px, 600)

### Voice Picker Sheet (Bottom Drawer)
- `background: #FFFFFF; border-radius: 24px 24px 0 0; shadow-emphasize-2`
- 핸들: 4px × 36px, `rgba(112,115,124,0.28)`, 위쪽 8px margin
- 음성 목록: list-cell 패턴
- Selected: `background: rgba(0,102,255,0.08)`, `#0066FF` 체크 아이콘

---

## 5. 애니메이션

| 이름 | 용도 | 스펙 |
|------|------|------|
| `pulse-ring` | Connecting 아바타 | scale 1→1.4, opacity 0.2→0, 1.5s infinite |
| `ai-breathing` | Speaking 상태 | scale 1.0→1.06→1.0, 2s ease-in-out infinite |
| `ai-glow` | Speaking glow | box-shadow 0→`0 0 24px rgba(0,102,255,0.3)`→0, 2s |
| `bounce-dots` | Connecting 로더 | translateY 0→-6px→0, staggered 0.15s |
| `sheet-slide-up` | Bottom sheet 등장 | translateY 100%→0, 250ms ease-out |
| `modal-fade-in` | 모달 등장 | opacity 0→1 + translateY 8px→0, 200ms ease-out |

---

## 6. 구현 범위

### 수정 파일
1. `client/src/index.css` — 전체 재작성
   - Wanted 토큰 변수 선언 (colors, type, spacing, radius, shadows)
   - Pretendard Variable @font-face
   - 폰 쉘 스타일
   - 각 화면 스타일 (idle, connecting, active, ended)
   - 오버레이 스타일 (settings, sms, voice picker)
   - 애니메이션 keyframes
2. `client/src/components/PhoneUI.jsx` — 클래스명 및 마크업 정리
   - Wanted 토큰 클래스 적용
   - 불필요한 glassmorphism 제거
3. `client/src/components/AgentSettings.jsx` — 버튼, 토글, 레이아웃 수정
4. `client/src/components/SmsNotification.jsx` — 카드 스타일 수정

### 보존 파일 (변경 없음)
- `App.jsx` — 로직 변경 없음
- `main.jsx` — 변경 없음
- `vite.config.js`, `tsconfig.json` — 변경 없음

### 추가 파일
- `client/public/fonts/PretendardVariable.woff2` — Wanted 폰트 복사
- `client/src/tokens.css` — Wanted 디자인 토큰 전용 파일 (index.css에서 import)

---

## 7. 성공 기준
- [ ] 데스크탑 배경이 `#F7F7F8` 라이트
- [ ] 폰 쉘이 화이트 + shadow-emphasize-3
- [ ] 모든 primary 액션이 `#0066FF`
- [ ] Pretendard 폰트 적용
- [ ] Speaking 애니메이션이 Wanted Blue 기반
- [ ] 버튼/입력 스타일이 Wanted 스펙 준수
- [ ] 다크 배경 / 글래스모피즘 완전 제거
