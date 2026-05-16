// Google Calendar API integration for function calling
// Provides check_calendar and create_calendar_event tools

import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// In-memory token storage (for hackathon demo)
let oauthTokens = null;

function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
  if (oauthTokens) {
    client.setCredentials(oauthTokens);
  }
  return client;
}

/**
 * Check Google Calendar for a given date
 * Returns existing events and available time slots
 */
export async function checkCalendar(date) {
  // If Google Calendar is not configured, return mock data for demo
  if (!GOOGLE_CLIENT_ID || !oauthTokens) {
    return getMockCalendarData(date);
  }

  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });

    const timeMin = new Date(`${date}T00:00:00+09:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59+09:00`).toISOString();

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (response.data.items || []).map(e => ({
      title: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
    }));

    const availableSlots = findAvailableSlots(events, date);

    return {
      date,
      existingEvents: events,
      availableSlots,
      message: events.length > 0
        ? `${date}에 ${events.length}개의 일정이 있습니다.`
        : `${date}은 일정이 비어있습니다.`
    };
  } catch (err) {
    console.error('[Calendar] 조회 오류:', err.message);
    return getMockCalendarData(date);
  }
}

/**
 * Create a new event on Google Calendar
 */
export async function createCalendarEvent({ summary, start_time, end_time, description }) {
  if (!GOOGLE_CLIENT_ID || !oauthTokens) {
    return getMockCreateResult(summary, start_time, end_time);
  }

  try {
    const auth = getOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
      summary,
      description: description || 'A-Machine에서 자동 등록된 일정',
      start: { dateTime: start_time, timeZone: 'Asia/Seoul' },
      end: { dateTime: end_time, timeZone: 'Asia/Seoul' },
    };

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: event,
    });

    return {
      success: true,
      eventId: response.data.id,
      summary,
      start: start_time,
      end: end_time,
      message: `"${summary}" 일정이 성공적으로 등록되었습니다.`
    };
  } catch (err) {
    console.error('[Calendar] 생성 오류:', err.message);
    return getMockCreateResult(summary, start_time, end_time);
  }
}

/** Set OAuth tokens (called after auth flow) */
export function setOAuthTokens(tokens) {
  oauthTokens = tokens;
}

// =============== Mock data for demo without real Google Calendar ===============

function getMockCalendarData(date) {
  // Generate realistic mock schedule data
  const dayOfWeek = new Date(date).getDay();

  // Weekend — empty
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      date,
      existingEvents: [],
      availableSlots: [
        { start: '09:00', end: '18:00', label: '종일 비어있음' }
      ],
      message: `${date}은 주말이라 일정이 비어있습니다.`
    };
  }

  // Weekday — typical business schedule
  const mockEvents = [
    { title: '팀 주간회의', start: `${date}T09:00:00+09:00`, end: `${date}T10:00:00+09:00` },
    { title: '점심 미팅', start: `${date}T12:00:00+09:00`, end: `${date}T13:00:00+09:00` },
    { title: '프로젝트 리뷰', start: `${date}T15:00:00+09:00`, end: `${date}T16:00:00+09:00` },
  ];

  return {
    date,
    existingEvents: mockEvents,
    availableSlots: [
      { start: '10:00', end: '12:00', label: '오전 10시~12시' },
      { start: '13:00', end: '15:00', label: '오후 1시~3시' },
      { start: '16:00', end: '18:00', label: '오후 4시~6시' },
    ],
    message: `${date}에 3개의 일정이 있고, 오전 10시~12시, 오후 1시~3시, 오후 4시~6시에 미팅이 가능합니다.`
  };
}

function getMockCreateResult(summary, start_time, end_time) {
  return {
    success: true,
    eventId: `mock_${Date.now()}`,
    summary,
    start: start_time,
    end: end_time,
    message: `"${summary}" 일정이 성공적으로 등록되었습니다.`,
    note: '(데모 모드: 실제 Google Calendar에는 등록되지 않았습니다)'
  };
}

function findAvailableSlots(events, date) {
  const workStart = 9;
  const workEnd = 18;
  const slots = [];

  const busyTimes = events.map(e => ({
    start: new Date(e.start).getHours(),
    end: new Date(e.end).getHours()
  })).sort((a, b) => a.start - b.start);

  let cursor = workStart;
  for (const busy of busyTimes) {
    if (cursor < busy.start) {
      slots.push({
        start: `${String(cursor).padStart(2, '0')}:00`,
        end: `${String(busy.start).padStart(2, '0')}:00`,
        label: `${cursor}시~${busy.start}시`
      });
    }
    cursor = Math.max(cursor, busy.end);
  }
  if (cursor < workEnd) {
    slots.push({
      start: `${String(cursor).padStart(2, '0')}:00`,
      end: `${String(workEnd).padStart(2, '0')}:00`,
      label: `${cursor}시~${workEnd}시`
    });
  }

  return slots;
}
