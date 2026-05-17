# A-Machine v2 (OpenAI Realtime GA 마이그레이션 및 버그 조치) 구현 계획서

## 1. 개요 및 배경
A-Machine 서비스는 OpenAI Realtime API를 도입하여 실시간 일정 관리 및 전화 응대 기능을 수행합니다. 그러나 최근 OpenAI가 Realtime API Beta(v1)를 공식 종료하고 **GA(General Availability)**로 전환함에 따라 기존 구현에서 아래와 같은 호환성 문제와 에러가 발생하였습니다:
1. `session.modalities` 및 `session.voice` 에러 (v1.0.0 Beta가 아닌 GA 스키마 적용에 따른 헤더 불일치)
2. `session.type` 누락 에러 (GA 스키마에서는 세션 용도를 명시해야 함)
3. 지원 종료된 `nova` 음성 사용 시 발생하는 에러
4. Render 배포 시 root 경로(`GET /`) 라우트 부재로 인한 `Cannot GET /` 현상
5. 통화 종료 기능이 제대로 정리되지 않아 통화가 끊기지 않는 문제

이 계획서는 이러한 문제점들을 완벽하게 조치하고, 안정적인 Low-Latency 실시간 음성 응대 서비스를 배포하는 것을 목표로 합니다.

---

## 2. 주요 조치 사항 및 설계

### 가. 백엔드 (Server) 개선
1. **OpenAI Realtime GA 마이그레이션**:
   - `realtimeSession.js`에서 기존 `'OpenAI-Beta': 'realtime=v1'` 헤더를 완전히 제거합니다. 이를 통해 OpenAI 서버가 GA 엔드포인트로 올바르게 라우팅하도록 합니다.
   - WebSocket URL 모델명을 최신 GA 모델인 `gpt-4o-realtime-preview-2024-12-17`로 명시 및 고정합니다.
   - `session.update` 이벤트 내에 필수 GA 규격인 `"type": "realtime"` 파라미터를 추가하여 스키마 유효성 검사를 통과시킵니다.
2. **기본 음성 변경**:
   - 지원이 중단된 `'nova'` 대신 안정적이고 자연스러운 남성/여성 기본 음성인 `'alloy'`로 기본값을 교체합니다.
3. **서버 헬스체크 및 웰컴 라우트 추가**:
   - `index.js`에 root `GET /` 라우트를 추가하여 Render 등 호스팅 환경에서 서비스 구동 시 웰컴 메시지를 반환하게 하고, `Cannot GET /` 에러를 완벽하게 해소합니다.

### 나. 프론트엔드 (Client) 개선
1. **음성 선택 옵션 정리**:
   - `VoiceSelector.jsx`에서 지원이 불가능해진 `'nova'` 옵션을 완벽히 제거하고, `'alloy'`, `'echo'`, `'shimmer'` 등 정상 동작하는 GA 음성 옵션들만 사용자에게 노출합니다.
2. **안정적인 통화 종료 수명 주기 구현**:
   - `App.jsx`에서 통화 종료 시 오디오 스트림, 미디어 송수신 WebSocket, RTC Peer Connection을 순차적으로 안전하게 close 하고 해제(`null`)하도록 수정하여, 메모리 누수를 방지하고 즉각적이고 안정적인 통화 종료를 보장합니다.
3. **에러 로깅 고도화**:
   - OpenAI 에러를 보다 직관적으로 표시하고 디버깅하기 위해 nested 된 JSON 형태의 에러도 예쁘게 파싱하여 화면 로그창에 보여줄 수 있도록 에러 로거를 보완합니다.

---

## 3. 변경 파일 목록

### 백엔드 (Server)
*   **[MODIFY] [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)**:
    - OpenAI-Beta 헤더 제거 및 URL 모델명 업그레이드
    - `session.update` 시 `type: 'realtime'` 설정 추가
    - 기본 목소리를 `'alloy'`로 설정
*   **[MODIFY] [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)**:
    - `app.get('/', ...)` 라우트 등록을 통한 웰컴 메시지 서빙

### 프론트엔드 (Client)
*   **[MODIFY] [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)**:
    - 음성 기본값 `'alloy'`로 동기화
    - `endCall()` 시 모든 미디어 및 통신 객체의 명시적 해제 로직 구현
    - 예외/에러 파싱 로거 고도화
*   **[MODIFY] [VoiceSelector.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/VoiceSelector.jsx)**:
    - `'nova'` 옵션 제거 및 지원되는 목소리 목록 업데이트

---

## 4. 검증 계획

### 자동 및 수동 검증 단계
1. **백엔드 서버 진입**:
   - `https://a-machine-workspace.onrender.com`에 접근하여 `Cannot GET /`이 발생하지 않고 정상 가동 메시지가 나오는지 검증합니다.
2. **프론트엔드 접속**:
   - `https://a-machine-workspace.vercel.app`에 접근하여 깔끔하고 세련된 UI를 확인합니다.
3. **음성 통화 테스트**:
   - '전화 걸기' 버튼을 클릭한 뒤, 마이크 권한을 승인하고 연결을 시작합니다.
   - OpenAI의 GA Realtime API 세션이 정상 연결되며, 통화 경과 시간이 정상적으로 올라가고 음성이 전달되는지 확인합니다.
4. **통화 종료 검증**:
   - '통화 종료' 버튼 클릭 시 즉시 통화가 끊기며, 모든 리소스가 깔끔히 회수되는지 확인합니다.
