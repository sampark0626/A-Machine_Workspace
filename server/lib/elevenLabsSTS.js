import { WebSocket } from 'ws';

function prependWavHeader(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const fileLength = pcmBuffer.length + 44 - 8;
  const dataLength = pcmBuffer.length;
  
  const header = Buffer.alloc(44);
  
  // RIFF identifier
  header.write('RIFF', 0);
  // file length
  header.writeUInt32LE(fileLength, 4);
  // RIFF type
  header.write('WAVE', 8);
  // format chunk identifier
  header.write('fmt ', 12);
  // format chunk length
  header.writeUInt32LE(16, 16);
  // sample format (raw PCM = 1)
  header.writeUInt16LE(1, 20);
  // channel count
  header.writeUInt16LE(numChannels, 22);
  // sample rate
  header.writeUInt32LE(sampleRate, 24);
  // byte rate = sampleRate * numChannels * bitsPerSample / 8
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
  // block align = numChannels * bitsPerSample / 8
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
  // bits per sample
  header.writeUInt16LE(bitsPerSample, 34);
  // data chunk identifier
  header.write('data', 36);
  // data chunk length
  header.writeUInt32LE(dataLength, 40);
  
  return Buffer.concat([header, pcmBuffer]);
}

export class ElevenLabsSTSStreamer {
  constructor(clientWs, initialVoiceId = null) {
    this.clientWs = clientWs;
    this.apiKey = process.env.ELEVENLABS_API_KEY;
    
    console.log('[ElevenLabs Debug] apiKey:', this.apiKey ? `Loaded (length: ${this.apiKey.length})` : 'undefined');
    console.log('[ElevenLabs Debug] initialVoiceId:', initialVoiceId);
    
    if (initialVoiceId === false) {
      this.voiceId = null;
      this.isConfigured = false;
    } else {
      this.voiceId = initialVoiceId || process.env.ELEVENLABS_VOICE_ID;
      this.isConfigured = !!(this.apiKey && this.voiceId);
    }
    
    console.log('[ElevenLabs Debug] final voiceId:', this.voiceId);
    console.log('[ElevenLabs Debug] isConfigured:', this.isConfigured);

    this.audioChunks = [];

    if (!this.isConfigured) {
      console.warn('[ElevenLabs] STS 기능이 활성화되지 않았습니다. OpenAI 기본 음성이 사용됩니다.');
    }
  }

  updateVoice(newVoiceId) {
    if (this.voiceId === newVoiceId) return;

    console.log(`[ElevenLabs] 목소리 변경 요청 수신 (기존: ${this.voiceId} -> 변경: ${newVoiceId})`);
    this.voiceId = newVoiceId;
    this.isConfigured = !!(this.apiKey && this.voiceId);
    this.audioChunks = [];
  }

  handleOpenAiAudioDelta(base64AudioDelta) {
    if (!this.isConfigured) return;
    this.audioChunks.push(Buffer.from(base64AudioDelta, 'base64'));
  }

  async triggerSpeechToSpeechConversion() {
    if (!this.isConfigured || this.audioChunks.length === 0) return;

    try {
      const pcmBuffer = Buffer.concat(this.audioChunks);
      this.audioChunks = []; // Clear for next turn

      const wavBuffer = prependWavHeader(pcmBuffer, 24000);
      
      const formData = new FormData();
      const audioBlob = new Blob([wavBuffer], { type: 'audio/wav' });
      formData.append('audio', audioBlob, 'input.wav');
      formData.append('model_id', 'eleven_multilingual_sts_v2');

      const url = `https://api.elevenlabs.io/v1/speech-to-speech/${this.voiceId}/stream?output_format=pcm_24000`;
      console.log(`[ElevenLabs] STS 변조 요청 전송 (Voice ID: ${this.voiceId}, Input Size: ${wavBuffer.length} bytes)`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[ElevenLabs] STS 변조 실패: ${response.status} ${response.statusText} - ${errText}`);
        return;
      }

      console.log(`[ElevenLabs] STS 변조 완료. 스트림 전송 중...`);

      let leftover = null;

      for await (const chunk of response.body) {
        let currentChunk = Buffer.from(chunk);
        
        if (leftover !== null) {
          currentChunk = Buffer.concat([Buffer.from([leftover]), currentChunk]);
          leftover = null;
        }

        if (currentChunk.length % 2 !== 0) {
          leftover = currentChunk[currentChunk.length - 1];
          currentChunk = currentChunk.subarray(0, currentChunk.length - 1);
        }

        if (currentChunk.length > 0 && this.clientWs.readyState === WebSocket.OPEN) {
          this.clientWs.send(JSON.stringify({
            type: 'response.output_audio.delta',
            delta: currentChunk.toString('base64')
          }));
        }
      }

      if (leftover !== null && this.clientWs.readyState === WebSocket.OPEN) {
        const padded = Buffer.from([leftover, 0]);
        this.clientWs.send(JSON.stringify({
          type: 'response.output_audio.delta',
          delta: padded.toString('base64')
        }));
      }


      console.log(`[ElevenLabs] STS 스트림 전송 완료.`);

      if (this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(JSON.stringify({
          type: 'response.output_audio.done'
        }));
      }

    } catch (error) {
      console.error('[ElevenLabs] STS 처리 중 오류 발생:', error);
    }
  }

  close() {
    this.audioChunks = [];
  }
}
