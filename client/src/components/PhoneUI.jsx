import { useState, useRef, useEffect } from 'react';
import { VOICES } from './AgentSettings';

export default function PhoneUI({
  callState,
  messages,
  elapsed,
  isModelSpeaking,
  echoGuard,
  onToggleEchoGuard,
  onStartCall,
  onEndCall,
  formatTime,
  summary,
  onResetCallState,
  callMode = 'answering',
  agentStatus = 'passive',
  onInvokeAgent,
  onOpenSettings,
  speakerRole = 'caller',
  onToggleSpeaker,
  currentVoice = 'marin',
  onChangeVoice,
  onTakeover,
  onTakeoverAssist,
  takeoverMode = 'assist',
}) {
  const [activeTab, setActiveTab] = useState('recents');
  const [keypadInput, setKeypadInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [showCallKeypad, setShowCallKeypad] = useState(false);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [showTakeoverSheet, setShowTakeoverSheet] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isModelSpeaking]);

  // Reset local state when call state transitions
  useEffect(() => {
    if (callState === 'connecting' || callState === 'active') {
      setKeypadInput('');
      setIsMuted(false);
      setShowCallKeypad(false);
    }
  }, [callState]);

  // Keypad Handlers
  const handleKeyClick = (val) => {
    if (keypadInput.length < 13) {
      // Add formatting for phone numbers roughly
      setKeypadInput(prev => {
        const next = prev + val;
        if (next === '021234567') return '02-123-4567';
        return next;
      });
    }
  };

  // Recent call records
  const recentCalls = [
    { name: '아빠 💖', number: '010-5555-1234', time: '오후 1:24', type: 'inbound', isMissed: false },
    { name: 'A-Machine 통화 비서', number: '02-123-4567', time: '오전 10:15', type: 'missed', isMissed: true, isSpecial: true },
    { name: '김 부장님', number: '010-9876-5432', time: '오전 9:40', type: 'outbound', isMissed: false },
    { name: '이모', number: '010-2222-3333', time: '어제', type: 'inbound', isMissed: false },
    { name: '택배', number: '010-1111-2222', time: '어제', type: 'inbound', isMissed: false }
  ];

  return (
    <div className="phone-shell">
      {/* Notch / Dynamic Island */}
      <div className="phone-notch" />

      {/* Screen */}
      <div className="phone-screen">
        {/* Status Bar */}
        <div className="phone-status-bar">
          <span className="status-time">09:41</span>
          <div className="status-right">
            <span>📶</span>
            <span>LTE</span>
            <span>🔋 85%</span>
          </div>
        </div>

        {/* Home Indicator */}
        <div className="phone-home-indicator" />

        {/* ================= SCREEN CONTENT BY STATE ================= */}

        {/* 1. IDLE / READY STATE */}
        {callState === 'idle' && (
          <>
            {/* Standby View based on Tabs */}
            {activeTab === 'recents' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div className="recents-header">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="recents-title">최근 통화</div>
                    <button className="settings-icon-btn" onClick={onOpenSettings} title="에이전트 설정">
                      ⚙️
                    </button>
                  </div>
                  <div className={`mode-badge ${callMode === 'assist' ? 'assist' : 'answering'}`}>
                    {callMode === 'assist' ? '🎧 통화 어시스트 모드' : '📞 자동 응답 모드'}
                  </div>
                  <div className="recents-tabs">
                    <button className="recents-tab-btn active">전체</button>
                    <button className="recents-tab-btn">부재중</button>
                  </div>
                </div>

                <div className="recents-list">
                  <div className="recents-divider">오늘</div>
                  {recentCalls.slice(0, 3).map((call, idx) => (
                    <div key={idx} className="recent-item" onClick={onStartCall}>
                      <div className="recent-item-left">
                        <div className={`recent-item-avatar ${call.isSpecial ? 'special' : ''}`}>
                          {call.isSpecial ? '🤖' : call.name[0]}
                        </div>
                        <div className="recent-item-info">
                          <span className={`recent-item-name ${call.isMissed ? 'missed' : ''}`}>
                            {call.name}
                          </span>
                          <span className="recent-item-meta">
                            {call.type === 'inbound' && '📞 수신'}
                            {call.type === 'outbound' && '↗️ 발신'}
                            {call.type === 'missed' && '🔴 부재중'}
                            {` · ${call.number}`}
                          </span>
                        </div>
                      </div>
                      <div className="recent-item-right">
                        <span className="recent-item-time">{call.time}</span>
                        <button className="recent-item-info-btn" onClick={(e) => { e.stopPropagation(); alert(`${call.name} 상세 정보\n전화번호: ${call.number}`); }}>
                          ⓘ
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="recents-divider">어제</div>
                  {recentCalls.slice(3).map((call, idx) => (
                    <div key={idx} className="recent-item" onClick={onStartCall}>
                      <div className="recent-item-left">
                        <div className="recent-item-avatar">{call.name[0]}</div>
                        <div className="recent-item-info">
                          <span className="recent-item-name">{call.name}</span>
                          <span className="recent-item-meta">📞 수신 · {call.number}</span>
                        </div>
                      </div>
                      <div className="recent-item-right">
                        <span className="recent-item-time">{call.time}</span>
                        <button className="recent-item-info-btn" onClick={(e) => { e.stopPropagation(); alert(`${call.name} 상세 정보\n전화번호: ${call.number}`); }}>
                          ⓘ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Floating Dialer FAB */}
                <button className="floating-call-btn" onClick={onStartCall} title="A-Machine 통화 시작">
                  📞
                </button>
              </div>
            )}

            {activeTab === 'keypad' && (
              <div className="keypad-container">
                <div className="keypad-display">
                  {keypadInput || '번호를 입력하세요'}
                </div>
                <div className="keypad-grid">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((key) => (
                    <button key={key} className="keypad-key" onClick={() => handleKeyClick(key)}>
                      <span className="keypad-num">{key}</span>
                      <span className="keypad-letters">
                        {key === '2' && 'ABC'}
                        {key === '3' && 'DEF'}
                        {key === '4' && 'GHI'}
                        {key === '5' && 'JKL'}
                        {key === '6' && 'MNO'}
                        {key === '7' && 'PQRS'}
                        {key === '8' && 'TUV'}
                        {key === '9' && 'WXYZ'}
                        {key === '0' && '+'}
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <div style={{ width: 50 }} /> {/* balance placeholder */}
                  <button className="keypad-dial-btn" onClick={onStartCall} title="통화 시작">
                    📞
                  </button>
                  {keypadInput.length > 0 ? (
                    <button 
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 18, cursor: 'pointer', width: 50 }}
                      onClick={handleKeyDelete}
                    >
                      ⌫
                    </button>
                  ) : (
                    <div style={{ width: 50 }} />
                  )}
                </div>
              </div>
            )}

            {(activeTab === 'favorites' || activeTab === 'contacts') && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
                <span style={{ fontSize: 44, opacity: 0.6, marginBottom: 12 }}>
                  {activeTab === 'favorites' ? '⭐' : '👤'}
                </span>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
                  {activeTab === 'favorites' ? '즐겨찾기 목록 비어있음' : '등록된 연락처가 없음'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', maxWidth: 220 }}>
                  통화 이력 탭에서 연락처를 등록하거나 터치하여 대화를 시작할 수 있습니다.
                </div>
              </div>
            )}

            {/* Bottom Tab Bar */}
            <div className="phone-tab-bar">
              <button className={`phone-tab-item ${activeTab === 'favorites' ? 'active' : ''}`} onClick={() => setActiveTab('favorites')}>
                <span className="phone-tab-icon">⭐</span>
                <span>즐겨찾기</span>
              </button>
              <button className={`phone-tab-item ${activeTab === 'recents' ? 'active' : ''}`} onClick={() => setActiveTab('recents')}>
                <span className="phone-tab-icon">🕒</span>
                <span>최근 통화</span>
              </button>
              <button className={`phone-tab-item ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveTab('contacts')}>
                <span className="phone-tab-icon">👤</span>
                <span>연락처</span>
              </button>
              <button className={`phone-tab-item ${activeTab === 'keypad' ? 'active' : ''}`} onClick={() => setActiveTab('keypad')}>
                <span className="phone-tab-icon">🔢</span>
                <span>키패드</span>
              </button>
            </div>
          </>
        )}

        {/* 2. CONNECTING STATE */}
        {callState === 'connecting' && (
          <div className="connecting-screen">
            <div className="connecting-avatar-container">
              <div className="connecting-ring" />
              <div className="connecting-avatar">🤖</div>
            </div>
            <div className="connecting-info">
              <div className="connecting-title">A-Machine 통화 비서</div>
              <div className="connecting-desc">전화 연결을 시작합니다...</div>
              <div className="connecting-pulse-dots">
                <div className="pulse-dot" />
                <div className="pulse-dot" />
                <div className="pulse-dot" />
              </div>
            </div>
          </div>
        )}

        {/* 3. ACTIVE STATE (A-DOT THEME) */}
        {callState === 'active' && (
          <div className="active-call-screen">
            {/* Ambient Fluid Glow */}
            <div className="active-ambient-glow" />

            <div className="call-content-box">
              {/* Pulsating Avatar */}
              <div className="speaking-avatar-wrapper">
                <div className="speaking-outer-ring" />
                <div className={`speaking-glow-ring ${isModelSpeaking ? 'active' : ''}`} />
                <div className="call-avatar-img">🤖</div>
              </div>

              <div className="caller-detail">
                <div className="caller-detail-name">
                  {callMode === 'assist' ? '🎧 통화 어시스트' : 'A-Machine 통화 비서'}
                </div>
                <div className="caller-detail-timer">
                  {callMode === 'assist'
                    ? agentStatus === 'active' ? '🟢 에이전트 응답 중' : '🎙️ 통화 녹취 중'
                    : isModelSpeaking ? '🎙️ AI 답변 중' : '🎧 대기 중'
                  } · {formatTime(elapsed)}
                </div>
              </div>

              {/* 어시스트 모드: 역할 전환 버튼 + 에이전트 상태 배너 */}
              {callMode === 'assist' && (
                <>
                  <button
                    className={`speaker-role-toggle ${speakerRole}`}
                    onClick={onToggleSpeaker}
                    title="발신자 / 수신자 전환"
                  >
                    <span className="role-icon">
                      {speakerRole === 'caller' ? '📞' : '📱'}
                    </span>
                    <span className="role-label">
                      {speakerRole === 'caller' ? '발신자로 말하는 중' : '수신자로 말하는 중'}
                    </span>
                    <span className="role-switch-hint">탭하여 전환 →</span>
                  </button>
                  <div className={`assist-status-banner ${agentStatus === 'active' ? 'active' : ''}`}>
                    {agentStatus === 'active'
                      ? '🟢 에이전트 응답 중 — 이어폰으로 청취하세요'
                      : '⚪ 에이전트 대기 중 — "에이전트"라고 말하거나 버튼을 눌러 호출'}
                  </div>
                </>
              )}
            </div>

            {/* Glassmorphism Chat Bubble Card */}
            <div className="glass-transcript-card">
              <div className="transcript-scroll-view">
                {messages.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.5, textAlign: 'center', padding: '20px 10px' }}>
                    <span style={{ fontSize: 24, marginBottom: 8 }}>💬</span>
                    <p style={{ fontSize: 12 }}>실시간 음성 통화 내용이여기에 투명 텍스트 말풍선으로 기록됩니다.</p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`glass-bubble-wrapper ${msg.role}`}>
                    <div className={`glass-bubble ${msg.role}`}>
                      <span className="bubble-tag-speaker">
                        {msg.role === 'caller' ? '📞 발신자'
                          : msg.role === 'receiver' ? '📱 수신자'
                          : msg.role === 'agent' ? '🤖 에이전트 (귓속말)'
                          : msg.role === 'user' ? '👤 나'
                          : '🤖 A-Machine'}
                      </span>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isModelSpeaking && (
                  <div className="glass-bubble-wrapper assistant">
                    <div className="glass-bubble assistant" style={{ padding: '8px 12px' }}>
                      <div className="typing-indicator">
                        <div className="typing-dot" style={{ background: '#34d399' }} />
                        <div className="typing-dot" style={{ background: '#34d399' }} />
                        <div className="typing-dot" style={{ background: '#34d399' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Mini Echo Guard Dashboard built into the call screen */}
            <div className="echo-guard-panel" onClick={() => onToggleEchoGuard(!echoGuard)}>
              <div className="echo-guard-title">
                🔊 에코 가드 모드
                <span className={`echo-guard-value ${echoGuard ? 'on' : ''}`}>
                  {echoGuard ? '스피커 보정 ON' : '헤드셋 모드'}
                </span>
              </div>
              <div className="echo-guard-value">
                {echoGuard 
                  ? '마이크 피드백 차단 기능이 강력하게 작동하고 있습니다.' 
                  : '더 자연스러운 실시간 동시 발화(끼어들기)가 가능합니다.'}
              </div>
            </div>

            {/* Controls Panel */}
            <div className="active-control-panel">
              <button
                className={`ctrl-btn ${isMuted ? 'active' : ''}`}
                onClick={() => setIsMuted(!isMuted)}
                title="음소거"
              >
                <span className="ctrl-btn-icon">{isMuted ? '🔇' : '🎙️'}</span>
                <span>{isMuted ? '소리 켬' : '음소거'}</span>
              </button>

              {callMode === 'answering' ? (
                <button
                  className="ctrl-btn takeover-btn"
                  onClick={() => setShowTakeoverSheet(true)}
                  title="전화 받기"
                >
                  <span className="ctrl-btn-icon">📱</span>
                  <span>전화 받기</span>
                </button>
              ) : (
                <button
                  className={`ctrl-btn agent-invoke-btn ${agentStatus === 'active' ? 'active' : ''}`}
                  onClick={onInvokeAgent}
                  title="에이전트 호출"
                  disabled={agentStatus === 'active'}
                >
                  <span className="ctrl-btn-icon">🤖</span>
                  <span>에이전트</span>
                </button>
              )}

              <button
                className={`ctrl-btn ${showVoicePicker ? 'active' : ''}`}
                onClick={() => setShowVoicePicker(v => !v)}
                title="목소리 선택"
              >
                <span className="ctrl-btn-icon">🎵</span>
                <span>{VOICES.find(v => v.id === currentVoice)?.name || '목소리'}</span>
              </button>

              <button
                className="ctrl-btn end-call"
                onClick={onEndCall}
                title="통화 종료"
              >
                <span className="ctrl-btn-icon">📴</span>
                <span>종료</span>
              </button>
            </div>

            {/* Voice Picker Sheet */}
            {showVoicePicker && (
              <div className="voice-picker-sheet">
                <div className="voice-picker-header">
                  <span>목소리 선택</span>
                  <button className="voice-picker-close" onClick={() => setShowVoicePicker(false)}>✕</button>
                </div>
                <div className="voice-picker-list">
                  {VOICES.map(v => (
                    <button
                      key={v.id}
                      className={`voice-picker-item ${currentVoice === v.id ? 'active' : ''}`}
                      onClick={() => { onChangeVoice(v); setShowVoicePicker(false); }}
                    >
                      <span className="voice-picker-name">{v.name}</span>
                      <span className="voice-picker-desc">{v.desc}</span>
                      {currentVoice === v.id && <span className="voice-picker-check">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Takeover Sheet */}
            {showTakeoverSheet && (
              <div className="voice-picker-sheet">
                <div className="voice-picker-header">
                  <span>📱 전화를 이어받겠습니까?</span>
                  <button className="voice-picker-close" onClick={() => setShowTakeoverSheet(false)}>✕</button>
                </div>
                <div className="voice-picker-list">
                  <button
                    className={`voice-picker-item ${takeoverMode === 'handoff' ? 'active' : ''}`}
                    onClick={() => { setShowTakeoverSheet(false); onTakeover && onTakeover(); }}
                  >
                    <span className="voice-picker-name">📵 전화만 이어받기</span>
                    <span className="voice-picker-desc">AI가 종료되고 직접 통화합니다</span>
                    {takeoverMode === 'handoff' && <span className="voice-picker-check">✓</span>}
                  </button>
                  <button
                    className={`voice-picker-item ${takeoverMode === 'assist' ? 'active' : ''}`}
                    onClick={() => { setShowTakeoverSheet(false); onTakeoverAssist && onTakeoverAssist(); }}
                  >
                    <span className="voice-picker-name">🎧 이어받기 + 통화 어시스트</span>
                    <span className="voice-picker-desc">AI가 어시스트 모드로 전환되어 통화를 도와줍니다</span>
                    {takeoverMode === 'assist' && <span className="voice-picker-check">✓</span>}
                  </button>
                </div>
              </div>
            )}

            {/* Overlay Phone Keypad Drawer during call */}
            {showCallKeypad && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(9, 7, 20, 0.96)',
                zIndex: 40,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                padding: 20
              }}>
                <button 
                  style={{ position: 'absolute', top: 30, right: 20, background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
                  onClick={() => setShowCallKeypad(false)}
                >
                  ✕
                </button>
                <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>키패드 전송</div>
                <div className="keypad-grid" style={{ gap: 12 }}>
                  {['1','2','3','4','5','6','7','8','9','*','0','#'].map(k => (
                    <button key={k} className="keypad-key" style={{ width: 62, height: 62 }} onClick={() => handleKeyClick(k)}>
                      <span className="keypad-num" style={{ fontSize: 18 }}>{k}</span>
                    </button>
                  ))}
                </div>
                <div style={{ height: 30, color: 'var(--accent)', fontSize: 18, fontWeight: 700 }}>
                  {keypadInput}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. ENDED STATE (SUMMARY VIEW) */}
        {callState === 'ended' && (
          <div className="ended-call-screen">
            <div className="ended-status-box">
              <span className="ended-icon">📴</span>
              <span className="ended-title">통화가 종료되었습니다</span>
            </div>

            <div className="ended-summary-panel">
              <div className="ended-summary-header">
                <span>📱 AI 통화 요약 리포트</span>
              </div>
              
              {!summary ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 10 }}>
                  <div className="typing-indicator">
                    <div className="typing-dot" style={{ background: '#34d399' }} />
                    <div className="typing-dot" style={{ background: '#34d399' }} />
                    <div className="typing-dot" style={{ background: '#34d399' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>통화 요약 리포트를 생성하는 중입니다...</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="summary-row">
                    <span className="summary-label">발신자</span>
                    <span className="summary-text">{summary.summary?.caller || '알 수 없음'}</span>
                  </div>
                  {summary.summary?.callerPhone && (
                    <div className="summary-row">
                      <span className="summary-label">연락처</span>
                      <span className="summary-text">{summary.summary?.callerPhone}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span className="summary-label">주요 용건</span>
                    <span className="summary-text">{summary.summary?.purpose || '용건 없음'}</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">통화 내용 요약</span>
                    <span className="summary-text">{summary.summary?.text || '통화 내용 요약이 존재하지 않습니다.'}</span>
                  </div>
                  {summary.summary?.actionItems && summary.summary.actionItems.length > 0 && (
                    <div className="summary-row">
                      <span className="summary-label">조치 필요 사항</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {summary.summary.actionItems.map((item, idx) => (
                          <span key={idx} className="summary-text" style={{ fontSize: 12 }}>• {item}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {summary.summary?.scheduledEvents && summary.summary.scheduledEvents.length > 0 && (
                    <div className="summary-row">
                      <span className="summary-label">캘린더 등록 일정</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        {summary.summary.scheduledEvents.map((evt, idx) => (
                          <span key={idx} className="summary-text" style={{ fontSize: 12, color: 'var(--accent)' }}>
                            📅 {evt.title} ({evt.datetime})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="summary-row" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="summary-label">긴급도</span>
                    <span 
                      className={`sms-urgency ${summary.summary?.urgency === 'urgent' ? 'urgent' : 'normal'}`}
                      style={{ marginTop: 0 }}
                    >
                      {summary.summary?.urgency === 'urgent' ? '🔴 긴급' : '🔵 일반'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button className="ended-back-btn" onClick={onResetCallState}>
              🔄 최근 통화 화면으로 이동
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
