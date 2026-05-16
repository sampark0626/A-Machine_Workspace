# A-Machine v2: OpenAI Realtime API 기반 엔서링머신 에이전트

기존 CSM+RunPod 기반의 A-Machine v1을 **OpenAI Realtime API** 기반의 v2로 전면 재구축합니다.
GPU 없이 동작하며, Google Calendar 연동과 통화 요약 전달 기능을 추가합니다.

## User Review Required

> [!IMPORTANT]
> ### 아키텍처 전환
> 기존 `app.py`(Streamlit + CSM + Whisper + RunPod)를 **완전히 새로운 구조**로 대체합니다.
> - 프론트엔드: **Vite + React** (기존 Streamlit 대체)
> - 백엔드: **Node.js + Express + WebSocket** (기존 Python 대체)
> - AI: **OpenAI Realtime API** (기존 CSM + Whisper + Gemini 대체)
> - 기존 `app.py`는 삭제하지 않고 `legacy/` 폴더로 보존합니다.

> [!WARNING]
> ### API 키 필요
> 아래 API 키가 해커톤 시작 전에 준비되어야 합니다:
> 1. **OpenAI API Key** (Realtime API 접근 권한 포함)
> 2. **Google Calendar API** OAuth 2.0 Client ID (Google Cloud Console에서 발급)

## Open Questions

1. **프론트엔드 프레임워크**: React(Vite)로 진행할까요, 아니면 기존 Streamlit을 유지하면서 WebSocket만 교체할까요?
2. **통화 요약 전달 채널**: 통화 종료 후 요약을 어디로 전달할까요? (Slack, 카카오톡, 이메일, SMS 중 선택)
3. **Google Calendar 계정**: 데모용 Google 계정이 준비되어 있나요?

---

## 시연 시나리오 매핑

| 시연 장면 | 기능 | 구현 방식 |
|----------|------|----------|
| ① 자연스러운 통화 응대 | 실시간 음성 대화 | OpenAI Realtime API (WebRTC/WebSocket) |
| ② 캘린더 확인 & 일정 협상 | Function Calling → Google Calendar | Realtime API `tools` + Google Calendar API |
| ③ 통화 요약 전달 | 대화 기록 요약 → 수신자 알림 | GPT-4o-mini 요약 + Slack/Email Webhook |
| ④ 목소리 변경 | 음성 프리셋 전환 | `session.update`로 voice 파라미터 변경 |

---

## Proposed Changes

### 프로젝트 구조

```
A-Machine_Workspace/
├── legacy/                     # 기존 v1 코드 보존
│   ├── app.py
│   ├── requirements.txt
│   └── ...
├── server/                     # [NEW] Node.js 백엔드
│   ├── index.js                # Express + WebSocket 서버
│   ├── lib/
│   │   ├── realtimeSession.js  # OpenAI Realtime API 세션 관리
│   │   ├── calendarTools.js    # Google Calendar Function Calling
│   │   └── summaryNotifier.js  # 통화 요약 & 전달
│   ├── package.json
│   └── .env.example
├── client/                     # [NEW] React 프론트엔드
│   ├── src/
│   │   ├── App.jsx             # 메인 앱
│   │   ├── components/
│   │   │   ├── PhoneUI.jsx     # 통화 화면 (기존 UI 계승)
│   │   │   ├── Dashboard.jsx   # 대시보드 (일정, 메모, 요약)
│   │   │   ├── VoiceSelector.jsx # 음성 변경 UI
│   │   │   └── CallSummary.jsx # 통화 종료 후 요약 화면
│   │   ├── hooks/
│   │   │   └── useRealtimeAudio.js # WebSocket 오디오 스트림 훅
│   │   ├── index.css           # 기존 A-Machine 다크 테마 계승
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .env.example                # [MODIFY] v2용 환경 변수
└── README.md                   # [MODIFY] v2 설명서
```

---

### 백엔드 (server/)

#### [NEW] [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)
- Express 서버 + WebSocket 엔드포인트
- 클라이언트 ↔ OpenAI Realtime API 중계
- CORS, 헬스체크, 세션 관리

#### [NEW] [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)
- OpenAI Realtime API WebSocket 연결 관리
- 시스템 프롬프트 설정 (한국어 엔서링머신 역할)
- `session.update`로 voice 파라미터 실시간 변경
- Function Calling 이벤트 핸들링
- 가용 음성 목록: `alloy`, `echo`, `nova`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`

핵심 로직:
```javascript
// 세션 초기화 시 tools 정의 (Function Calling)
session: {
  instructions: SYSTEM_PROMPT_KO,
  voice: 'nova',  // 기본 음성
  tools: [
    {
      type: 'function',
      name: 'check_calendar',
      description: '수신자의 Google Calendar에서 특정 날짜의 일정을 확인합니다',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD 형식의 날짜' }
        },
        required: ['date']
      }
    },
    {
      type: 'function',
      name: 'create_calendar_event',
      description: '수신자의 Google Calendar에 새 일정을 등록합니다',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          start_time: { type: 'string', description: 'ISO 8601 형식' },
          end_time: { type: 'string', description: 'ISO 8601 형식' },
          description: { type: 'string' }
        },
        required: ['summary', 'start_time', 'end_time']
      }
    }
  ],
  turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 600 }
}
```

#### [NEW] [calendarTools.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/calendarTools.js)
- Google Calendar API OAuth2 인증
- `check_calendar(date)`: 특정 날짜 일정 조회 → 빈 시간대 반환
- `create_calendar_event(...)`: 새 일정 생성
- Function Calling 결과를 Realtime API로 반환

#### [NEW] [summaryNotifier.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/summaryNotifier.js)
- 통화 종료 시 대화 기록(transcript) 수집
- GPT-4o-mini로 통화 요약 생성
- Slack Webhook / 이메일로 수신자에게 전달
- 요약 형식: 발신자 정보, 핵심 용건, 등록된 일정, 조치 필요 사항

---

### 프론트엔드 (client/)

#### [NEW] [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)
- 2컬럼 레이아웃 (좌: Dashboard, 우: PhoneUI) — 기존 v1 구조 계승
- WebSocket 연결 상태 관리
- 전체 앱 상태(통화 상태, 대화 기록, 요약 등) 관리

#### [NEW] [PhoneUI.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/PhoneUI.jsx)
- 기존 `phone-shell` 디자인 계승 (다크 테마, 라운드 코너)
- 마이크 버튼 (녹음 시작/중지)
- 실시간 자막 표시 (response.audio_transcript.delta)
- 대화 버블 UI
- 통화 종료 버튼

#### [NEW] [Dashboard.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/Dashboard.jsx)
- 통화 상태 (대기/통화중/종료)
- 의도 분류 실시간 표시
- 자동 등록 일정 목록 (Google Calendar 연동)
- 자동 등록 메모
- 통화 핵심 요약

#### [NEW] [VoiceSelector.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/VoiceSelector.jsx)
- 9가지 음성 프리셋 선택 UI
- 선택 시 `session.update`로 실시간 음성 변경
- 음성별 미리듣기 (이름, 특성 설명)

#### [NEW] [CallSummary.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/CallSummary.jsx)
- 통화 종료 후 자동 표시
- AI 생성 통화 요약
- 등록된 일정 목록
- "수신자에게 전달" 버튼 (Slack/Email)

#### [NEW] [useRealtimeAudio.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/hooks/useRealtimeAudio.js)
- WebSocket을 통한 오디오 스트림 관리
- 마이크 → PCM16 24kHz 변환 → 서버 전송
- 서버 → 오디오 디코딩 → 스피커 출력
- VAD(Voice Activity Detection) 상태 표시

#### [NEW] [index.css](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/index.css)
- 기존 A-Machine v1의 다크 테마 CSS 변수 계승
- `--bg`, `--panel`, `--accent`, `--text` 등 기존 디자인 토큰 유지
- phone-shell, bubble, dashboard 스타일 재구현

---

### 시스템 프롬프트 (핵심)

```
## 역할
당신은 수신자를 대신해 전화를 받는 AI 엔서링머신 에이전트 "A-Machine"입니다.

## 성격과 톤
- 따뜻하고 전문적인 한국어 상담사
- 자연스러운 존댓말 사용
- 간결한 발화 (15초 이내)
- 적절한 추임새 ("네", "그렇군요", "알겠습니다")

## 핵심 업무
1. 인사: "안녕하세요, [수신자이름]님의 AI 비서 에이머신입니다. 무엇을 도와드릴까요?"
2. 용건 파악 및 메모 기록
3. 일정 관련 요청 시 → check_calendar 도구로 캘린더 확인 → 빈 시간 안내 → 협상 → create_calendar_event로 등록
4. 통화 마무리 및 메시지 접수 확인

## 캘린더 협상 규칙
- 발신자가 날짜를 말하면 check_calendar로 해당 날짜 일정 확인
- 비어있는 시간대를 먼저 제안: "그 날 오후 2시부터 4시까지 비어있는데요, 괜찮으실까요?"
- 발신자가 동의하면 create_calendar_event로 등록
- 발신자가 다른 시간을 원하면 대안 제시

## 제약
- 수신자 대신 의사결정을 하지 마세요
- 확실하지 않은 정보는 "확인 후 연락드리겠습니다"로 안내
- 개인정보 최소 수집
```

---

## Verification Plan

### Automated Tests
```bash
# 서버 시작
cd server && npm run dev

# 클라이언트 시작
cd client && npm run dev

# 브라우저에서 http://localhost:5173 접속
```

### 시연 테스트 시나리오
1. **장면 ①**: 페이지 접속 → 통화 시작 → "안녕하세요, 김과장님 자리에 계신가요?" → AI 자연스러운 응대 확인
2. **장면 ②**: "내일 오후에 미팅 잡고 싶은데요" → AI가 캘린더 확인 → "내일 오후 2시~4시 비어있습니다" → 일정 등록
3. **장면 ③**: 통화 종료 → 대시보드에 요약 표시 → "수신자에게 전달" 버튼 → Slack/Email 전송
4. **장면 ④**: VoiceSelector에서 음성 변경 → 즉시 다른 목소리로 응답 확인

### Manual Verification
- 한국어 자연스러움 청취 테스트
- 끼어들기(barge-in) 동작 확인
- 다양한 시나리오(일정, 메모, 긴급) 테스트
