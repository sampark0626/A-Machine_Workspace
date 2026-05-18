// A-Machine v2 Server — Express + WebSocket relay to OpenAI Realtime API
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { handleRealtimeConnection } from './lib/realtimeSession.js';

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

// Google Calendar OAuth callback placeholder
app.get('/auth/google/callback', (req, res) => {
  const { code } = req.query;
  // In production, exchange code for tokens here
  res.send('Google Calendar 인증이 완료되었습니다. 이 창을 닫아주세요.');
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
