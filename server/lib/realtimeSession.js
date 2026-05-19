// OpenAI Realtime API session management with Function Calling
import { WebSocket } from 'ws';
import { checkCalendar, createCalendarEvent } from './calendarTools.js';
import { generateSummary } from './summaryNotifier.js';
import { ElevenLabsSTSStreamer } from './elevenLabsSTS.js';
import { invokeAgent, classifyInterrupt, resumeAgent, invokeElevenLabsAgent } from './agentResponder.js';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2';
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;
const RECEIVER_NAME = process.env.RECEIVER_NAME || '수민';
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
const AUDIO_SAMPLE_RATE = 24000;

// Known OpenAI voices list to identify ElevenLabs voices by exclusion
const OPENAI_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse', 'marin', 'cedar']);

// ── Assist Mode System Prompt ──────────────────────────────────────────────
function buildAssistInstructions(receiverName, assistContext) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const dateStr = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;
  const dayNames = ['일','월','화','수','목','금','토'];
  const timeStr = `${String(kst.getHours()).padStart(2,'0')}:${String(kst.getMinutes()).padStart(2,'0')}`;

  return `## 역할
당신은 ${receiverName}님의 **친구** 역할을 맡은 AI입니다.
자연스럽게 친구처럼 행동하며, ${receiverName}님과 실제 친구 사이의 통화처럼 대화하세요.

## 대화 방식
- 편하고 친근한 한국어 구어체 사용 (반말 또는 편한 말투)
- 일상, 약속, 근황, 재미있는 이야기 등 다양한 주제로 자연스럽게 대화
- 한 번에 1~2문장으로 짧고 자연스럽게 주고받기
- 상대방(${receiverName})의 말에 재미있게 반응하고 대화를 이끌어가기
${assistContext ? `\n## 대화 배경\n${assistContext}\n` : ''}
## 현재 시간 (KST)
- 날짜: ${dateStr} (${dayNames[kst.getDay()]}요일) / 시각: ${timeStr}`;
}

// ── Agent Instructions (OpenAI Realtime 에이전트 모드용) ──────────────────
function buildAgentInstructions(assistContext) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);
  const dateStr = `${kst.getFullYear()}-${String(kst.getMonth()+1).padStart(2,'0')}-${String(kst.getDate()).padStart(2,'0')}`;
  const dayNames = ['일','월','화','수','목','금','토'];
  const timeStr = `${String(kst.getHours()).padStart(2,'0')}:${String(kst.getMinutes()).padStart(2,'0')}`;
  return `당신은 통화 중인 사용자 옆에서 귓속말로 도와주는 AI 어시스턴트입니다. 질문에 바로 핵심만 1~2문장으로 짧게 답하세요. 서론·마무리 인사 절대 금지. 마크다운 기호 절대 사용 금지. 자연스러운 한국어 구어체. 현재 시간(KST): ${dateStr}(${dayNames[kst.getDay()]}요일) ${timeStr}${assistContext ? ` 참고 정보: ${assistContext}` : ''}`;
}

// ── Answering Machine System Prompt ───────────────────────────────────────
const SYSTEM_PROMPT = `## 역할
당신은 ${RECEIVER_NAME}님을 대신해 전화를 받는 AI 엔서링머신 에이전트 "A-Machine"입니다.

## 성격과 톤
- 따뜻하고 신뢰감을 주는 스마트한 한국어 비서
- 자연스럽고 상냥한 존댓말 사용 (하십시오체와 해요체를 자연스럽게 혼용)
- 극도의 간결함 유지: 한 번 말할 때 반드시 **1~2문장** 이내로 짧게 대답하세요 (전화 통화에서 AI가 길게 말하면 매우 지루해집니다).

## 한국어 발화 지침 (음성 자연스러움 극대화)
- **자연스러운 쉼표(,) 및 말줄임표(...) 활용**:
  - 문장 사이에 쉼표(',')와 말줄임표('...')를 의도적으로 적극 섞어서 대답을 구성하세요. 오디오 합성 모델(TTS)이 이 문장 부호를 실제 사람의 자연스러운 '호흡 쉼'과 '억양의 올림/내림'으로 매끄럽게 번역하여 출력합니다.
- **자연스러운 구어체 추임새(Vocal Fillers) 섞기**:
  - 기계적인 문어체 표현("함수를 실행하여 확인하겠습니다" 등)을 **절대 사용하지 마세요**.
  - 대신 실제 사람이 생각하고 말하듯 자연스러운 추임새를 대화에 녹여내세요. (예: "아, 잠시만요...", "음... 캘린더를 확인해 보니까요...", "네~ 알겠습니다.")
- **대화하듯 말하기**:
  - 로봇처럼 일정한 속도로 또박또박 국어책 읽는 톤을 피하고, 친구나 동료의 전화를 대신 받아주는 상냥한 실제 사람 비서처럼 리드미컬하고 부드러운 억양을 연출하세요.

## 🚫 중복 및 상투적 발화 방지 지침
- **"네, 알겠습니다", "알겠습니다" 연속/반복 사용 절대 금지**:
  - 이전 턴의 대답이나 동일한 대화 맥락에서 "알겠습니다" 또는 "네, 알겠습니다"를 이미 사용했다면, **바로 이어지는 다음 대답이나 도구 실행 완료 후의 대답에서는 절대 동일한 단어("알겠습니다")를 연달아 시작으로 사용하지 마세요.**
  - 매번 대답의 첫머리를 다양하게 구성하거나, 아예 불필요한 동조어를 생략하고 바로 본론으로 진입해야 합니다.
  - 대안이 되는 다채로운 구어체 리액션을 돌아가며 적극 활용하세요. (예: "아~", "음...", "그렇군요!", "네, 말씀하신 대로...", "확인해 보니까...", "아하!", "바로 조치해 드릴게요.", "알려주신 대로...")
- **도구 호출(Tool Call) 전후의 호응 중복 제거**:
  - 도구를 호출하기 전에 이미 "네, 알겠습니다. 조회해 볼게요."라고 호응했다면, 도구 결과가 나온 뒤에 다시 "알겠습니다"라고 말해서는 절대 안 됩니다.
  - 도구의 실행 결과가 오면 바로 본론으로 진입하세요. (예: "음... 확인해 보니, 오후 2시부터 4시까지 비어 있네요.")
- **대화의 입체적 다양성 확보**:
  - 동일한 리액션 단어를 2번 이상 연달아 말하는 것은 인공지능의 한계를 보여주는 치명적인 이질감을 줍니다. 다양한 일상 비서의 동의어를 섞어 마치 리얼한 사람 비서가 실시간으로 임기응변하며 대응하는 세련된 감각을 선사하세요.

## 첫 인사
통화가 시작되면 따뜻하게 먼저 첫마디를 건네세요:
"안녕하세요! ... 지금 ${RECEIVER_NAME}님이 부재중이시라... 대신 전화를 받은 AI 비서 에이머신입니다. 메모나 일정 등록이 가능한데, ... , 어떤 일로 전화주셨나요?"


## 핵심 업무 흐름
1. 인사 → 발신자 용건 경청
2. 용건 파악 → 핵심 내용 자연스럽게 확인 및 반복
3. 일정 관련 요청 시:
   - check_calendar 도구로 해당 날짜 캘린더 확인
   - 비어있는 시간대를 부드러운 구어체로 안내
   - 발신자와 시간 협상 (대안 제시)
   - 합의되면 create_calendar_event로 등록
4. 메모/전달 요청 시: 핵심 내용 정리 확인
5. 통화 마무리: 전달 내용 요약 확인 → 상냥한 종료 인사

## 자연스러운 구어체 예시 (Few-Shot)
- 사용자가 일정 물어볼 때: "아, 잠시만요... 그날 일정을 한번 확인해 볼게요... 음, 오후 2시부터 4시까지 비어있는데요, 괜찮으실까요?"
- 시간 안 맞을 때: "아, 그 시간은 이미 일정이 잡혀 있네요... 음, 오전 10시쯤은 어떠세요?"
- 일정 잡을 때: "네! 그럼 그 시간으로 캘린더에 예약 등록해 둘게요."

## 제약
- ${RECEIVER_NAME}님 대신 독단적인 비즈니스 의사결정을 하지 마세요.
- 확실하지 않은 정보: "음... 이 부분은 제가 잘 모르겠어서, 수민님께 꼭 전달해 드릴게요."
- 개인정보 최소 수집
- 급한 용건인 경우: "아, 아주 급하신 용건이시군요! 제가 바로 수민님께 긴급으로 표시해서 메모를 전달할게요."`;

const TOOLS = [
  {
    type: 'function',
    name: 'check_calendar',
    description: `${RECEIVER_NAME}님의 Google Calendar에서 특정 날짜의 일정을 확인하고 빈 시간대를 알려줍니다`,
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'YYYY-MM-DD 형식의 날짜. 예: 2026-05-20'
        }
      },
      required: ['date']
    }
  },
  {
    type: 'function',
    name: 'create_calendar_event',
    description: `${RECEIVER_NAME}님의 Google Calendar에 새 일정을 등록합니다`,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '일정 제목' },
        start_time: { type: 'string', description: 'ISO 8601 시작 시간' },
        end_time: { type: 'string', description: 'ISO 8601 종료 시간' },
        description: { type: 'string', description: '일정 상세 내용' }
      },
      required: ['summary', 'start_time', 'end_time']
    }
  }
];

/**
 * Handle a single client WebSocket connection:
 * 1. Open a relay WebSocket to OpenAI Realtime API
 * 2. Forward audio & events bidirectionally
 * 3. Handle function calls (calendar tools) locally
 */
export function handleRealtimeConnection(clientWs, req) {
  if (!OPENAI_API_KEY) {
    clientWs.send(JSON.stringify({
      type: 'error',
      message: 'OPENAI_API_KEY가 설정되지 않았습니다.'
    }));
    clientWs.close();
    return;
  }

  // Conversation transcript for summary generation
  const transcript = [];
  const handledFunctionCalls = new Set();
  let currentVoice = DEFAULT_VOICE;
  let lastAgentText = '';
  let lastAgentSettings = {};
  let agentRealtimeMode = false; // OpenAI Realtime을 에이전트 응답으로 사용 중

  // Extract query parameters
  let isAssistMode = false;
  let assistContext = '';
  if (req && req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const voiceParam = url.searchParams.get('voice');
      if (voiceParam) {
        currentVoice = voiceParam;
        console.log(`[A-Machine] 클라이언트 요청 음성 사용: ${currentVoice}`);
      }
      isAssistMode = url.searchParams.get('mode') === 'assist';
      assistContext = url.searchParams.get('context') || '';
    } catch (e) {
      console.warn('[A-Machine] URL 파싱 실패, 기본값 사용:', e.message);
    }
  }

  // Determine initial ElevenLabs settings based on voice query parameter (any voice not in OpenAI list is ElevenLabs)
  const ELEVENLABS_VOICE_MAPPING = {
    'clone_minseok': 'Da4ldXDTb66CahhogG02'
  };

  const isElevenLabs = !OPENAI_VOICES.has(currentVoice);
  const initialElevenLabsVoiceId = isElevenLabs
    ? (process.env.ELEVENLABS_VOICE_ID || ELEVENLABS_VOICE_MAPPING[currentVoice])
    : false;
  const elevenLabsSTS = new ElevenLabsSTSStreamer(clientWs, initialElevenLabsVoiceId);

  if (isAssistMode) {
    console.log('[A-Machine] 통화 어시스트 모드로 시작');
  }

  let sessionReady = false;

  // Connect to OpenAI Realtime API
  const openaiWs = new WebSocket(REALTIME_URL, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    }
  });

  openaiWs.on('open', () => {
    console.log(`[A-Machine] OpenAI Realtime 연결됨 (model=${REALTIME_MODEL})`);
  });

  // Forward OpenAI events → Client
  openaiWs.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());

      // 1. Initial setup when session is created
      if (event.type === 'session.created') {
        console.log('[A-Machine] OpenAI 세션 생성됨');
        const openAiVoice = !OPENAI_VOICES.has(currentVoice) ? 'echo' : currentVoice;
        if (openAiVoice !== currentVoice) {
          console.log(`[A-Machine] 음성 변조 필터 활성화: ${currentVoice} -> OpenAI 베이스라인: ${openAiVoice}`);
        }


        safeSend(openaiWs, {
          type: 'session.update',
          session: isAssistMode
            ? buildAssistSessionConfig(currentVoice, assistContext)
            : buildSessionConfig(openAiVoice)
        });
        return;
      }

      if (event.type === 'session.updated' && !sessionReady) {
        sessionReady = true;
        safeSend(clientWs, {
          type: 'session.ready',
          model: REALTIME_MODEL,
          voice: currentVoice
        });
        // 자동응답 모드만 AI가 먼저 인사말 시작 (어시스트 모드는 사용자가 직접 대화)
        if (!isAssistMode) {
          safeSend(openaiWs, {
            type: 'response.create',
            response: { output_modalities: ['audio'] }
          });
        }
      }

      // Log OpenAI error events
      if (event.type === 'error') {
        console.error('[A-Machine] OpenAI로부터 에러 수신:', JSON.stringify(event.error, null, 2));
        safeSend(clientWs, {
          type: 'error',
          message: event.error?.message || 'OpenAI Realtime 오류가 발생했습니다.',
          error: event.error
        });
      }

      // ── 에이전트 Realtime 모드: 응답 이벤트를 agent.* 메시지로 라우팅 ──
      if (agentRealtimeMode) {
        if (event.type === 'response.audio.delta' || event.type === 'response.output_audio.delta') {
          safeSend(clientWs, { type: 'agent.audio', delta: event.delta });
        } else if (event.type === 'response.audio_transcript.done' || event.type === 'response.output_audio_transcript.done') {
          lastAgentText = event.transcript || '';
          safeSend(clientWs, { type: 'agent.transcript', text: lastAgentText });
          // 에이전트 응답을 대화 이력에 추가 (후속 호출 시 맥락 유지)
          if (lastAgentText) transcript.push({ role: 'agent', text: lastAgentText });
        } else if (event.type === 'response.done') {
          agentRealtimeMode = false;
          // 어시스트 모드 instructions + turn_detection 원복
          if (isAssistMode) {
            safeSend(openaiWs, {
              type: 'session.update',
              session: {
                type: 'realtime',
                instructions: buildAssistInstructions(RECEIVER_NAME, assistContext),
                audio: {
                  input: {
                    turn_detection: { type: 'semantic_vad', eagerness: 'auto', create_response: false }
                  }
                }
              },
            });
          }
          safeSend(clientWs, { type: 'agent.passive' });
        } else if (event.type === 'error') {
          agentRealtimeMode = false;
          if (isAssistMode) {
            safeSend(openaiWs, {
              type: 'session.update',
              session: { type: 'realtime', instructions: buildAssistInstructions(RECEIVER_NAME, assistContext) },
            });
          }
          safeSend(clientWs, { type: 'agent.passive' });
          safeSend(clientWs, event);
        }
        // input_audio_buffer.speech_started 등 공용 이벤트는 그대로 포워드
        if (event.type === 'input_audio_buffer.speech_started' || event.type === 'input_audio_buffer.speech_stopped') {
          safeSend(clientWs, event);
        }
        return;
      }

      // Handle function calls from the model
      if (event.type === 'response.function_call_arguments.done') {
        await handleFunctionCall(event, openaiWs, clientWs, handledFunctionCalls);
        return;
      }
      if (event.type === 'response.done') {
        await handleFunctionCallsFromResponse(event.response, openaiWs, clientWs, handledFunctionCalls);
      }

      // Track transcripts
      if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.audio_transcript.done') {
        transcript.push({ role: 'assistant', text: event.transcript });
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        transcript.push({ role: 'user', text: event.transcript });
      }

      // Intercept OpenAI audio output and relay to ElevenLabs STS (if configured)
      if (event.type === 'response.output_audio.delta') {
        if (elevenLabsSTS.isConfigured) {
          elevenLabsSTS.handleOpenAiAudioDelta(event.delta);
          return;
        }
      }

      if (event.type === 'response.output_audio.done') {
        if (elevenLabsSTS.isConfigured) {
          elevenLabsSTS.triggerSpeechToSpeechConversion();
          return;
        }
      }


      // Forward to client
      safeSend(clientWs, event);
    } catch (err) {
      console.error('[A-Machine] OpenAI 이벤트 처리 오류:', err.message);
    }
  });

  // Forward Client events → OpenAI
  clientWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Handle mode switch: answering → assist
      if (msg.type === 'mode.switch' && msg.mode === 'assist') {
        isAssistMode = true;
        console.log('[A-Machine] 통화 어시스트 모드로 전환');
        safeSend(openaiWs, {
          type: 'session.update',
          session: buildAssistSessionConfig(currentVoice, assistContext)
        });
        safeSend(clientWs, { type: 'mode.switched', mode: 'assist' });
        return;
      }

      // Keyword trigger greeting — "부르셨나요?" one-shot, then waits for question
      if (msg.type === 'agent.greet') {
        const greetText = '부르셨나요?';
        safeSend(clientWs, { type: 'agent.active', reason: greetText, triggerType: 'keyword' });
        agentRealtimeMode = true;
        safeSend(openaiWs, {
          type: 'session.update',
          session: { type: 'realtime', instructions: `지금 즉시 이 한 문장만 자연스럽게 말하세요: "${greetText}" 다른 말은 절대 하지 마세요.` },
        });
        safeSend(openaiWs, { type: 'response.create', response: { output_modalities: ['audio'] } });
        return;
      }

      // Handle voice phishing / emergency alert — fixed one-sentence urgent warning
      if (msg.type === 'agent.alert') {
        const alertMessages = {
          voicePhishing: '보이스 피싱이 의심되니 조심하세요',
        };
        const alertText = alertMessages[msg.alertType] || '주의하세요';
        console.log(`[A-Machine] 경고 알림: ${alertText}`);
        safeSend(clientWs, { type: 'agent.active', reason: alertText });
        agentRealtimeMode = true;
        safeSend(openaiWs, {
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: `지금 즉시 이 한 문장만 긴박하게 말하세요: "${alertText}" 다른 말은 절대 하지 마세요.`,
          },
        });
        safeSend(openaiWs, {
          type: 'response.create',
          response: { output_modalities: ['audio'] },
        });
        return;
      }

      // Handle agent invoke (assist mode) — separate Agent AI via agentResponder
      if (msg.type === 'agent.invoke') {
        const reason = msg.reason || '에이전트 호출';
        const s = msg.agentSettings || {};
        safeSend(clientWs, { type: 'agent.active', reason });
        console.log(`[A-Machine] 에이전트 호출됨 (${s.agentType || 'claude'}): ${reason}`);

        if (s.agentType === 'openai-realtime') {
          // OpenAI Realtime API로 에이전트 응답 생성 (기존 세션 활용)
          agentRealtimeMode = true;
          lastAgentSettings = s;
          const question = reason && reason !== '에이전트 호출' ? reason : '통화 내용을 바탕으로 도움이 될 정보를 알려주세요';
          const recentTranscript = transcript.slice(-10);
          const conversationText = recentTranscript.length > 0
            ? '\n\n[최근 대화 맥락]\n' + recentTranscript.map(t => {
                const label = t.role === 'caller' ? '발신자' : t.role === 'receiver' ? '수신자' : t.role === 'agent' ? '에이전트' : '사용자';
                return `${label}: ${t.text}`;
              }).join('\n')
            : '';
          safeSend(openaiWs, {
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: buildAgentInstructions(assistContext) + conversationText + `\n\n지금 바로 이 질문에 답하세요: ${question}`,
            },
          });
          safeSend(openaiWs, {
            type: 'response.create',
            response: { output_modalities: ['audio'] },
          });
        } else {
          const run = s.agentType === 'elevenlabs'
            ? invokeElevenLabsAgent({ transcript, reason, agentId: s.elevenLabsAgentId, clientWs })
            : invokeAgent({ transcript, reason, assistContext, clientWs, llmModel: s.llmModel, ttsProvider: s.ttsProvider, ttsVoice: s.ttsVoice });

          run.then(text => { lastAgentText = text; lastAgentSettings = s; })
             .catch(err => {
               console.error('[Agent] 오류:', err.message);
               safeSend(clientWs, { type: 'agent.passive' });
             });
        }
        return;
      }

      // Handle agent interrupt — classify and resume or answer new question
      if (msg.type === 'agent.interrupt') {
        const { userText } = msg;
        const s = msg.agentSettings || lastAgentSettings || {};
        console.log(`[A-Machine] 에이전트 인터럽트: "${userText}"`);
        if (!userText) {
          safeSend(clientWs, { type: 'agent.passive' });
          return;
        }

        // OpenAI Realtime 모드: classifyInterrupt 없이 즉시 응답 (레이턴시 제거)
        if (s.agentType === 'openai-realtime') {
          safeSend(clientWs, { type: 'agent.active', reason: userText });
          agentRealtimeMode = true;
          const recentTranscript = transcript.slice(-10);
          const conversationText = recentTranscript.length > 0
            ? '\n\n[최근 대화 맥락]\n' + recentTranscript.map(t => {
                const label = t.role === 'caller' ? '발신자' : t.role === 'receiver' ? '수신자' : t.role === 'agent' ? '에이전트' : '사용자';
                return `${label}: ${t.text}`;
              }).join('\n')
            : '';
          safeSend(openaiWs, {
            type: 'session.update',
            session: {
              type: 'realtime',
              instructions: buildAgentInstructions(assistContext) + conversationText + `\n\n지금 바로 이 질문에 답하세요: ${userText}`,
            },
          });
          safeSend(openaiWs, {
            type: 'response.create',
            response: { output_modalities: ['audio'] },
          });
          return;
        }

        // Claude/GPT 모드: classifyInterrupt로 resume vs new 판단
        if (!lastAgentText) {
          safeSend(clientWs, { type: 'agent.passive' });
          return;
        }
        classifyInterrupt(userText, lastAgentText)
          .then(action => {
            safeSend(clientWs, { type: 'agent.active', reason: action === 'resume' ? '재개' : userText });
            if (action === 'resume') {
              console.log('[A-Machine] 에이전트 재개');
              return resumeAgent({ text: lastAgentText, clientWs, ttsProvider: s.ttsProvider, ttsVoice: s.ttsVoice });
            } else {
              console.log(`[A-Machine] 새 질문: "${userText}"`);
              const run2 = s.agentType === 'elevenlabs'
                ? invokeElevenLabsAgent({ transcript, reason: userText, agentId: s.elevenLabsAgentId, clientWs })
                : invokeAgent({ transcript, reason: userText, assistContext, clientWs, llmModel: s.llmModel, ttsProvider: s.ttsProvider, ttsVoice: s.ttsVoice });
              return run2.then(text => { lastAgentText = text; });
            }
          })
          .catch(err => {
            console.error('[Agent] 인터럽트 처리 오류:', err.message);
            safeSend(clientWs, { type: 'agent.passive' });
          });
        return;
      }

      // Handle voice change request from client
      if (msg.type === 'voice.change') {
        currentVoice = msg.voice;
        const isElevenLabs = msg.provider === 'elevenlabs';

        if (isElevenLabs) {
          elevenLabsSTS.updateVoice(msg.elevenLabsVoiceId);
        } else {
          elevenLabsSTS.isConfigured = false;
          elevenLabsSTS.close();
        }

        // Determine which voice to set on OpenAI Realtime session
        // (For ElevenLabs STS, we use a resonant baseline voice like 'echo')
        const openAiSessionVoice = isElevenLabs ? 'echo' : msg.voice;


        safeSend(openaiWs, {
          type: 'session.update',
          session: {
            type: 'realtime',
            audio: {
              output: {
                voice: openAiSessionVoice
              }
            }
          }
        });
        safeSend(clientWs, {
          type: 'voice.changed',
          voice: msg.voice
        });
        console.log(`[A-Machine] 음성 변경: ${msg.voice} (Provider: ${msg.provider || 'openai'}, OpenAI baseline: ${openAiSessionVoice})`);
        return;
      }

      // Handle call end request
      if (msg.type === 'call.end') {
        handleCallEnd(transcript, clientWs, openaiWs);
        return;
      }

      // Forward audio/other events to OpenAI
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(data.toString());
      }
    } catch (err) {
      // Binary audio data — forward as-is
      if (openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(data);
      }
    }
  });

  // Cleanup
  clientWs.on('close', () => {
    console.log('[A-Machine] 클라이언트 연결 종료');
    elevenLabsSTS.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  });

  openaiWs.on('close', (code, reason) => {
    console.log(`[A-Machine] OpenAI 연결 종료 (Code: ${code}, Reason: ${reason})`);
    if (clientWs.readyState === WebSocket.OPEN) {
      safeSend(clientWs, { type: 'session.closed' });
    }
  });

  openaiWs.on('error', (err) => {
    console.error('[A-Machine] OpenAI WebSocket 오류:', err.message);
    safeSend(clientWs, {
      type: 'error',
      message: `OpenAI 연결 오류: ${err.message}`
    });
  });
}

function getDynamicInstructions() {
  const now = new Date();
  
  // Calculate KST time (UTC + 9 hours)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstTime = new Date(utc + (9 * 60 * 60000));
  
  const year = kstTime.getFullYear();
  const month = String(kstTime.getMonth() + 1).padStart(2, '0');
  const date = String(kstTime.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${date}`;
  
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[kstTime.getDay()];
  
  const hours = String(kstTime.getHours()).padStart(2, '0');
  const minutes = String(kstTime.getMinutes()).padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;

  return `${SYSTEM_PROMPT}

## 📅 현재 시간 정보 (KST 기준 - 필수 준수)
- 현재 날짜: ${formattedDate} (${dayName}요일)
- 현재 시각: ${formattedTime}

## ⚠️ 날짜/시간 도구 호출 및 일정 매칭 지침 (매우 중요)
1. **상대적 날짜 계산**:
   - 발신자가 "오늘", "내일", "모레", "이번 주 금요일" 등으로 표현할 경우, **반드시 위의 '현재 날짜' 및 '요일'을 기준으로 정확한 YYYY-MM-DD 날짜를 수식으로 계산하여 도구를 호출**하세요. (예: 현재 날짜가 2026-05-19(화)이고 "내일"을 언급하면 반드시 '2026-05-20'으로 지정)
2. **일정 제목(Summary) 구성**:
   - 일정 제목(Summary)은 단순히 "저녁 식사"나 "회의"와 같이 광범위하게 작성하지 마세요.
   - **발신자가 대화 중 언급한 목적지, 만남 대상, 구체적인 장소나 키워드(예: '일지로 삼가', '을지로 3가', 'OO 부장님')가 있다면 이를 제목에 반드시 포함**하여 가시성 있게 구성하세요. (예: "일지로 삼가 저녁 식사" 또는 "을지로 3가 저녁 약속")
3. **일정 등록 및 결과 안내**:
   - 일정을 등록한 후 발신자에게 안내할 때는 등록된 날짜와 요일, 시간을 명확히 복기해 주어 신뢰감을 주세요.`;
}

function buildAssistSessionConfig(voice, assistContext) {
  return {
    type: 'realtime',
    model: REALTIME_MODEL,
    output_modalities: ['audio'],
    instructions: buildAssistInstructions(RECEIVER_NAME, assistContext),
    tools: TOOLS,
    tool_choice: 'auto',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
        transcription: {
          model: 'gpt-realtime-whisper',
          language: 'ko'
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'auto',
          create_response: false // 어시스트 모드: AI 자동 응답 없음, 트랜스크립션만
        }
      },
      output: {
        format: { type: 'audio/pcm', rate: AUDIO_SAMPLE_RATE },
        voice,
        speed: 1.0
      }
    }
  };
}

function buildSessionConfig(voice) {
  return {
    type: 'realtime',
    model: REALTIME_MODEL,
    output_modalities: ['audio'],
    instructions: getDynamicInstructions(),
    tools: TOOLS,
    tool_choice: 'auto',
    audio: {
      input: {
        format: {
          type: 'audio/pcm',
          rate: AUDIO_SAMPLE_RATE
        },
        transcription: {
          model: 'gpt-realtime-whisper',
          language: 'ko'
        },
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'auto',
          create_response: true
        }
      },
      output: {
        format: {
          type: 'audio/pcm',
          rate: AUDIO_SAMPLE_RATE
        },
        voice,
        speed: 1.0
      }
    }
  };
}

function safeSend(ws, payload) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
  }
}

async function handleFunctionCallsFromResponse(response, openaiWs, clientWs, handledFunctionCalls) {
  const outputs = response?.output || [];
  for (const item of outputs) {
    if (item.type === 'function_call') {
      await handleFunctionCall(item, openaiWs, clientWs, handledFunctionCalls);
    }
  }
}

/** Execute a function call and return result to OpenAI */
async function handleFunctionCall(event, openaiWs, clientWs, handledFunctionCalls) {
  const { name, arguments: argsStr, call_id } = event;
  if (!call_id || handledFunctionCalls.has(call_id)) return;
  handledFunctionCalls.add(call_id);

  console.log(`[A-Machine] Function Call: ${name}`, argsStr);

  let result;
  try {
    const args = JSON.parse(argsStr);

    // Notify client about tool execution
    safeSend(clientWs, {
      type: 'tool.executing',
      tool: name,
      args
    });

    if (name === 'check_calendar') {
      result = await checkCalendar(args.date);
    } else if (name === 'create_calendar_event') {
      result = await createCalendarEvent(args);
    } else {
      result = { error: `알 수 없는 도구: ${name}` };
    }
  } catch (err) {
    result = { error: err.message };
  }

  // Notify client about tool result
  safeSend(clientWs, {
    type: 'tool.result',
    tool: name,
    result
  });

  // Return result to OpenAI to continue conversation
  safeSend(openaiWs, {
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id,
      output: JSON.stringify(result)
    }
  });

  // Trigger model to continue responding
  safeSend(openaiWs, {
    type: 'response.create',
    response: { output_modalities: ['audio'] }
  });
}

/** Generate summary and send SMS notification on call end */
async function handleCallEnd(transcript, clientWs, openaiWs) {
  console.log('[A-Machine] 통화 종료 → 요약 생성 중...');

  try {
    const summary = await generateSummary(transcript);

    safeSend(clientWs, {
      type: 'call.summary',
      summary,
      receiver: {
        name: RECEIVER_NAME,
        phone: process.env.RECEIVER_PHONE || '010-1234-5678'
      },
      timestamp: new Date().toISOString()
    });
    
    // Close websockets
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    setTimeout(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    }, 250);
  } catch (err) {
    console.error('[A-Machine] 요약 생성 실패:', err.message);
    safeSend(clientWs, {
      type: 'call.summary',
      summary: {
        text: '요약 생성 중 오류가 발생했습니다.',
        caller: '알 수 없음',
        purpose: '확인 필요',
        actionItems: [],
        urgency: 'normal'
      },
      receiver: {
        name: RECEIVER_NAME,
        phone: process.env.RECEIVER_PHONE || '010-1234-5678'
      },
      timestamp: new Date().toISOString()
    });
    
    // Close websockets
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    setTimeout(() => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    }, 250);
  }
}
