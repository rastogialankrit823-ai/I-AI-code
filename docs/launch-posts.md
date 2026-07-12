# Launch-Day Posts — I&AI Code

Ready-to-paste drafts for each channel. Post natively — don't cross-link the
Product Hunt page anywhere except your own social accounts; HN and Reddit
communities respond badly to PH funnels.

---

## Show HN (~7 AM PT on launch day)

**Title:**
> Show HN: Open-source AI interview prep that runs fully offline (llama.cpp + Qwen 3B)

**URL:** https://github.com/rastogialankrit823-ai/I-AI-code

**First comment (post immediately after submitting):**

I built this because interview-prep AI tools all want a subscription and send your code to someone's cloud.

I&AI Code runs Qwen2.5-Coder-3B locally via llama.cpp — three modes: DSA (write/run code, AI traces the exact buggy line), low-level design (AI generates class structures and code files into a workspace), and timed mock interviews with test suites and an AI judge. No API keys, no telemetry, MIT licensed.

The interesting engineering problem was that small local models are terrible judges. Ask a 3B model to "score this answer 0-100" and you get noise. What ended up working:

1. Deterministic static analysis runs before any LLM call — classic bug patterns (like backtracking without undo) are caught instantly without inference
2. The judge answers binary yes/no per rubric point instead of producing scores, and must quote the candidate's answer to claim a point — unverifiable claims get flipped to "no"
3. The final score is clamped to ±30 of a deterministically computed coverage baseline
4. AI-generated patches are validated with AST parsing before being offered — rejecting self-recursion and undefined-name typos the model introduces

It's a public beta — macOS is well-tested (Apple Silicon Metal is several times faster than CPU), Linux path exists but has had less testing. Install is clone + one script (~2.3 GB model download).

Happy to answer anything about making small local models reliable — including everything that didn't work.

---

## r/LocalLLaMA (mid-morning PT)

**Title:**
> I built an offline interview-prep app around Qwen2.5-Coder-3B — here's what it took to make a 3B model a reliable code judge

**Body:**

I've been building I&AI Code, an open-source (MIT) interview-prep app that runs entirely on llama.cpp + Qwen2.5-Coder-3B-Instruct (Q5_K_M). DSA practice with AI debugging, low-level design workspace, and timed mock interviews — all offline, no API keys.

The hard part wasn't the plumbing, it was that **3B models are terrible judges**. Things that fixed it:

- **Static analysis before inference** — deterministic scanners catch classic bug patterns (missing backtrack in N-Queens, etc.) instantly. The LLM only handles what static analysis can't. Fun result: my 3B setup caught a backtracking bug that bigger cloud models hallucinated on, because the scanner isn't probabilistic.
- **Binary rubrics instead of scores** — "yes/no: did the answer address X, quote the sentence that does" works. "Score this 0-100" doesn't. Unverifiable claims get flipped to no.
- **Clamped scoring** — the LLM's final score can only move ±30 from a deterministic coverage baseline, so one hallucinated rubric point can't swing the verdict.
- **AST validation of generated patches** — the model loves introducing `mai()` typos and self-recursive `main()` calls. Every patch is parsed and rejected if it calls undefined names or introduces recursion that wasn't there.
- **Per-feature token budgets** — hard output caps tuned for CPU latency; a complexity analysis gets far fewer tokens than a full review.

Repo: https://github.com/rastogialankrit823-ai/I-AI-code

Swap in any instruct GGUF — first .gguf in models/ is used; a 7B noticeably improves LLD reviews if you have the RAM. Public beta, would love feedback from people running other models/quants.

---

## r/leetcode (mid-morning PT)

**Title:**
> I made a free, open-source mock-interview tool that runs 100% offline — AI finds the exact buggy line in your solution

**Body:**

Got tired of interview-prep tools that want $30/month to run your code through someone's cloud. So I built I&AI Code — it runs a small coding model entirely on your laptop (nothing leaves your machine, works on a plane):

- **DSA mode** — paste a problem, write your solution, run it. If it's wrong, the AI traces your logic and points at the exact line, then offers a fix you can apply with one click
- **Interview mode** — 20 DSA + 20 LLD timed mocks with real test suites and an AI interviewer that asks follow-up questions and scores you against a rubric
- **LLD mode** — describe a design (parking lot, Splitwise...), get class structures and working code files you can run in a built-in terminal

Free forever (MIT license), no account, no API keys. Needs 8 GB+ RAM; macOS best-tested, Linux works, Windows via WSL2.

https://github.com/rastogialankrit823-ai/I-AI-code

It's a public beta — if the install breaks on your machine, open an issue and I'll usually fix it same-day.

---

## r/selfhosted (afternoon PT)

**Title:**
> I&AI Code — self-hosted AI coding interview coach (llama.cpp + Qwen, no cloud, MIT)

**Body:**

Sharing my weekend-project-that-grew: a fully local AI interview-prep app. llama.cpp serves Qwen2.5-Coder-3B on localhost, a FastAPI backend orchestrates code execution + AI analysis, React frontend, optional Tauri desktop wrapper.

Self-hosted angle: **zero external calls after install**. The only network access is the one-time model download from HuggingFace. No telemetry, no account, no API keys. Your code never leaves the machine.

Stack: llama.cpp (OpenAI-compatible server) → FastAPI with async task queues → Vite/React. Model is swappable — drop any instruct GGUF in models/.

Install is `git clone` + `./scripts/install.sh` (builds llama.cpp with Metal/CUDA autodetect, downloads the model, sets up venv + npm, optionally builds a real desktop app). There's an uninstaller with `--dry-run` and `--purge`.

https://github.com/rastogialankrit823-ai/I-AI-code

Public beta — macOS well-tested, Linux less so. Issues welcome.

---

## r/opensource (afternoon PT)

**Title:**
> I&AI Code — MIT-licensed offline AI interview prep (llama.cpp + Qwen 3B), public beta

**Body:**

Just released my first significant open-source project: an AI coding-interview coach that runs entirely offline. Local 3B model via llama.cpp, three practice modes (DSA debugging, low-level design, timed mocks with an AI judge), MIT licensed.

Built it because every interview-prep AI tool is a subscription wrapper around someone else's API. This one is free forever and your code stays on your machine.

Good first-contribution areas: new interview problems (JSON data files), prompt improvements, and Linux/WSL install testing.

https://github.com/rastogialankrit823-ai/I-AI-code

---

## X/Twitter thread (launch morning)

**Tweet 1:**
I built an AI coding interview coach that runs 100% on your laptop. No API keys. No cloud. No subscription. Your code never leaves your machine.

Open source, public beta 🧵
[attach dsa-demo.gif]

**Tweet 2:**
Three modes:
🧩 DSA — AI traces your logic to the exact buggy line
🏗 LLD — AI generates class designs + code files into a workspace
🎤 Interview — timed mocks, real test suites, rubric-based AI judge

**Tweet 3:**
The hard part: small local models are terrible judges.

Fixes that worked:
• static analysis before any LLM call
• binary yes/no rubrics (must quote your answer to claim a point)
• scores clamped to a deterministic baseline
• AST validation on every AI patch

**Tweet 4:**
It's live on Product Hunt today → [PH link]
Repo (MIT): https://github.com/rastogialankrit823-ai/I-AI-code

⭐ if you find it useful — and if the install breaks, open an issue, fixes ship same-day during beta.
