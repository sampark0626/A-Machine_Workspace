// OpenAI Realtime API session management with Function Calling
import { WebSocket } from 'ws';
import { checkCalendar, createCalendarEvent } from './calendarTools.js';
import { generateSummary } from './summaryNotifier.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';
const RECEIVER_NAME = process.env.RECEIVER_NAME || '김부장';

const SYSTEM_PROMPT = `## 역할
당신은 ${RECEIVER_NAME}님을 대신해 전화를 받는 AI 엔서링머신 에이전트 "A-Machine"입니다.

## 성격과 톤
- 따뜻하고 전문적인 한국어 상담사
- 자연스러운 존댓말 사용 (격식체와 비격식체를 상황에 맞게)
- 간결한 발화 (15초 이내)
- 적절한 추임새: "네", "그렇군요", "알겠습니다"
- 너무 길게 말하지 말고, 한 번에 2-3문장 이내로

## 첫 인사
통화가 시작되면 반드시 먼저 인사하세요:
"안녕하세요, ${RECEIVER_NAME}님의 AI 비서 에이머신입니다. 용건을 말씀해 주세요."

## 핵심 업무 흐름
1. 인사 → 발신자 용건 경청
2. 용건 파악 → 핵심 내용 확인 및 반복
3. 일정 관련 요청 시:
   - check_calendar 도구로 해당 날짜 캘린더 확인
   - 비어있는 시간대를 자연스럽게 안내
   - 발신자와 시간 협상 (대안 제시)
   - 합의되면 create_calendar_event로 등록
4. 메모/전달 요청 시: 핵심 내용 정리 확인
5. 통화 마무리: 전달 내용 요약 확인 → 종료 인사

## 캘린더 협상 예시
- "그 날 일정을 확인해 볼게요... 오후 2시부터 4시까지 비어있는데요, 괜찮으실까요?"
- "아, 그 시간은 이미 일정이 있네요. 오전 10시는 어떠세요?"
- "네, 그럼 그 시간으로 잡아둘게요."

## 제약
- ${RECEIVER_NAME}님 대신 업무 의사결정을 하지 마세요
- 불확실한 정보: "확인 후 연락드리겠습니다"
- 개인정보 최소 수집
- 발신자가 급한 용건이면 "긴급으로 표시해서 전달하겠습니다"로 안내`;

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
export function handleRealtimeConnection(clientWs) {
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
  let currentVoice = 'nova';

  // Connect to OpenAI Realtime API
  const openaiWs = new WebSocket(REALTIME_URL, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    }
  });

  // Forward OpenAI events → Client
  openaiWs.on('message', async (data) => {
    try {
      const event = JSON.parse(data.toString());

      // 1. Initial setup when session is created
      if (event.type === 'session.created') {
        console.log('[A-Machine] OpenAI 세션 생성됨');
        
        // Configure the session
        openaiWs.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: SYSTEM_PROMPT,
            voice: currentVoice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            tools: TOOLS,
            tool_choice: 'auto',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600
            }
          }
        }));

        // Trigger initial greeting
        openaiWs.send(JSON.stringify({
          type: 'response.create',
          response: {
            instructions: '통화가 시작되었습니다. 첫 인사를 해주세요.'
          }
        }));

        clientWs.send(JSON.stringify({ type: 'session.ready' }));
        return;
      }

      // Log OpenAI error events
      if (event.type === 'error') {
        console.error('[A-Machine] OpenAI로부터 에러 수신:', JSON.stringify(event.error, null, 2));
      }

      // Handle function calls from the model
      if (event.type === 'response.function_call_arguments.done') {
        await handleFunctionCall(event, openaiWs, clientWs);
        return;
      }

      // Track transcripts
      if (event.type === 'response.audio_transcript.done') {
        transcript.push({ role: 'assistant', text: event.transcript });
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        transcript.push({ role: 'user', text: event.transcript });
      }

      // Forward to client
      clientWs.send(data.toString());
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
        openaiWs.send(JSON.stringify({
          type: 'session.update',
          session: { voice: msg.voice }
        }));
        clientWs.send(JSON.stringify({
          type: 'voice.changed',
          voice: msg.voice
        }));
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
      clientWs.send(JSON.stringify({ type: 'session.closed' }));
    }
  });

  openaiWs.on('error', (err) => {
    console.error('[A-Machine] OpenAI WebSocket 오류:', err.message);
    clientWs.send(JSON.stringify({
      type: 'error',
      message: `OpenAI 연결 오류: ${err.message}`
    }));
  });
}

/** Execute a function call and return result to OpenAI */
async function handleFunctionCall(event, openaiWs, clientWs) {
  const { name, arguments: argsStr, call_id } = event;
  console.log(`[A-Machine] Function Call: ${name}`, argsStr);

  let result;
  try {
    const args = JSON.parse(argsStr);

    // Notify client about tool execution
    clientWs.send(JSON.stringify({
      type: 'tool.executing',
      tool: name,
      args
    }));

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
  clientWs.send(JSON.stringify({
    type: 'tool.result',
    tool: name,
    result
  }));

  // Return result to OpenAI to continue conversation
  openaiWs.send(JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id,
      output: JSON.stringify(result)
    }
  }));

  // Trigger model to continue responding
  openaiWs.send(JSON.stringify({
    type: 'response.create'
  }));
}

/** Generate summary and send SMS notification on call end */
async function handleCallEnd(transcript, clientWs, openaiWs) {
  console.log('[A-Machine] 통화 종료 → 요약 생성 중...');

  try {
    const summary = await generateSummary(transcript);

    clientWs.send(JSON.stringify({
      type: 'call.summary',
      summary,
      receiver: {
        name: RECEIVER_NAME,
        phone: process.env.RECEIVER_PHONE || '010-1234-5678'
      },
      timestamp: new Date().toISOString()
    }));
    
    // Close websockets
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    clientWs.close();
  } catch (err) {
    console.error('[A-Machine] 요약 생성 실패:', err.message);
    clientWs.send(JSON.stringify({
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
    }));
    
    // Close websockets
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    clientWs.close();
  }
}
