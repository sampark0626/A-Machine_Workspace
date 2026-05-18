// Google Calendar API integration for function calling
// Provides checkCalendar and createCalendarEvent tools

import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

// In-memory token storage (if dynamically updated via OAuth flow)
let oauthTokens = null;

/**
 * Initialize OAuth2 Client using environment credentials (without enforcing token existence)
 */
function getOAuth2ClientWithoutToken() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth 클라이언트 ID 또는 시크릿이 설정되지 않았습니다. .env 파일을 확인해 주세요.');
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Initialize OAuth2 Client using environment credentials and refresh token
 */
function getOAuth2Client() {
  const client = getOAuth2ClientWithoutToken();

  if (oauthTokens) {
    client.setCredentials(oauthTokens);
  } else if (GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN
    });
  } else {
    throw new Error('Google Calendar에 접근하기 위한 Refresh Token이 없습니다. .env 파일의 GOOGLE_REFRESH_TOKEN 설정을 확인해 주세요.');
  }

  return client;
}

/**
 * Generate Auth URL for Google OAuth2
 */
export function getAuthUrl() {
  const client = getOAuth2ClientWithoutToken();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar']
  });
}

/**
 * Exchange Authorization Code for Tokens
 */
export async function getTokensFromCode(code) {
  const client = getOAuth2ClientWithoutToken();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Check Google Calendar for a given date
 * Returns existing events in a natural voice-friendly Korean format
 */
export async function checkCalendar(date) {
  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });

    // Retrieve events from 00:00:00 to 23:59:59 KST (+09:00)
    const timeMin = new Date(`${date}T00:00:00+09:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59+09:00`).toISOString();

    console.log(`[Calendar] ${date} 일정 조회 중...`);

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = response.data.items || [];
    if (items.length === 0) {
      return `${date}에는 등록된 일정이 없습니다.`;
    }

    const eventStrings = items.map(item => {
      const start = item.start.dateTime || item.start.date;
      const end = item.end.dateTime || item.end.date;

      if (item.start.dateTime) {
        const startDate = new Date(start);
        const endDate = new Date(end);

        const formatTime = (d) => {
          const options = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' };
          return d.toLocaleTimeString('ko-KR', options);
        };

        return `${formatTime(startDate)}부터 ${formatTime(endDate)}까지, ${item.summary || '제목 없는 일정'}`;
      } else {
        return `하루 종일, ${item.summary || '제목 없는 일정'}`;
      }
    });

    return `${date}에 등록되어 있는 일정 목록입니다.\n${eventStrings.map(str => `- ${str}`).join('\n')}`;
  } catch (err) {
    console.error('[Calendar] checkCalendar API 호출 오류:', err.stack || err.message);
    return `죄송합니다. 캘린더 일정을 확인하는 중에 기술적인 문제가 발생했습니다. 수민님께 대신 메모를 남겨드릴까요?`;
  }
}

/**
 * Create a new event on Google Calendar
 * Accepts both original model arguments and prompt specified fields
 */
export async function createCalendarEvent(eventData) {
  try {
    const {
      summary,
      start_time,
      end_time,
      description,
      date,
      startTime,
      endTime,
      title,
      callerName,
      callerNumber
    } = eventData || {};

    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });

    // Standardize title/summary
    const eventSummary = title || summary || '새 일정';

    // Standardize start and end times in ISO 8601 KST format (+09:00)
    let startDateTime;
    let endDateTime;

    if (start_time) {
      startDateTime = start_time;
    } else if (date && startTime) {
      const formattedStartTime = startTime.includes(':') && startTime.split(':').length === 2 ? `${startTime}:00` : startTime;
      startDateTime = `${date}T${formattedStartTime}+09:00`;
    } else {
      throw new Error('시작 시간 정보가 없습니다.');
    }

    if (end_time) {
      endDateTime = end_time;
    } else if (date && endTime) {
      const formattedEndTime = endTime.includes(':') && endTime.split(':').length === 2 ? `${endTime}:00` : endTime;
      endDateTime = `${date}T${formattedEndTime}+09:00`;
    } else {
      throw new Error('종료 시간 정보가 없습니다.');
    }

    // Enrich description with caller information if available
    let eventDescription = description || 'A-Machine에서 자동 등록된 일정';
    if (callerName || callerNumber) {
      eventDescription += '\n\n[발신자 정보]';
      if (callerName) eventDescription += `\n이름: ${callerName}`;
      if (callerNumber) eventDescription += `\n연락처: ${callerNumber}`;
    }

    const event = {
      summary: eventSummary,
      description: eventDescription,
      start: {
        dateTime: startDateTime,
        timeZone: 'Asia/Seoul'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Asia/Seoul'
      }
    };

    console.log(`[Calendar] 일정 등록 진행 중: "${eventSummary}"...`);

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: event,
    });

    // Formatting for high-quality Korean speech output
    const formatDateTimeForVoice = (isoStr) => {
      try {
        const d = new Date(isoStr);
        const options = {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Seoul'
        };
        return d.toLocaleString('ko-KR', options);
      } catch (e) {
        return isoStr;
      }
    };

    const voiceStart = formatDateTimeForVoice(startDateTime);
    const voiceEnd = formatDateTimeForVoice(endDateTime);

    return `일정이 성공적으로 등록되었습니다. 등록된 일정은 "${eventSummary}"이며, 시간은 ${voiceStart}부터 ${voiceEnd}까지입니다.`;
  } catch (err) {
    console.error('[Calendar] createCalendarEvent API 호출 오류:', err.stack || err.message);
    return `죄송합니다. 일정을 등록하는 중에 오류가 발생했습니다. 나중에 직접 연락하실 수 있도록 메모로 등록해 드릴까요?`;
  }
}

/**
 * Set OAuth tokens dynamically (if needed in advanced flows)
 */
export function setOAuthTokens(tokens) {
  oauthTokens = tokens;
}
