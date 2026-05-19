import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';
import PhoneUI from './components/PhoneUI';
import SmsNotification from './components/SmsNotification';
import AgentSettings, { loadSettings } from './components/AgentSettings';

// ── 트리거 패턴 ────────────────────────────────────────────────────────────
const TRIGGER_PATTERNS = {
  onDateTime: /오늘|내일|모레|이번\s*주|다음\s*주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|\d+월\s*\d+일|\d+시(?:\s*반)?|오전|오후|언제/,
  onPrice:    /원|달러|유로|만\s*원|천\s*원|억|백만|천만|\d[\d,]*원/,
  onQuestion: /어떠세요|어때요|가능한가요|괜찮으세요|어떻게\s*생각|가능할까요|어떠신가요|할\s*수\s*있나요|되나요|맞나요/,
  onAccount:  /계좌|통장|계좌번호|계좌정보|은행|입금|송금|이체|주민등록번호|카드\s*번호|비밀번호|인증번호|OTP|보안카드/,
};
const COOLDOWN_KEYWORD = 3000;
const COOLDOWN_AUTO = 10000;

function checkTriggers(text, settings, lastTriggerTime) {
  if (!settings || settings.callMode !== 'assist') return null;
  const now = Date.now();

  const KEYWORD_RE = /에이머신|에이\s*머신|[Aa]\s*머신|헤이\s*머신|이머신/;
  if (settings.voiceKeyword !== false && KEYWORD_RE.test(text)) {
    if (now - lastTriggerTime >= COOLDOWN_KEYWORD) {
      const after = text.match(/(에이머신|에이\s*머신|[Aa]\s*머신|헤이\s*머신|이머신)[야아,!]?\s*(.+)/s);
      const question = after?.[2]?.trim();
      if (question) {
        return { trigger: 'keyword', reason: question };
      } else {
        return { trigger: 'keyword', waitForQuestion: true };
      }
    }
  }
  if (now - lastTriggerTime < COOLDOWN_AUTO) return null;

  // 계좌/금융정보 → 보이스피싱 즉각 경고 (별도 alert 타입)
  if (settings.autoTriggers?.onAccount && TRIGGER_PATTERNS.onAccount.test(text)) {
    return { trigger: 'alert', alertType: 'voicePhishing' };
  }

  for (const [key, pattern] of Object.entries(TRIGGER_PATTERNS)) {
    if (key === 'onAccount') continue; // 위에서 처리
    if (settings.autoTriggers?.[key] && pattern.test(text)) {
      const labels = {
        onDateTime: '날짜/시간 언급 감지',
        onPrice: '금액 언급 감지',
        onQuestion: '질문 감지',
      };
      return { trigger: 'auto', reason: labels[key] };
    }
  }

  for (const kw of (settings.customKeywords || [])) {
    if (kw && text.includes(kw)) {
      return { trigger: 'auto', reason: `키워드 감지: "${kw}"` };
    }
  }

  return null;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';
const OPENAI_AUDIO_RATE = 24000;

function resampleTo24k(input, sourceRate) {
  if (sourceRate === OPENAI_AUDIO_RATE) return input;

  const ratio = sourceRate / OPENAI_AUDIO_RATE;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const before = Math.floor(sourceIndex);
    const after = Math.min(before + 1, input.length - 1);
    const weight = sourceIndex - before;
    output[i] = input[before] * (1 - weight) + input[after] * weight;
  }

  return output;
}

function pcm16ToBase64(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function App() {
  const [callState, setCallState] = useState('idle'); // idle | connecting | active | ended
  const [messages, setMessages] = useState([]);
  const [currentVoice, setCurrentVoice] = useState('marin');
  const [summary, setSummary] = useState(null);
  const [smsVisible, setSmsVisible] = useState(false);
  const [toolActivity, setToolActivity] = useState(null);
  const [events, setEvents] = useState([]);
  const [memos, setMemos] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [echoGuard, setEchoGuard] = useState(true);
  const [agentSettings, setAgentSettings] = useState(loadSettings);
  const [agentStatus, setAgentStatus] = useState('passive'); // 'passive' | 'active'
  const [showSettings, setShowSettings] = useState(false);
  const [speakerRole, setSpeakerRole] = useState('caller'); // 'caller' | 'receiver'

  const wsRef = useRef(null);
  const playbackContextRef = useRef(null);
  const captureContextRef = useRef(null);
  const playbackTimeRef = useRef(0);
  const sessionReadyRef = useRef(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const echoGuardRef = useRef(true);
  const isModelSpeakingRef = useRef(false);
  const agentSettingsRef = useRef(agentSettings);
  const lastTriggerTimeRef = useRef(0);
  const speakerRoleRef = useRef('caller');
  const agentSourceNodesRef = useRef([]);       // 재생 중인 에이전트 오디오 소스 노드
  const agentGainNodeRef = useRef(null);        // GainNode — gain=0으로 즉각 무음 처리
  const agentPlayingRef = useRef(false);        // 에이전트 오디오 재생 중 여부
  const agentPlaybackTimeRef = useRef(0);       // 에이전트 전용 스케줄링 시각 (에코 가드와 분리)
  const agentPlaybackEndTimeRef = useRef(0);    // AudioContext 기준 실제 재생 종료 시각
  const agentPassiveTimerRef = useRef(null);         // passive 지연 타이머
  const agentInterruptModeRef = useRef(false);       // 인터럽트 대기 중 (다음 발화 = 분류 대상)
  const agentContinuationTimerRef = useRef(null);    // 연속 대화 자동 종료 타이머
  const agentTriggerTypeRef = useRef('keyword');     // 'keyword' | 'auto' — 연속 대화 활성 여부 결정
  const agentWaitingForQuestionRef = useRef(false);  // "에이머신" 후 질문 대기 중
  const agentMutedRef = useRef(false);               // 쉿 명령 후 오디오 차단
  const lastAgentTextRef = useRef('');

  useEffect(() => { agentSettingsRef.current = agentSettings; }, [agentSettings]);

  const handleToggleEchoGuard = useCallback((val) => {
    setEchoGuard(val);
    echoGuardRef.current = val;
  }, []);

  // Timer
  useEffect(() => {
    if (callState === 'active') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  // 에이전트 오디오가 지금 실제로 재생 중인지 (AudioContext 시각 기준)
  const isAgentActuallyPlaying = useCallback(() => {
    const ctx = playbackContextRef.current;
    return ctx ? ctx.currentTime < agentPlaybackEndTimeRef.current : false;
  }, []);

  // Stop all scheduled agent audio immediately via GainNode mute
  const stopAgentAudio = useCallback(() => {
    if (agentPassiveTimerRef.current) {
      clearTimeout(agentPassiveTimerRef.current);
      agentPassiveTimerRef.current = null;
    }
    // GainNode를 0으로 설정해 즉시 무음 처리 (소스 노드 참조 여부와 무관)
    if (agentGainNodeRef.current) {
      agentGainNodeRef.current.gain.setValueAtTime(0, 0);
    }
    agentSourceNodesRef.current.forEach(s => { try { s.stop(0); } catch {} });
    agentSourceNodesRef.current = [];
    agentPlayingRef.current = false;
    agentPlaybackEndTimeRef.current = 0;
    agentPlaybackTimeRef.current = playbackContextRef.current?.currentTime ?? 0;
  }, []);

  // Play agent audio — routes through GainNode for reliable muting
  const playAgentAudio = useCallback((base64Audio) => {
    try {
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: OPENAI_AUDIO_RATE });
      }
      const ctx = playbackContextRef.current;

      // GainNode 생성 (한 번만)
      if (!agentGainNodeRef.current) {
        const gain = ctx.createGain();
        gain.connect(ctx.destination);
        agentGainNodeRef.current = gain;
      }

      const raw = atob(base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      const buffer = ctx.createBuffer(1, float32.length, OPENAI_AUDIO_RATE);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(agentGainNodeRef.current); // destination이 아닌 GainNode에 연결
      const startAt = Math.max(ctx.currentTime, agentPlaybackTimeRef.current);
      source.start(startAt);
      agentPlaybackTimeRef.current = startAt + buffer.duration;
      agentPlaybackEndTimeRef.current = agentPlaybackTimeRef.current;
      agentSourceNodesRef.current.push(source);
    } catch (err) {
      console.error('Agent audio playback error:', err);
    }
  }, []);

  // Play audio from base64 PCM16
  const playAudio = useCallback((base64Audio) => {
    try {
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: OPENAI_AUDIO_RATE });
      }
      const ctx = playbackContextRef.current;
      const raw = atob(base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      const buffer = ctx.createBuffer(1, float32.length, OPENAI_AUDIO_RATE);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime, playbackTimeRef.current);
      source.start(startAt);
      playbackTimeRef.current = startAt + buffer.duration;
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  // Handle WebSocket messages from server
  const handleServerMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'session.ready':
          sessionReadyRef.current = true;
          playbackTimeRef.current = 0;
          setCallState('active');
          break;

        case 'response.output_audio.delta':
        case 'response.audio.delta':
          setIsModelSpeaking(true);
          isModelSpeakingRef.current = true;
          playAudio(data.delta);
          break;

        case 'response.output_audio.done':
        case 'response.audio.done':
          setIsModelSpeaking(false);
          isModelSpeakingRef.current = false;
          break;

        case 'response.output_audio_transcript.done':
        case 'response.audio_transcript.done':
          if (data.transcript) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: data.transcript,
              time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            }]);
          }
          setIsModelSpeaking(false);
          isModelSpeakingRef.current = false;
          break;

        case 'response.output_text.done':
          if (data.text) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              text: data.text,
              time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            }]);
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (data.transcript) {
            // 쉿 명령: 에이전트 즉시 무음 처리 (서버 분류 없음)
            if (/쉿/.test(data.transcript) && (isAgentActuallyPlaying() || agentInterruptModeRef.current)) {
              stopAgentAudio();
              agentInterruptModeRef.current = false;
              agentMutedRef.current = true;
              setAgentStatus('passive');
              break;
            }

            // 에이전트 인터럽트 모드: 발화를 분류 대상으로 서버에 전송
            if (agentInterruptModeRef.current) {
              agentInterruptModeRef.current = false;
              console.log(`[Client] 인터럽트 발화 전송: "${data.transcript}"`);
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'agent.interrupt',
                  userText: data.transcript,
                  agentSettings: agentSettingsRef.current,
                }));
              }
              break;
            }

            const role = agentSettingsRef.current?.callMode === 'assist'
              ? speakerRoleRef.current
              : 'user';
            setMessages(prev => [...prev, {
              role,
              text: data.transcript,
              time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            }]);

            // "에이머신" 후 질문 대기 중 → 이 발화가 질문
            if (agentWaitingForQuestionRef.current) {
              agentWaitingForQuestionRef.current = false;
              lastTriggerTimeRef.current = Date.now();
              agentTriggerTypeRef.current = 'keyword';
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'agent.invoke',
                  trigger: 'keyword',
                  reason: data.transcript,
                  agentSettings: agentSettingsRef.current,
                }));
              }
              break;
            }

            // 어시스트 모드 트리거 감지
            const triggerResult = checkTriggers(
              data.transcript,
              agentSettingsRef.current,
              lastTriggerTimeRef.current
            );
            if (triggerResult) {
              if (triggerResult.waitForQuestion) {
                // 질문 없이 호출어만 → "부르셨나요?" 발화 후 다음 발화 대기
                agentWaitingForQuestionRef.current = true;
                agentTriggerTypeRef.current = 'keyword';
                lastTriggerTimeRef.current = Date.now();
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'agent.greet' }));
                }
              } else if (triggerResult.trigger === 'alert') {
                // 보이스피싱 등 즉각 고정 경고 — agent.alert으로 서버에 전송 (연속 대화 없음)
                lastTriggerTimeRef.current = Date.now();
                agentTriggerTypeRef.current = 'auto';
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'agent.alert', alertType: triggerResult.alertType }));
                }
              } else if (wsRef.current?.readyState === WebSocket.OPEN) {
                lastTriggerTimeRef.current = Date.now();
                // auto 트리거(금액/날짜 등)는 한 번 경고 후 연속 대화 없이 종료
                agentTriggerTypeRef.current = triggerResult.trigger;
                wsRef.current.send(JSON.stringify({ type: 'agent.invoke', ...triggerResult, agentSettings: agentSettingsRef.current }));
              }
            }
          }
          break;

        case 'agent.active':
          agentInterruptModeRef.current = false;
          agentMutedRef.current = false;
          agentSourceNodesRef.current = [];
          agentPlayingRef.current = false;
          // 연속 대화 자동 종료 타이머 취소
          if (agentContinuationTimerRef.current) {
            clearTimeout(agentContinuationTimerRef.current);
            agentContinuationTimerRef.current = null;
          }
          // GainNode gain 복원 (쉿/stopAgentAudio 후 다음 응답 재생 가능하게)
          if (agentGainNodeRef.current) {
            agentGainNodeRef.current.gain.setValueAtTime(1, 0);
          }
          setAgentStatus('active');
          break;

        case 'agent.passive': {
          // 서버는 청크 전송 직후 passive를 보내지만 AudioContext는 아직 재생 중
          // → 실제 재생 종료 시각까지 기다렸다가 passive 처리
          agentInterruptModeRef.current = false;
          const ctx = playbackContextRef.current;
          const remaining = ctx
            ? Math.max(0, (agentPlaybackEndTimeRef.current - ctx.currentTime) * 1000)
            : 0;
          if (agentPassiveTimerRef.current) clearTimeout(agentPassiveTimerRef.current);
          agentPassiveTimerRef.current = setTimeout(() => {
            agentSourceNodesRef.current = [];
            agentPlayingRef.current = false;
            agentPlaybackEndTimeRef.current = 0;
            agentPlaybackTimeRef.current = 0;
            agentPassiveTimerRef.current = null;
            setAgentStatus('passive');
            // 키워드/버튼으로 호출된 경우에만 연속 대화 모드 활성
            // auto 트리거(계좌/금액/날짜 자동 감지)는 한 번 경고 후 바로 종료
            if (agentTriggerTypeRef.current === 'keyword') {
              agentInterruptModeRef.current = true;
              if (agentContinuationTimerRef.current) clearTimeout(agentContinuationTimerRef.current);
              agentContinuationTimerRef.current = setTimeout(() => {
                agentInterruptModeRef.current = false;
                agentContinuationTimerRef.current = null;
              }, 25000); // 25초 침묵 시 연속 대화 모드 종료
            }
          }, remaining + 100);
          break;
        }

        case 'agent.transcript':
          if (data.text) {
            lastAgentTextRef.current = data.text;
            setMessages(prev => {
              // resume 시 기존 에이전트 말풍선 교체 (중복 방지)
              const last = prev[prev.length - 1];
              if (last?.role === 'agent' && last?.resuming) {
                return [...prev.slice(0, -1), {
                  role: 'agent', text: data.text,
                  time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                }];
              }
              return [...prev, {
                role: 'agent', text: data.text,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
              }];
            });
          }
          break;

        case 'agent.audio':
          if (!agentInterruptModeRef.current && !agentMutedRef.current) {
            agentPlayingRef.current = true;
            playAgentAudio(data.delta);
          }
          break;

        case 'input_audio_buffer.speech_started': {
          const agentStillPlaying = isAgentActuallyPlaying() || agentPlayingRef.current;
          if (agentStillPlaying) {
            // 키워드 호출 세션: 사용자 발화 우선 → 에이전트 오디오 즉시 중단, 버퍼 유지
            if (agentTriggerTypeRef.current === 'keyword' || agentInterruptModeRef.current) {
              stopAgentAudio();
              // input_audio_buffer.clear 하지 않음 — 사용자 발화를 그대로 인식
            } else {
              // 에코 처리: auto 트리거 혹은 일반 에코 → 버퍼 클리어
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
              }
            }
          } else {
            playbackTimeRef.current = playbackContextRef.current?.currentTime || 0;
            setIsModelSpeaking(false);
            isModelSpeakingRef.current = false;
          }
          break;
        }

        case 'tool.executing':
          setToolActivity({ tool: data.tool, args: data.args, status: 'executing' });
          break;

        case 'tool.result':
          setToolActivity(null);
          if (data.tool === 'check_calendar' && data.result) {
            // Show calendar events in dashboard
            if (data.result.existingEvents) {
              setEvents(prev => [...prev, ...data.result.existingEvents.map(e => ({
                ...e, source: 'check'
              }))]);
            }
          }
          if (data.tool === 'create_calendar_event' && data.result?.success) {
            setEvents(prev => [...prev, {
              title: data.result.summary,
              start: data.result.start,
              end: data.result.end,
              source: 'created'
            }]);
          }
          break;

        case 'voice.changed':
          setCurrentVoice(data.voice);
          break;

        case 'mode.switched':
          if (data.mode === 'assist') {
            setAgentSettings(prev => {
              const updated = { ...prev, callMode: 'assist' };
              agentSettingsRef.current = updated;
              return updated;
            });
          }
          break;

        case 'call.summary':
          setSummary(data);
          setCallState('ended');
          sessionReadyRef.current = false;
          // Show SMS notification after 1.5s delay
          setTimeout(() => setSmsVisible(true), 1500);
          wsRef.current?.close();
          wsRef.current = null;
          break;

        case 'error':
          console.error('Server error:', data.error?.message || data.message || '알 수 없는 오류');
          // 통화 중 비치명적 오류(목소리 변경 실패 등)는 통화를 유지
          if (!sessionReadyRef.current) {
            setCallState('idle');
          }
          break;

        case 'session.closed':
          if (callState !== 'ended') setCallState('idle');
          sessionReadyRef.current = false;
          break;
      }
    } catch (err) {
      // Non-JSON messages (binary audio etc.) — ignore
    }
  }, [callState, playAudio, playAgentAudio, stopAgentAudio, isAgentActuallyPlaying]);

  // Stop microphone
  const stopMicrophone = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (captureContextRef.current) {
      captureContextRef.current.close();
      captureContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Start call
  const startCall = useCallback(async () => {
    setCallState('connecting');
    setMessages([]);
    setEvents([]);
    setMemos([]);
    setSummary(null);
    setElapsed(0);
    sessionReadyRef.current = false;
    playbackTimeRef.current = 0;
    agentPlaybackTimeRef.current = 0;
    agentPlaybackEndTimeRef.current = 0;
    agentWaitingForQuestionRef.current = false;
    agentInterruptModeRef.current = false;
    setSpeakerRole('caller');
    speakerRoleRef.current = 'caller';

    const settings = agentSettingsRef.current;
    const wsUrl = settings.callMode === 'assist'
      ? `${WS_URL}?voice=${currentVoice}&mode=assist&context=${encodeURIComponent(settings.assistContext || '')}`
      : `${WS_URL}?voice=${currentVoice}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log('[Client] WebSocket 연결됨');
    ws.onmessage = handleServerMessage;
    ws.onerror = (err) => {
      console.error('[Client] WebSocket 오류:', err);
      setCallState('idle');
    };
    ws.onclose = () => {
      console.log('[Client] WebSocket 종료');
      stopMicrophone();
      sessionReadyRef.current = false;
      setCallState(prev => prev === 'ended' ? 'ended' : 'idle');
      if (wsRef.current === ws) wsRef.current = null;
      // 통화 중 모드 전환이 있었을 경우 저장된 설정으로 원복
      const saved = loadSettings();
      setAgentSettings(saved);
      agentSettingsRef.current = saved;
    };

    // Start microphone capture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext();
      captureContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Use ScriptProcessor for PCM extraction (AudioWorklet would be better for prod)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (!sessionReadyRef.current) return;
        
        // Echo Guard: AI 또는 에이전트가 스피커로 출력 중이면 마이크 전송 차단
        const isSpeaking = isModelSpeakingRef.current || (
          playbackContextRef.current &&
          playbackContextRef.current.currentTime < (playbackTimeRef.current + 0.3)
        );
        const isAgentSpeaking = agentPlayingRef.current || isAgentActuallyPlaying();
        if (echoGuardRef.current && (isSpeaking || isAgentSpeaking)) return;

        const float32 = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo24k(float32, audioCtx.sampleRate);
        const base64 = pcm16ToBase64(resampled);
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('[Client] 마이크 접근 실패:', err);
      alert('마이크 접근 권한이 필요합니다.\n브라우저 설정에서 마이크 권한을 허용해 주세요.');
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setCallState('idle');
      sessionReadyRef.current = false;
    }
  }, [handleServerMessage, currentVoice, stopMicrophone]);

  // End call
  const endCall = useCallback(() => {
    stopAgentAudio();
    stopMicrophone();
    sessionReadyRef.current = false;
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'call.end' }));
      } else {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
    setCallState('ended');
  }, [stopMicrophone, stopAgentAudio]);

  // Change voice
  const changeVoice = useCallback((voiceObj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'voice.change',
        voice: voiceObj.id,
        provider: voiceObj.provider,
        elevenLabsVoiceId: voiceObj.voiceId
      }));
    }
    setCurrentVoice(voiceObj.id);
  }, []);

  const handleResetCallState = useCallback(() => {
    setCallState('idle');
    setMessages([]);
    setSummary(null);
    setElapsed(0);
    setAgentStatus('passive');
    // 통화 중 모드 전환(이어받기 + 어시스트)으로 변경된 callMode를
    // 저장된 설정으로 원복하여 다음 통화가 올바른 모드로 시작되게 한다
    const saved = loadSettings();
    setAgentSettings(saved);
    agentSettingsRef.current = saved;
  }, []);

  const toggleSpeakerRole = useCallback(() => {
    setSpeakerRole(prev => {
      const next = prev === 'caller' ? 'receiver' : 'caller';
      speakerRoleRef.current = next;
      return next;
    });
  }, []);

  const invokeAgent = useCallback(() => {
    lastTriggerTimeRef.current = Date.now();
    agentTriggerTypeRef.current = 'keyword';
    agentWaitingForQuestionRef.current = true;
  }, []);

  const getAgentSettings = useCallback(() => agentSettingsRef.current, []);

  const handleSaveSettings = useCallback((newSettings) => {
    setAgentSettings(newSettings);
    agentSettingsRef.current = newSettings;
  }, []);

  // 자동응답 통화 중 전화 이어받기 — AI 종료
  const handleTakeover = useCallback(() => {
    endCall();
  }, [endCall]);

  // 자동응답 통화 중 전화 이어받기 + 어시스트 모드 전환
  const handleTakeoverAssist = useCallback(() => {
    setAgentSettings(prev => {
      const updated = { ...prev, callMode: 'assist' };
      agentSettingsRef.current = updated;
      return updated;
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mode.switch', mode: 'assist' }));
    }
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="app">
      <PhoneUI
        callState={callState}
        messages={messages}
        elapsed={elapsed}
        isModelSpeaking={isModelSpeaking}
        echoGuard={echoGuard}
        onToggleEchoGuard={handleToggleEchoGuard}
        onStartCall={startCall}
        onEndCall={endCall}
        formatTime={formatTime}
        summary={summary}
        onResetCallState={handleResetCallState}
        callMode={agentSettings.callMode}
        agentStatus={agentStatus}
        onInvokeAgent={invokeAgent}
        onOpenSettings={() => setShowSettings(true)}
        speakerRole={speakerRole}
        onToggleSpeaker={toggleSpeakerRole}
        currentVoice={currentVoice}
        onChangeVoice={changeVoice}
        onTakeover={handleTakeover}
        onTakeoverAssist={handleTakeoverAssist}
        takeoverMode={agentSettings.takeoverMode}
      />

      {smsVisible && summary && (
        <SmsNotification
          summary={summary}
          onClose={() => setSmsVisible(false)}
        />
      )}

      {showSettings && (
        <AgentSettings
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
          currentVoice={currentVoice}
          onChangeVoice={changeVoice}
        />
      )}
    </div>
  );
}
