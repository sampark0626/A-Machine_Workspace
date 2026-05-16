# -*- coding: utf-8 -*-
from __future__ import annotations

import concurrent.futures
import gc
import hashlib
import html
import json
import os
import re
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import streamlit as st

try:
    import torch
except Exception:  # pragma: no cover - Streamlit UI reports the concrete error.
    torch = None

try:
    from transformers import AutoProcessor, CsmForConditionalGeneration
except Exception:  # pragma: no cover
    AutoProcessor = None
    CsmForConditionalGeneration = None

try:
    from audio_recorder_streamlit import audio_recorder
except Exception:  # pragma: no cover
    audio_recorder = None


# =============================================================================
# A-Machine runtime constants
# =============================================================================

APP_TITLE = "A-Machine"
CSM_MODEL_ID = os.getenv("AMACHINE_CSM_MODEL_ID", "sesame/csm-1b")
GEMINI_MODEL_ID = os.getenv("GEMINI_MODEL_ID", "gemini-1.5-flash")
ASR_MODEL_ID = os.getenv("AMACHINE_ASR_MODEL", "small")
ASR_DEVICE = os.getenv("AMACHINE_ASR_DEVICE", "cpu")
ASR_COMPUTE_TYPE = os.getenv("AMACHINE_ASR_COMPUTE_TYPE", "int8")

CSM_SYSTEM_INSTRUCTION = (
    "너는 주인을 대신해 전화를 받는 자율 응답기 에이 머신이다. "
    "발신자의 말을 주의 깊게 듣고 가장 자연스럽고 친절한 전화 통화 톤으로 응대해라. "
    "모든 대화는 반드시 한국어로만 진행해야 한다."
)

OPENING_GREETING = "안녕하세요 자율 비서 에이 머신입니다 용건을 말씀해 주세요"
DEFAULT_ACK = "네 말씀 감사합니다 핵심 내용을 정리하고 있습니다 추가로 전달하실 내용이 있으면 계속 말씀해 주세요"
DEFAULT_TERMINATION_SCRIPT = "네 말씀하신 내용을 잘 전달하겠습니다 통화를 종료할까요"
FINAL_GOODBYE = "네 확인했습니다 통화를 종료하겠습니다 좋은 하루 보내세요"

TERMINATION_CONFIRM_WORDS = (
    "네",
    "예",
    "응",
    "그래",
    "좋아",
    "좋습니다",
    "종료",
    "끊어",
    "끊어주세요",
    "마무리",
)
TERMINATION_REJECT_WORDS = ("아니", "아니요", "잠시", "추가", "더 있어", "기다려")


# =============================================================================
# Streamlit page setup and CSS
# =============================================================================

st.set_page_config(page_title=APP_TITLE, page_icon="A", layout="wide")

st.markdown(
    """
    <style>
    :root {
      --bg: #080a0d;
      --panel: #11161c;
      --panel-2: #171d24;
      --line: #27313b;
      --text: #eef3f7;
      --muted: #9ca8b4;
      --accent: #34d399;
      --amber: #f8c14a;
      --blue: #5aa7ff;
      --red: #ff6b6b;
    }
    .stApp {
      background: radial-gradient(circle at 25% 0%, #18212b 0%, #080a0d 38%, #07080a 100%);
      color: var(--text);
    }
    [data-testid="stHeader"] {
      background: rgba(8, 10, 13, 0.78);
      backdrop-filter: blur(14px);
    }
    .am-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 0 18px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      margin-bottom: 18px;
    }
    .am-title {
      font-size: 32px;
      font-weight: 760;
      letter-spacing: 0;
      line-height: 1.1;
    }
    .am-sub {
      margin-top: 5px;
      color: var(--muted);
      font-size: 14px;
    }
    .am-badge {
      border: 1px solid rgba(52, 211, 153, .42);
      color: #b8ffe3;
      background: rgba(52, 211, 153, .08);
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      white-space: nowrap;
    }
    .panel {
      background: rgba(17, 22, 28, .92);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px;
      padding: 18px;
      min-height: 720px;
      box-shadow: 0 18px 44px rgba(0,0,0,.24);
    }
    .panel-title {
      font-size: 17px;
      font-weight: 720;
      margin-bottom: 10px;
    }
    .status-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 10px 0 16px 0;
    }
    .status-box {
      background: #0d1116;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 8px;
      padding: 11px;
      min-height: 75px;
    }
    .status-label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .status-value {
      color: var(--text);
      font-size: 17px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .work-item {
      background: #0d1116;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 8px;
      padding: 12px;
      margin: 8px 0;
    }
    .work-item-title {
      font-weight: 700;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .work-item-body {
      color: #cbd5df;
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .phone-shell {
      width: min(100%, 460px);
      margin: 0 auto;
      background: #080b0f;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 34px;
      padding: 14px;
      min-height: 720px;
      box-shadow: 0 24px 60px rgba(0,0,0,.42);
    }
    .phone-screen {
      background: #10151b;
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 26px;
      min-height: 690px;
      padding: 14px;
      overflow: hidden;
    }
    .phone-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,.08);
      margin-bottom: 12px;
    }
    .phone-name {
      font-weight: 760;
      font-size: 16px;
    }
    .phone-state {
      color: var(--accent);
      font-size: 12px;
      white-space: nowrap;
    }
    .chat-area {
      display: flex;
      flex-direction: column;
      gap: 9px;
      min-height: 392px;
      max-height: 450px;
      overflow-y: auto;
      padding: 2px 2px 12px 2px;
    }
    .bubble-row {
      display: flex;
      width: 100%;
    }
    .bubble-row.user {
      justify-content: flex-start;
    }
    .bubble-row.assistant {
      justify-content: flex-end;
    }
    .bubble {
      max-width: 82%;
      border-radius: 18px;
      padding: 10px 12px;
      font-size: 14px;
      line-height: 1.43;
      overflow-wrap: anywhere;
      word-break: keep-all;
    }
    .bubble.user .speaker,
    .bubble.assistant .speaker {
      display: block;
      font-size: 11px;
      margin-bottom: 4px;
      opacity: .78;
    }
    .bubble.user {
      background: #1b232d;
      color: #eef3f7;
      border-bottom-left-radius: 6px;
    }
    .bubble.assistant {
      background: #d6fbe9;
      color: #06120d;
      border-bottom-right-radius: 6px;
    }
    .small-note {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }
    div[data-testid="stAudio"] {
      margin-top: 8px;
    }
    textarea {
      min-height: 112px !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# =============================================================================
# Session state
# =============================================================================


def init_state() -> None:
    defaults = {
        "messages": [],
        "summary": "아직 통화 내용이 충분히 수집되지 않았습니다.",
        "intent": "대기 중",
        "schedules": [],
        "memos": [],
        "call_started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "call_status": "대기",
        "last_audio_hash": None,
        "latest_audio_message_id": None,
        "greeting_done": False,
        "pending_gemini_future": None,
        "pending_gemini_revision": 0,
        "completed_gemini_revision": 0,
        "termination_ready": False,
        "termination_prompt_played_revision": 0,
        "termination_script": DEFAULT_TERMINATION_SCRIPT,
        "termination_asked": False,
        "call_ended": False,
        "last_error": "",
        "last_transcript_at": "",
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


init_state()


# =============================================================================
# Utility helpers
# =============================================================================


def now_label() -> str:
    return datetime.now().strftime("%H:%M:%S")


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def sanitize_for_speech(text: str, limit: int = 180) -> str:
    """Remove markdown, symbols, and non-Korean fragments before CSM speaks."""
    replacements = {
        "A-Machine": "에이 머신",
        "A.Machine": "에이 머신",
        "A Machine": "에이 머신",
        "A.": "에이닷",
        "CSM": "씨에스엠",
        "Gemini": "제미나이",
        "AI": "에이아이",
        "AX": "에이엑스",
        "SKT": "에스케이텔레콤",
    }
    clean = text or ""
    for src, dst in replacements.items():
        clean = clean.replace(src, dst)
    clean = re.sub(r"[*_`#>\[\]{}()<>~|\\/@$%^&+=:;\"']", " ", clean)
    clean = re.sub(r"[-·•※→←↑↓]", " ", clean)
    clean = re.sub(r"[^\uac00-\ud7a3\u3131-\u318e0-9\s.,!?]", " ", clean)
    clean = re.sub(r"[.,!?]", " ", clean)
    clean = normalize_space(clean)
    if not clean:
        clean = DEFAULT_ACK
    return clean[:limit].strip()


def safe_text(text: str) -> str:
    return html.escape(text or "")


def message_id() -> str:
    return uuid.uuid4().hex


def add_message(role: str, text: str, audio_bytes: bytes | None = None) -> dict[str, Any]:
    msg = {
        "id": message_id(),
        "role": role,
        "text": normalize_space(text),
        "audio": audio_bytes,
        "time": now_label(),
    }
    st.session_state.messages.append(msg)
    if audio_bytes:
        st.session_state.latest_audio_message_id = msg["id"]
    return msg


def transcript_text() -> str:
    lines = []
    for msg in st.session_state.messages:
        speaker = "발신자" if msg["role"] == "user" else "에이 머신"
        lines.append(f"{speaker}: {msg['text']}")
    return "\n".join(lines)


def has_any_word(text: str, words: tuple[str, ...]) -> bool:
    compact = normalize_space(text)
    return any(word in compact for word in words)


def detect_intent_locally(text: str) -> str:
    t = normalize_space(text)
    keyword_map = [
        (("회의", "미팅", "일정", "약속", "방문"), "일정 요청"),
        (("전달", "메모", "남겨", "알려", "보고"), "메모 전달"),
        (("문의", "질문", "확인", "궁금"), "문의 사항"),
        (("계약", "견적", "비용", "청구", "결제"), "비즈니스 문의"),
        (("긴급", "장애", "문제", "불가", "오류"), "긴급 이슈"),
        (TERMINATION_CONFIRM_WORDS, "통화 종료 확인"),
    ]
    for keywords, label in keyword_map:
        if has_any_word(t, keywords):
            return label
    return "일반 용건 접수"


def compact_items(items: list[dict[str, Any]], max_items: int = 12) -> list[dict[str, Any]]:
    seen = set()
    compacted = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = json.dumps(item, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        compacted.append(item)
    return compacted[-max_items:]


# =============================================================================
# Cached resources
# =============================================================================


@st.cache_resource(show_spinner="CSM 모델을 GPU에 로딩 중입니다.")
def load_csm_model() -> tuple[Any, Any]:
    if torch is None:
        raise RuntimeError("PyTorch가 설치되어 있지 않습니다. torch 패키지를 설치해 주세요.")
    if AutoProcessor is None or CsmForConditionalGeneration is None:
        raise RuntimeError("transformers 4.52.1 이상과 CSM 클래스가 필요합니다.")
    if not torch.cuda.is_available():
        raise RuntimeError("RunPod RTX 3090 CUDA GPU가 감지되지 않았습니다.")

    processor = AutoProcessor.from_pretrained(
        CSM_MODEL_ID,
        trust_remote_code=True,
    )
    model = CsmForConditionalGeneration.from_pretrained(
        CSM_MODEL_ID,
        torch_dtype=torch.float16,
        trust_remote_code=True,
    ).to("cuda")
    model.eval()

    max_length = int(os.getenv("AMACHINE_CSM_MAX_LENGTH", "600"))
    if hasattr(model, "generation_config"):
        model.generation_config.max_length = max_length
        if hasattr(model.generation_config, "max_new_tokens"):
            model.generation_config.max_new_tokens = None
    return processor, model


@st.cache_resource(show_spinner="ASR 모델을 로딩 중입니다.")
def load_asr_model() -> tuple[str, Any] | tuple[None, None]:
    backend = os.getenv("AMACHINE_ASR_BACKEND", "faster-whisper").lower()
    if backend == "none":
        return None, None

    if backend in {"faster-whisper", "auto"}:
        try:
            from faster_whisper import WhisperModel

            model = WhisperModel(
                ASR_MODEL_ID,
                device=ASR_DEVICE,
                compute_type=ASR_COMPUTE_TYPE,
            )
            return "faster-whisper", model
        except Exception:
            if backend == "faster-whisper":
                raise

    try:
        import whisper

        model = whisper.load_model(ASR_MODEL_ID, device=ASR_DEVICE)
        return "openai-whisper", model
    except Exception as exc:
        raise RuntimeError(
            "한국어 음성 인식을 위해 faster-whisper 또는 openai-whisper가 필요합니다."
        ) from exc


@st.cache_resource(show_spinner=False)
def load_gemini_model() -> Any:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        return genai.GenerativeModel(
            GEMINI_MODEL_ID,
            generation_config={
                "temperature": 0.2,
                "top_p": 0.7,
                "response_mime_type": "application/json",
            },
        )
    except Exception:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        return genai.GenerativeModel(GEMINI_MODEL_ID)


@st.cache_resource(show_spinner=False)
def background_executor() -> concurrent.futures.ThreadPoolExecutor:
    return concurrent.futures.ThreadPoolExecutor(max_workers=2, thread_name_prefix="amachine-bg")


# =============================================================================
# Audio and model pipeline
# =============================================================================


def transcribe_audio(audio_bytes: bytes) -> str:
    backend, model = load_asr_model()
    if not backend or model is None:
        raise RuntimeError("ASR 백엔드가 비활성화되어 있습니다.")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            tmp.write(audio_bytes)
            temp_path = tmp.name

        if backend == "faster-whisper":
            segments, _info = model.transcribe(
                temp_path,
                language="ko",
                vad_filter=True,
                beam_size=5,
            )
            text = " ".join(segment.text.strip() for segment in segments)
        else:
            result = model.transcribe(temp_path, language="ko", fp16=False)
            text = result.get("text", "")
        text = normalize_space(text)
        if not text:
            raise RuntimeError("음성에서 인식 가능한 한국어 문장을 찾지 못했습니다.")
        return text
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)


def synthesize_csm_wav(text: str) -> tuple[bytes, str]:
    spoken = sanitize_for_speech(text)
    processor, model = load_csm_model()
    temp_path = None

    try:
        conversation = [
            {
                "role": "0",
                "content": [{"type": "text", "text": spoken}],
            }
        ]
        try:
            inputs = processor.apply_chat_template(
                conversation,
                tokenize=True,
                return_dict=True,
            ).to("cuda")
        except Exception:
            inputs = processor(f"[0]{spoken}", add_special_tokens=True).to("cuda")

        with torch.inference_mode():
            audio = model.generate(**inputs, output_audio=True)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            temp_path = tmp.name

        try:
            processor.save_audio(audio, temp_path)
        except Exception:
            if isinstance(audio, (list, tuple)) and audio:
                processor.save_audio(audio[0], temp_path)
            else:
                raise
        wav_bytes = Path(temp_path).read_bytes()
        return wav_bytes, spoken
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        gc.collect()
        if torch is not None and torch.cuda.is_available():
            torch.cuda.empty_cache()


def choose_frontline_reply(user_text: str, local_intent: str) -> str:
    if st.session_state.call_ended:
        return FINAL_GOODBYE

    if st.session_state.termination_asked:
        if has_any_word(user_text, TERMINATION_CONFIRM_WORDS):
            st.session_state.call_ended = True
            st.session_state.call_status = "종료"
            return FINAL_GOODBYE
        if has_any_word(user_text, TERMINATION_REJECT_WORDS):
            st.session_state.termination_asked = False
            st.session_state.termination_ready = False
            return "네 알겠습니다 추가로 전달하실 내용을 계속 말씀해 주세요"

    if local_intent == "긴급 이슈":
        return "긴급한 내용으로 확인했습니다 핵심 내용을 바로 정리해 전달하겠습니다"
    if local_intent == "일정 요청":
        return "일정 관련 내용으로 확인했습니다 날짜와 시간을 함께 정리하고 있습니다"
    if local_intent == "메모 전달":
        return "전달 메모로 확인했습니다 빠뜨리지 않도록 정리하고 있습니다"
    return DEFAULT_ACK


def build_background_prompt(payload: dict[str, Any]) -> str:
    return f"""
역할: 너는 A-Machine의 후방 서브 에이전트다. 발신자와 직접 대화하지 말고 업무 대시보드만 갱신한다.
목표: 통화 스크립트와 로컬 의도를 읽고 통화 핵심 요약, 의도, 일정, 메모, 종료 준비 여부를 JSON으로 작성한다.
언어: 모든 값은 한국어만 사용한다. 영어, 마크다운, 불릿 기호, 특수문자를 쓰지 않는다.
종료 유도 대본: 발신자 용건이 충분히 정리되었을 때만 termination_ready를 true로 하고, CSM이 읽을 한 문장 대본을 만든다.
대본 제한: termination_script_ko는 90자 이내, 한국어와 숫자와 공백만 사용한다. 마지막은 통화를 종료할까요 형태의 확인 질문으로 끝낸다.

반드시 아래 JSON 스키마만 출력한다.
{{
  "summary_ko": "통화 핵심 요약",
  "intent_ko": "파악된 의도",
  "schedules": [
    {{"title": "일정명", "date": "날짜 또는 미정", "time": "시간 또는 미정", "detail": "상세"}}
  ],
  "memos": [
    {{"title": "메모 제목", "content": "메모 내용"}}
  ],
  "termination_ready": false,
  "termination_script_ko": "종료 유도 대본",
  "confidence": 0.0
}}

입력 데이터:
{json.dumps(payload, ensure_ascii=False)}
""".strip()


def extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?", "", raw).strip()
    raw = re.sub(r"```$", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            raise
        return json.loads(match.group(0))


def run_background_gemini(payload: dict[str, Any]) -> dict[str, Any]:
    model = load_gemini_model()
    if model is None:
        return {
            "summary_ko": payload.get("current_summary") or "Gemini API 키가 없어 로컬 기록만 유지 중입니다.",
            "intent_ko": payload.get("local_intent") or "일반 용건 접수",
            "schedules": payload.get("current_schedules") or [],
            "memos": payload.get("current_memos") or [],
            "termination_ready": False,
            "termination_script_ko": DEFAULT_TERMINATION_SCRIPT,
            "confidence": 0.0,
            "warning": "GEMINI_API_KEY 또는 GOOGLE_API_KEY가 설정되지 않았습니다.",
        }

    prompt = build_background_prompt(payload)
    response = model.generate_content(prompt)
    text = getattr(response, "text", "") or ""
    data = extract_json(text)
    data["termination_script_ko"] = sanitize_for_speech(
        data.get("termination_script_ko", DEFAULT_TERMINATION_SCRIPT),
        limit=100,
    )
    data["summary_ko"] = normalize_space(data.get("summary_ko", ""))
    data["intent_ko"] = normalize_space(data.get("intent_ko", ""))
    data["schedules"] = data.get("schedules") if isinstance(data.get("schedules"), list) else []
    data["memos"] = data.get("memos") if isinstance(data.get("memos"), list) else []
    data["termination_ready"] = bool(data.get("termination_ready", False))
    return data


def submit_background_update(user_text: str, local_intent: str) -> None:
    payload = {
        "system_instruction": CSM_SYSTEM_INSTRUCTION,
        "latest_user_text": user_text,
        "local_intent": local_intent,
        "transcript": transcript_text(),
        "current_summary": st.session_state.summary,
        "current_intent": st.session_state.intent,
        "current_schedules": st.session_state.schedules,
        "current_memos": st.session_state.memos,
        "now": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    st.session_state.pending_gemini_revision += 1
    future = background_executor().submit(run_background_gemini, payload)
    st.session_state.pending_gemini_future = future
    st.session_state.call_status = "후방 처리 중"


def apply_background_result(data: dict[str, Any]) -> None:
    summary = normalize_space(data.get("summary_ko", ""))
    intent = normalize_space(data.get("intent_ko", ""))
    if summary:
        st.session_state.summary = summary
    if intent:
        st.session_state.intent = intent

    st.session_state.schedules = compact_items(
        [*st.session_state.schedules, *data.get("schedules", [])]
    )
    st.session_state.memos = compact_items([*st.session_state.memos, *data.get("memos", [])])
    st.session_state.termination_ready = bool(data.get("termination_ready", False))
    st.session_state.termination_script = sanitize_for_speech(
        data.get("termination_script_ko", DEFAULT_TERMINATION_SCRIPT),
        limit=100,
    )
    st.session_state.completed_gemini_revision = st.session_state.pending_gemini_revision
    st.session_state.call_status = "통화 중" if not st.session_state.call_ended else "종료"
    if data.get("warning"):
        st.session_state.last_error = data["warning"]


def poll_background_future() -> None:
    future = st.session_state.pending_gemini_future
    if future is None:
        return
    if not future.done():
        return

    st.session_state.pending_gemini_future = None
    try:
        apply_background_result(future.result())
    except Exception as exc:
        st.session_state.last_error = f"Gemini 처리 실패: {exc}"
        st.session_state.call_status = "통화 중"
        return

    if (
        st.session_state.termination_ready
        and not st.session_state.call_ended
        and st.session_state.termination_prompt_played_revision
        < st.session_state.completed_gemini_revision
    ):
        try:
            audio, spoken = synthesize_csm_wav(st.session_state.termination_script)
            add_message("assistant", spoken, audio)
            st.session_state.termination_prompt_played_revision = (
                st.session_state.completed_gemini_revision
            )
            st.session_state.termination_asked = True
        except Exception as exc:
            st.session_state.last_error = f"CSM 종료 대본 합성 실패: {exc}"


def maybe_autorefresh_for_background() -> None:
    future = st.session_state.pending_gemini_future
    if future is None or future.done():
        return
    try:
        from streamlit_autorefresh import st_autorefresh

        st_autorefresh(interval=1200, limit=None, key="amachine_bg_poll")
    except Exception:
        st.caption("후방 서브 에이전트가 처리 중입니다. 화면 조작 시 결과가 갱신됩니다.")


def ensure_opening_greeting() -> None:
    if st.session_state.greeting_done:
        return
    try:
        audio, spoken = synthesize_csm_wav(OPENING_GREETING)
        add_message("assistant", spoken, audio)
        st.session_state.greeting_done = True
        st.session_state.call_status = "통화 중"
    except Exception as exc:
        add_message("assistant", OPENING_GREETING, None)
        st.session_state.greeting_done = True
        st.session_state.call_status = "오류"
        st.session_state.last_error = f"첫 인사 CSM 합성 실패: {exc}"


def process_audio_turn(audio_bytes: bytes) -> None:
    audio_hash = hashlib.sha256(audio_bytes).hexdigest()
    if st.session_state.last_audio_hash == audio_hash:
        return
    st.session_state.last_audio_hash = audio_hash
    st.session_state.call_status = "음성 인식 중"

    user_text = transcribe_audio(audio_bytes)
    st.session_state.last_transcript_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    local_intent = detect_intent_locally(user_text)
    st.session_state.intent = local_intent
    add_message("user", user_text)
    submit_background_update(user_text, local_intent)

    reply = choose_frontline_reply(user_text, local_intent)
    audio, spoken = synthesize_csm_wav(reply)
    add_message("assistant", spoken, audio)
    st.session_state.call_status = "후방 처리 중"


def process_text_turn(text: str) -> None:
    clean = normalize_space(text)
    if not clean:
        return
    local_intent = detect_intent_locally(clean)
    st.session_state.intent = local_intent
    add_message("user", clean)
    submit_background_update(clean, local_intent)
    reply = choose_frontline_reply(clean, local_intent)
    audio, spoken = synthesize_csm_wav(reply)
    add_message("assistant", spoken, audio)
    st.session_state.call_status = "후방 처리 중"


# =============================================================================
# Render helpers
# =============================================================================


def render_top() -> None:
    st.markdown(
        f"""
        <div class="am-top">
          <div>
            <div class="am-title">A-Machine</div>
            <div class="am-sub">자율 음성 응대 및 요약 에이전트</div>
          </div>
          <div class="am-badge">Frontline CSM + Background Gemini</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_status_boxes() -> None:
    elapsed = "-"
    try:
        start = datetime.strptime(st.session_state.call_started_at, "%Y-%m-%d %H:%M:%S")
        elapsed_seconds = int((datetime.now() - start).total_seconds())
        elapsed = f"{elapsed_seconds // 60}분 {elapsed_seconds % 60}초"
    except Exception:
        pass
    st.markdown(
        f"""
        <div class="status-row">
          <div class="status-box">
            <div class="status-label">상태 Status</div>
            <div class="status-value">{safe_text(st.session_state.call_status)}</div>
          </div>
          <div class="status-box">
            <div class="status-label">의도 Intent</div>
            <div class="status-value">{safe_text(st.session_state.intent)}</div>
          </div>
          <div class="status-box">
            <div class="status-label">경과 Elapsed</div>
            <div class="status-value">{safe_text(elapsed)}</div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_dashboard() -> None:
    st.markdown('<div class="panel">', unsafe_allow_html=True)
    st.markdown('<div class="panel-title">업무 대시보드</div>', unsafe_allow_html=True)
    render_status_boxes()

    st.text_area(
        "통화 핵심 요약",
        value=st.session_state.summary,
        height=140,
        disabled=True,
        label_visibility="visible",
    )

    st.markdown("#### 자동 등록 일정")
    if st.session_state.schedules:
        for item in st.session_state.schedules:
            title = safe_text(str(item.get("title", "일정")))
            date = safe_text(str(item.get("date", "미정")))
            item_time = safe_text(str(item.get("time", "미정")))
            detail = safe_text(str(item.get("detail", "")))
            st.markdown(
                f"""
                <div class="work-item">
                  <div class="work-item-title">{title}</div>
                  <div class="work-item-body">{date} {item_time}<br>{detail}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.caption("아직 자동 등록된 일정이 없습니다.")

    st.markdown("#### 자동 등록 메모")
    if st.session_state.memos:
        for item in st.session_state.memos:
            title = safe_text(str(item.get("title", "메모")))
            content = safe_text(str(item.get("content", "")))
            st.markdown(
                f"""
                <div class="work-item">
                  <div class="work-item-title">{title}</div>
                  <div class="work-item-body">{content}</div>
                </div>
                """,
                unsafe_allow_html=True,
            )
    else:
        st.caption("아직 자동 등록된 메모가 없습니다.")

    if st.session_state.termination_ready:
        st.success(f"종료 유도 대본: {st.session_state.termination_script}")
    if st.session_state.last_error:
        st.warning(st.session_state.last_error)
    st.markdown("</div>", unsafe_allow_html=True)


def render_chat_messages() -> None:
    rows = ['<div class="chat-area">']
    for msg in st.session_state.messages:
        role = msg["role"]
        speaker = "발신자" if role == "user" else "에이 머신"
        text = safe_text(msg["text"])
        time_label = safe_text(msg["time"])
        rows.append(
            f"""
            <div class="bubble-row {role}">
              <div class="bubble {role}">
                <span class="speaker">{speaker} · {time_label}</span>
                {text}
              </div>
            </div>
            """
        )
    rows.append("</div>")
    st.markdown("\n".join(rows), unsafe_allow_html=True)

    latest_id = st.session_state.latest_audio_message_id
    for msg in st.session_state.messages:
        if msg.get("audio"):
            if msg["id"] == latest_id:
                st.audio(msg["audio"], format="audio/wav", autoplay=True)
            else:
                st.audio(msg["audio"], format="audio/wav", autoplay=False)


def render_phone() -> None:
    st.markdown('<div class="phone-shell"><div class="phone-screen">', unsafe_allow_html=True)
    phone_state = "통화 종료" if st.session_state.call_ended else "실시간 응대"
    st.markdown(
        f"""
        <div class="phone-bar">
          <div>
            <div class="phone-name">A-Machine 통화</div>
            <div class="small-note">한국어 전용 자율 응답</div>
          </div>
          <div class="phone-state">{phone_state}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    render_chat_messages()

    st.markdown("#### 마이크 입력")
    if audio_recorder is None:
        st.error("audio-recorder-streamlit 패키지가 필요합니다.")
    elif st.session_state.call_ended:
        st.info("통화가 종료되었습니다.")
    else:
        audio_bytes = audio_recorder(
            text="",
            recording_color="#ff6b6b",
            neutral_color="#34d399",
            icon_name="microphone",
            icon_size="2x",
            pause_threshold=1.8,
            sample_rate=24000,
            key="amachine_recorder",
        )
        if audio_bytes:
            try:
                process_audio_turn(audio_bytes)
                st.rerun()
            except Exception as exc:
                st.session_state.last_error = f"음성 처리 실패: {exc}"
                st.session_state.call_status = "오류"

    with st.expander("텍스트 입력 테스트"):
        st.caption("마이크 또는 ASR이 준비되지 않은 환경에서만 사용하세요.")
        with st.form("text_turn_form", clear_on_submit=True):
            typed = st.text_input("발신자 발화")
            submitted = st.form_submit_button("전송")
        if submitted and typed and not st.session_state.call_ended:
            try:
                process_text_turn(typed)
                st.rerun()
            except Exception as exc:
                st.session_state.last_error = f"텍스트 처리 실패: {exc}"
                st.session_state.call_status = "오류"

    col_a, col_b = st.columns(2)
    with col_a:
        if st.button("요약 재처리", use_container_width=True):
            submit_background_update("요약 재처리", st.session_state.intent)
            st.rerun()
    with col_b:
        if st.button("세션 초기화", use_container_width=True):
            for key in list(st.session_state.keys()):
                del st.session_state[key]
            st.rerun()

    st.markdown("</div></div>", unsafe_allow_html=True)


# =============================================================================
# Main app
# =============================================================================


def main() -> None:
    poll_background_future()
    ensure_opening_greeting()
    maybe_autorefresh_for_background()

    render_top()
    left, right = st.columns([0.95, 1.05], gap="large")
    with left:
        render_dashboard()
    with right:
        render_phone()

    with st.sidebar:
        st.header("Runtime")
        st.write(f"CSM: `{CSM_MODEL_ID}`")
        st.write(f"Gemini: `{GEMINI_MODEL_ID}`")
        st.write(f"ASR: `{ASR_MODEL_ID}` on `{ASR_DEVICE}`")
        cuda_status = bool(torch is not None and torch.cuda.is_available())
        st.write(f"CUDA: `{cuda_status}`")
        if cuda_status:
            st.write(f"GPU: `{torch.cuda.get_device_name(0)}`")
        st.divider()
        st.caption("필수 환경 변수")
        st.code("GEMINI_API_KEY 또는 GOOGLE_API_KEY", language="text")
        st.caption("권장 설치")
        st.code(
            "\n".join(
                [
                    "pip install streamlit audio-recorder-streamlit",
                    "pip install transformers>=4.52.1 accelerate torch",
                    "pip install faster-whisper google-generativeai",
                    "pip install streamlit-autorefresh",
                ]
            ),
            language="bash",
        )


if __name__ == "__main__":
    main()
