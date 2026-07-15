#!/usr/bin/env bash
# I&AI Code — start all services and open the app window.
# Ctrl+C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.run_logs"
mkdir -p "$LOGS"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

PIDS=()
cleanup() {
  echo
  bold "Shutting down…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  ok "All services stopped"
}
trap cleanup EXIT INT TERM

wait_for() { # url, name, attempts
  local url="$1" name="$2" attempts="${3:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl -sf -o /dev/null "$url"; then ok "$name ready"; return 0; fi
    sleep 1
  done
  die "$name did not become ready ($url). Logs: $LOGS/"
}

# ── llama-server ─────────────────────────────────────────────────────────────
LLAMA_BIN="$ROOT/llama.cpp/build/bin/llama-server"
[ -x "$LLAMA_BIN" ] || LLAMA_BIN="$(command -v llama-server || true)"
[ -n "$LLAMA_BIN" ] || die "llama-server not found. Run ./scripts/install.sh first."

MODEL="$(find "$ROOT/models" -maxdepth 1 -name '*.gguf' 2>/dev/null | head -1)"
[ -n "$MODEL" ] || die "No model in ./models/. Run ./scripts/download-model.sh"

bold "Starting llama.cpp ($(basename "$MODEL"))"
# Metal on Intel Macs (AMD/Intel GPUs) produces garbage output — force CPU there.
LLAMA_GPU_ARGS=""
if [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "x86_64" ]; then
  LLAMA_GPU_ARGS="-ngl 0"
fi
"$LLAMA_BIN" -m "$MODEL" --host 127.0.0.1 --port 8081 -c 8192 -t 4 $LLAMA_GPU_ARGS \
  > "$LOGS/llama.log" 2>&1 &
PIDS+=($!)
wait_for "http://127.0.0.1:8081/v1/models" "llama.cpp" 90

# ── Backend ──────────────────────────────────────────────────────────────────
bold "Starting backend"
UVICORN="$ROOT/backend/.venv/bin/uvicorn"
[ -x "$UVICORN" ] || die "Backend venv missing. Run ./scripts/install.sh first."
( cd "$ROOT/backend" && "$UVICORN" main:app --host 127.0.0.1 --port 8000 ) \
  > "$LOGS/backend.log" 2>&1 &
PIDS+=($!)
wait_for "http://127.0.0.1:8000/" "backend" 30

# ── Frontend ─────────────────────────────────────────────────────────────────
bold "Starting frontend"
( cd "$ROOT/frontend" && npm run dev ) > "$LOGS/vite.log" 2>&1 &
PIDS+=($!)
wait_for "http://127.0.0.1:5173/" "frontend" 30

# ── Open app window ──────────────────────────────────────────────────────────
URL="http://localhost:5173"
open_app_window() {
  # Prefer a chromium --app window: standalone, no tabs / URL bar.
  local browsers=()
  if [ "$(uname -s)" = "Darwin" ]; then
    browsers=(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    )
  else
    browsers=(google-chrome chromium chromium-browser microsoft-edge brave-browser)
  fi
  for b in "${browsers[@]}"; do
    if [ -x "$b" ] || command -v "$b" >/dev/null 2>&1; then
      "$b" --app="$URL" --new-window >/dev/null 2>&1 &
      return 0
    fi
  done
  # Fallback: default browser tab
  if command -v open >/dev/null; then open "$URL"; else xdg-open "$URL" 2>/dev/null || true; fi
}
open_app_window

echo
bold "🚀 I&AI Code is running — $URL"
echo "   Press Ctrl+C to stop all services."
wait
