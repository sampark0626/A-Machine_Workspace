import { useState } from 'react';

const DEFAULT_SETTINGS = {
  callMode: 'answering',
  agentType: 'claude',
  llmModel: 'claude-haiku-4-5-20251001',
  ttsProvider: 'openai',
  ttsVoice: 'nova',
  elevenLabsAgentId: '',
  voiceKeyword: true,
  autoTriggers: {
    onDateTime: true,
    onPrice: false,
    onQuestion: false,
  },
  customKeywords: [],
  assistContext: '',
};

export function loadSettings() {
  try {
    const saved = localStorage.getItem('a-machine-settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const LLM_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  desc: '빠름 · 저비용' },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', desc: '균형잡힌 성능' },
  { value: 'claude-opus-4-7',           label: 'Claude Opus 4.7',   desc: '최고 성능' },
  { value: 'gpt-4o-mini',               label: 'GPT-4o mini',       desc: '빠름 · 저비용' },
  { value: 'gpt-4o',                    label: 'GPT-4o',            desc: '고성능' },
];

const OPENAI_VOICES = [
  { value: 'nova',    label: 'Nova',    desc: '여성 · 밝고 친근함' },
  { value: 'alloy',   label: 'Alloy',   desc: '중성 · 자연스러움' },
  { value: 'echo',    label: 'Echo',    desc: '남성 · 차분함' },
  { value: 'fable',   label: 'Fable',   desc: '남성 · 따뜻함' },
  { value: 'onyx',    label: 'Onyx',    desc: '남성 · 깊은 목소리' },
  { value: 'shimmer', label: 'Shimmer', desc: '여성 · 부드러움' },
];

export default function AgentSettings({ onClose, onSave }) {
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

  const AUTO_TRIGGER_OPTIONS = [
    { key: 'onDateTime', icon: '📅', label: '날짜/시간 언급 시', desc: '일정 관련 대화에서 자동 개입' },
    { key: 'onPrice',    icon: '💰', label: '금액/가격 언급 시', desc: '금액이 나올 때 자동 개입' },
    { key: 'onQuestion', icon: '❓', label: '질문 받을 때',      desc: '"어때요?", "가능한가요?" 등 감지 시' },
  ];

  const isClaudeGPT      = settings.agentType === 'claude';
  const isOpenAIRealtime = settings.agentType === 'openai-realtime';
  const isElevenLabs     = settings.agentType === 'elevenlabs';
  const isOpenAITTS      = settings.ttsProvider !== 'elevenlabs';

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

        {settings.callMode === 'assist' && (
          <>
            {/* ── AI 모델 설정 ── */}
            <div className="settings-section">
              <div className="settings-section-title">AI 모델</div>

              {/* Agent 타입 */}
              <div className="model-type-selector">
                <button
                  className={`model-type-btn ${settings.agentType === 'claude' ? 'active' : ''}`}
                  onClick={() => set('agentType', 'claude')}
                >
                  <span className="model-type-icon">🧠</span>
                  <span className="model-type-label">Claude / GPT</span>
                </button>
                <button
                  className={`model-type-btn ${settings.agentType === 'openai-realtime' ? 'active' : ''}`}
                  onClick={() => set('agentType', 'openai-realtime')}
                >
                  <span className="model-type-icon">⚡</span>
                  <span className="model-type-label">OpenAI Realtime</span>
                </button>
                <button
                  className={`model-type-btn ${settings.agentType === 'elevenlabs' ? 'active' : ''}`}
                  onClick={() => set('agentType', 'elevenlabs')}
                >
                  <span className="model-type-icon">🎙️</span>
                  <span className="model-type-label">ElevenLabs</span>
                </button>
              </div>

              {isOpenAIRealtime && (
                <div className="elevenlabs-voice-input" style={{ marginTop: 8 }}>
                  <div className="toggle-desc" style={{ lineHeight: 1.6 }}>
                    기존 OpenAI Realtime 세션을 그대로 활용합니다. 추가 API 비용 없이 낮은 지연시간으로 응답하며, 통화 목소리 설정을 그대로 사용합니다.
                  </div>
                </div>
              )}

              {isClaudeGPT && (
                <>
                  {/* LLM 모델 */}
                  <div className="settings-subsection-title">언어 모델 (LLM)</div>
                  <div className="model-grid">
                    {LLM_MODELS.map(m => (
                      <button
                        key={m.value}
                        className={`model-chip ${settings.llmModel === m.value ? 'active' : ''}`}
                        onClick={() => set('llmModel', m.value)}
                      >
                        <span className="model-chip-name">{m.label}</span>
                        <span className="model-chip-desc">{m.desc}</span>
                      </button>
                    ))}
                  </div>

                  {/* TTS 제공자 */}
                  <div className="settings-subsection-title">음성 합성 (TTS)</div>
                  <div className="model-type-selector">
                    <button
                      className={`model-type-btn ${isOpenAITTS ? 'active' : ''}`}
                      onClick={() => { set('ttsProvider', 'openai'); set('ttsVoice', 'nova'); }}
                    >
                      <span className="model-type-icon">🔊</span>
                      <span className="model-type-label">OpenAI TTS</span>
                    </button>
                    <button
                      className={`model-type-btn ${!isOpenAITTS ? 'active' : ''}`}
                      onClick={() => { set('ttsProvider', 'elevenlabs'); set('ttsVoice', '21m00Tcm4TlvDq8ikWAM'); }}
                    >
                      <span className="model-type-icon">🎙️</span>
                      <span className="model-type-label">ElevenLabs TTS</span>
                    </button>
                  </div>

                  {isOpenAITTS && (
                    <div className="model-grid">
                      {OPENAI_VOICES.map(v => (
                        <button
                          key={v.value}
                          className={`model-chip ${settings.ttsVoice === v.value ? 'active' : ''}`}
                          onClick={() => set('ttsVoice', v.value)}
                        >
                          <span className="model-chip-name">{v.label}</span>
                          <span className="model-chip-desc">{v.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!isOpenAITTS && (
                    <div className="elevenlabs-voice-input">
                      <label className="settings-label">Voice ID</label>
                      <input
                        className="settings-input"
                        value={settings.ttsVoice}
                        onChange={e => set('ttsVoice', e.target.value)}
                        placeholder="ElevenLabs Voice ID (예: 21m00Tcm4TlvDq8ikWAM)"
                      />
                      <div className="toggle-desc">ElevenLabs 대시보드 → Voices에서 복사</div>
                    </div>
                  )}
                </>
              )}

              {isElevenLabs && !isOpenAIRealtime && (
                <div className="elevenlabs-voice-input">
                  <label className="settings-label">Agent ID</label>
                  <input
                    className="settings-input"
                    value={settings.elevenLabsAgentId}
                    onChange={e => set('elevenLabsAgentId', e.target.value)}
                    placeholder="ElevenLabs Agent ID"
                  />
                  <div className="toggle-desc">ElevenLabs 대시보드 → Conversational AI에서 복사</div>
                </div>
              )}
            </div>

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
