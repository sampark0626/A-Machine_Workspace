const VOICES = [
  { id: 'marin', name: 'Marin' },
  { id: 'sage', name: 'Sage' },
  { id: 'shimmer', name: 'Shimmer' },
  { id: 'ash', name: 'Ash' },
  { id: 'coral', name: 'Coral' },
  { id: 'alloy', name: 'Alloy' },
  { id: 'echo', name: 'Echo' },
  { id: 'ballad', name: 'Ballad' },
  { id: 'verse', name: 'Verse' },
  { id: 'cedar', name: 'Cedar' },
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
            onClick={() => onChangeVoice(v.id)}
          >
            {v.name}
          </button>
        ))}
      </div>
    </div>
  );
}
