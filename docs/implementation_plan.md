# 🎙️ A-Machine v2 한국어 최적화 및 프리미엄 비서 시스템 구현 계획서 (Implementation Plan)

본 문서는 OpenAI Realtime API 기반의 대화형 자동 응답기 **A-Machine v2**의 핵심 아키텍처, 성능 튜닝, 오디오 에코 방지, 그리고 한국어 발화 자연스러움 극대화를 위해 수립 및 반영된 종합 구현 계획서입니다. 

---

## 1. 🎯 개요 및 배경

A-Machine v2 서비스 배포 후 실시간 통화 시연 과정에서 발신자가 기계적 피로감을 느끼지 않고 통화를 매끄럽게 유지할 수 있도록 대화 및 기술 파이프라인을 전면 혁신하였습니다.

### 📌 개선 및 구현 목표
1. **수신인 호칭 변경**: 기존의 딱딱한 호칭 '김부장'을 세련되고 친근한 **'수민님'**으로 전격 변경.
2. **한국어 최적화 목소리 도입**: OpenAI Realtime API 음성 중 한국어 발화 억양 및 발음이 가장 자연스럽고 지적인 **`'Marin'`** 보이스를 기본값으로 지정.
3. **에코 및 자가 피드백 차단**: 브라우저 오디오 출력 소리가 다시 마이크로 입력되어 무한 반복 답변을 생성하는 피드백 루프의 원천 차단.
4. **사전 목소리 선택 (Pre-call Selector)**: 통화 시작 전 대기 화면에서 원하는 목소리를 미리 선택하여 첫 인사 발화부터 맞춤형으로 출력되도록 지원.
5. **모바일 반응형 프리미엄 UI**: 해커톤 오프라인 현장 시연을 고려하여 모바일 기기(아이폰, 갤럭시 등) 액정 내에서 UI 깨짐 없이 완벽하게 동작하는 유연한 화면 설계.

---

## 2. 🛠️ 아키텍처 및 세부 설계

### 가. 실시간 음성 스트리밍 및 Dynamic Voice 연동
* **구조**: Client ↔ Node.js Server ↔ OpenAI Realtime API 간의 이중 WebSockets 연결 구성.
* **음성 연동**: 클라이언트 대기 중(`idle`) 또는 연결 중(`connecting`) 화면에 목소리 칩 리스트를 노출합니다. 클라이언트가 선택한 `currentVoice`는 WebSocket 핸드셰이크 요청 시 쿼리 파라미터(`?voice=marin`)로 서버에 전송됩니다.
* **백엔드 매핑**: 서버 [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)는 클라이언트의 `req` 객체를 [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)로 온전히 위임하고, 서버는 `req.url`의 쿼리 파라미터를 파싱하여 `session.created` 최초 세션 셋업 때 이를 dynamic하게 세션에 등록합니다.

### 나. 타임라인 기반 Echo Guard (마이크 게이트 설계)
* **문제 정의**: AI의 발화가 물리적 스피커를 통해 나오는 도중 브라우저 마이크가 이 소리를 수집하여 OpenAI 서버로 송신, AI가 자신의 말을 다시 경청하고 대답하는 에코 루프 발생.
* **해결 조치**: 
  - [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)의 마이크 입력 수집부(`onaudioprocess`)에 정밀한 재생 타임라인 비교 연산식 탑재.
  - Web Audio API의 실제 물리 재생 시점(`playbackContextRef.current.currentTime`)과 데이터 큐 기반의 스케줄링 재생 완료 시점(`playbackTimeRef.current`)을 대조하여 실제 재생이 완료되기 전 및 재생 종료 후 울림 시간(`+ 0.3초`) 동안 마이크 전송을 완벽히 차단.
  
```javascript
// 재생 중 여부 판별 식 (물리적 재생 시간 + 여유 안전 패딩 300ms)
const isSpeaking = isModelSpeakingRef.current || (
  playbackContextRef.current &&
  playbackContextRef.current.currentTime < (playbackTimeRef.current + 0.3)
);

if (echoGuardRef.current && isSpeaking) {
  // AI 음성이 나오는 동안에는 마이크 입력 데이터를 OpenAI 서버로 보내지 않고 드롭
  return;
}
```

### 다. 한국어 발화 자연스러움 튜닝 & VAD 제어
* **음색(Voice)**: 한국어 발음 정확도가 뛰어난 **`'marin'`**을 기본값으로 탑재하고 `sage`, `shimmer`, `alloy`를 보조 리스트로 구비.
* **지연 및 턴 오버 감지**: 
  - 일반적인 무음 감지 대신 OpenAI의 최신 **시맨틱 VAD** (`type: "semantic_vad"`, `eagerness: "auto"`)를 도입하여 화자의 말이 문법적/문맥적으로 완료되었는지를 실시간 분석.
  - 한국어 대화의 호흡 속도를 존중하여 무음 판정 기준 시간을 기존 `600ms`에서 **`800ms`**로 여유롭게 설정하여 말이 끊기는 오조작 방지.
* **발화 가이드라인 (Micro-Pause & Anti-Duplicate Prompting)**:
  - 쉼표(`,`)와 말줄임표(`...`)를 텍스트 출력에 전략적으로 활용하여 TTS 엔진이 자연스러운 호흡 쉼 및 억양의 강약을 연출하도록 프롬프팅 최적화.
  - "알겠습니다", "네, 알겠습니다"와 같은 동조어를 2회 연속 연속 사용하지 않도록 차단하는 **Zero Consecutive Duplicate 정책** 적용.

---

## 3. 📂 변경 및 구현 대상 파일 목록

### 🔹 백엔드 (Server Layer)
*   **[MODIFY] [.env](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/.env)**:
    - 수신자 명칭 `RECEIVER_NAME=수민님`으로 설정 및 `OPENAI_REALTIME_VOICE=marin` 추가.
*   **[MODIFY] [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)**:
    - WebSocket 접속 시 클라이언트의 HTTP `req` 객체를 세션 핸들러로 넘겨 쿼리 매개변수가 읽히도록 보완.
*   **[MODIFY] [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)**:
    - 기본 목소리를 `'marin'`으로 초기화.
    - `req.url` 파싱을 통한 사전 선택 목소리 값 적용 기능 탑재.
    - 중복 발화 금지, 단축 첫인상, Micro-Pause 연출 기법이 포함된 프리미엄 한국어 페르소나 `SYSTEM_PROMPT` 업데이트.

### 🔹 프론트엔드 (Client Layer)
*   **[MODIFY] [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)**:
    - 기본 목소리 상태 값 `'marin'` 반영.
    - Web Audio API 스케줄링 동기화 기반 에코 가드 필터(`onaudioprocess`) 적용.
    - WebSocket 연결 수립 시 `${WS_URL}?voice=${currentVoice}` 포맷으로 사전 선택 음성 정보 파라미터 결합.
    - `VoiceSelector` 노출 범위를 통화 전(`idle`/`connecting`) 상태까지 확대 적용.
*   **[MODIFY] [index.css](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/index.css)**:
    - 모바일 및 태블릿 대응을 위한 1024px, 768px, 480px 단위의 프리미엄 반응형 미디어 쿼리 적용.
    - 모바일 대시보드 상태 카드 1열화, 목소리 선택 리스크 2열 배치, SMS 모달 창 깨짐 현상 수정.

---

## 4. 🧪 검증 및 품질 테스트 시나리오

1. **사전 음성 선택 및 동작 검증**:
   - 통화 시작 전 대기 상태에서 `Marin` 목소리를 클릭한 뒤 다이얼 버튼을 눌러 연결을 시작합니다. 첫 인삿말부터 `Marin` 음색의 차분하고 자연스러운 한국어가 출력되는지 청음합니다.
2. **에코 및 피드백 방어 검증**:
   - 이어폰을 끼지 않고 스피커폰 상태로 통화를 진행합니다. AI가 답변할 때 나오는 소리가 마이크로 재흡수되어 무한 반복 답변이나 에코 루프가 생기지 않고 매끄럽게 통화가 이뤄지는지 확인합니다.
3. **모바일 반응형 테스트**:
   - 모바일 크롬 브라우저의 기기 시뮬레이터 및 실제 갤럭시/아이폰 실기기를 통해 대시보드 및 상태 창, 통화 UI가 삐져나감 없이 깔끔하게 한 화면 내에 스크롤 안정성이 유지되는지 체크합니다.

---

> [!TIP]
> 본 구현 계획서의 설계 지침에 맞게 구현된 소스 코드는 빌드 완료 후 Git 원격 저장소(`sampark0626/A-Machine_Workspace`)로 최종 업로드되어 배포의 완결성을 확보하였습니다. 해커톤 기술 경쟁력 입증 시 아키텍처 상의 **'Timeline-based Echo Guard'**와 **'Semantic VAD 기반 한국어 억양 튜닝'**을 독창적 핵심 기술로 적극 어필하십시오.
