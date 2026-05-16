#!/usr/bin/env bash
set -euo pipefail

APP_PORT="${APP_PORT:-8501}"

if [ -f ".env" ]; then
  set -a
  source .env
  set +a
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ffmpeg
fi

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

streamlit run app.py --server.port "${APP_PORT}" --server.address 0.0.0.0
