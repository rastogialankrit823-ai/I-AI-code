# Technical Report — I&AI Code

## Model and runtime

| | |
|---|---|
| **Model** | Qwen2.5-Coder-3B-Instruct |
| **Format** | GGUF, Q5_K_M quantization |
| **Model size on disk** | 2.44 GB (2,438,740,416 bytes) |
| **Runtime** | llama.cpp `llama-server` (build `12127de`), OpenAI-compatible API |
| **Context window** | 8,192 tokens |
| **Serving config** | 4 slots, unified KV cache, 4 CPU threads |

The model is swappable: the first `.gguf` in `models/` is used, or set `"model"` in `~/.iandai/config.json`. A 7B model noticeably improves LLD reviews on machines with more RAM.

## Quantization and optimization techniques

- **Q5_K_M quantization** — 5-bit k-quant; chosen as the best quality/size trade-off that keeps the model + KV cache under ~3.5 GB total, fitting 8 GB machines.
- **Per-feature token budgets** — every prompt has a hard `max_tokens` cap tuned to its purpose (a complexity analysis gets far fewer tokens than a full code review), keeping CPU latency bounded.
- **Prompt trimming** — inputs are trimmed to fit the context budget before dispatch.
- **Response caching** — in-memory LRU cache keyed by SHA-256 of (mode, params, prompt); repeated queries are instant.
- **Deterministic pre-pass** — static bug scanners answer common cases with zero inference cost.
- **503 retry + port fallback** — busy inference slots are retried with backoff instead of failing; alternate ports are tried automatically.
- **Backend accelerator** — Metal on Apple Silicon, CUDA on NVIDIA Linux, CPU otherwise (autodetected at build time). Metal is deliberately disabled on Intel Macs (see below).

## Measured performance

Measured on the tested device below, CPU-only inference (`-ngl 0`), 4 threads, cold cache:

| Metric | Value |
|---|---|
| Prompt eval speed | 8.0 tokens/s (124 ms/token) |
| Generation speed | 4.5 tokens/s (224 ms/token) |
| End-to-end, 200-token answer (42-token prompt) | ~50 s |
| Typical short answer (clarifying question, hint) | 5–15 s |
| Cached repeat query | < 0.1 s |

Apple Silicon with Metal is several times faster than these CPU numbers.

### Memory usage

| Metric | Value |
|---|---|
| `llama-server` RSS after model load | ~66 MB (model is mmapped; pages fault in on use) |
| `llama-server` peak RSS during inference | ~2.9 GB |
| Backend (FastAPI) + frontend | ~200 MB combined |
| **Total practical footprint** | **~3.2 GB** — fits 8 GB machines |

### CPU/GPU/NPU usage

- **This test device (Intel Mac):** 100% CPU inference. Metal on AMD/Intel GPUs produced corrupted output ("Compute error", garbage tokens), so the app forces `-ngl 0` on `x86_64` macOS.
- **Apple Silicon:** full Metal GPU offload (all layers).
- **Linux + NVIDIA:** CUDA offload, autodetected by the installer via `nvcc`.
- **NPU:** not used.

### Tested device specifications

| | |
|---|---|
| Device | MacBook Pro 16" 2019 (MacBookPro16,1) |
| CPU | Intel Core i7-9750H @ 2.60 GHz (6 cores) |
| RAM | 16 GB |
| GPU | AMD Radeon Pro (unused — see above) |
| OS | macOS (Darwin 25.5.0) |

## Local AI verification

**Runs fully on-device:**
- All model inference (every AI feature: debugging, reviews, judging, hints, LLD generation) — served by llama.cpp on `127.0.0.1:8081`
- All code execution — local subprocess (optional Docker sandbox)
- All storage — workspace files, settings, interview history stay on local disk

**Requires internet:**
- One-time model download from HuggingFace during install (~2.3 GB)
- One-time toolchain fetches during install (pip, npm, llama.cpp clone, optional rustup)
- Tavily web search — **optional and off by default**; only active if the user adds an API key to `backend/.env`

**Does any user data leave the device?** No. After install, with the default configuration, the app makes zero network calls beyond localhost. Code, answers, and files are never transmitted anywhere. There is no telemetry, no account, and no analytics.

You can verify this: run the app with Wi-Fi off — everything works.

## Evaluation

### Method

The core quality problem is that **small models are unreliable judges**. Evaluation focused on the DSA verdict path and the interview judge, tested against solutions with known-correct and known-buggy variants of the bundled problems (20 DSA + 20 LLD mocks).

### What the layered pipeline fixes (vs. raw-prompt baseline)

| Failure in raw 3B prompting | Mitigation | Result |
|---|---|---|
| "Score this 0–100" produces near-random scores | Binary yes/no per rubric point + quote requirement + score clamped to ±30 of deterministic coverage baseline | Scores track answer coverage instead of noise |
| Misses classic logic bugs (e.g. missing backtrack in N-Queens) | Deterministic static scanners run before any LLM call | Caught instantly, 100% of the time — not probabilistic. This setup caught a backtracking bug that larger cloud models hallucinated on |
| Generated patches introduce typos (`mai()`) or self-recursion | AST validation of every patch before it's offered | Invalid patches rejected, never shown |
| Correct outputs judged "Wrong Answer" over formatting (quotes, whitespace, trailing lines) | Multi-strategy output comparison: normalized → canonical → numeric → last-line → multi-line tail | Formatting differences no longer produce false verdicts |

### Known failure cases

- **Long/complex LLD reviews** — the 3B model can produce shallow or partially incorrect design feedback; a 7B model measurably improves this.
- **CPU latency** — long reviews take 30–90 s on Intel CPUs; users on older hardware may find full reviews slow.
- **Expected-output inference** — when a DSA problem statement has no parseable example matching the user's stdin, no verdict is given (by design) rather than guessing.
- **Judge variance** — rubric clamping bounds but does not eliminate scoring variance between runs on borderline answers.
- **Non-Python DSA** — deep bug-tracing and AST patch validation are Python-first; other languages get generic LLM review only.
