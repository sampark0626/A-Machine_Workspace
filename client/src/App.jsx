import { useState, useCallback, useRef, useEffect } from 'react';
import './index.css';
import PhoneUI from './components/PhoneUI';
import Dashboard from './components/Dashboard';
import VoiceSelector from './components/VoiceSelector';
import SmsNotification from './components/SmsNotification';

const WS_URL = 'ws://localhost:3001/ws';

export default function App() {
  const [callState, setCallState] = useState('idle'); // idle | connecting | active | ended
  const [messages, setMessages] = useState([]);
  const [currentVoice, setCurrentVoice] = useState('nova');
  const [summary, setSummary] = useState(null);
  const [smsVisible, setSmsVisible] = useState(false);
  const [toolActivity, setToolActivity] = useState(null);
  const [events, setEvents] = useState([]);
  const [memos, setMemos] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);

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

  // Play audio from base64 PCM16
  const playAudio = useCallback((base64Audio) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const raw = atob(base64Audio);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start();
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
          setCallState('active');
          break;

        case 'response.audio.delta':
          setIsModelSpeaking(true);
          playAudio(data.delta);
          break;

        case 'response.audio.done':
          setIsModelSpeaking(false);
          break;

        case 'response.audio_transcript.done':
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: data.transcript,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          }]);
          setIsModelSpeaking(false);
          break;

        case 'conversation.item.input_audio_transcription.completed':
          setMessages(prev => [...prev, {
            role: 'user',
            text: data.transcript,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
          }]);
          break;

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

        case 'call.summary':
          setSummary(data);
          setCallState('ended');
          // Show SMS notification after 1.5s delay
          setTimeout(() => setSmsVisible(true), 1500);
          break;

        case 'error':
          console.error('Server error:', data.message);
          break;

        case 'session.closed':
          if (callState !== 'ended') setCallState('idle');
          break;
      }
    } catch (err) {
      // Non-JSON messages (binary audio etc.) — ignore
    }
  }, [callState, playAudio]);

  // Start call
  const startCall = useCallback(async () => {
    setCallState('connecting');
    setMessages([]);
    setEvents([]);
    setMemos([]);
    setSummary(null);
    setElapsed(0);

    const ws = new WebSocket(WS_URL);
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
    };

    // Start microphone capture
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true }
      });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Use ScriptProcessor for PCM extraction (AudioWorklet would be better for prod)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.floor(float32[i] * 32768)));
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)));
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('[Client] 마이크 접근 실패:', err);
    }
  }, [handleServerMessage]);

  // Stop microphone
  const stopMicrophone = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // End call
  const endCall = useCallback(() => {
    stopMicrophone();
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'call.end' }));
    }
  }, [stopMicrophone]);

  // Change voice
  const changeVoice = useCallback((voice) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'voice.change', voice }));
    }
    setCurrentVoice(voice);
  }, []);

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="logo-icon">A</div>
          <div>
            <div className="app-title">A-Machine</div>
            <div className="app-subtitle">AI Answering Machine Agent v2</div>
          </div>
        </div>
        <div className={`status-badge ${callState === 'active' ? 'active' : callState === 'ended' ? 'ended' : ''}`}>
          <div className={`status-dot ${callState === 'active' ? 'active' : callState === 'ended' ? 'ended' : ''}`} />
          {callState === 'idle' && '대기 중'}
          {callState === 'connecting' && '연결 중...'}
          {callState === 'active' && `통화 중 · ${formatTime(elapsed)}`}
          {callState === 'ended' && '통화 종료'}
        </div>
      </header>

      {/* Main Grid */}
      <div className="main-grid">
        <Dashboard
          callState={callState}
          messages={messages}
          events={events}
          memos={memos}
          toolActivity={toolActivity}
          elapsed={elapsed}
          summary={summary}
        />
        <div className="phone-wrapper">
          <PhoneUI
            callState={callState}
            messages={messages}
            elapsed={elapsed}
            isModelSpeaking={isModelSpeaking}
            onStartCall={startCall}
            onEndCall={endCall}
            formatTime={formatTime}
          />
          {callState === 'active' && (
            <VoiceSelector
              currentVoice={currentVoice}
              onChangeVoice={changeVoice}
            />
          )}
        </div>
      </div>

      {/* SMS Notification Overlay */}
      {smsVisible && summary && (
        <SmsNotification
          summary={summary}
          onClose={() => setSmsVisible(false)}
        />
      )}
    </div>
  );
}
