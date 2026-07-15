# Architecture — I&AI Code

## System overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App (Rust)                      │
│   spawns & supervises both services · kills them on quit         │
│                                                                  │
│  ┌─────────────────────┐    HTTP     ┌──────────────────────┐    │
│  │   React Frontend    │ ◄─────────► │   FastAPI Backend    │    │
│  │   Vite · port 5173  │             │   Python · port 8000 │    │
│  └─────────────────────┘             └──────────┬───────────┘    │
│                                                 │ HTTP           │
│                                      ┌──────────▼───────────┐    │
│                                      │   llama.cpp server   │    │
│                                      │  Qwen2.5-Coder-3B    │    │
│                                      │  GGUF · port 8081    │    │
│                                      └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
        Everything above runs on localhost. No cloud components.
```

- **Desktop shell** — Tauri 2 (Rust). On launch it locates the install via `~/.iandai/config.json`, health-checks ports 8081/8000, kills stale port-squatters from crashed runs, spawns `llama-server` and `uvicorn`, and streams boot progress to a splash screen. On quit it kills both sidecars.
- **Frontend** — React 18 + Vite, no UI framework. Three modes (DSA / LLD / Interview) share an editor, tab bar, and workspace file explorer.
- **Backend** — FastAPI with async parallel task queues: code execution, LLM prompting, stress testing, and workspace file operations run concurrently without blocking each other.
- **Inference** — `llama-server` (llama.cpp) exposing an OpenAI-compatible `/v1/chat/completions` API. Model is swappable: first `.gguf` in `models/` is used.

## Model pipeline

Every AI feature follows the same layered pipeline — deterministic work first, LLM last:

```
user action
   │
   ▼
1. Static analysis (no LLM)          e.g. bug-pattern scanners, AST checks
   │  answer found? ──► return immediately
   ▼
2. Prompt assembly                   feature-specific template + trimmed context
   │                                 (per-feature token budgets, prompt trimming)
   ▼
3. llama.cpp call                    retry on 503 (slots busy), port fallback,
   │                                 response cache keyed by prompt hash
   ▼
4. Post-validation                   JSON extraction/repair · AST-validate patches ·
   │                                 rubric-claim verification · score clamping
   ▼
result to UI
```

Key post-validation steps:

- **AST patch validation** — every AI-generated code patch is parsed with Python's `ast` module and rejected if it calls undefined names or introduces self-recursion the original didn't have.
- **Verified rubric judging** — the interview judge answers binary yes/no per rubric point and must quote the candidate's answer to claim a point; unverifiable claims are flipped to "no". The final score is clamped to ±30 of a deterministically computed coverage baseline.

## Data flow

1. User code and answers stay in the browser/webview and are POSTed to `127.0.0.1:8000` only.
2. The backend runs user code in a subprocess (optional Docker sandbox via `RUNNER_MODE`), and sends prompts to `127.0.0.1:8081`.
3. LLD workspace files are written to a user-chosen folder on the local disk.
4. Nothing is sent to any remote host (see [Local AI verification](docs/TECHNICAL_REPORT.md#local-ai-verification)).

## Local vs. cloud components

| Component | Where it runs |
|---|---|
| Model inference (all AI features) | 100% on-device (llama.cpp) |
| Code execution | On-device subprocess (optional Docker sandbox) |
| File storage (workspace, settings) | Local disk only |
| Model download | Internet, one-time (HuggingFace) |
| Tavily web search | Optional, **off by default** — only if the user adds an API key |

## Key design decisions

1. **3B model + engineering, not a bigger model** — the target is "runs on any 8 GB laptop". Reliability comes from static analysis before the LLM, binary rubrics, clamped scoring, and AST validation, rather than model size.
2. **llama.cpp over Python runtimes** — one static binary, Metal/CUDA/CPU autodetect at build time, OpenAI-compatible API means the backend doesn't care what serves the model.
3. **CPU-only inference on Intel Macs** — Metal on AMD/Intel GPUs produces corrupted output; the app and scripts pass `-ngl 0` on `x86_64` macOS. Apple Silicon keeps full Metal acceleration.
4. **Locally-compiled desktop app** — building the Tauri app on the user's machine avoids Gatekeeper quarantine entirely, so no Apple Developer signing is needed.
5. **Sidecar supervision in the shell, not scripts** — the desktop app owns service lifecycle (reuse healthy instances, kill stale ports, clean shutdown), so users never touch a terminal after install.
6. **Response caching** — identical prompts are served from an in-memory LRU cache, which matters at 4–8 tokens/s on CPU.
