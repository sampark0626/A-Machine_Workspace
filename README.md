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

