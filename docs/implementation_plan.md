# Google Calendar 실제 API 연동 구현 계획

현재 `server/lib/calendarTools.js` 파일에 하드코딩 되어 있는 가짜(Mock) 일정 데이터 로직을 삭제하고, 실제 Google Calendar API와 연동하여 동작하도록 백엔드 코드를 리팩토링합니다.

---

## User Review Required

> [!IMPORTANT]
> **1. 환경변수 확인 (`GOOGLE_REFRESH_TOKEN`)**
> - 사용자의 `server/.env` 파일에 `GOOGLE_REFRESH_TOKEN` 환경변수가 주입되어야 정상 동작합니다.
> - 구현 코드에서는 `process.env.GOOGLE_REFRESH_TOKEN`을 통해 해당 토큰을 주입받아 OAuth2 클라이언트를 인증합니다.

> [!NOTE]
> **2. `googleapis` 패키지 설치 여부**
> - 이미 `server/package.json` 파일의 `dependencies`에 `"googleapis": "^144.0.0"`가 명시되어 있으며, `node_modules` 폴더가 존재합니다. 따라서 추가적인 `npm install`은 불필요하지만, 만약 패키지 설치 오류가 발생할 경우 `npm install`을 다시 실행할 수 있도록 안내하겠습니다.

---

## Proposed Changes

### 백엔드 (Server)

#### [MODIFY] [calendarTools.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/calendarTools.js)

- **OAuth2 클라이언트 연동**:
  - `googleapis` 패키지를 사용해 `getOAuth2Client()` 헬퍼 함수를 재작성합니다.
  - `GOOGLE_REFRESH_TOKEN`을 사용하여 `client.setCredentials()`를 설정합니다. 이를 통해 만료된 access token이 요청 시 자동으로 갱신됩니다.
  
- **`checkCalendar(date)` 함수 실제 API 연동**:
  - `calendar.events.list` 메서드를 호출하여 지정된 `date` (예: "2026-05-20")의 `00:00:00+09:00`부터 `23:59:59+09:00`까지의 범위를 조회합니다.
  - 조회 결과(`items`)가 비어 있는 경우 `"해당 날짜에는 등록된 일정이 없습니다."`를 반환합니다.
  - 일정이 있는 경우, 각 일정의 시작 시간과 종료 시간을 한국 시간(KST, `Asia/Seoul`) 기준으로 포맷팅(예: `14:00 ~ 15:00: 주간 회의`)하여 에이전트(LLM)가 읽기 쉽도록 줄바꿈 텍스트로 합성해 반환합니다.

- **`createCalendarEvent(eventData)` 함수 실제 API 연동**:
  - 기존의 `{ summary, start_time, end_time, description }` 형식과 프롬프트에서 정의한 `{ date, startTime, endTime, title, description, callerName, callerNumber }` 형식을 **모두 호환**할 수 있도록 파라미터 매핑 로직을 유연하게 구현합니다.
  - 만약 `date`, `startTime`, `endTime`이 전달되면 한국 시간대(`+09:00`) 기준의 ISO 8601 `dateTime`으로 조합합니다.
  - `callerName` 및 `callerNumber` 정보가 존재할 경우, 일정의 `description`에 자동으로 발신자 정보를 추가하여 캘린더 등록의 편의성을 높입니다.
  - `calendar.events.insert` 메서드를 사용하여 일정을 실제로 Google Calendar에 등록하고, 자연스러운 한국어 문장으로 성공 메시지와 일정 요약을 반환합니다.

- **Mock 코드 제거 및 에러 핸들링**:
  - `getMockCalendarData`, `getMockCreateResult`, `findAvailableSlots` 등 기존의 가짜 데이터와 가짜 슬롯 계산 로직을 모두 삭제합니다.
  - 상세한 `try-catch` 구문을 작성하여 캘린더 API 호출 실패 시 에이전트가 통화 중인 사용자에게 자연스럽게 에러 상황을 전달할 수 있도록 명확하고 부드러운 한국어 에러 메시지를 반환합니다.
    - 예: `"죄송합니다. 캘린더 일정을 조회하는 중에 일시적인 오류가 발생했습니다. 수민님께 이 내용을 메모로 남겨드릴까요?"`

---

## Verification Plan

### Automated Tests
- Google Calendar API의 정상 호출 여부를 검증하기 위한 간단한 테스트 스크립트를 작성하여 로컬에서 실행해보거나, 서버를 시작하고 API 오류 여부를 로깅으로 확인합니다.
- Node.js 서버를 `npm run dev`로 구동하여 문법 에러나 빌드 에러가 없는지 검증합니다.

### Manual Verification
- 서버 구동 상태를 확인하고, 실제 Google Calendar에 일정이 등록되는지 웹 브라우저 또는 Google Calendar 서비스 상에서 실시간 확인합니다.
