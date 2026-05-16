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
