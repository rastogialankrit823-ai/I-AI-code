# I&AI Code — Local AI Coding Assistant

A fully offline, privacy-first coding companion that runs **entirely on your machine** using [llama.cpp](https://github.com/ggml-org/llama.cpp) + Qwen2.5-Coder models. No API keys, no cloud, no data leaves your device.

---

## What It Does

I&AI Code is a multi-mode developer tool built with React + FastAPI. It gives you:

- **DSA Mode** — Write, run, and debug code with an AI assistant that spots bugs, explains complexity, and suggests fixes with one-click patches
- **LLD Mode (Low Level Design)** — AI-powered workspace for designing systems: context panel, auto-updating class structure generator, file editor with AI code generation, and a built-in terminal
- **Interview Mode** — Timed mock interviews with 20 hardcoded LeetCode DSA problems (runs your code against full test suites) and 20 LLD problems (AI evaluates your design answers question-by-question against reference solutions)

---

## Architecture

```
┌─────────────────────┐     HTTP      ┌──────────────────────┐
│   React Frontend    │ ◄───────────► │  FastAPI Backend      │
│   Vite · port 5173  │               │  Python · port 8000   │
└─────────────────────┘               └──────────┬───────────┘
                                                 │ HTTP
                                      ┌──────────▼───────────┐
                                      │   llama.cpp server    │
                                      │  Qwen2.5-Coder GGUF   │
                                      │  port 8081/8082/8083  │
                                      └──────────────────────┘
```

**Frontend** (`frontend/`) — React 18 + Vite, zero UI framework, custom CSS, highlight.js for code highlighting, lucide-react icons.

**Backend** (`backend/`) — FastAPI with async parallel task queues. Handles code execution, LLM prompting, stress testing, LLD workspace file ops, and mistake memory.

**Model** — Qwen2.5-Coder-Instruct GGUF via llama-server (OpenAI-compatible `/v1/chat/completions`). Works offline once downloaded.

---

## Modes

### DSA Mode
- Code editor with syntax highlighting, tab indent, auto-brackets, line numbers
- Build & Run with real output (Python via subprocess or Docker sandbox)
- AI analysis on every run: bug repair cards, complexity analysis, wrong-answer detection
- One-click patch apply with undo
- Stress tester — generates random inputs and compares outputs
- Problem context panel — paste a LeetCode problem for WA detection
- AI assistant with quick prompts

### LLD Mode
- Collapsible context panel — describe your design problem
- **Structure generator** — auto-generates a class diagram (classes, attributes, methods, relationships, design patterns) from your context, refreshes every 10 minutes
- **Workspace** — file tree backed by `backend/lld-workspace/`, create/edit/delete files
- **AI file generator** — say "generate parking_lot.py" and it writes a complete, runnable file and opens it
- **AI patcher** — with a file open, say "add type hints" or "refactor for thread safety" and it patches in place
- **Terminal** — run commands in the workspace directory (collapsible)
- AI assistant bar at top with intent detection for generation vs patching vs Q&A

### Interview Mode
- Picks one of **20 hardcoded LeetCode DSA problems** randomly (no internet needed)
  - Python only, same CodeEditor as DSA mode
  - Runs your code against **all test cases** using a JSON stdin/stdout harness
  - Shows pass/fail per test case with actual vs expected output
- Or picks one of **20 hardcoded LLD problems**
  - Asks 5 design questions one by one
  - AI evaluates each answer against a reference solution, gives a 0–100 score and feedback
- 45-minute countdown timer with automatic hints at 15-min intervals
- Clarifying questions, hint requests, final session report with scores

---

## Quick Start

### macOS (one command)

```bash
./run_all_mac.sh
```

This script:
1. Checks/installs Xcode CLI tools, Homebrew, git, cmake, node
2. Builds llama.cpp with Metal GPU acceleration (or uses Homebrew `llama-server` if available)
3. Downloads the Qwen2.5-Coder GGUF model from HuggingFace
4. Creates a Python venv and installs backend deps
5. Installs frontend npm packages
6. Starts all three services and waits for them to be ready

**Speed profiles** (default: `balanced`):

| Profile | Model | RAM needed |
|---------|-------|------------|
| `fast` | Qwen2.5-Coder-1.5B Q4_K_M | ~2 GB |
| `balanced` | Qwen2.5-Coder-3B Q4_K_M | ~3 GB |
| `quality` | Qwen2.5-Coder-7B Q4_K_M | ~6 GB |

```bash
SPEED_PROFILE=fast ./run_all_mac.sh
SPEED_PROFILE=quality ./run_all_mac.sh
```

### Linux

```bash
./run_all_linux.sh
```

Same flow as macOS but uses `apt` instead of Homebrew and builds llama.cpp with CUDA if `nvcc` is detected.

### Stop everything

```bash
./stop_all.sh
```

---

## Manual Setup

If you prefer to run each service yourself:

### 1. llama-server

```bash
# Download a GGUF model (example: 3B balanced)
huggingface-cli download bartowski/Qwen2.5-Coder-3B-Instruct-GGUF \
  Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf --local-dir ~/models/qwen

# Start llama-server
llama-server \
  -m ~/models/qwen/Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf \
  --host 127.0.0.1 --port 8082 -c 8192 -t 4
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # edit URLs/ports to match your llama-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## Configuration

All backend settings live in `backend/.env`. Key options:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLAMACPP_URL_MAIN` | `http://127.0.0.1:8082/v1/...` | LLM endpoint |
| `LLAMACPP_MAX_TOKENS` | `1024` | Max tokens per LLM call |
| `LLAMACPP_TEMPERATURE` | `0.10` | Lower = more deterministic |
| `LLM_TIMEOUT_SECONDS` | `90` | Timeout per LLM request |
| `RUNNER_MODE` | `auto` | `auto` · `local` · `docker` |
| `RUN_TIMEOUT_SECONDS` | `2` | Code execution timeout |
| `INTERNET_ENABLED` | `true` | Allow Tavily web search for context |
| `TAVILY_API_KEY` | _(empty)_ | Optional — for internet-augmented answers |
| `LLM_CACHE_ENABLED` | `true` | Cache identical LLM prompts |
| `LLM_WORKERS` | `1` | Keep at 1 on laptops to prevent overheating |
| `LLD_WORKSPACE` | `./lld-workspace` | Directory for LLD mode files |

### Code runner modes

- **`auto`** — uses local subprocess (fastest, no Docker needed)
- **`local`** — explicit local subprocess
- **`docker`** — runs code in an isolated Docker container (`python:3.11-slim`)

---

## Project Structure

```
i-and-ai-code-llama-cpp/
├── run_all_mac.sh          # one-command macOS setup + start
├── run_all_linux.sh        # one-command Linux setup + start
├── stop_all.sh             # kill all three services
│
├── backend/
│   ├── main.py             # FastAPI routes
│   ├── ai_engine.py        # all LLM prompt functions
│   ├── runner.py           # code execution (local / docker)
│   ├── parallel_runtime.py # async task queue for LLM + runner
│   ├── internet_tools.py   # Tavily web search integration
│   ├── requirements.txt
│   ├── .env                # your config (gitignored)
│   ├── .env.example        # template
│   └── lld-workspace/      # files created in LLD mode
│
└── frontend/
    ├── src/
    │   ├── App.jsx                      # root, mode routing, run logic
    │   ├── api.js                       # all fetch calls to backend
    │   ├── index.css                    # all styles
    │   ├── components/
    │   │   ├── CodeEditor.jsx           # highlight.js editor
    │   │   ├── AssistantPanel.jsx       # AI chat sidebar
    │   │   ├── BuildRunPanel.jsx        # run output, stress test, WA verdict
    │   │   ├── ContextPanel.jsx         # problem context input
    │   │   ├── InterviewMode.jsx        # full interview state machine
    │   │   ├── SystemDesignMode.jsx     # LLD workspace
    │   │   ├── TopBar.jsx
    │   │   └── Sidebar.jsx
    │   └── data/
    │       ├── interviewProblems.js     # 20 DSA problems + test harnesses
    │       └── lldProblems.js           # 20 LLD problems + reference solutions
    └── package.json
```

---

## Requirements

**macOS:**
- macOS 12+ (Apple Silicon recommended for Metal GPU acceleration)
- Xcode Command Line Tools
- Homebrew
- Node.js 18+
- Python 3.11–3.13
- ~4 GB free RAM (balanced profile)

**Linux:**
- Ubuntu 20.04+ / Debian 11+
- build-essential, cmake, git, node, python3
- NVIDIA GPU optional (CUDA acceleration via nvcc)

**Docker** (optional, for sandboxed code execution):
- Docker Desktop or Docker Engine

---

## Tips

- **Too hot / slow?** Run with fewer threads and smaller context:
  ```bash
  LLAMA_THREADS=2 LLAMA_CTX=1536 SPEED_PROFILE=fast ./run_all_mac.sh
  ```
- **Model already downloaded?** Point to it directly:
  ```bash
  MODEL_PATH=/path/to/your/model.gguf ./run_all_mac.sh
  ```
- **LLD workspace** files persist between sessions at `backend/lld-workspace/`
- **Mistake memory** — the backend remembers past errors in `backend/mistake_memory.json` and uses them to give better hints
- **Interview mode** problems are fully offline — no network calls during interviews

---

## License

MIT
