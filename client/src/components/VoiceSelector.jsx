const VOICES = [
  // OpenAI Default Voices
  { id: 'alloy', name: 'Alloy (OpenAI)', provider: 'openai' },
  { id: 'ash', name: 'Ash (OpenAI)', provider: 'openai' },
  { id: 'ballad', name: 'Ballad (OpenAI)', provider: 'openai' },
  { id: 'coral', name: 'Coral (OpenAI)', provider: 'openai' },
  { id: 'echo', name: 'Echo (OpenAI)', provider: 'openai' },
  { id: 'sage', name: 'Sage (OpenAI)', provider: 'openai' },
  { id: 'shimmer', name: 'Shimmer (OpenAI)', provider: 'openai' },
  { id: 'verse', name: 'Verse (OpenAI)', provider: 'openai' },
  { id: 'marin', name: 'Marin (OpenAI)', provider: 'openai' },

  // ElevenLabs Cloned Voices
  { id: 'clone_minseok', name: '민석 (클론)', provider: 'elevenlabs', voiceId: 'Da4ldXDTb66CahhogG02' },
];

export default function VoiceSelector({ currentVoice, onChangeVoice }) {
  return (
    <div className="voice-selector-minimal">
      <div className="voice-selector-header">
        <span>🎙️ 목소리 모델 톤</span>
        <span className="current-voice-badge">
          {VOICES.find(v => v.id === currentVoice)?.name || currentVoice}
        </span>
      </div>
      <div className="voice-scroll-container">
        {VOICES.map(v => (
          <button
            key={v.id}
            className={`voice-pill ${currentVoice === v.id ? 'active' : ''}`}
            onClick={() => onChangeVoice(v)}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
