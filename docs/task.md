# Google Calendar 연동 작업 태스크 리스트

- `[x]` `getOAuth2Client` 헬퍼 함수 작성 (`GOOGLE_REFRESH_TOKEN` 활용)
- `[x]` `checkCalendar` 실제 API 연동 및 KST 기준 일정 목록 문자열 포맷팅 구현
- `[x]` `createCalendarEvent` 실제 API 연동 및 다중 파라미터(summary/start_time, date/startTime 등) 매핑 구현
- `[x]` 기존 Mock 데이터 생성 및 Mock 헬퍼 함수들 완전히 제거
- `[x]` 예외 상황 처리 및 자연스러운 한국어 에러 메시지 반환 구현
- `[x]` `npm run dev` 구동을 통한 서버 빌드 및 문법 상태 로컬 검증
