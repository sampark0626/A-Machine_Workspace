// OpenAI Realtime API session management with Function Calling
import { WebSocket } from 'ws';
import { checkCalendar, createCalendarEvent } from './calendarTools.js';
import { generateSummary } from './summaryNotifier.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2';
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`;
const RECEIVER_NAME = process.env.RECEIVER_NAME || '수민';
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
const AUDIO_SAMPLE_RATE = 24000;

const SYSTEM_PROMPT = `## 역할
당신은 ${RECEIVER_NAME}님을 대신해 전화를 받는 AI 엔서링머신 에이전트 "A-Machine"입니다.

## 성격과 톤
- 따뜻하고 신뢰감을 주는 스마트한 한국어 비서
- 자연스럽고 상냥한 존댓말 사용 (하십시오체와 해요체를 자연스럽게 혼용)
- 극도의 간결함 유지: 한 번 말할 때 반드시 **1~2문장** 이내로 짧게 대답하세요 (전화 통화에서 AI가 길게 말하면 매우 지루해집니다).

## 한국어 발화 지침 (음성 자연스러움 극대화)
- **자연스러운 쉼표(,) 및 말줄임표(...) 활용**:
  - 문장 사이에 쉼표(`,`)와 말줄임표(`...`)를 의도적으로 적극 섞어서 대답을 구성하세요. 오디오 합성 모델(TTS)이 이 문장 부호를 실제 사람의 자연스러운 '호흡 쉼'과 '억양의 올림/내림'으로 매끄럽게 번역하여 출력합니다.
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
"안녕하세요! ${RECEIVER_NAME}님의 AI 비서 에이머신입니다. 어떤 용건이신가요?"

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

  // Extract voice from query parameter if available
  if (req && req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const voiceParam = url.searchParams.get('voice');
      if (voiceParam) {
        currentVoice = voiceParam;
        console.log(`[A-Machine] 클라이언트 요청 음성 사용: ${currentVoice}`);
      }
    } catch (e) {
      console.warn('[A-Machine] URL 파싱 실패, 기본값 사용:', e.message);
    }
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
        
        // Configure the session
        safeSend(openaiWs, {
          type: 'session.update',
          session: buildSessionConfig(currentVoice)
        });
        return;
      }

      // Start the greeting only after the server accepts the session settings.
      if (event.type === 'session.updated' && !sessionReady) {
        sessionReady = true;
        safeSend(clientWs, {
          type: 'session.ready',
          model: REALTIME_MODEL,
          voice: currentVoice
        });
        safeSend(openaiWs, {
          type: 'response.create',
          response: {
            output_modalities: ['audio']
          }
        });
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

      // Handle voice change request from client
      if (msg.type === 'voice.change') {
        currentVoice = msg.voice;
        safeSend(openaiWs, {
          type: 'session.update',
          session: {
            audio: {
              output: {
                voice: msg.voice
              }
            }
          }
        });
        safeSend(clientWs, {
          type: 'voice.changed',
          voice: msg.voice
        });
        console.log(`[A-Machine] 음성 변경: ${msg.voice}`);
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

function buildSessionConfig(voice) {
  return {
    type: 'realtime',
    model: REALTIME_MODEL,
    output_modalities: ['audio'],
    instructions: SYSTEM_PROMPT,
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
