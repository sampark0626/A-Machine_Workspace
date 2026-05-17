# A-Machine v2 에코 개선, 사전 목소리 선택, 한국어 최적화 및 모바일 반응형 UI 조치 계획서

## 1. 개요 및 배경
A-Machine v2 (OpenAI Realtime API) 배포 이후, 실사용 시나리오와 모바일 데모 과정에서 접수된 세 가지 불편 사항을 완벽하게 수정하기 위한 구현 계획서입니다. 추가적으로 수신자 호칭을 `'김부장'`에서 `'수민님'`으로 세련되게 변경하고, 가장 한국어 구현이 자연스러운 목소리 `'Sage'`를 기본값으로 지정하여 완벽한 시연 환경을 갖추고자 합니다.

### 해결할 문제점 및 개선 요청 사항
1. **호칭 변경**: '김부장' 대신 트렌디한 **'수민님'** 호칭 적용.
2. **한국어 최적화 목소리 및 셋팅**: OpenAI Realtime API에서 한국어를 가장 자연스럽고 명확하게 구사하는 지적이고 차분한 여성 음성 **'Sage'**를 기본 설정하고, 한국어 프롬프트 억양 및 속도 셋팅 최적화.
3. **에코 피드백 및 자가 반복 응답**: AI 스피커 출력이 끝나는 시점과 브라우저의 실제 재생 시간 차이로 인해, 마이크가 AI 목소리를 다시 수집하여 끊임없이 반복 응답하는 문제.
4. **사전 목소리 선택 불가**: 통화가 시작된 후에만 목소리 변경이 가능하여, 첫 인사("안녕하세요, 수민님의 AI 비서 에이머신입니다...")는 무조건 기본 목소리로 나오는 문제.
5. **모바일 반응형 UI 엉망**: 1024px 이하 해상도 및 모바일 뷰포트에서 다이얼 카드가 가로로 배치되거나 요소들이 비정상적으로 구겨지고 넘치는 문제.

---

## 2. 주요 조치 사항 및 설계

### 가. 호칭 및 한국어 구현 최적화 설정
- **수신자 정보**: `server/.env` 및 `realtimeSession.js`에서 기본 수신자명을 `'수민님'`으로 수정합니다.
- **가장 자연스러운 한국어 목소리 적용**: 기본 목소리를 `'alloy'`에서 한국어 발화가 가장 지적이고 발음이 명확하다고 평가받는 **'sage'**로 전면 전환합니다 (`App.jsx` 및 `realtimeSession.js`).
- **한국어 발화 셋팅 튜닝**: `SYSTEM_PROMPT`에 한국어 억양, 발음 자연스러움, 격식 있는 일정 조율 표현, 그리고 부드럽고 기계적이지 않은 비서 톤앤매너 규칙을 추가합니다.

### 나. 에코 방지 수명 주기 강화 (Mic Gate & Web Audio API 동기화)
- **원인**: `isModelSpeakingRef.current`가 WebSocket 오디오 전달 완료(done) 이벤트와 매핑되어 실제 소리가 완전히 브라우저 스피커로 나오기 전에 마이크 게이트가 열려 에코 루프 발생.
- **해결**: Web Audio API의 `AudioContext.currentTime`과 스케줄링된 버퍼 재생 시간(`playbackTimeRef.current`)을 직접 비교하여, 실제 재생이 물리적으로 끝날 때까지 마이크 입력을 차단하는 차단 게이트 구현.
- **여유 안전 버퍼(Safety Padding)**: 물리적인 스피커 소리 감쇠 및 실내 울림(reverberation) 시간을 고려해 `+ 0.3초(300ms)`의 여유 값을 더해 철저히 방어.
```javascript
const isSpeaking = isModelSpeakingRef.current || (
  playbackContextRef.current &&
  playbackContextRef.current.currentTime < (playbackTimeRef.current + 0.3)
);
if (echoGuardRef.current && isSpeaking) return; // 전송 차단
```

### 다. 통화 연결 전 목소리 선택 기능 (Pre-call Voice Selector)
- **프론트엔드**: 
  - `VoiceSelector` 컴포넌트의 렌더링 조건을 `{callState === 'active'}`에서 `{callState !== 'ended'}`로 확장하여 통화 전 대기 중(`idle`)일 때도 목소리를 고를 수 있도록 배치.
  - WebSocket 최초 연결 시 선택된 목소리(`currentVoice`)를 쿼리 파라미터(`?voice=alloy`)로 전달.
- **백엔드**: 
  - `server/index.js`에서 연결 요청 객체(`req`)를 `handleRealtimeConnection`에 전달.
  - `realtimeSession.js`에서 `req.url`을 파싱해 클라이언트가 지정한 `voice` 파라미터를 읽고, 최초 세션 생성(`session.created`) 시 해당 목소리로 `session.update`를 수행.

### 라. 모바일 최적화 반응형 UI 개선 (Responsive Design & Media Queries)
- **1024px 이하 (테블릿/대화면 모바일)**: 
  - `.phone-wrapper`를 세로 플렉스(`flex-direction: column`)로 변경해 다이얼 카드와 목소리 선택 카드가 위아래로 넓고 예쁘게 배치되도록 수정.
- **768px 이하 (표준 모바일)**:
  - 전체 앱 패딩 감소, 헤더 세로 정렬 및 배치 최적화.
  - 다이얼 카드(`.phone-shell`)의 내부 둥글기 및 여백 조정.
- **480px 이하 (소형 모바일)**:
  - 대시보드의 상태 카드(`.status-cards`)를 1열로 변환하여 글씨가 찌그러지는 현상 예방.
  - 목소리 그리드(`.voice-grid`)를 2열 구조로 변환하여 터치 영역 확보 및 가독성 극대화.
  - SMS 팝업(`.sms-container`)의 가로 너비가 화면을 뚫고 나가지 않도록 `width: 90%; max-width: 380px`로 개선.

---

## 3. 변경 파일 목록

### 백엔드 (Server)
*   **[MODIFY] [server/.env](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/.env)**:
    - `RECEIVER_NAME=수민님`으로 수정.
    - `OPENAI_REALTIME_VOICE=sage` 설정 추가.
*   **[MODIFY] [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)**:
    - `handleRealtimeConnection(clientWs, req)`로 `req` 전달 추가.
*   **[MODIFY] [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)**:
    - 기본 목소리를 `'sage'`로 설정.
    - `SYSTEM_PROMPT`에서 호칭 수정 및 한국어 자연스러움 튜닝 규칙 보강.
    - `req.url` 쿼리 파라미터에서 `voice` 추출하여 최초 세션 음성으로 적용.

### 프론트엔드 (Client)
*   **[MODIFY] [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)**:
    - `currentVoice` 기본값을 `'sage'`로 설정.
    - `onaudioprocess`에서 `playbackContextRef.current.currentTime`을 이용한 실시간 에코 차단 필터 적용.
    - `startCall`에서 `new WebSocket(`${WS_URL}?voice=${currentVoice}`)` 주소로 연결.
    - `VoiceSelector`가 대기 및 연결 중일 때도 렌더링되도록 조건 조정.
*   **[MODIFY] [index.css](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/index.css)**:
    - 1024px, 768px, 480px 단위의 정교한 반응형 디자인 및 스타일 보완.

---

## 4. 검증 계획
- 통화 시작 전 'Sage'로 음성이 설정되어 있는지 확인 후 통화를 개시하여 Shimmer 또는 Sage의 가장 자연스러운 음성인지 파악.
- 물리적 에코 및 피드백 현상이 완전히 제거되었는지 스피커 통화로 마이크 간섭 여부를 테스트.
- 모바일 가로/세로 레이아웃이 찌그러짐 없이 완벽한지 에뮬레이터로 더블 체크.
