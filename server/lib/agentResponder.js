import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { WebSocket } from 'ws';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const _require = createRequire(import.meta.url);
const _dir = dirname(fileURLToPath(import.meta.url));
_require('dotenv').config({ path: join(_dir, '..', '.env'), override: true });

let anthropic = null;
function getAnthropicClient() {
  if (!anthropic) anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropic;
}

let openai = null;
function getOpenAIClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function safeSend(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function buildSystemPrompt(assistContext) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const dateStr = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;
  const dayNames = ['일','월','화','수','목','금','토'];
  const timeStr = `${String(kst.getHours()).padStart(2,'0')}:${String(kst.getMinutes()).padStart(2,'0')}`;

  return `당신은 통화 중인 사용자 옆에서 즉시 귓속말로 도와주는 AI 어시스턴트입니다.

## 핵심 원칙
- 질문에 바로 핵심만 답하세요. 서론·마무리 인사 절대 금지
- 반드시 1~2문장 이내로 짧게 — 통화 중이므로 길면 방해됩니다
- 맛집·장소·제품은 이름 1~2개 + 한 줄 특징만 말하세요
- "검색해보세요", "찾아보세요" 절대 금지
- 마크다운 기호(*, **, ##, - 등) 절대 사용 금지 — 음성으로 읽히므로 일반 텍스트만
- 자연스러운 한국어 구어체

## 현재 시간 (KST)
${dateStr} (${dayNames[kst.getDay()]}요일) ${timeStr}
${assistContext ? `\n## 참고 정보\n${assistContext}` : ''}`;
}

// ── LLM 호출 (Claude / GPT 공용) ─────────────────────────────────────────
async function callLLM(model, systemPrompt, userMessage) {
  const m = model || 'claude-haiku-4-5-20251001';
  if (m.startsWith('gpt-')) {
    const res = await getOpenAIClient().chat.completions.create({
      model: m,
      max_tokens: 350,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return res.choices[0].message.content;
  }
  const res = await getAnthropicClient().messages.create({
    model: m,
    max_tokens: 350,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return res.content[0].text;
}

// ── OpenAI TTS ───────────────────────────────────────────────────────────
async function openaiTTS(text, voice, clientWs) {
  const speech = await getOpenAIClient().audio.speech.create({
    model: 'tts-1',
    voice: voice || 'nova',
    input: text,
    response_format: 'pcm',
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  const CHUNK = 4800;
  for (let i = 0; i < buf.length; i += CHUNK) {
    safeSend(clientWs, { type: 'agent.audio', delta: buf.slice(i, i + CHUNK).toString('base64') });
  }
}

// ── ElevenLabs TTS ───────────────────────────────────────────────────────
async function elevenLabsTTS(text, voiceId, clientWs) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  const vid = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel (default)
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=pcm_24000`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS 오류 ${res.status}: ${err}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const CHUNK = 4800;
  for (let i = 0; i < buf.length; i += CHUNK) {
    safeSend(clientWs, { type: 'agent.audio', delta: buf.slice(i, i + CHUNK).toString('base64') });
  }
}

// ── PCM 리샘플 (16kHz → 24kHz, Int16 버퍼) ───────────────────────────────
function resample16to24(buf) {
  const inputSamples = buf.length / 2;
  const ratio = 16000 / 24000;
  const outputSamples = Math.round(inputSamples / ratio);
  const out = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    const src = i * ratio;
    const a = Math.min(Math.floor(src), inputSamples - 1);
    const b = Math.min(a + 1, inputSamples - 1);
    const w = src - a;
    const s1 = buf.readInt16LE(a * 2);
    const s2 = buf.readInt16LE(b * 2);
    out.writeInt16LE(Math.round(s1 * (1 - w) + s2 * w), i * 2);
  }
  return out;
}

// ── ElevenLabs 대화 에이전트 (WebSocket) ─────────────────────────────────
export async function invokeElevenLabsAgent({ transcript, reason, agentId, clientWs }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!agentId) throw new Error('ElevenLabs Agent ID가 설정되지 않았습니다');

  const question = reason && reason !== '에이전트 호출'
    ? reason
    : transcript.length > 0
      ? transcript.map(t => `${t.role === 'caller' ? '발신자' : '수신자'}: ${t.text}`).join('\n')
      : '안녕하세요';

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`,
      { headers: { 'xi-api-key': apiKey } }
    );

    let agentText = '';
    let initiated = false;
    let audioTimeout = null;
    let gotAudio = false;

    const finish = () => {
      if (audioTimeout) clearTimeout(audioTimeout);
      try { ws.close(); } catch {}
      safeSend(clientWs, { type: 'agent.passive' });
      resolve(agentText);
    };

    const resetAudioTimeout = () => {
      if (audioTimeout) clearTimeout(audioTimeout);
      // 마지막 오디오 청크 후 1.2초 침묵이면 완료로 간주
      audioTimeout = setTimeout(finish, 1200);
    };

    ws.on('open', () => {
      console.log('[ElevenLabs] WebSocket 연결됨');
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case 'conversation_initiation_metadata':
          console.log('[ElevenLabs] 대화 시작, format:', msg.conversation_initiation_metadata_event?.agent_output_audio_format);
          initiated = true;
          // 사용자 메시지 전송
          ws.send(JSON.stringify({ user_message: question }));
          break;

        case 'audio': {
          const b64 = msg.audio_event?.audio_base_64;
          if (!b64) break;
          gotAudio = true;
          const raw = Buffer.from(b64, 'base64');
          // ElevenLabs Conversational AI는 기본 pcm_16000 출력 → 24kHz로 리샘플
          const resampled = resample16to24(raw);
          safeSend(clientWs, { type: 'agent.audio', delta: resampled.toString('base64') });
          resetAudioTimeout();
          break;
        }

        case 'agent_response':
          agentText = msg.agent_response_event?.agent_response || '';
          console.log(`[ElevenLabs] 응답 텍스트: ${agentText}`);
          safeSend(clientWs, { type: 'agent.transcript', text: agentText });
          if (!gotAudio) resetAudioTimeout(); // 오디오 없이 응답만 온 경우 대비
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
          break;

        case 'error':
          console.error('[ElevenLabs] 오류:', msg);
          finish();
          break;
      }
    });

    ws.on('error', (err) => {
      console.error('[ElevenLabs] WebSocket 오류:', err.message);
      safeSend(clientWs, { type: 'agent.passive' });
      reject(err);
    });

    ws.on('close', () => {
      console.log('[ElevenLabs] WebSocket 종료');
      if (audioTimeout) clearTimeout(audioTimeout);
    });

    // 연결 후 30초 내 응답이 없으면 타임아웃
    setTimeout(() => {
      if (!initiated || !gotAudio) {
        console.error('[ElevenLabs] 타임아웃');
        finish();
      }
    }, 30000);
  });
}

// ── Claude/GPT 에이전트 호출 ──────────────────────────────────────────────
export async function invokeAgent({
  transcript, reason, assistContext, clientWs,
  llmModel, ttsProvider, ttsVoice,
}) {
  const conversationText = transcript.length > 0
    ? transcript.map(t => {
        const label = t.role === 'caller' ? '발신자' : t.role === 'receiver' ? '수신자' : t.role === 'user' ? '사용자' : '상대방';
        return `${label}: ${t.text}`;
      }).join('\n')
    : '(대화 시작 전)';

  const userMessage = reason && reason !== '에이전트 호출'
    ? `질문: ${reason}${conversationText !== '(대화 시작 전)' ? `\n\n[통화 맥락]\n${conversationText}` : ''}`
    : `[통화 맥락]\n${conversationText}\n\n위 대화에서 사용자에게 바로 도움이 될 만한 정보나 추천을 해주세요.`;

  const text = await callLLM(llmModel, buildSystemPrompt(assistContext), userMessage);
  console.log(`[에이전트] 응답 (${llmModel || 'claude-haiku'}): ${text}`);

  safeSend(clientWs, { type: 'agent.transcript', text });

  if (ttsProvider === 'elevenlabs') {
    await elevenLabsTTS(text, ttsVoice, clientWs);
  } else {
    await openaiTTS(text, ttsVoice, clientWs);
  }

  safeSend(clientWs, { type: 'agent.passive' });
  return text;
}

// ── 인터럽트 분류 ─────────────────────────────────────────────────────────
export async function classifyInterrupt(userText, agentText) {
  const res = await getAnthropicClient().messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5,
    system: `사용자 발화가 에이전트 답변에 대한 "계속" 요청(예: 응, 어, 맞아, 계속해, 그래서?, 더 말해줘 등)인지, 아니면 새로운 질문인지 판단하세요.
"resume" 또는 "new" 중 하나만 출력하세요. 다른 말은 절대 하지 마세요.`,
    messages: [{ role: 'user', content: `에이전트 답변: ${agentText}\n\n사용자: ${userText}` }],
  });
  const result = res.content[0].text.trim().toLowerCase();
  console.log(`[에이전트] 인터럽트 분류: "${userText}" → ${result}`);
  return result.includes('resume') ? 'resume' : 'new';
}

// ── 에이전트 답변 재생 (인터럽트 후 계속) ────────────────────────────────
export async function resumeAgent({ text, clientWs, ttsProvider, ttsVoice }) {
  safeSend(clientWs, { type: 'agent.transcript', text });
  if (ttsProvider === 'elevenlabs') {
    await elevenLabsTTS(text, ttsVoice, clientWs);
  } else {
    await openaiTTS(text, ttsVoice, clientWs);
  }
  safeSend(clientWs, { type: 'agent.passive' });
}
