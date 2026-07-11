# Product Hunt Launch Kit — I&AI Code

## Name
**I&AI Code**

## Tagline (60 chars max)
Primary:
> Offline AI interview coach — DSA, LLD & mocks. No API keys.

Alternates:
> Your AI coding interview coach that runs 100% on your laptop
> Open-source interview prep with a local AI judge. $0 forever.

## Description (260 chars max)
> Practice DSA, low-level design & mock interviews with an AI that runs entirely on your machine via llama.cpp + Qwen. It finds the exact buggy line, reviews your designs, and judges mock answers — no API keys, no cloud, no subscription. Open source (MIT).

## Categories
Developer Tools · Artificial Intelligence · Open Source

## Links
- **Get it:** https://github.com/rastogialankrit823-ai/I-AI-code
- Release: https://github.com/rastogialankrit823-ai/I-AI-code/releases/tag/v1.0.0

## Gallery (1270×760)
| # | File | Caption |
|---|------|---------|
| 1 | `demo.gif` | Write code → run → AI finds the exact buggy line → fix → green verdict |
| 2 | `dsa-mode.png` | DSA Mode — AI traces your logic and pinpoints the bug, with a one-click fix |
| 3 | `lld-mode.png` | LLD Mode — AI generates class structures and complete code files from your design brief |
| 4 | `interview-mode.png` | Interview Mode — timed mocks with full test suites and a rubric-based AI judge |
| 5 | `light-theme-settings.png` | Light & dark themes; AI replies in English or Hinglish |

## Maker comment (post immediately at launch)

Hey PH 👋

I built I&AI Code because interview-prep AI tools all want a subscription and send your code to someone's cloud.

This runs a Qwen 2.5 Coder model **entirely on your machine** via llama.cpp:

- 🧩 **DSA mode** — write code, run it, and the AI traces your logic to find the exact buggy line (it caught a missing-backtrack bug in N-Queens that bigger cloud models hallucinated on)
- 🏗 **LLD mode** — an AI workspace that generates class structures, writes complete code files, and patches them in place
- 🎤 **Interview mode** — 40 mock problems with full test suites and a rubric-based AI judge, scored offline

No API key. No account. No telemetry. Works on a plane ✈️

The hardest engineering problem: **small local models are terrible judges.** Ask a 3B model to "score this answer 0–100" and you get noise. What fixed it:

1. Deterministic bug scanners run *before* the LLM — classic patterns (like backtracking without undo) are caught instantly by static analysis
2. The judge answers **binary yes/no per rubric point** instead of producing a score, and must *quote your answer* to claim a point — unverifiable claims get flipped to "no"
3. The final score is clamped to ±30 of a deterministically computed coverage baseline

Happy to answer anything about making small local models reliable — including everything that totally didn't work. 🙃

## Launch-day checklist
- [ ] Launch Tue/Wed 12:01 AM PT
- [ ] Post maker comment immediately
- [ ] ~7 AM PT: Show HN — "Show HN: Open-source AI interview prep that runs fully offline (llama.cpp + Qwen 3B)"
- [ ] Mid-morning: r/LocalLLaMA (technical angle), r/leetcode (prep angle), r/selfhosted, r/opensource
- [ ] X/Twitter thread with demo GIF
- [ ] Reply to every comment; watch GitHub issues for install failures — hotfix fast
- [ ] Star CTA in every reply footer: "⭐ the repo if this is useful"
