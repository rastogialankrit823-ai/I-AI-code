#!/usr/bin/env bash
# Download the Qwen2.5-Coder-3B-Instruct GGUF model (~2.3 GB) into ./models/
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="$ROOT/models"
MODEL_FILE="qwen2.5-coder-3b-instruct-q5_k_m.gguf"
MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/${MODEL_FILE}"

mkdir -p "$MODELS_DIR"

if [ -f "$MODELS_DIR/$MODEL_FILE" ]; then
  echo "✓ Model already present: models/$MODEL_FILE"
  exit 0
fi

echo "Downloading Qwen2.5-Coder-3B-Instruct (Q5_K_M, ~2.3 GB)…"
echo "  from: $MODEL_URL"
echo "  to:   models/$MODEL_FILE"
echo

# -C - resumes a partial download if interrupted
curl -L -C - --progress-bar -o "$MODELS_DIR/$MODEL_FILE.part" "$MODEL_URL"
mv "$MODELS_DIR/$MODEL_FILE.part" "$MODELS_DIR/$MODEL_FILE"

echo
echo "✓ Model downloaded: models/$MODEL_FILE"
