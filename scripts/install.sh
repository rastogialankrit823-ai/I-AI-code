#!/usr/bin/env bash
# I&AI Code — one-shot installer.
#   git clone <repo> && cd <repo> && ./scripts/install.sh
# Builds llama.cpp, downloads the model, sets up backend + frontend.
# Optionally builds the native desktop app (Tauri).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

OS="$(uname -s)"   # Darwin | Linux

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
bold "1/6 Checking prerequisites"

command -v git   >/dev/null || die "git not found. Install it first."
command -v curl  >/dev/null || die "curl not found. Install it first."
command -v cmake >/dev/null || die "cmake not found. macOS: brew install cmake · Ubuntu: sudo apt install cmake build-essential"

PY=""
for cand in python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null; then
    ver="$("$cand" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')"
    major="${ver%%.*}"; minor="${ver##*.}"
    if [ "$major" -eq 3 ] && [ "$minor" -ge 10 ]; then PY="$cand"; break; fi
  fi
done
[ -n "$PY" ] || die "Python 3.10+ not found. macOS: brew install python · Ubuntu: sudo apt install python3 python3-venv"
ok "python: $PY ($($PY --version 2>&1))"

command -v node >/dev/null || die "Node.js not found. Install Node 18+: https://nodejs.org"
NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 18+ required (found $(node --version))"
ok "node: $(node --version)"
ok "cmake: $(cmake --version | head -1)"

# ── 2. Build llama.cpp ───────────────────────────────────────────────────────
bold "2/6 Building llama.cpp"

if [ -x "$ROOT/llama.cpp/build/bin/llama-server" ]; then
  ok "llama-server already built"
else
  if [ ! -d "$ROOT/llama.cpp" ]; then
    git clone --depth 1 https://github.com/ggml-org/llama.cpp "$ROOT/llama.cpp"
  fi
  CMAKE_FLAGS="-DLLAMA_CURL=OFF"
  if [ "$OS" = "Darwin" ]; then
    ok "macOS detected — Metal GPU acceleration enabled by default"
  elif command -v nvcc >/dev/null; then
    CMAKE_FLAGS="$CMAKE_FLAGS -DGGML_CUDA=ON"
    ok "NVIDIA CUDA detected — building with GPU support"
  else
    warn "No GPU toolkit detected — building CPU-only (slower inference)"
  fi
  cmake -S "$ROOT/llama.cpp" -B "$ROOT/llama.cpp/build" $CMAKE_FLAGS >/dev/null
  cmake --build "$ROOT/llama.cpp/build" --target llama-server -j "$(getconf _NPROCESSORS_ONLN)" >/dev/null
  ok "llama-server built"
fi

# ── 3. Download model ────────────────────────────────────────────────────────
bold "3/6 Model"
bash "$ROOT/scripts/download-model.sh"

# ── 4. Backend ───────────────────────────────────────────────────────────────
bold "4/6 Backend (FastAPI)"
if [ ! -d "$ROOT/backend/.venv" ]; then
  "$PY" -m venv "$ROOT/backend/.venv"
fi
"$ROOT/backend/.venv/bin/pip" install --quiet --upgrade pip
"$ROOT/backend/.venv/bin/pip" install --quiet -r "$ROOT/backend/requirements.txt"
[ -f "$ROOT/backend/.env" ] || cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
ok "Python dependencies installed"

# ── 5. Frontend ──────────────────────────────────────────────────────────────
bold "5/6 Frontend (React)"
( cd "$ROOT/frontend" && npm install --no-fund --no-audit --loglevel=error )
ok "npm dependencies installed"

# Record install location so the desktop app can find everything
mkdir -p "$HOME/.iandai"
printf '{\n  "root": "%s"\n}\n' "$ROOT" > "$HOME/.iandai/config.json"
ok "Install location saved to ~/.iandai/config.json"

# ── 6. Native desktop app (recommended) ─────────────────────────────────────
bold "6/6 Desktop app"
echo "  Builds a real desktop app: dock icon, double-click launch, services"
echo "  auto-start on open and stop on quit. One-time build (5–10 min,"
echo "  installs the Rust toolchain if missing) — never needed again."
printf '  Build the desktop app? [Y/n] '
read -r BUILD_APP || BUILD_APP="y"
[ -z "$BUILD_APP" ] && BUILD_APP="y"

if [[ ! "$BUILD_APP" =~ ^[Nn] ]]; then
  if ! command -v cargo >/dev/null; then
    echo "  Installing Rust via rustup…"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi
  if [ "$OS" = "Darwin" ]; then
    # Build only the .app bundle — .dmg needs Finder permissions and isn't
    # required for a local install.
    ( cd "$ROOT/frontend" && npm run tauri build -- --bundles app )
    APP_SRC="$(find "$ROOT/frontend/src-tauri/target/release/bundle/macos" -maxdepth 1 -name '*.app' | head -1)"
    if [ -n "$APP_SRC" ]; then
      rm -rf "/Applications/$(basename "$APP_SRC")"
      cp -R "$APP_SRC" /Applications/
      ok "Installed: /Applications/$(basename "$APP_SRC")"
      echo
      bold "✅ Install complete"
      echo "   Open 'I&AI Code' from Spotlight or Applications — services"
      echo "   start automatically on open and stop when you quit."
      echo "   (No rebuild ever needed. Browser alternative: ./scripts/start.sh)"
      exit 0
    else
      warn "Build finished but no .app found — check frontend/src-tauri/target/release/bundle/"
    fi
  else
    ( cd "$ROOT/frontend" && npm run tauri build ) || warn "Desktop bundle failed — use ./scripts/start.sh instead"
    BUNDLE_DIR="$ROOT/frontend/src-tauri/target/release/bundle"
    ok "Bundles are in $BUNDLE_DIR (AppImage/deb — install or run directly)"
  fi
else
  ok "Skipped. Start with: ./scripts/start.sh"
fi

echo
bold "✅ Install complete"
echo "   Run:  ./scripts/start.sh"
