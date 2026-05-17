import { useRef, useEffect } from 'react';

export default function PhoneUI({ callState, messages, elapsed, isModelSpeaking, echoGuard, onToggleEchoGuard, onStartCall, onEndCall, formatTime }) {
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="phone-shell">
      <div className="phone-screen">
        {/* Header */}
        <div className="phone-header">
          <div className="caller-info">
            <div className="caller-avatar">A</div>
            <div>
              <div className="caller-name">A-Machine 통화</div>
              <div className="caller-status">
                {callState === 'active' ? '실시간 응대 중' : callState === 'ended' ? '통화 종료' : '대기 중'}
              </div>
            </div>
          </div>
          {callState === 'active' && (
            <div className="call-timer">{formatTime(elapsed)}</div>
          )}
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {callState === 'idle' && (
            <div className="empty-state">
              <div style={{ fontSize: 48, marginBottom: 16 }}>📞</div>
              <p>통화를 시작하려면 아래 버튼을 누르세요</p>
            </div>
          )}
          {callState === 'connecting' && (
            <div className="empty-state">
              <div className="typing-indicator" style={{ justifyContent: 'center' }}>
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
              <p style={{ marginTop: 12 }}>연결 중...</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`bubble-row ${msg.role}`}>
              <div className={`bubble ${msg.role}`}>
                <span className="bubble-speaker">
                  {msg.role === 'user' ? '📞 발신자' : '🤖 A-Machine'}
                </span>
                {msg.text}
                <span className="bubble-time">{msg.time}</span>
              </div>
            </div>
          ))}
          {isModelSpeaking && (
            <div className="bubble-row assistant">
              <div className="bubble assistant">
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Echo Guard Option (Only visible when call is active or ready) */}
        {callState === 'active' && (
          <div className="echo-guard-wrapper">
            <div className="echo-guard-toggle" onClick={() => onToggleEchoGuard(!echoGuard)}>
              <div className={`echo-switch ${echoGuard ? 'active' : ''}`}>
                <div className="echo-knob" />
              </div>
              <span style={{ fontWeight: 600 }}>에코 방지 모드 {echoGuard ? 'ON' : 'OFF'}</span>
            </div>
            <p className="echo-guard-tip">
              {echoGuard 
                ? "🔊 스피커 사용 중 (스피커 소리가 마이크로 재입력되는 것을 완벽히 방지)" 
                : "🎧 헤드셋/이어폰 사용 중 (자연스러운 끼어들기/말끊기 활성화)"}
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="phone-controls">
          {callState === 'idle' && (
            <button className="mic-button" onClick={onStartCall} title="통화 시작">
              📞
            </button>
          )}
          {callState === 'active' && (
            <>
              <button className="mic-button recording" title="녹음 중 (자동)">
                🎙️
              </button>
              <button className="end-call-btn" onClick={onEndCall}>
                📴 통화 종료
              </button>
            </>
          )}
          {callState === 'ended' && (
            <button className="mic-button" onClick={onStartCall} title="새 통화 시작">
              🔄
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
