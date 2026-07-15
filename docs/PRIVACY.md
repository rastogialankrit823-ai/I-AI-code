# Privacy and Safety — I&AI Code

## Data handling

- **Code, answers, and files never leave your machine.** All AI inference happens on `127.0.0.1` via llama.cpp; there is no cloud component.
- **No telemetry, no analytics, no account, no API keys** in the default configuration.
- The only default network activity is the **one-time model download** from HuggingFace during install.
- Optional exception: if you add a Tavily API key to `backend/.env` (off by default), web-search queries are sent to Tavily. Nothing else changes.

## Storage

| Data | Location |
|---|---|
| Your code and LLD workspace files | Folder you choose (plus `backend/lld-workspace/` default) |
| App settings, recent folders | Browser localStorage inside the app |
| Install location config | `~/.iandai/config.json` |
| Service logs | `.run_logs/` inside the repo folder |

Everything is plain files on your disk — deleting the repo folder and `~/.iandai` removes all of it (`./scripts/uninstall.sh` automates this, with `--dry-run` and `--purge` options).

## Permissions

- No special OS permissions are requested — no microphone, camera, contacts, or screen recording.
- The app binds only to localhost ports 5173, 8000, and 8081.
- Code you run in DSA/LLD mode executes as your user in a subprocess. Set `RUNNER_MODE=docker` in `backend/.env` to sandbox execution in a container instead.

## Limitations and risks

- **AI output can be wrong.** The model is 3B parameters; reviews, hints, and judgments are aids, not authority. Patches are AST-validated but still review them before applying.
- **Local code execution** — the app runs the code *you* write, unsandboxed by default. Don't paste and run untrusted code; enable the Docker runner if you want isolation.
- **Localhost services** — while running, the backend and model server accept connections from other processes on the same machine (they bind to 127.0.0.1 only, never the network).
- **Model biases** — Qwen2.5-Coder inherits the biases and gaps of its training data; interview scoring should not be treated as a hiring-grade assessment.
