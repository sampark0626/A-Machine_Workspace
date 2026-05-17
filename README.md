# A-Machine v2 (OpenAI Realtime API)

A-Machine v2는 OpenAI Realtime API 기반으로 작동하는 AI 응답기(Answering Machine) 에이전트입니다.

## 시스템 실행 준비 및 설치 가이드

시스템을 실제로 실행하기 위해 준비해야 할 항목과 실행 순서입니다.

### 1. 필수 API 키 준비
*   **OpenAI API Key (필수)**
    *   OpenAI 플랫폼에서 `sk-...`로 시작하는 API 키를 발급받아야 합니다. (실시간 음성 인식을 위한 Realtime API 사용에 필요)
*   **Google Calendar API (선택)**
    *   해커톤 데모용으로 Google 연동 없이도 **자동으로 가짜(Mock) 데이터를 반환하도록 구현**되어 있습니다.
    *   만약 실제 일정을 연동하고 싶으시다면 [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 생성한 후, **Google Calendar API**를 활성화하고 **OAuth 2.0 클라이언트 ID/Secret**을 발급받아야 합니다.

### 2. 환경 변수(`.env`) 설정
루트 디렉토리에 있는 `.env.example` 파일을 복사하여 `.env` 파일을 생성하고, 발급받은 키 및 정보를 입력합니다.

```env
# OpenAI API (필수)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Google Calendar API (선택: 비워두면 데모용 가짜 데이터 사용)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
GOOGLE_CALENDAR_ID=primary

# 서버 설정 (기본값 사용)
PORT=3001
CLIENT_URL=http://localhost:5173

# 수신자 정보 (요약 문자 전송용)
RECEIVER_NAME=김부장
RECEIVER_PHONE=010-1234-5678
```

### 3. 패키지 설치
`server`와 `client` 폴더 각각에 필요한 Node.js 패키지를 설치해야 합니다.

**서버 패키지 설치:**
```bash
cd server
npm install
```

**클라이언트 패키지 설치:**
```bash
cd client
npm install
```

### 4. 시스템 실행
프론트엔드와 백엔드를 동시에 실행해야 합니다. 터미널을 2개 열어서 각각 실행해주세요.

**터미널 1 (서버 실행):**
```bash
cd server
npm run dev
```
*(기본적으로 `http://localhost:3001`에서 서버가 실행됩니다.)*

**터미널 2 (클라이언트 실행):**
```bash
cd client
npm run dev
```
*(기본적으로 `http://localhost:5173`에서 프론트엔드가 실행됩니다.)*

---

모든 준비가 완료되면 브라우저에서 `http://localhost:5173` 에 접속하여 A-Machine v2 인터페이스를 통해 직접 음성 대화를 테스트해 보실 수 있습니다.

---

## 클라우드 배포 및 환경 설정 (Render & Vercel)

A-Machine v2는 원격 호스팅 환경에서 원활한 데모를 진행할 수 있도록 **Backend(Render)**와 **Frontend(Vercel)** 연동 배포를 지원합니다.

### 1. 배포 아키텍처 개요
*   **Backend (Render)**: Node.js WebSocket Express 서버를 구동하며, 클라이언트의 오디오 데이터 중계 및 OpenAI Realtime API 통신을 전담합니다.
*   **Frontend (Vercel)**: React(Vite) 앱 정적 호스팅을 제공하며, 사용자 브라우저 마이크 오디오 및 스피커 출력을 처리합니다.

---

### 2. 백엔드 배포 가이드 (Render)

Render에서 Web Service를 생성하여 백엔드 서버를 배포합니다.

1.  **서비스 생성**: Render 대시보드에서 `New +` -> `Web Service` 선택 후, 본 저장소를 연동합니다.
2.  **설정 값 입력**:
    *   **Name**: `a-machine-workspace` (혹은 임의의 이름)
    *   **Root Directory**: `server` (중요: 반드시 server 폴더로 설정)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node index.js`
3.  **환경 변수(Environment Variables) 설정**:
    *   `OPENAI_API_KEY`: OpenAI 플랫폼에서 발급받은 실시간 API 키 (`sk-...`)
    *   `PORT`: `3001` (기본값)
    *   `CLIENT_URL`: 프론트엔드가 배포된 Vercel 주소 (예: `https://a-machine-workspace.vercel.app`) - CORS 정책 허용용
    *   `RECEIVER_NAME`: 수신자 이름 (예: `김부장`)
    *   `RECEIVER_PHONE`: 수신자 전화번호 (예: `010-1234-5678`)

> [!NOTE]
> Render 무료 티어(Free Tier)의 경우 웹 서비스가 15분 이상 사용되지 않으면 슬립 모드로 진입(Spin-down)하여 첫 접속 시 최초 로딩에 약 50초 내외가 소요될 수 있습니다.

---

### 3. 프론트엔드 배포 가이드 (Vercel)

Vercel을 통해 React 프론트엔드 앱을 정적 호스팅합니다.

1.  **프로젝트 생성**: Vercel 대시보드에서 `Add New` -> `Project` 선택 후, 본 저장소를 연동합니다.
2.  **설정 값 입력**:
    *   **Framework Presets**: `Vite` (자동 인식)
    *   **Root Directory**: `client` (중요: 반드시 client 폴더로 설정)
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist` (자동 입력됨)
3.  **환경 변수(Environment Variables) 설정**:
    *   **`VITE_WS_URL`**: Render에 배포된 백엔드 WebSocket 주소를 입력합니다.
        *   형식: `wss://[Render앱이름].onrender.com/ws`
        *   예시: `wss://a-machine-workspace.onrender.com/ws` (보안 프로토콜인 `wss` 사용 필수)

---

### 4. 연동 및 테스트 방법

1.  백엔드(Render)와 프론트엔드(Vercel) 배포가 모두 완료되었는지 확인합니다.
2.  Vercel 배포 주소(예: `https://a-machine-workspace.vercel.app`)로 브라우저에 접속합니다.
3.  전화기 인터페이스 중앙의 **[통화 시작]** 버튼을 누릅니다.
4.  브라우저 마이크 접근 권한 팝업이 나타나면 **[허용]**을 선택합니다.
5.  정상적으로 연결되면 AI 비서 "A-Machine"이 첫 인사를 건네며 실시간 대화가 시작됩니다.

---

## 4. 상세 동작 구조 및 설계 (Architecture & Flows)

A-Machine v2는 사용자의 음성을 실시간으로 디지털 파형으로 받아 처리하는 고성능 실시간 스트리밍 아키텍처를 기반으로 설계되었습니다.

### 가. 핵심 기술 사양 (Key Technical Features)

1.  **실시간 실시간 24kHz 리샘플러 (`resampleTo24k`)**:
    *   사용자의 입력 기기(브라우저 마이크)는 일반적으로 44.1kHz 또는 48kHz Float32 규격으로 입력을 캡처합니다.
    *   프론트엔드에서 고성능 보간(Interpolation)을 구현하여 OpenAI Realtime API의 규격인 **24kHz PCM16 오디오 버퍼**로 실시간 주파수를 다운샘플링합니다.
    *   음향이 튀거나 느려지는(음정 저하) 현상을 전면 통제하여, AI 모델이 사용자의 음성을 무손실 수준으로 선명하게 인식하게 만듭니다.
2.  **오디오 타임 스케줄러 (`playbackTimeRef`)**:
    *   스트리밍되는 복수의 음성 데이터 조각(Chunk)들을 연속적이고 매끄럽게 재생하기 위해 **Web Audio API 타임라인 예약 시스템**을 사용합니다.
    *   오디오 패킷이 조각조각 전송될 때 발생하는 지터(Jitter) 현상이나 사운드 오버랩(중첩)을 근본적으로 보완하여, 자연스러운 목소리로 대화를 출력합니다.
3.  **VAD 기반 발화 중단 및 인터럽션 제어**:
    *   서버 발화 감지(Server VAD)를 통해 사용자가 말을 가로채기 시작하는 순간(`input_audio_buffer.speech_started` 감지) 클라이언트 오디오 대기열을 강제 초기화합니다.
    *   대화가 꼬이거나 밀리지 않고 즉각적으로 사용자의 명령에 반응하도록 하여, 마치 실제 전화를 하듯 매끄러운 턴 체인지를 지원합니다.
4.  **도구 호출 무결성 및 중복 제어**:
    *   도구(Tool) 호출 시 `call_id` 기반 트래킹을 통해 중복 명령의 병렬 유입을 원천 배제하여, 외부 API나 캘린더 데이터베이스의 신뢰도를 보장합니다.

---

### 나. 서비스 동작 흐름도 (Mermaid Sequence Diagram)

아래의 순서도는 **전화 연결 수립 ➡️ 실시간 대화 및 주파수 변환 ➡️ 도구 호출(캘린더 제어) ➡️ 사용자 인터럽션 ➡️ 통화 종료 및 요약문 문자 발송**에 이르는 모든 단계를 세부적으로 설명합니다.

```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (Browser)
    participant Client as 프론트엔드 (React)
    participant Server as 백엔드 (Express/WS)
    participant OpenAI as OpenAI Realtime API

    %% 1. 통화 시작 세션 수립
    Note over User, OpenAI: 1단계: 실시간 음성 통화 세션 수립 (GA 규격)
    User->>Client: [전화 시작] 클릭
    Client->>Server: WebSocket 연결 요청 (wss://...)
    Server->>OpenAI: OpenAI Realtime 소켓 연결 수립
    Note over Server, OpenAI: OpenAI GA 규격 적용<br/>Authorization 헤더 연동 (Beta 헤더 배제)<br/>model = gpt-4o-realtime-preview-2024-12-17
    OpenAI-->>Server: session.created 수신
    Server->>OpenAI: session.update (type: 'realtime', tools, VAD 설정 등)
    OpenAI-->>Server: session.updated 수신
    Server-->>Client: session.ready 전송 (세션 수립 완료)
    Server->>OpenAI: response.create (첫 인사 발화 지시)

    %% 2. 음성 데이터 처리 및 대화
    Note over User, OpenAI: 2단계: 실시간 음성 스트리밍 & 재생 스케줄링
    OpenAI-->>Server: response.output_audio.delta (PCM16 오디오 수신)
    Server-->>Client: response.output_audio.delta 중계
    Client->>Client: playAudio() 가동<br/>playbackTimeRef 기준 순차적 타임라인 스케줄링 예약
    Client-->>User: 비서 목소리 출력 ("안녕하세요. 김부장님 AI비서...")

    User->>Client: 마이크 실시간 음성 캡처 (48kHz/44.1kHz)
    Client->>Client: resampleTo24k() 리샘플링 가동<br/>Float32 ➡️ 24kHz PCM16으로 실시간 복원
    Client->>Server: input_audio_buffer.append 전송
    Server->>OpenAI: input_audio_buffer.append 중계

    %% 3. 도구 호출 및 의도 분석
    Note over User, OpenAI: 3단계: 도구 호출 (Function Calling)
    OpenAI-->>Server: response.function_call_arguments.done (check_calendar 호출)
    Server->>Server: call_id 중복 검증 및 도구 활성화
    Server-->>Client: tool.executing (일정 조회 중 화면 표시)
    Server->>Server: checkCalendar(date) 실행 (Mock 또는 Google Calendar 연동)
    Server-->>Client: tool.result (일정 정보 전달)
    Server->>OpenAI: conversation.item.create (도구 실행 결과 입력)
    Server->>OpenAI: response.create (다음 발화 지시)
    OpenAI-->>Server: response.output_audio.delta 수신
    Server-->>Client: 오디오 중계 및 캘린더 내용 출력

    %% 4. 실시간 인터럽션
    Note over User, OpenAI: 4단계: 실시간 사용자 인터럽션 (VAD 말끊기)
    User->>Client: (AI가 한참 말하는 중 말을 가로챔) "그 시간 말고 내일은요?"
    Client->>Server: 마이크 데이터 전송
    Server->>OpenAI: 마이크 데이터 스트리밍
    OpenAI-->>Server: input_audio_buffer.speech_started 감지
    Server-->>Client: input_audio_buffer.speech_started 전달
    Client->>Client: playbackTimeRef 및 오디오 출력 버퍼 강제 리셋 (즉시 정적 상태)
    Note over Client: 비서가 말을 멈추고<br/>사용자의 다음 말을 경청

    %% 5. 통화 종료 및 요약 생성
    Note over User, OpenAI: 5단계: 통화 종료 및 요약 알림 문자 발송
    User->>Client: [통화 종료] 클릭
    Client->>Server: call.end 전송
    Server->>OpenAI: 대화 내역(Transcript) 보관 후 연결 즉시 종료
    Server->>Server: generateSummary() 호출 (GPT-4o-mini 요약 생성)
    Server-->>Client: call.summary 전송 (요약 데이터 & 문자 수신 정보)
    Client->>Client: 마이크 트랙 정지, AudioContext close 및 커넥션 null 초기화
    Client-->>User: 통화 요약 화면 출력 & SMS 모의 문자 팝업 알림 표출


