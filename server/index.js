// A-Machine v2 Server — Express + WebSocket relay to OpenAI Realtime API
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { handleRealtimeConnection } from './lib/realtimeSession.js';
import { getAuthUrl, getTokensFromCode, setOAuthTokens } from './lib/calendarTools.js';

const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Welcome / Root endpoint
app.get('/', (_req, res) => {
  res.send('A-Machine 서버가 정상적으로 동작 중입니다. 헬스체크는 /health 경로에서 가능합니다.');
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', name: 'A-Machine' });
});

// Environment verification endpoint (safe for public check, masks secret values)
app.get('/debug-env', (_req, res) => {
  res.json({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'Present' : 'Missing',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'Present' : 'Missing',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI ? 'Present' : 'Missing',
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN ? `Present (length: ${process.env.GOOGLE_REFRESH_TOKEN.length})` : 'Missing',
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID ? 'Present' : 'Missing',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'Present' : 'Missing'
  });
});

// Google Calendar OAuth Initiation
app.get('/auth/google', (req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (error) {
    console.error('[OAuth] URL 생성 실패:', error);
    res.status(500).send(`구글 로그인 URL 생성 중 오류가 발생했습니다: ${error.message}`);
  }
});

// Google Calendar OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send('인증 코드가 전달되지 않았습니다.');
  }

  try {
    const tokens = await getTokensFromCode(code);
    setOAuthTokens(tokens);

    // If a refresh token is returned, display it so the user can easily save it to .env
    const refreshToken = tokens.refresh_token;

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>A-Machine Google Auth 성공</title>
        <style>
          body {
            font-family: 'Segoe UI', -apple-system, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background-color: #1e293b;
            padding: 2.5rem;
            border-radius: 1rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 90%;
            text-align: center;
          }
          h1 { color: #38bdf8; margin-top: 0; }
          p { color: #cbd5e1; font-size: 1.1rem; line-height: 1.6; }
          .token-box {
            background-color: #020617;
            padding: 1rem;
            border-radius: 0.5rem;
            border: 1px solid #334155;
            font-family: monospace;
            word-break: break-all;
            margin: 1.5rem 0;
            user-select: all;
            color: #34d399;
            text-align: left;
          }
          .copy-btn {
            background-color: #38bdf8;
            color: #0f172a;
            border: none;
            padding: 0.75rem 1.5rem;
            font-weight: bold;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .copy-btn:hover { background-color: #0ea5e9; }
          .instructions {
            font-size: 0.9rem;
            color: #94a3b8;
            margin-top: 1.5rem;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Google Calendar 인증 완료! 🎉</h1>
          <p>구글 캘린더 연동용 토큰이 정상적으로 발급되었습니다. 메모리에 즉시 적용되어 현재 구동 중인 서버에서 바로 일정 조회가 가능합니다.</p>
    `;

    if (refreshToken) {
      html += `
          <p>이후 서버 재시작 시에도 자동 로그인되도록 아래 <strong>Refresh Token</strong>을 복사하여 <code>.env</code> 파일의 <code>GOOGLE_REFRESH_TOKEN</code> 값에 채워주세요.</p>
          <div class="token-box" id="token">${refreshToken}</div>
          <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('token').innerText); alert('클립보드에 복사되었습니다!');">토큰 복사하기</button>
      `;
    } else {
      html += `
          <p class="warning" style="color: #fb7185;">⚠️ 이미 한 번 인증이 완료되었거나 prompt=consent 설정이 누락되어 Refresh Token이 포함되지 않았습니다. 만약 새로운 Refresh Token이 필요하시다면 구글 계정 보안 설정에서 A-Machine 앱 권한을 삭제한 뒤 다시 시도해 주세요.</p>
      `;
    }

    html += `
          <div class="instructions">
            <strong>추가 안내:</strong><br>
            - 로컬 환경: <code>server/.env</code> 파일의 <code>GOOGLE_REFRESH_TOKEN=...</code> 항목에 저장하세요.<br>
            - Render.com 호스팅 환경: Render 대시보드의 Environment 탭에 <code>GOOGLE_REFRESH_TOKEN</code>으로 추가하고 배포하세요.
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('[OAuth] 토큰 획득 오류:', error);
    res.status(500).send(`구글 토큰 획득 중 오류가 발생했습니다: ${error.message}`);
  }
});

const server = http.createServer(app);

// WebSocket server for client ↔ OpenAI Realtime relay
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (clientWs, req) => {
  console.log(`[A-Machine] 클라이언트 연결: ${req.socket.remoteAddress}`);
  handleRealtimeConnection(clientWs, req);
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   A-Machine v2 Server                   ║
  ║   http://localhost:${PORT}                  ║
  ║   WebSocket: ws://localhost:${PORT}/ws      ║
  ╚══════════════════════════════════════════╝
  `);
});
