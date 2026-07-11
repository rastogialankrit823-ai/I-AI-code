#!/usr/bin/env bash
# I&AI Code — uninstaller.
#
#   ./scripts/uninstall.sh            remove the desktop app + config, stop services
#   ./scripts/uninstall.sh --purge    also delete model, llama.cpp build, venv,
#                                     node_modules, build artifacts (~7 GB freed)
#   ./scripts/uninstall.sh --dry-run  show what would be removed, remove nothing
#   ./scripts/uninstall.sh --yes      skip confirmation prompts
#
# The repo's source files are always kept. To remove everything, delete the
# cloned folder afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OS="$(uname -s)"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
info() { printf '  \033[36m·\033[0m %s\n' "$*"; }

PURGE=false; DRY=false; YES=false
for arg in "$@"; do
  case "$arg" in
    --purge)   PURGE=true ;;
    --dry-run) DRY=true ;;
    --yes|-y)  YES=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

remove() { # path, label
  local path="$1" label="$2"
  [ -e "$path" ] || { info "$label — not present"; return 0; }
  local size
  size="$(du -sh "$path" 2>/dev/null | cut -f1)"
  if $DRY; then
    info "would remove $label ($size): $path"
  else
    rm -rf "$path"
    ok "removed $label ($size)"
  fi
}

bold "I&AI Code uninstaller$($DRY && echo ' — DRY RUN (nothing will be deleted)')"

if ! $YES && ! $DRY; then
  printf '  Remove the desktop app and stop all services? [y/N] '
  read -r CONFIRM || CONFIRM="n"
  [[ "$CONFIRM" =~ ^[Yy] ]] || { echo "  Aborted."; exit 0; }
fi

# ── 1. Stop everything ───────────────────────────────────────────────────────
bold "1/3 Stopping services"
if $DRY; then
  info "would stop: desktop app, llama-server (8081), backend (8000), vite (5173)"
else
  if [ "$OS" = "Darwin" ]; then
    osascript -e 'quit app "I&AI Code"' 2>/dev/null || true
    sleep 1
    pkill -9 -f "I&AI Code.app/Contents/MacOS" 2>/dev/null || true
  fi
  for port in 8000 8081 5173; do
    lsof -ti tcp:$port 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
  ok "services stopped, ports 8000/8081/5173 freed"
fi

# ── 2. Remove app + config ───────────────────────────────────────────────────
bold "2/3 Removing app + config"
if [ "$OS" = "Darwin" ]; then
  remove "/Applications/I&AI Code.app" "desktop app"
else
  info "Linux: if you installed a .deb, remove with: sudo apt remove iai-code"
  info "AppImage users: delete the AppImage file you copied"
fi
remove "$HOME/.iandai" "config (~/.iandai)"
remove "$ROOT/backend/.session_memory.json" "session memory"
remove "$ROOT/backend/app_settings.json" "app settings"
remove "$ROOT/.run_logs" "run logs"

# ── 3. Optional purge of heavy artifacts ─────────────────────────────────────
bold "3/3 Heavy artifacts"
if $PURGE; then
  if ! $YES && ! $DRY; then
    printf '  Also delete model (~2.3 GB), llama.cpp build, venv, node_modules? [y/N] '
    read -r CONFIRM2 || CONFIRM2="n"
    [[ "$CONFIRM2" =~ ^[Yy] ]] || { info "purge skipped"; exit 0; }
  fi
  remove "$ROOT/models" "model files"
  remove "$ROOT/llama.cpp" "llama.cpp checkout + build"
  remove "$ROOT/backend/.venv" "python venv"
  remove "$ROOT/frontend/node_modules" "node_modules"
  remove "$ROOT/frontend/dist" "frontend build"
  remove "$ROOT/frontend/src-tauri/target" "rust build cache"
else
  info "kept: model, llama.cpp build, venv, node_modules (rerun with --purge to delete, frees ~7 GB)"
fi

echo
bold "✅ Uninstall complete"
echo "   Source files kept at: $ROOT"
echo "   To remove everything:  rm -rf \"$ROOT\""
