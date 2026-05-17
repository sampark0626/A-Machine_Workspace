// Call summary generation using OpenAI GPT-4o-mini
import OpenAI from 'openai';

let openai = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Generate a structured call summary from the conversation transcript
 */
export async function generateSummary(transcript) {
  if (!transcript || transcript.length === 0) {
    return {
      text: '통화 내용이 없습니다.',
      caller: '알 수 없음',
      purpose: '확인 필요',
      actionItems: [],
      scheduledEvents: [],
      urgency: 'normal',
      duration: '0분'
    };
  }

  const conversationText = transcript
    .map(t => `${t.role === 'user' ? '발신자' : 'A-Machine'}: ${t.text}`)
    .join('\n');

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `당신은 통화 내용을 분석하여 수신자에게 전달할 요약을 작성하는 AI입니다.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "text": "통화 핵심 내용 요약 (2-3문장)",
  "caller": "발신자 이름 또는 소속",
  "callerPhone": "발신자 연락처 (언급된 경우)",
  "purpose": "통화 목적 (한 줄)",
  "actionItems": ["조치 필요 사항 목록"],
  "scheduledEvents": [{"title": "일정명", "datetime": "날짜시간"}],
  "urgency": "urgent 또는 normal",
  "sentiment": "positive, neutral, 또는 negative",
  "duration": "추정 통화 시간"
}`
        },
        {
          role: 'user',
          content: `다음 통화 내용을 분석하여 수신자에게 SMS로 전달할 요약을 작성해주세요:\n\n${conversationText}`
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (err) {
    console.error('[Summary] 요약 생성 오류:', err.message);
    // Fallback: simple summary
    return {
      text: transcript.filter(t => t.role === 'user').map(t => t.text).join('. '),
      caller: '확인 필요',
      purpose: '통화 내용 확인 필요',
      actionItems: ['통화 내용 확인'],
      scheduledEvents: [],
      urgency: 'normal',
      duration: `약 ${Math.ceil(transcript.length / 4)}분`
    };
  }
}
