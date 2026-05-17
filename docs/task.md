# Task List - A-Machine v2 Bug Fixes

- [x] **Backend Fixes**
    - [x] Change default voice from `'nova'` to `'alloy'` in [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)
    - [x] Add root welcome route `GET /` in [index.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/index.js)
    - [x] Migrate legacy Beta Realtime connection to GA standard endpoint in [realtimeSession.js](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/server/lib/realtimeSession.js)
- [x] **Frontend Fixes**
    - [x] Change default voice state to `'alloy'` in [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)
    - [x] Remove unsupported `'nova'` voice preset from [VoiceSelector.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/components/VoiceSelector.jsx)
    - [x] Implement robust `endCall` safety and bulletproof lifecycle in [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)
    - [x] Enhance error logger parsing for nested OpenAI errors in [App.jsx](file:///c:/Users/SKTelecom/skt/A-Machine_Workspace/client/src/App.jsx)
- [x] **Deployment & Verification**
    - [x] Commit all code changes and push to GitHub (triggering automatic Vercel + Render deployments)
    - [x] Verify live Vercel frontend and Render backend endpoints to confirm everything works flawlessly
