export default function Dashboard({ callState, messages, events, memos, toolActivity, elapsed, summary }) {
  const userMessages = messages.filter(m => m.role === 'user');
  const formatTime = (s) => `${Math.floor(s / 60)}분 ${s % 60}초`;

  // Derive intent from conversation
  const deriveIntent = () => {
    const lastUser = userMessages[userMessages.length - 1]?.text || '';
    if (/일정|미팅|회의|약속|방문/.test(lastUser)) return '📅 일정 요청';
    if (/전달|메모|남겨|알려/.test(lastUser)) return '📝 메모 전달';
    if (/긴급|장애|문제/.test(lastUser)) return '🚨 긴급 이슈';
    if (userMessages.length > 0) return '💬 일반 용건';
    return '⏳ 대기 중';
  };

  return (
    <div className="dashboard">
      {/* Status Cards */}
      <div className="section-title"><span className="icon">📊</span> 실시간 상태</div>
      <div className="status-cards">
        <div className="status-card">
          <div className="status-card-label">상태</div>
          <div className={`status-card-value ${callState === 'active' ? 'accent' : ''}`}>
            {callState === 'idle' ? '대기' : callState === 'connecting' ? '연결 중' : callState === 'active' ? '통화 중' : '종료'}
          </div>
        </div>
        <div className="status-card">
          <div className="status-card-label">의도</div>
          <div className="status-card-value blue">{deriveIntent()}</div>
        </div>
        <div className="status-card">
          <div className="status-card-label">경과</div>
          <div className="status-card-value">{formatTime(elapsed)}</div>
        </div>
      </div>

      {/* Tool Activity */}
      {toolActivity && (
        <div className="tool-activity">
          <div className="tool-spinner" />
          {toolActivity.tool === 'check_calendar' && `📅 ${toolActivity.args?.date} 캘린더 확인 중...`}
          {toolActivity.tool === 'create_calendar_event' && `✅ "${toolActivity.args?.summary}" 일정 등록 중...`}
        </div>
      )}

      {/* Summary */}
      <div className="section-title"><span className="icon">📋</span> 통화 핵심 요약</div>
      <div className="summary-box">
        <div className="summary-text">
          {summary?.summary?.text || (
            userMessages.length > 0
              ? userMessages.map(m => m.text).join(' → ')
              : '통화가 시작되면 실시간으로 요약됩니다.'
          )}
        </div>
      </div>

      {/* Calendar Events */}
      <div className="section-title"><span className="icon">📅</span> 일정 현황</div>
      <div className="event-list">
        {events.length > 0 ? events.map((evt, i) => (
          <div key={i} className="event-card">
            <div className="event-icon calendar">📅</div>
            <div>
              <div className="event-title">
                {evt.source === 'created' && '✅ '}{evt.title}
              </div>
              <div className="event-detail">
                {evt.start && new Date(evt.start).toLocaleString('ko-KR', {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
                {evt.source === 'created' && ' (새로 등록됨)'}
              </div>
            </div>
          </div>
        )) : (
          <div className="empty-state">일정 관련 대화가 시작되면 표시됩니다</div>
        )}
      </div>

      {/* Transcript */}
      <div className="section-title"><span className="icon">💬</span> 대화 기록 ({messages.length})</div>
      <div className="event-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
        {messages.map((msg, i) => (
          <div key={i} className="event-card" style={{ padding: 10 }}>
            <div className={`event-icon ${msg.role === 'user' ? 'memo' : 'calendar'}`}>
              {msg.role === 'user' ? '📞' : '🤖'}
            </div>
            <div>
              <div className="event-title" style={{ fontSize: 12 }}>
                {msg.role === 'user' ? '발신자' : 'A-Machine'} · {msg.time}
              </div>
              <div className="event-detail">{msg.text}</div>
            </div>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="empty-state">대화가 시작되면 실시간 기록됩니다</div>
        )}
      </div>
    </div>
  );
}
