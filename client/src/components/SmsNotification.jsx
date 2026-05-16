export default function SmsNotification({ summary, onClose }) {
  const { receiver, timestamp } = summary;
  const data = summary.summary || {};
  const time = new Date(timestamp).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="sms-overlay" onClick={onClose}>
      <div className="sms-container" onClick={e => e.stopPropagation()}>
        <div className="sms-phone">
          <div className="sms-screen">
            {/* SMS Header */}
            <div className="sms-header">
              <div className="sms-sender">
                <div className="sms-avatar">A</div>
                <div>
                  <div className="sms-sender-name">A-Machine</div>
                  <div className="sms-sender-number">부재중 통화 알림</div>
                </div>
              </div>
              <div className="sms-time">{time}</div>
            </div>

            {/* SMS Body */}
            <div className="sms-body">
              <div className="sms-bubble">
                <div className="sms-label">📱 부재중 통화 요약</div>
                <div className="sms-content">
                  <p style={{ fontWeight: 600, marginBottom: 12 }}>
                    {receiver?.name || '김부장'}님, 부재중 전화가 있었습니다.
                  </p>

                  <div className="field">
                    <span className="field-label">발신자</span>
                    <span className="field-value">{data.caller || '알 수 없음'}</span>
                  </div>
                  {data.callerPhone && (
                    <div className="field">
                      <span className="field-label">연락처</span>
                      <span className="field-value">{data.callerPhone}</span>
                    </div>
                  )}
                  <div className="field">
                    <span className="field-label">용건</span>
                    <span className="field-value">{data.purpose || '확인 필요'}</span>
                  </div>
                  <div className="field">
                    <span className="field-label">통화시간</span>
                    <span className="field-value">{data.duration || '약 1분'}</span>
                  </div>

                  <p style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                    {data.text || '통화 내용을 요약할 수 없습니다.'}
                  </p>

                  {data.actionItems && data.actionItems.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>조치 필요</span>
                      {data.actionItems.map((item, i) => (
                        <div key={i} className="field-value" style={{ fontSize: 12, marginBottom: 4 }}>
                          • {item}
                        </div>
                      ))}
                    </div>
                  )}

                  {data.scheduledEvents && data.scheduledEvents.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>등록된 일정</span>
                      {data.scheduledEvents.map((evt, i) => (
                        <div key={i} className="field-value" style={{ fontSize: 12, marginBottom: 4 }}>
                          📅 {evt.title} — {evt.datetime}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`sms-urgency ${data.urgency === 'urgent' ? 'urgent' : 'normal'}`}>
                    {data.urgency === 'urgent' ? '🔴 긴급' : '🔵 일반'}
                  </div>
                </div>
              </div>
            </div>

            {/* SMS Actions */}
            <div className="sms-actions">
              <button className="sms-action-btn primary" onClick={onClose}>
                확인
              </button>
              <button className="sms-action-btn secondary" onClick={onClose}>
                바로 전화하기
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
