const VOICES = [
  { id: 'marin', name: 'Marin', desc: '신뢰감 있고 따뜻한' },
  { id: 'sage', name: 'Sage', desc: '지적이고 차분한' },
  { id: 'shimmer', name: 'Shimmer', desc: '부드럽고 밝은' },
  { id: 'ash', name: 'Ash', desc: '자연스러운' },
  { id: 'coral', name: 'Coral', desc: '명랑하고 활기찬' },
  { id: 'alloy', name: 'Alloy', desc: '균형잡힌' },
  { id: 'echo', name: 'Echo', desc: '차분하고 낮은' },
  { id: 'ballad', name: 'Ballad', desc: '감성적인' },
  { id: 'verse', name: 'Verse', desc: '또렷하고 명확한' },
  { id: 'cedar', name: 'Cedar', desc: '자연스럽고 활기찬' },
];

export default function VoiceSelector({ currentVoice, onChangeVoice }) {
  return (
    <div className="voice-selector">
      <div className="section-title"><span className="icon">🎙️</span> 음성 변경</div>
      <div className="voice-grid">
        {VOICES.map(v => (
          <button
            key={v.id}
            className={`voice-chip ${currentVoice === v.id ? 'active' : ''}`}
            onClick={() => onChangeVoice(v.id)}
          >
            <div className="voice-chip-name">{v.name}</div>
            <div className="voice-chip-desc">{v.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
