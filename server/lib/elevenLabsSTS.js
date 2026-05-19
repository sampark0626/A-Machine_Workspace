import WebSocket from 'ws';

export class ElevenLabsSTSStreamer {
  constructor(clientWs, initialVoiceId = null) {
    this.clientWs = clientWs;
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    if (initialVoiceId === false) {
      this.voiceId = null;
      this.isConfigured = false;
    } else {
      this.voiceId = initialVoiceId || process.env.ELEVENLABS_VOICE_ID;
      this.isConfigured = !!(this.apiKey && this.voiceId);
    }
    
    this.elevenWs = null;
    this.isConnected = false;
    this.audioBuffer = []; // Buffer for chunks received before connection is open

    if (!this.isConfigured) {
      console.warn('[ElevenLabs] STS 기능이 활성화되지 않았습니다. OpenAI 기본 음성이 사용됩니다.');
      return;
    }

    this.connect();
  }

  connect() {
    const url = `wss://api.elevenlabs.io/v1/speech-to-speech/${this.voiceId}/stream-input?model_id=eleven_multilingual_sts_v2&output_format=pcm_24000`;

    this.elevenWs = new WebSocket(url, {
      headers: { 'xi-api-key': this.apiKey }
    });

    this.elevenWs.on('open', () => {
      this.isConnected = true;
      console.log(`[ElevenLabs] STS 연결 성공 (Voice ID: ${this.voiceId})`);
      
      // Flush buffered chunks
      if (this.audioBuffer.length > 0) {
        console.log(`[ElevenLabs] 연결 대기 동안 누적된 ${this.audioBuffer.length}개 오디오 청크를 전송합니다.`);
        for (const chunk of this.audioBuffer) {
          this.relayAudioFromOpenAI(chunk);
        }
        this.audioBuffer = [];
      }
    });

    this.elevenWs.on('message', (data) => {
      try {
        const response = JSON.parse(data);
        if (response.audio && this.clientWs.readyState === WebSocket.OPEN) {
          this.clientWs.send(JSON.stringify({
            type: 'response.output_audio.delta',
            delta: response.audio
          }));
        }
      } catch (error) {
        console.error('[ElevenLabs] 파싱 오류:', error);
      }
    });

    this.elevenWs.on('error', (error) => console.error('[ElevenLabs] 에러:', error));
    this.elevenWs.on('close', (code, reason) => {
      this.isConnected = false;
      console.log(`[ElevenLabs] 연결 종료 (Code: ${code}, Reason: ${reason})`);
    });
  }

  updateVoice(newVoiceId) {
    if (this.voiceId === newVoiceId) return;

    console.log(`[ElevenLabs] 목소리 변경 요청 수신 (기존: ${this.voiceId} -> 변경: ${newVoiceId})`);
    this.voiceId = newVoiceId;
    this.isConfigured = !!(this.apiKey && this.voiceId);

    this.close();
    if (this.isConfigured) {
      this.connect();
    }
  }

  relayAudioFromOpenAI(base64AudioDelta) {
    if (!this.isConfigured) return;

    if (this.isConnected && this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.elevenWs.send(JSON.stringify({ user_audio_chunk: base64AudioDelta }));
    } else {
      // Buffer chunks if connection is not ready yet
      this.audioBuffer.push(base64AudioDelta);
    }
  }

  close() {
    if (this.elevenWs && this.elevenWs.readyState === WebSocket.OPEN) {
      this.elevenWs.close();
    }
  }
}
