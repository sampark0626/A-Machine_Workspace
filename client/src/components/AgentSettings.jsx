import { useState } from 'react';

const DEFAULT_SETTINGS = {
  callMode: 'answering',
  agentType: 'openai-realtime',
  llmModel: 'claude-haiku-4-5-20251001',
  ttsProvider: 'openai',
  ttsVoice: 'nova',
  elevenLabsAgentId: '',
  voiceKeyword: true,
  takeoverMode: 'assist',
  autoTriggers: {
    onDateTime: true,
    onPrice: false,
    onQuestion: false,
    onAccount: true,
  },
  customKeywords: [],
  assistContext: '',
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem('a-machine-settings');
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      autoTriggers: { ...DEFAULT_SETTINGS.autoTriggers, ...parsed.autoTriggers },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const VOICES = [
  { id: 'marin',         name: 'Marin',      desc: '명료하고 친근한 여성 (기본)',  provider: 'openai' },
  { id: 'sage',          name: 'Sage',        desc: '차분하고 명확한 여성',         provider: 'openai' },
  { id: 'shimmer',       name: 'Shimmer',     desc: '밝고 생동감 있는 여성',        provider: 'openai' },
  { id: 'ash',           name: 'Ash',         desc: '중성적이고 안정적',            provider: 'openai' },
  { id: 'coral',         name: 'Coral',       desc: '따뜻하고 표현력 있는 여성',    provider: 'openai' },
  { id: 'alloy',         name: 'Alloy',       desc: '균형 잡힌 중성 목소리',        provider: 'openai' },
  { id: 'echo',          name: 'Echo',        desc: '또렷하고 전문적인 남성',       provider: 'openai' },
  { id: 'ballad',        name: 'Ballad',      desc: '감성적이고 부드러운 남성',     provider: 'openai' },
  { id: 'verse',         name: 'Verse',       desc: '역동적이고 표현력 풍부',       provider: 'openai' },
  { id: 'cedar',         name: 'Cedar',       desc: '깊고 신뢰감 있는 남성',       provider: 'openai' },
  { id: 'clone_minseok', name: '민석 클론',   desc: '목소리 클론 (ElevenLabs)',     provider: 'elevenlabs', voiceId: 'Da4ldXDTb66CahhogG02' },
];

const AUTO_TRIGGER_OPTIONS = [
  { key: 'onDateTime', icon: '📅', label: '날짜/시간 언급 시',  desc: '일정 관련 대화에서 자동 개입' },
  { key: 'onPrice',    icon: '💰', label: '금액/가격 언급 시',  desc: '금액이 나올 때 자동 개입' },
  { key: 'onQuestion', icon: '❓', label: '질문 받을 때',       desc: '"어때요?", "가능한가요?" 등 감지 시' },
  { key: 'onAccount',  icon: '🏦', label: '계좌/금융정보 언급 시', desc: '계좌번호·인증번호 등 언급 시 보이스피싱 경고' },
];

export default function AgentSettings({ onClose, onSave, currentVoice, onChangeVoice }) {
  const [settings, setSettings] = useState(loadSettings);
  const [newKeyword, setNewKeyword] = useState('');

  const save = () => {
    localStorage.setItem('a-machine-settings', JSON.stringify(settings));
    onSave(settings);
    onClose();
  };

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));
  const setMode = (mode) => set('callMode', mode);
  const setTrigger = (key, val) =>
    setSettings(s => ({ ...s, autoTriggers: { ...s.autoTriggers, [key]: val } }));
  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw && !settings.customKeywords.includes(kw)) {
      setSettings(s => ({ ...s, customKeywords: [...s.customKeywords, kw] }));
      setNewKeyword('');
    }
  };
  const removeKeyword = (i) =>
    setSettings(s => ({ ...s, customKeywords: s.customKeywords.filter((_, j) => j !== i) }));

  const handleVoiceChange = (voice) => {
    if (onChangeVoice) {
      onChangeVoice(voice);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-header-icon">⚙️</span>
          <h2 className="settings-title">에이전트 설정</h2>
          <button className="settings-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* ── 통화 모드 ── */}
        <div className="settings-section">
          <div className="settings-section-title">통화 모드</div>
          <div className="mode-selector">
            <button className={`mode-btn ${settings.callMode === 'answering' ? 'active' : ''}`} onClick={() => setMode('answering')}>
              <span className="mode-icon">📞</span>
              <span className="mode-label">자동 응답</span>
              <span className="mode-desc">부재 중 AI가 대신 통화</span>
            </button>
            <button className={`mode-btn ${settings.callMode === 'assist' ? 'active' : ''}`} onClick={() => setMode('assist')}>
              <span className="mode-icon">🎧</span>
              <span className="mode-label">통화 어시스트</span>
              <span className="mode-desc">통화 중 AI 보조 활성화</span>
            </button>
          </div>
        </div>

        {/* ── 자동 응답 모드: 전화 받기 시 동작 ── */}
        {settings.callMode === 'answering' && (
          <div className="settings-section">
            <div className="settings-section-title">전화를 받을 때 동작</div>
            <div className="toggle-desc" style={{ marginBottom: 10 }}>
              자동 응답 통화 중 전화 받기 버튼을 누를 때의 동작을 선택하세요.
            </div>
            <div className="mode-selector">
              <button
                className={`mode-btn ${settings.takeoverMode === 'handoff' ? 'active' : ''}`}
                onClick={() => set('takeoverMode', 'handoff')}
              >
                <span className="mode-icon">📵</span>
                <span className="mode-label">전화 이어받기</span>
                <span className="mode-desc">AI 종료 후 직접 통화</span>
              </button>
              <button
                className={`mode-btn ${settings.takeoverMode === 'assist' ? 'active' : ''}`}
                onClick={() => set('takeoverMode', 'assist')}
              >
                <span className="mode-icon">🎧</span>
                <span className="mode-label">이어받기 + 어시스트</span>
                <span className="mode-desc">AI가 어시스트로 전환</span>
              </button>
            </div>
          </div>
        )}

        {/* ── 목소리 선택 ── */}
        <div className="settings-section">
          <div className="settings-section-title">목소리</div>
          <div className="voice-grid">
            {VOICES.map(v => (
              <button
                key={v.id}
                className={`model-chip ${currentVoice === v.id ? 'active' : ''}`}
                onClick={() => handleVoiceChange(v)}
              >
                <span className="model-chip-name">{v.name}</span>
                <span className="model-chip-desc">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 통화 어시스트 설정 ── */}
        {settings.callMode === 'assist' && (
          <>
            {/* ── 호출 방식 ── */}
            <div className="settings-section">
              <div className="settings-section-title">호출 방식</div>
              <label className="settings-toggle-row">
                <div>
                  <div className="toggle-label">"에이전트" 음성 호출</div>
                  <div className="toggle-desc">통화 중 "에이전트"라고 말하면 AI가 응답합니다</div>
                </div>
                <div
                  className={`toggle-switch ${settings.voiceKeyword ? 'on' : ''}`}
                  onClick={() => set('voiceKeyword', !settings.voiceKeyword)}
                />
              </label>
            </div>

            {/* ── 자동 개입 조건 ── */}
            <div className="settings-section">
              <div className="settings-section-title">자동 개입 조건</div>
              {AUTO_TRIGGER_OPTIONS.map(({ key, icon, label, desc }) => (
                <label key={key} className="settings-toggle-row">
                  <div>
                    <div className="toggle-label">{icon} {label}</div>
                    <div className="toggle-desc">{desc}</div>
                  </div>
                  <div
                    className={`toggle-switch ${settings.autoTriggers[key] ? 'on' : ''}`}
                    onClick={() => setTrigger(key, !settings.autoTriggers[key])}
                  />
                </label>
              ))}
            </div>

            {/* ── 커스텀 키워드 ── */}
            <div className="settings-section">
              <div className="settings-section-title">커스텀 키워드</div>
              {settings.customKeywords.length > 0 && (
                <div className="keyword-tags">
                  {settings.customKeywords.map((kw, i) => (
                    <span key={i} className="keyword-tag">
                      {kw}
                      <button className="keyword-remove-btn" onClick={() => removeKeyword(i)}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="keyword-input-row">
                <input
                  className="settings-input"
                  value={newKeyword}
                  onChange={e => setNewKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addKeyword()}
                  placeholder="키워드 입력 후 Enter"
                />
                <button className="keyword-add-btn" onClick={addKeyword}>+</button>
              </div>
            </div>

            {/* ── 에이전트 컨텍스트 ── */}
            <div className="settings-section">
              <div className="settings-section-title">에이전트 컨텍스트</div>
              <textarea
                className="settings-textarea"
                value={settings.assistContext}
                onChange={e => set('assistContext', e.target.value)}
                placeholder={'미리 알려줄 정보를 입력하세요\n예: 나는 IT 회사 영업팀장이고, 오늘은 신규 프로젝트 계약 미팅입니다.'}
                rows={3}
              />
            </div>
          </>
        )}

        <div className="settings-actions">
          <button className="settings-cancel-btn" onClick={onClose}>취소</button>
          <button className="settings-save-btn" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}
