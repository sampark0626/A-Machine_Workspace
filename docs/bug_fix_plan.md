# 구현 계획 - A-Machine v2 버그 수정

이 계획은 Render 및 Vercel 배포 후 발생한 주요 버그들을 수정하기 위한 상세 계획입니다.

---

## 사용자 검토 필요 사항

> [!IMPORTANT]
> ### 1. OpenAI Realtime API 목소리 미지원으로 인한 연결 끊김
> 기존 코드의 기본 음성이 `nova`로 설정되어 있었습니다. **`nova`는 일반 TTS(Text-to-Speech) 음성이며, OpenAI Realtime API에서는 지원되지 않는 식별자입니다.**
> 이로 인해 OpenAI 서버가 `session.update` 요청에 대해 `Unknown parameter: 'session.voice'` 에러를 반환하고 즉시 연결을 종료시켰습니다.
> 기본 음성을 실시간 전용 음성인 `alloy`로 변경하고, 프론트엔드의 `VoiceSelector` 목록에서도 `nova`를 제거하여 지원되는 실시간 음성들로만 구성하겠습니다.

> [!NOTE]
> ### 2. 백엔드 루트 엔드포인트(/) 추가
> Express 서버에 `app.get('/')` 핸들러가 없어서 Render 백엔드 주소로 직접 접속 시 브라우저에 `Cannot GET /` 이라는 에러가 투박하게 노출되었습니다. 서버가 성공적으로 작동 중임을 보여주는 깔끔한 안내 페이지를 추가하겠습니다.

---

## 변경 사항 및 적용 파일

### 백엔드 (server/)

#### [MODIFY] [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)
* 기본 `currentVoice` 설정을 `'nova'`에서 `'alloy'`로 수정합니다.
* WebSocket 연결 설정 시 OpenAI 호환성을 완벽하게 보장하도록 조정합니다.

```diff
-  let currentVoice = 'nova';
+  let currentVoice = 'alloy';
```

#### [MODIFY] [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)
* 루트 경로(`GET /`) 접속 시 서버 작동 상태와 `/health` 체크 링크를 보여주는 안내 메시지를 추가합니다.

```javascript
// Welcome / Root endpoint
app.get('/', (_req, res) => {
  res.send('A-Machine 서버가 정상적으로 동작 중입니다. 헬스체크는 /health 경로에서 가능합니다.');
});
```

---

### 프론트엔드 (client/)

#### [MODIFY] [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)
* React 상태의 기본 목소리를 `'alloy'`로 설정합니다.
* `endCall` 함수가 언제 호출되더라도(연결 도중 실패했더라도) 마이크 스트림을 확실히 종료하고, WebSocket을 완전히 닫은 뒤, `callState`를 `'ended'`로 즉시 전환하도록 예외 처리를 강화합니다.
* `ws.onclose`가 실행될 때 UI 상태가 `'connecting'`에서 멈추지 않고 `'idle'` 혹은 `'ended'`로 정상 복귀하도록 라이프사이클을 보완합니다.
* OpenAI 오류 로깅 시 `data.error?.message` 구조를 완벽히 파싱하여 콘솔에 `Server error: undefined` 대신 구체적인 에러 사유가 출력되도록 수정합니다.

#### [MODIFY] [VoiceSelector.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/VoiceSelector.jsx)
* 지원되지 않는 `'nova'` 프리셋을 선택 목록(`VOICES` 배열)에서 삭제하고, 지원 가능한 8가지 실시간 목소리로 목록을 구성합니다.

---

## 검증 계획

### 자동화 및 로컬 테스트
* 로컬 환경에서 서버와 클라이언트를 실행하고 WebSocket 연결이 차단 없이 안전하게 작동하는지 검증합니다.
* 마이크 입력 및 스피커 음성이 실시간으로 전달되는지 확인합니다.

### 수동 검증 및 실배포 테스트
* 수정 사항을 적용하여 Render 및 Vercel에 실배포를 진행합니다.
* `https://a-machine-workspace.vercel.app`에 접속하여:
  1. **[통화 시작]**을 클릭하고 즉시 실시간 목소리로 AI 안내가 흘러나오는지 확인합니다.
  2. 음성을 테스트하고 **[통화 종료]** 버튼을 클릭하여 통화 상태와 대시보드 화면이 깔끔히 리셋 및 요약 전송 모드로 전환되는지 확인합니다.
