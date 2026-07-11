"""Fully dynamic native llama.cpp model orchestration for I&AI Code.

This version uses local llama.cpp / llama-server instead of Ollama, with three
selectable quality modes: Fast Mode (~2B-class), Normal Mode (~3B), and Main
Mode (~7B). All intelligent features remain dynamic and routed to the selected
local llama.cpp endpoint.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import requests

try:
    import internet_tools
except Exception:
    internet_tools = None

# llama.cpp / llama-server configuration.
# Recommended: run one llama-server per mode on different ports.
# If mode-specific URLs are empty, LLAMACPP_URL is used for every mode.
LLAMACPP_URL = os.getenv("LLAMACPP_URL", "http://localhost:8080/v1/chat/completions")
LLAMACPP_URL_FAST = os.getenv("LLAMACPP_URL_FAST", "http://localhost:8081/v1/chat/completions")
LLAMACPP_URL_NORMAL = os.getenv("LLAMACPP_URL_NORMAL", "http://localhost:8082/v1/chat/completions")
LLAMACPP_URL_MAIN = os.getenv("LLAMACPP_URL_MAIN", "http://localhost:8083/v1/chat/completions")
LLAMACPP_API_STYLE = os.getenv("LLAMACPP_API_STYLE", "openai").lower().strip()  # openai or completion
LLAMACPP_MAX_TOKENS = int(os.getenv("LLAMACPP_MAX_TOKENS", "1024"))
LLAMACPP_TEMPERATURE = float(os.getenv("LLAMACPP_TEMPERATURE", "0.15"))

# These names are display/routing names only. llama-server loads the actual GGUF file.
LLAMACPP_MODEL_FAST = os.getenv("LLAMACPP_MODEL_FAST", "qwen2.5-coder-3b-instruct-q5_k_m.gguf")
LLAMACPP_MODEL_NORMAL = os.getenv("LLAMACPP_MODEL_NORMAL", "qwen2.5-coder-3b-instruct-q5_k_m.gguf")
LLAMACPP_MODEL_MAIN = os.getenv("LLAMACPP_MODEL_MAIN", "qwen2.5-coder-3b-instruct-q5_k_m.gguf")
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "90"))
LLM_CACHE_ENABLED = os.getenv("LLM_CACHE_ENABLED", "true").lower() not in {"0", "false", "no"}
LLM_CACHE_MAX_ITEMS = int(os.getenv("LLM_CACHE_MAX_ITEMS", "96"))
LLM_MAX_PROMPT_CHARS = int(os.getenv("LLM_MAX_PROMPT_CHARS", "12000"))
COMPLEXITY_USE_LLM = os.getenv("COMPLEXITY_USE_LLM", "false").lower() in {"1", "true", "yes"}
_REQUEST_SESSION = requests.Session()
_LLM_CACHE: "OrderedDict[str, str]" = OrderedDict()

MODEL_MODES = {
    "fast": {"label": "Fast Mode", "size": "3B Q5", "model": LLAMACPP_MODEL_FAST, "url": LLAMACPP_URL_FAST or LLAMACPP_URL, "best_for": "quick chat, small patches, simple suggestions"},
    "normal": {"label": "Normal Mode", "size": "3B Q5", "model": LLAMACPP_MODEL_NORMAL, "url": LLAMACPP_URL_NORMAL or LLAMACPP_URL, "best_for": "daily DSA help, unit tests, suggestions"},
    "main": {"label": "Main Mode", "size": "3B Q5", "model": LLAMACPP_MODEL_MAIN, "url": LLAMACPP_URL_MAIN or LLAMACPP_URL, "best_for": "best patch quality, system design, interview judging"},
}


def resolve_model(model_mode: str = "main") -> str:
    key = (model_mode or "main").lower().strip()
    return MODEL_MODES.get(key, MODEL_MODES["main"])["model"]


def resolve_llamacpp_url(model_mode: str = "main") -> str:
    key = (model_mode or "main").lower().strip()
    return MODEL_MODES.get(key, MODEL_MODES["main"]).get("url") or LLAMACPP_URL


def model_mode_info(model_mode: str = "main") -> Dict[str, Any]:
    key = (model_mode or "main").lower().strip()
    if key not in MODEL_MODES:
        key = "main"
    info = dict(MODEL_MODES[key])
    info["key"] = key
    return info
INTERNET_ENABLED = os.getenv("INTERNET_ENABLED", "true").lower() not in {"0", "false", "no"}

DYNAMIC_REPAIR = True
DYNAMIC_SUGGESTIONS = True
DYNAMIC_SYSTEM_VALIDATION = True
DYNAMIC_UNIT_TESTS = True
DYNAMIC_INTERVIEW = True
DYNAMIC_QUICK_PROMPTS = True
DYNAMIC_SYSTEM_DIAGRAM = True
DYNAMIC_APPLY_GUIDE = True
DYNAMIC_STARTER_CODE = True
DYNAMIC_RUN_EXPLANATION = True
DYNAMIC_COMPLEXITY_ANALYSIS = True
DYNAMIC_STRESS_TEST = True
DYNAMIC_MISTAKE_MEMORY = True
DYNAMIC_DESIGN_RISK_RADAR = True

# ── AI reply style (English) ──────────────────────────────────────────────────
BRO_STYLE = """You are Bro, a friendly expert coding assistant.
Reply in clear, concise English. Casual tone, technically precise.
Example: "Bro, the base case is missing here — add `if n == 0: return`."
When asked for JSON: return ONLY valid JSON, no markdown.""".strip()

AI_LANGUAGE = "english"


def set_language(_lang: str = "english") -> str:
    """Kept for API compatibility — replies are always English."""
    return "english"


def get_language() -> str:
    return "english"


MAX_CODE_CHARS = 20000


def _prepare_code(code: str, max_chars: int = MAX_CODE_CHARS, numbered: bool = True) -> str:
    """Send full code to the model. If code exceeds max_chars, do function-aware reduction."""
    code = str(code or "")
    if not code.strip():
        return ""

    if len(code) <= max_chars:
        if numbered:
            return '\n'.join(f'{i+1}: {l}' for i, l in enumerate(code.split('\n')))
        return code

    lines = code.split('\n')
    fns = []
    for i, line in enumerate(lines):
        m = re.match(r'^(\s*)def\s+(\w+)\s*\(', line)
        if m:
            fns.append((i, m.group(2), len(m.group(1))))

    if not fns:
        # No functions — head + tail trim
        half = max_chars // 2
        trimmed = code[:half] + "\n\n# ... [middle trimmed — code too large] ...\n\n" + code[-half:]
        if numbered:
            return '\n'.join(f'{i+1}: {l}' for i, l in enumerate(trimmed.split('\n')))
        return trimmed

    # Function-aware: keep all signatures + short bodies, trim long function bodies
    kept_lines = set()
    for idx, (start, name, indent_len) in enumerate(fns):
        # Find function end
        end = len(lines)
        for j in range(idx + 1, len(fns)):
            if fns[j][2] <= indent_len:
                end = fns[j][0]
                break
        body_len = end - start
        if body_len <= 30:
            # Short function — keep entirely
            for li in range(start, end):
                kept_lines.add(li)
        else:
            # Keep first 10 + last 5 lines of function
            for li in range(start, min(start + 10, end)):
                kept_lines.add(li)
            for li in range(max(start + 10, end - 5), end):
                kept_lines.add(li)

    # Also keep top-level non-function lines (imports, globals) — first 20 lines
    for i in range(min(20, len(lines))):
        kept_lines.add(i)

    result = []
    prev = -1
    for li in sorted(kept_lines):
        if prev >= 0 and li > prev + 1:
            result.append(f"    # ... [{li - prev - 1} lines trimmed] ...")
        if numbered:
            result.append(f'{li+1}: {lines[li]}')
        else:
            result.append(lines[li])
        prev = li

    reduced = '\n'.join(result)
    if len(reduced) <= max_chars:
        return reduced

    # Still too large — hard trim
    half = max_chars // 2
    return reduced[:half] + "\n\n# ... [middle trimmed] ...\n\n" + reduced[-half:]


def _offline_payload(feature: str, extra: Optional[Dict[str, Any]] = None, model_mode: str = "main") -> Dict[str, Any]:
    selected_model = resolve_model(model_mode)
    payload: Dict[str, Any] = {
        "dynamic": False,
        "available": False,
        "feature": feature,
        "model_mode": model_mode_info(model_mode),
        "error": "LLM unavailable. Start llama.cpp llama-server for the selected model mode, then retry.",
        "hint": f"Start llama-server for {selected_model}. Example: ./llama-server -m /path/to/{selected_model} --port 8083",
    }
    if extra:
        payload.update(extra)
    return payload



def _trim_prompt(prompt: str) -> str:
    """Keep prompts bounded so they fit in the 16k context window."""
    prompt = str(prompt or "")
    if len(prompt) <= LLM_MAX_PROMPT_CHARS:
        return prompt
    head = prompt[: max(4000, LLM_MAX_PROMPT_CHARS // 3)]
    tail = prompt[-max(8000, (LLM_MAX_PROMPT_CHARS * 2) // 3):]
    return head + "\n\n...[middle trimmed for context limit]...\n\n" + tail


def _cache_get(key: str) -> Optional[str]:
    if not LLM_CACHE_ENABLED:
        return None
    value = _LLM_CACHE.get(key)
    if value is not None:
        _LLM_CACHE.move_to_end(key)
    return value


def _cache_set(key: str, value: str) -> None:
    if not LLM_CACHE_ENABLED or not value:
        return
    _LLM_CACHE[key] = value
    _LLM_CACHE.move_to_end(key)
    while len(_LLM_CACHE) > LLM_CACHE_MAX_ITEMS:
        _LLM_CACHE.popitem(last=False)

_FALLBACK_PORTS = [8080, 8081, 8082, 8083]


def _try_llamacpp_url(url: str, prompt: str, timeout: int, model_mode: str, max_tokens: int = LLAMACPP_MAX_TOKENS) -> Optional[str]:
    """Single attempt to call one llama-server URL. Returns text or None."""
    if LLAMACPP_API_STYLE == "completion" or url.rstrip("/").endswith("/completion"):
        payload = {
            "prompt": prompt,
            "temperature": LLAMACPP_TEMPERATURE,
            "n_predict": max_tokens,
            "stream": False,
        }
        response = _REQUEST_SESSION.post(url, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
        return str(data.get("content") or data.get("response") or "").strip() or None

    payload = {
        "model": resolve_model(model_mode),
        "messages": [
            {"role": "system", "content": "You are Bro, a concise English coding assistant. Respond in clear English. Follow the output format exactly."},
            {"role": "user", "content": prompt},
        ],
        "temperature": LLAMACPP_TEMPERATURE,
        "max_tokens": max_tokens,
        "stream": False,
    }
    response = _REQUEST_SESSION.post(url, json=payload, timeout=timeout)
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if choices:
        message = choices[0].get("message") or {}
        content = message.get("content")
        if content is not None:
            return str(content).strip() or None
        text = choices[0].get("text")
        if text is not None:
            return str(text).strip() or None
    return str(data.get("content") or data.get("response") or "").strip() or None


def _call_llamacpp(prompt: str, timeout: int = LLM_TIMEOUT_SECONDS, model_mode: str = "main", max_tokens: int = LLAMACPP_MAX_TOKENS) -> Optional[str]:
    """Call a local llama.cpp server with automatic port fallback."""
    prompt = _trim_prompt(prompt)
    primary_url = resolve_llamacpp_url(model_mode)
    cache_key = hashlib.sha256(
        f"{model_mode}|{LLAMACPP_API_STYLE}|{LLAMACPP_TEMPERATURE}|{max_tokens}|{prompt}".encode("utf-8", "ignore")
    ).hexdigest()
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    base_path = "/completion" if (LLAMACPP_API_STYLE == "completion" or primary_url.rstrip("/").endswith("/completion")) else "/v1/chat/completions"
    tried = {primary_url}
    candidates = [primary_url] + [
        f"http://localhost:{p}{base_path}" for p in _FALLBACK_PORTS
        if f"http://localhost:{p}{base_path}" not in tried
    ]

    for url in candidates:
        try:
            result = _try_llamacpp_url(url, prompt, timeout, model_mode, max_tokens)
            if result:
                _cache_set(cache_key, result)
                return result
        except requests.exceptions.ConnectionError:
            continue
        except requests.exceptions.Timeout:
            import sys
            print(f"[llamacpp] Timeout on {url} after {timeout}s", file=sys.stderr, flush=True)
            return None
        except Exception as exc:
            import sys
            print(f"[llamacpp] Error on {url}: {exc}", file=sys.stderr, flush=True)
            return None

    import sys
    print(f"[llamacpp] All candidates failed: {candidates}", file=sys.stderr, flush=True)
    return None


def _extract_json(raw: str) -> Any:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("empty model response")
    try:
        return json.loads(raw)
    except Exception:
        pass
    cleaned = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        pass
    # Prefer the first object; arrays are allowed for list-style endpoints.
    for pattern in [r"\{.*\}", r"\[.*\]"]:
        match = re.search(pattern, raw, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
    raise ValueError("no JSON found")


def _json_llm(prompt: str, feature: str, timeout: int = LLM_TIMEOUT_SECONDS, model_mode: str = "main", max_tokens: int = LLAMACPP_MAX_TOKENS) -> Any:
    raw = _call_llamacpp(prompt, timeout=timeout, model_mode=model_mode, max_tokens=max_tokens)
    if not raw:
        import sys
        print(f"[{feature}] LLM returned empty/None", file=sys.stderr, flush=True)
        return _offline_payload(feature, model_mode=model_mode)
    try:
        parsed = _extract_json(raw)
        if isinstance(parsed, dict):
            parsed.setdefault("dynamic", True)
            parsed.setdefault("available", True)
            parsed.setdefault("model_mode", model_mode_info(model_mode))
        return parsed
    except Exception as e:
        import sys
        print(f"[{feature}] JSON parse failed: {e} | raw[:300]: {raw[:300]!r}", file=sys.stderr, flush=True)
        return _offline_payload(feature, {"raw_model_response": raw[:2500]}, model_mode=model_mode)


def _web_context(query: str, enabled: bool, max_results: int = 4) -> str:
    if not (INTERNET_ENABLED and enabled and internet_tools and query.strip()):
        return ""
    try:
        return internet_tools.search_web(query, max_results=max_results)
    except Exception as exc:
        return f"Internet search failed: {exc}"



MEMORY_PATH = os.getenv("MISTAKE_MEMORY_PATH", os.path.join(os.path.dirname(__file__), "mistake_memory.json"))


def _load_memory() -> Dict[str, Any]:
    try:
        with open(MEMORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            data.setdefault("mistakes", [])
            return data
    except Exception:
        pass
    return {"mistakes": []}


def _save_memory(data: Dict[str, Any]) -> None:
    try:
        with open(MEMORY_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


def record_mistake(kind: str, problem: str, where: str = "", fix: str = "", mode: str = "DSA") -> Dict[str, Any]:
    data = _load_memory()
    item = {
        "kind": str(kind or "unknown")[:80],
        "problem": str(problem or "")[:400],
        "where": str(where or "")[:200],
        "fix": str(fix or "")[:400],
        "mode": str(mode or "DSA")[:40],
    }
    data.setdefault("mistakes", []).insert(0, item)
    data["mistakes"] = data["mistakes"][:60]
    _save_memory(data)
    return item


def get_mistake_memory(limit: int = 10) -> Dict[str, Any]:
    data = _load_memory()
    mistakes = data.get("mistakes", [])
    if not isinstance(mistakes, list):
        mistakes = []
    top: Dict[str, int] = {}
    for m in mistakes:
        if isinstance(m, dict):
            key = str(m.get("kind", "unknown"))
            top[key] = top.get(key, 0) + 1
    return {"mistakes": mistakes[:max(1, min(int(limit or 10), 30))], "patterns": top, "count": len(mistakes)}

def _extract_line(error: str) -> int:
    for pattern in [r"main\.cpp:(\d+):(\d+):", r"temp\.cpp:(\d+):(\d+):", r"/main\.cpp:(\d+):(\d+):", r"line\s+(\d+)"]:
        match = re.search(pattern, error or "", re.IGNORECASE)
        if match:
            try:
                return int(match.group(1))
            except Exception:
                pass
    return 1


def _repair_unavailable(error: str, model_mode: str = "main") -> Dict[str, Any]:
    return _offline_payload(
        "repair_gap",
        {
            "line": _extract_line(error),
            "type": "unavailable",
            "problem": "AI repair gap unavailable",
            "fix": "",
            "why": "Bro, connect the LLM to get a real fix. Check the raw compiler output in the error panel.",
            "confidence": 0.0,
        },
        model_mode=model_mode,
    )



def generate_starter_code(mode: str = "DSA", language: str = "cpp", context: str = "", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    """Generate a dynamic editor starter template instead of shipping demo code.

    This is intentionally LLM-backed. If the model is offline, the UI receives
    an explicit unavailable state and can start with a blank editor.
    """
    internet_context = _web_context(context or f"{mode} starter code", use_internet, max_results=3)
    schema = """
{
  "title": "main.cpp",
  "code": "minimal starter code only, no solved demo",
  "stdin": "optional sample stdin derived from context, otherwise empty",
  "note": "short English note"
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Generate a dynamic starter editor state for I&AI Code.
Return ONLY JSON:
{schema}

Rules:
- Do not use Two Sum/KV store/demo code unless user context asks for it.
- Do not include a solved algorithm.
- If Language is cpp/C++, give a minimal compile-ready main that reads stdin only if context implies input shape.
- If Language is python/py, give a minimal Python 3 stdin template, not C++.
- For System Design, give minimal pseudocode skeleton if relevant.
- Keep stdin empty unless a real context/problem gives sample input.

Mode: {mode}
Language: {language}
Context: {context}
Internet context: {internet_context}
""".strip()
    parsed = _json_llm(prompt, "starter_code", timeout=70, model_mode=model_mode)
    default_title = "main.py" if str(language).lower() in {"python", "py", "python3"} else "main.cpp"
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("starter_code", {"title": default_title, "code": "", "stdin": "", "note": "LLM start hone ke baad dynamic starter generate hoga."}, model_mode=model_mode)
    parsed.setdefault("title", default_title)
    parsed.setdefault("code", "")
    parsed.setdefault("stdin", "")
    parsed.setdefault("note", "Dynamic starter ready.")
    return parsed


def explain_run_result(code: str, mode: str, stdin: str, output: str, error: str, success: bool, use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    """Dynamic run summary for the bottom panel.

    The actual stdout/stderr remain the source of truth; this only adds a
    concise friend-style explanation for what happened.
    """
    schema = """
{
  "status_text": "short result explanation",
  "next_step": "what user should do next",
  "risk": "empty or one important risk",
  "time_complexity": "O(n)",
  "space_complexity": "O(1)",
  "complexity_reason": "short reason"
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Explain the latest Build & Run result concisely.
Return ONLY JSON:
{schema}

Rules:
- Do not invent output. Use given stdout/stderr.
- If success, mention thumbs-up style success and next useful step.
- If failure, explain the error shortly; repair gap endpoint handles the actual patch.
- Complexity: check recursion FIRST. Recursive call inside a loop → O(n!) or O(2^n) (backtracking), NOT O(n^2). Two recursive calls no memo → O(2^n). Memoised → unique states. Only then count loop nesting. If unknown, say Unknown.
- risk: if the stdout looks wrong for the given stdin (wrong count, wrong order, missing cases), state that suspicion here in one sentence.

Mode: {mode}
Success: {success}
Stdin:
{stdin}
Stdout:
{output}
Stderr/error:
{error}
Code:
{_prepare_code(code)}
""".strip()
    parsed = _json_llm(prompt, "run_explanation", timeout=60, model_mode=model_mode, max_tokens=400)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("run_explanation", {"status_text": "", "next_step": "", "risk": ""}, model_mode=model_mode)
    parsed.setdefault("status_text", "")
    parsed.setdefault("next_step", "")
    parsed.setdefault("risk", "")
    parsed.setdefault("time_complexity", "Unknown")
    parsed.setdefault("space_complexity", "Unknown")
    parsed.setdefault("complexity_reason", "")
    return parsed


def get_repair_fix(code: str, error: str, mode: str = "DSA", language: str = "cpp", model_mode: str = "main") -> Dict[str, Any]:
    schema = """{"line":1,"type":"syntax|runtime|logic","problem":"...","fix":"...","why":"short reason","confidence":0.9,"patch":{"operation":"replace|insert_before|insert_after|delete","start_line":1,"end_line":1,"replacement":"fixed code"}}""".strip()
    numbered_code = _prepare_code(code)
    prompt = f"""{BRO_STYLE}
Return ONLY JSON: {schema}

MANDATORY PROCEDURE — silently, BEFORE answering:
1. Read the error. Find the line it points at — that is the SYMPTOM.
2. Trace backwards: which earlier line produced the bad value/type/name that exploded here? That earlier line is the ROOT CAUSE. TypeError → fix the function def or the value's origin, not the call site. NameError → fix the missing declaration. IndexError → fix the bound/loop that built the bad index.
3. Check classic causes at that line: off-by-one bound, wrong operator, wrong init, swapped indices, wrong formula, missing base case, state not reset.
4. Write the smallest patch. Re-trace the failing input with the patch applied and confirm the error is gone AND the output is correct.

replacement = valid {language}, same indentation, smallest patch, no undefined names.

Code:
{numbered_code}

Compiler/runtime error:
{error}
""".strip()
    parsed = _json_llm(prompt, "repair_gap", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _repair_unavailable(error, model_mode=model_mode)
    parsed.setdefault("line", _extract_line(error))
    parsed.setdefault("type", "unknown")
    parsed.setdefault("problem", "Issue found")
    parsed.setdefault("fix", "")
    parsed.setdefault("why", "Bro, a patch is needed here.")
    parsed.setdefault("confidence", 0.5)
    if not isinstance(parsed.get("patch"), dict):
        parsed["patch"] = {
            "operation": "replace",
            "start_line": parsed.get("line", _extract_line(error)),
            "end_line": parsed.get("line", _extract_line(error)),
            "replacement": parsed.get("fix", ""),
        }
    else:
        parsed["patch"].setdefault("operation", "replace")
        parsed["patch"].setdefault("start_line", parsed.get("line", _extract_line(error)))
        parsed["patch"].setdefault("end_line", parsed["patch"].get("start_line", parsed.get("line", _extract_line(error))))
        parsed["patch"].setdefault("replacement", parsed.get("fix", ""))
    try:
        record_mistake(parsed.get("type", "issue"), parsed.get("problem", ""), f"line {parsed.get('line', 1)}", parsed.get("fix", ""), mode)
    except Exception:
        pass
    return parsed


def _extract_line_cards(reply: str, model_mode: str = "main") -> list:
    """AI-based: extract inline editor cards from a chat reply that references line numbers."""
    if not reply or not re.search(r'[Ll]ine[s]?\s+\d+', reply):
        return []
    prompt = f"""{BRO_STYLE}
The chat reply below contains references like "Line X..." or "Lines X-Y...".
Extract them and return ONLY a JSON array. If there are no line references, return [].

Reply:
{reply}

Output format (ONLY JSON array, nothing else):
[{{"line": <first line number>, "title": "<function name or 5-word summary>", "explanation": "<the full content said about that line>"}}]

Rules:
- line: "Line 5" → 5, "Line 5-15" → 5
- title: the backticked name if present, else the first 5 words of the explanation
- explanation: exactly the content following that line reference, up to the next one
- Skip it if the explanation is under 10 words""".strip()

    raw = _call_llamacpp(prompt, timeout=30, model_mode=model_mode, max_tokens=1024)
    if not raw:
        return []
    try:
        parsed = _extract_json(raw)
        if isinstance(parsed, list):
            return [c for c in parsed if isinstance(c, dict) and c.get('line') and c.get('explanation')]
    except Exception:
        pass
    return []


def chat(message: str, mode: str = "DSA", code: str = "", context: str = "", use_internet: bool = False, model_mode: str = "main", history: List[Dict[str, str]] = None) -> dict:
    internet_context = _web_context(message, use_internet, max_results=2) if use_internet else ""

    code_section = ""
    if code.strip():
        numbered = _prepare_code(code)
        code_section = f"\nCode (with line numbers):\n{numbered}"

    # Recent chat history — last 3 exchanges so model has conversational context
    history_section = ""
    if history:
        recent = history[-6:]  # last 3 user+bot pairs
        lines = []
        for m in recent:
            role = str(m.get('role', 'user'))
            text = str(m.get('content') or m.get('text', ''))
            lines.append(f"{'User' if role == 'user' else 'Bro'}: {text}")
        history_section = "\nRecent chat:\n" + '\n'.join(lines)

    prompt = f"""{BRO_STYLE}
Mode: {mode}{code_section}{history_section}

User: {message}
Reply in plain English text (NOT JSON). Reference line numbers when relevant. Keep it concise.""".strip()

    raw = _call_llamacpp(prompt, timeout=60, model_mode=model_mode, max_tokens=640)
    if not raw:
        return {"reply": _offline_payload("chat", model_mode=model_mode)["error"] + f" ({resolve_model(model_mode)})", "cards": []}
    cards = _extract_line_cards(raw, model_mode) if code.strip() else []
    return {"reply": raw, "cards": cards}


def _normalize_suggestions(value: Any) -> List[Dict[str, str]]:
    if isinstance(value, dict) and "suggestions" in value:
        value = value["suggestions"]
    if isinstance(value, dict):
        merged: List[Dict[str, str]] = []
        for cat in ["Speed", "Safety", "Balanced", "speed", "safety", "balanced"]:
            items = value.get(cat, [])
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict):
                        item = dict(item)
                        item.setdefault("category", cat.capitalize())
                        merged.append(item)
        value = merged
    if not isinstance(value, list):
        return []
    cleaned: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        category = str(item.get("category") or item.get("type") or "Balanced").capitalize()
        if category not in {"Speed", "Safety", "Balanced"}:
            category = "Balanced"
        cleaned.append(
            {
                "category": category,
                "title": str(item.get("title") or item.get("name") or "Improve this part")[:100],
                "detail": str(item.get("detail") or item.get("why") or item.get("description") or "")[:280],
                "apply": str(item.get("apply") or item.get("apply_hint") or item.get("fix") or "")[:500],
                "where": str(item.get("where") or "")[:140],
            }
        )
    result: List[Dict[str, str]] = []
    for category in ["Speed", "Safety", "Balanced"]:
        result.extend([x for x in cleaned if x["category"] == category][:2])
    # Do not fill missing slots with hardcoded tips. Missing means model did not supply enough.
    return result[:6]


def generate_suggestions(code: str, mode: str = "DSA", context: str = "", run_output: str = "", error: str = "", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    """Return a single best suggestion with annotated apply_code, or already_optimized=True."""
    internet_context = _web_context(context or mode, use_internet, max_results=3)
    numbered_code = _prepare_code(code)
    schema = """
{
  "already_optimized": false,
  "suggestion": {
    "title": "most impactful improvement title",
    "detail": "concise explanation of what and why",
    "apply": "brief plain-English instruction (1 sentence)",
    "apply_code": "EXACT Python snippet with correct indentation + # CHANGED: comment or updated docstring at the top, showing ONLY the lines that change",
    "where": "line N or function name"
  },
  "optimized_code": null
}
""".strip()
    optimized_schema = """
{
  "already_optimized": true,
  "suggestion": {
    "title": "Already Optimized!",
    "detail": "Brief reason why the code is already optimal",
    "apply": "",
    "apply_code": "",
    "where": ""
  },
  "optimized_code": "full clean optimized version of the code with a module-level docstring at the top explaining what was improved"
}
""".strip()
    prompt = f"""
{BRO_STYLE}

Task: Analyze the code and return ONE best suggestion as JSON.
- If code is already well-optimized, return already_optimized=true and fill optimized_code.
- Otherwise pick the single most impactful improvement.
- Return ONLY JSON. No markdown. No extra text.

Schema when improvement needed:
{schema}

Schema when already optimized:
{optimized_schema}

CRITICAL rules for apply_code:
1. apply_code must be syntactically valid Python — never description or pseudo-code.
2. apply_code contains ONLY the lines that change (not the whole file).
3. Count the leading spaces on those lines in the original code and match EXACTLY.
4. ALWAYS prepend a # CHANGED: comment (same indentation) explaining what changed and why:
     # CHANGED: Replaced O(n^2) nested loop with hashmap lookup → O(n)
     seen = {{}}
     for i, val in enumerate(nums):
         ...
5. If the change is inside a function body, also add/update that function's docstring:
     def two_sum(nums, target):
         \"\"\"
         CHANGED: Now uses hashmap for O(n) instead of O(n^2) nested loop.
         \"\"\"
         ...
6. If already_optimized, optimized_code is the FULL file with a module-level docstring at line 1.
7. where: give the EXACT line number of the root cause, not a symptom line.

Mode: {mode}
Run output: {run_output}
Error: {error}
Internet context: {internet_context}

Code with line numbers:
{numbered_code}
""".strip()
    parsed = _json_llm(prompt, "suggestions", timeout=60, model_mode=model_mode, max_tokens=512)
    if not isinstance(parsed, dict):
        return {"already_optimized": False, "suggestion": {"title": "Review your code", "detail": "LLM unavailable", "apply": "", "apply_code": "", "where": ""}, "optimized_code": None}
    already = bool(parsed.get("already_optimized", False))
    sug = parsed.get("suggestion") or {}
    if not isinstance(sug, dict):
        sug = {}
    return {
        "already_optimized": already,
        "suggestion": {
            "title": str(sug.get("title") or ("Already Optimized!" if already else "Improve this"))[:120],
            "detail": str(sug.get("detail") or "")[:400],
            "apply": str(sug.get("apply") or "")[:800],
            "apply_code": str(sug.get("apply_code") or ""),
            "where": str(sug.get("where") or "")[:120],
        },
        "optimized_code": parsed.get("optimized_code") or None,
    }


def explain_code(message: str, code: str, mode: str = "DSA", model_mode: str = "main") -> List[Dict[str, Any]]:
    """Return explanation cards, one per function/section, for inline display in the editor."""
    numbered = _prepare_code(code)
    prompt = f"""{BRO_STYLE}
Create one JSON object for EACH function in the code below.
Return ONLY a JSON array. No markdown. No extra text.

Each object:
  "line": <line number where the function starts>,
  "title": "<function name — short kaam>",
  "explanation": "<English, MAX 3 sentences: what it does, key params/return, complexity>"

Example:
[{{"line": 1, "title": "isSafe — bounds check", "explanation": "Bro, checks whether row and col are inside the matrix. Size comes from n = len(mat); both must be within 0..n-1. It is the base guard for the recursion."}},{{"line": 8, "title": "solve — recursive DFS", "explanation": "..."}}]

Code:
{numbered}""".strip()

    raw = _call_llamacpp(prompt, timeout=90, model_mode=model_mode, max_tokens=1024)
    if not raw:
        return [{"line": 1, "title": "Explanation", "explanation": "LLM unavailable — start llama-server.", "steps": [], "code_hint": ""}]

    # Extract JSON array from response
    try:
        parsed = _extract_json(raw)
    except Exception:
        # Try to salvage a partial array
        m = re.search(r'\[.*', raw, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0).rstrip(',} \n') + ']')
            except Exception:
                parsed = []
        else:
            parsed = []

    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        return [{"line": 1, "title": "Explanation", "explanation": raw[:1000], "steps": [], "code_hint": ""}]

    result = []
    seen_lines: set = set()
    for item in parsed:
        if not isinstance(item, dict):
            continue
        explanation = str(item.get("explanation") or "").strip()
        if not explanation:
            continue
        line = max(1, int(item.get("line") or 1))
        if line in seen_lines:
            line = max(seen_lines) + 1
        seen_lines.add(line)
        result.append({
            "line": line,
            "title": str(item.get("title") or "Explanation")[:80],
            "explanation": explanation,
            "steps": [],
            "code_hint": "",
        })
    return result if result else [{"line": 1, "title": "Explanation", "explanation": raw[:800], "steps": [], "code_hint": ""}]


def get_apply_guide(suggestion: Dict[str, Any], code: str = "", mode: str = "DSA", context: str = "", model_mode: str = "main") -> Dict[str, Any]:
    schema = """
{
  "line": 1,
  "type": "speed|safety|balanced|design|test",
  "problem": "what this suggestion fixes",
  "fix": "small patch/pseudocode/change steps",
  "why": "short reason",
  "confidence": 0.0,
  "patch": {
    "operation": "replace|insert_before|insert_after|delete",
    "start_line": 1,
    "end_line": 1,
    "replacement": "exact code/pseudocode to insert/replace"
  }
}
""".strip()
    prompt = f"""
{BRO_STYLE}

Task: Convert the selected suggestion into a repair-gap-style apply guide.
Return ONLY JSON:
{schema}

Rules:
- Use the current code/context, not generic advice.
- Prefer smallest patch or exact design insertion point.
- Include patch object when the change can be applied to code/pseudocode.
- If line is unknown, use the closest likely line and confidence below 0.5.

Mode: {mode}
Context: {context}
Selected suggestion:
{json.dumps(suggestion, ensure_ascii=False)}
Code/pseudocode:
{_prepare_code(code, numbered=False)}
""".strip()
    parsed = _json_llm(prompt, "apply_guide", timeout=60, model_mode=model_mode, max_tokens=512)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("apply_guide", {"line": 1, "type": "unavailable", "problem": "Apply guide unavailable", "fix": "", "why": "Connect the LLM to get an exact patch for the selected suggestion.", "confidence": 0.0}, model_mode=model_mode)
    parsed.setdefault("line", 1)
    parsed.setdefault("type", str(suggestion.get("category", "balanced")).lower())
    parsed.setdefault("problem", suggestion.get("title", "Selected suggestion"))
    parsed.setdefault("fix", suggestion.get("apply", ""))
    parsed.setdefault("why", suggestion.get("detail", ""))
    parsed.setdefault("confidence", 0.5)
    if not isinstance(parsed.get("patch"), dict):
        parsed["patch"] = {
            "operation": "replace",
            "start_line": parsed.get("line", 1),
            "end_line": parsed.get("line", 1),
            "replacement": parsed.get("fix", ""),
        }
    else:
        parsed["patch"].setdefault("operation", "replace")
        parsed["patch"].setdefault("start_line", parsed.get("line", 1))
        parsed["patch"].setdefault("end_line", parsed["patch"].get("start_line", parsed.get("line", 1)))
        parsed["patch"].setdefault("replacement", parsed.get("fix", ""))
    return parsed


def get_lld_question(difficulty: str = "Medium", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    internet_context = _web_context(f"{difficulty} LLD Low Level Design interview question", use_internet, max_results=4)
    schema = """
{
  "title": "Design a Parking Lot",
  "difficulty": "Medium",
  "problem": "full problem statement",
  "requirements": ["functional requirement 1", "functional requirement 2"],
  "constraints": ["constraint 1"],
  "entities_hint": ["Entity1", "Entity2"],
  "followups": ["follow-up question 1"]
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Generate one real Low Level Design (LLD) interview question.
Return ONLY JSON:
{schema}

Rules:
- Pick a fresh, real-world LLD topic (Parking Lot, Library System, ATM, Chess, Elevator, Movie Booking, Ride Sharing, etc.)
- Do not pick the same topic every time. Vary it.
- Problem statement must be detailed enough to design classes, interfaces, and patterns.
- entities_hint: top 3-5 key classes/interfaces to identify.
- followups: 2-3 design follow-up questions.
- If internet context has a real question, use it as the base.

Difficulty: {difficulty}
Internet context:
{internet_context}
""".strip()
    parsed = _json_llm(prompt, "lld_question", timeout=80, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("lld_question", {
            "title": "LLD Question Unavailable",
            "difficulty": difficulty,
            "problem": "Connect the LLM to generate the LLD question.",
            "requirements": [], "constraints": [], "entities_hint": [], "followups": [],
        }, model_mode=model_mode)
    parsed.setdefault("title", "LLD Question")
    parsed.setdefault("difficulty", difficulty)
    parsed.setdefault("problem", "")
    parsed.setdefault("requirements", [])
    parsed.setdefault("constraints", [])
    parsed.setdefault("entities_hint", [])
    parsed.setdefault("followups", [])
    return parsed


def generate_system_diagram(context: str, code: str = "", pseudocode: str = "", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    internet_context = _web_context(context or "LLD class diagram design patterns", use_internet, max_results=4)
    schema = """
{
  "diagram_style": "class|sequence|component|layered",
  "summary": "short description",
  "nodes": [
    {"id":"vehicle", "title":"Vehicle", "sub":"abstract class", "type":"class"}
  ],
  "edges": [
    {"from":"car", "to":"vehicle", "label":"extends"}
  ],
  "notes": ["design pattern or SOLID principle used"]
}
""".strip()
    prompt = f"""
{BRO_STYLE}

Task: Generate a Low Level Design (LLD) class diagram from the user's context + code + pseudocode.
Return ONLY JSON:
{schema}

Rules:
- Focus on classes, interfaces, abstract classes, enums — not microservices or infra.
- Node types: class, interface, abstract, enum, pattern
- Edge labels: extends, implements, has-a, uses, creates, observes
- Keep 4-9 nodes max.
- notes should mention which design patterns or SOLID principles apply.

User context:
{context}
Code:
{_prepare_code(code, numbered=False)}
Pseudocode:
{pseudocode}
Internet context:
{internet_context}
""".strip()
    parsed = _json_llm(prompt, "system_diagram", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("system_diagram", {"diagram_style": "unavailable", "summary": "Diagram LLM se generate hoga once model is running.", "nodes": [], "edges": [], "notes": []}, model_mode=model_mode)
    parsed.setdefault("diagram_style", "class")
    parsed.setdefault("summary", "")
    parsed.setdefault("nodes", [])
    parsed.setdefault("edges", [])
    parsed.setdefault("notes", [])
    if not isinstance(parsed["nodes"], list):
        parsed["nodes"] = []
    if not isinstance(parsed["edges"], list):
        parsed["edges"] = []
    return parsed


def validate_system_design(context: str, diagram_text: str, code: str, pseudocode: str, use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    internet_context = _web_context(context or "LLD SOLID design patterns best practices", use_internet, max_results=5)
    diagram = generate_system_diagram(context + "\n" + diagram_text, code, pseudocode, use_internet, model_mode=model_mode)
    schema = """
{
  "works": false,
  "diagram_style": "class/sequence/component/layered",
  "summary": "concise summary",
  "gaps": [
    {"type":"LLD Repair Gap", "problem":"...", "where":"...", "fix":"...", "why":"..."}
  ],
  "repair_gap": {"type":"LLD Repair Gap", "problem":"...", "fix":"...", "why":"..."},
  "suggestions": [
    {"category":"Speed", "title":"...", "detail":"...", "apply":"...", "where":"..."}
  ],
  "risk_radar": [
    {"area":"extensibility", "level":"high", "risk":"...", "fix":"..."}
  ]
}
""".strip()
    prompt = f"""
{BRO_STYLE}

Task: Validate a Low Level Design (LLD) from user context + class diagram + code + pseudocode.
Judge whether the design is solid, extensible, and follows good OOP/SOLID principles.
Return ONLY JSON:
{schema}

Rules:
- Check SOLID principles: SRP, OCP, LSP, ISP, DIP.
- Check for appropriate design patterns (Strategy, Observer, Factory, Singleton, etc.).
- Find missing classes, interfaces, or relationships.
- Check if code/pseudocode aligns with the class diagram.
- Suggestions: ideally 2 Speed + 2 Safety + 2 Balanced — LLD-relevant.
- risk_radar: focus on extensibility, tight-coupling, violation of OCP/DIP, missing abstraction, concurrency.

User context / LLD problem:
{context}
Current diagram text:
{diagram_text}
Generated class diagram JSON:
{json.dumps(diagram, ensure_ascii=False)}
Code already written:
{_prepare_code(code, numbered=False)}
Pseudocode / design notes:
{pseudocode}
Internet context:
{internet_context}
""".strip()
    parsed = _json_llm(prompt, "system_validation", timeout=100, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("system_validation", {"works": False, "diagram_style": diagram.get("diagram_style", "unavailable"), "summary": "LLM validation unavailable.", "gaps": [], "repair_gap": None, "suggestions": [], "diagram": diagram}, model_mode=model_mode)
    parsed.setdefault("works", False)
    parsed.setdefault("diagram_style", diagram.get("diagram_style", "component"))
    parsed.setdefault("summary", "")
    parsed.setdefault("gaps", [])
    if parsed.get("gaps") and not parsed.get("repair_gap"):
        parsed["repair_gap"] = parsed["gaps"][0]
    parsed.setdefault("repair_gap", None)
    parsed["suggestions"] = _normalize_suggestions(parsed.get("suggestions", []))
    if not isinstance(parsed.get("risk_radar"), list):
        radar = design_risk_radar(context, code, pseudocode, model_mode=model_mode)
        parsed["risk_radar"] = radar.get("risks", []) if isinstance(radar, dict) else []
    parsed["diagram"] = diagram
    return parsed


def generate_unit_tests(code: str, requirement: str, language: str = "cpp", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    internet_context = _web_context(requirement, use_internet, max_results=3)
    schema = """
{
  "message": "short message",
  "tests": [
    {"name":"...", "stdin":"...", "expected":"...", "why":"..."}
  ],
  "test_file": "optional full test file if useful"
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Generate dynamic unit tests or stdin tests from the user's actual code and requirement.
Return ONLY JSON:
{schema}

Rules:
- Use the user's code/requirement exactly.
- Do not hardcode Two Sum unless the code/requirement is actually Two Sum.
- For DSA C++ or Python, prefer stdin + expected output unless a framework is requested.
- If framework-style tests are requested, use the selected language.
- Include sample, edge, invalid/negative when relevant, and stress-style tests.

Language: {language}
Requirement: {requirement}
Internet context: {internet_context}
Code:
{_prepare_code(code, numbered=False)}
""".strip()
    parsed = _json_llm(prompt, "unit_tests", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("unit_tests", {"message": "Unit tests need LLM connection.", "tests": [], "test_file": ""}, model_mode=model_mode)
    parsed.setdefault("message", "Bro, tests are ready.")
    if not isinstance(parsed.get("tests"), list):
        parsed["tests"] = []
    parsed.setdefault("test_file", "")
    return parsed




def _quick_complexity_analysis(code: str) -> Dict[str, Any]:
    """Instant heuristic Big-O for the Build & Run panel.

    This avoids an LLM call on every run, making DSA Build & Run feel instant.
    Users can set COMPLEXITY_USE_LLM=true for deeper but slower analysis.
    """
    c = str(code or "")
    low = c.lower()

    # ── Data-structure hints ──────────────────────────────────────────────────
    has_sort    = any(x in low for x in ["sort(", ".sort(", "sorted("])
    has_map     = any(x in low for x in ["unordered_map", "unordered_set", "dict(", "{}", "set(", "map<", "set<"])
    has_vector  = any(x in low for x in ["vector<", "list(", "[]", "array", "new "])
    has_dp      = any(x in low for x in ["dp[", "memo[", "lru_cache", "cache", "@cache", "functools.lru", "memoize", "dp ="])
    has_bsearch = any(x in low for x in ["binary_search", "bisect", "mid =", "lo =", "hi =", "left =", "right ="])

    # ── Loop counts ───────────────────────────────────────────────────────────
    loop_count = (
        len(re.findall(r"\bfor\s*\(|\bwhile\s*\(", c)) +
        len(re.findall(r"^\s*for\s+.+\s+in\s+", c, flags=re.MULTILINE)) +
        len(re.findall(r"^\s*while\s+", c, flags=re.MULTILINE))
    )
    nested_hint = (
        bool(re.search(r"for\s*\([^\n]*\)\s*\{[^{}]*(for\s*\(|while\s*\()", c, flags=re.DOTALL)) or
        bool(re.search(r"^\s+for\s+.+\n\s{8,}for\s+", c, flags=re.MULTILINE)) or
        bool(re.search(r"^\s+while\s+.+\n\s{8,}for\s+", c, flags=re.MULTILINE))
    )

    # ── Recursion detection ────────────────────────────────────────────────────
    # Find all defined function names
    fn_names = re.findall(r"^\s*def\s+(\w+)\s*\(", c, flags=re.MULTILINE)
    if not fn_names:
        fn_names = re.findall(r"\b\w+\s+\w+\s*\([^)]*\)\s*\{", c)  # C++ style

    recursive_fns = []
    for fn in fn_names:
        # Find the function body (from its def line to the next top-level def or EOF)
        body_match = re.search(
            rf"(?m)^(\s*)def\s+{re.escape(fn)}\s*\(",
            c
        )
        if body_match:
            indent = body_match.group(1)
            body_start = body_match.start()
            # End of body = next def at same or lower indentation
            next_def = re.search(rf"(?m)^{re.escape(indent)}def\s+", c[body_match.end():])
            body_end = body_match.end() + next_def.start() if next_def else len(c)
            fn_body = c[body_start:body_end]
            # Count recursive calls within the body only (subtract 1 for the def line itself)
            call_count = max(0, len(re.findall(rf"\b{re.escape(fn)}\s*\(", fn_body)) - 1)
        else:
            call_count = max(0, len(re.findall(rf"\b{re.escape(fn)}\s*\(", c)) - 1)
        if call_count >= 1:
            recursive_fns.append((fn, call_count))

    is_recursive     = len(recursive_fns) > 0
    max_branch       = max((cnt for _, cnt in recursive_fns), default=0)
    is_multi_branch  = max_branch >= 2   # e.g. two recursive calls per frame
    has_loop_in_rec  = is_recursive and loop_count >= 1

    # Recursive call INSIDE a loop body = n-way branching per frame (backtracking:
    # N-Queens, permutations). Detect: a `for`/`while` line followed by a deeper-
    # indented line calling the recursive function.
    rec_call_in_loop = False
    for fn, _cnt in recursive_fns:
        if re.search(
            rf"(?m)^(\s*)(?:for|while)\b[^\n]*:\n(?:\1\s+[^\n]*\n)*?\1\s+[^\n]*\b{re.escape(fn)}\s*\(",
            c,
        ):
            rec_call_in_loop = True
            break

    # ── Classify time complexity ───────────────────────────────────────────────
    if has_sort:
        time = "O(n log n)"
        bottleneck = "sort"
        reason = "Bro, sorting dominates — O(n log n) guaranteed."

    elif is_recursive and has_dp:
        # Memoised recursion — depends on state dimensions
        if has_map or "dp[" in low:
            time = "O(n²)"
            space = "O(n²)"
        else:
            time = "O(n)"
            space = "O(n)"
        bottleneck = "memoised recursion"
        reason = "Bro, memoised recursion/DP — unique states x per-state work."

    elif is_recursive and rec_call_in_loop:
        # Recursive call inside a loop = up to n branches per level → factorial-ish
        # (N-Queens, permutations, combination search)
        time = "O(n!)"
        bottleneck = "backtracking (recursion in loop)"
        reason = "Bro, a recursive call inside a loop — n choices per level builds a factorial tree (backtracking pattern).",

    elif is_recursive and is_multi_branch:
        # Branching recursion without memoisation → exponential
        time = f"O({max_branch}^n)"
        bottleneck = "branching recursion (no memo)"
        reason = f"Bro, {max_branch} recursive calls per frame — exponential tree. Memoisation or DP would optimize it.",

    elif is_recursive and has_loop_in_rec:
        time = "O(n²)"
        bottleneck = "recursion + inner loop"
        reason = "Bro, loop inside recursion — likely O(n²) or worse."

    elif is_recursive and has_bsearch:
        time = "O(log n)"
        bottleneck = "binary-search recursion"
        reason = "Bro, each call halves the problem — O(log n)."

    elif is_recursive:
        time = "O(n)"
        bottleneck = "linear recursion"
        reason = "Bro, single recursive chain — O(n) depth."

    elif nested_hint or (loop_count >= 2 and not has_map):
        time = "O(n²)"
        bottleneck = "nested loop"
        reason = "Bro, nested loops — repeated O(n²) scans."

    elif loop_count >= 1 and has_bsearch:
        time = "O(log n)"
        bottleneck = "binary search"
        reason = "Bro, the search space halves every step."

    elif loop_count >= 1:
        time = "O(n)"
        bottleneck = "single pass"
        reason = "Bro, one linear scan — O(n)."

    else:
        time = "O(1)"
        bottleneck = "constant work"
        reason = "Bro, no loops or recursion — constant time."

    # ── Space complexity (set only if not already set by memo branch) ─────────
    if not is_recursive or not has_dp:
        if has_dp:
            space = "O(n²)"
        elif has_map or has_vector or is_recursive:
            space = "O(n)"
        else:
            space = "O(1)"

    return {
        "time_complexity": time,
        "space_complexity": space,
        "reason": reason,
        "bottleneck": bottleneck,
        "confidence": 0.78,
        "dynamic": True,
        "available": True,
        "analyzer": "instant-heuristic",
    }

def analyze_complexity(code: str, mode: str = "DSA", context: str = "", model_mode: str = "main") -> Dict[str, Any]:
    if not COMPLEXITY_USE_LLM:
        return _quick_complexity_analysis(code)

    schema = '{"time_complexity":"O(n)","space_complexity":"O(1)","reason":"1-2 sentence explanation","bottleneck":"what dominates"}'
    prompt = f"""{BRO_STYLE}
Output ONLY valid JSON, nothing else.

JSON schema (fill in real values):
{schema}

MANDATORY PROCEDURE — do these checks silently BEFORE answering:
1. RECURSION: find every function that calls itself.
   - Recursive call INSIDE a for/while loop over ~n choices → branching factor n → O(n!) (permutations/N-Queens backtracking) or O(2^n * n) (subsets).
   - Two+ recursive calls per frame, no memo → O(2^n).
   - Memoised recursion / DP → count UNIQUE STATES x work per state.
   - Single recursive chain → O(depth).
2. LOOPS: count actual nesting depth over the SAME input size. Two sequential loops = O(n), not O(n^2).
3. SORT / heap / binary search present? They dominate small loops.
4. SPACE: recursion depth + allocated structures (visited sets, DP tables, result lists count).
5. SELF-CHECK: does your answer match the dominant structure you found in step 1-3? If code has recursion in a loop, the answer is NEVER O(n^2).

Rules:
- Standard Big-O only: O(1), O(log n), O(n), O(n log n), O(n^2), O(2^n), O(n!) etc.
- reason: 1-2 sentences naming the structure you found. Example: "Bro, recursive call inside a loop — n choices per level, factorial tree."
- bottleneck: single English phrase like "backtracking recursion", "nested loop", "sort", "DP table".

Code to analyse:
{_prepare_code(code, numbered=False)}
""".strip()
    parsed = _json_llm(prompt, "complexity_analysis", timeout=60, model_mode=model_mode, max_tokens=320)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        # fallback to heuristic so the panel always shows something
        return _quick_complexity_analysis(code)
    parsed.setdefault("time_complexity", "Unknown")
    parsed.setdefault("space_complexity", "Unknown")
    parsed.setdefault("reason", "")
    parsed.setdefault("bottleneck", "")
    parsed["analyzer"] = "llm"
    return parsed


def generate_stress_tests(code: str, context: str = "", count: int = 6, model_mode: str = "main") -> Dict[str, Any]:
    schema = """
{
  "message": "short message",
  "tests": [
    {"name":"...", "stdin":"...", "expected":"optional expected output", "why":"..."}
  ]
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Generate stress/edge stdin tests for current DSA code.
Return ONLY JSON:
{schema}

Rules:
- Generate {max(1, min(int(count or 6), 12))} tests.
- Prefer small brute-checkable edge cases and a few larger stress-style inputs.
- Do not assume Two Sum unless code/context says so.
- expected may be blank if exact output cannot be inferred.

Context/problem:
{context}
Code:
{_prepare_code(code, numbered=False)}
""".strip()
    parsed = _json_llm(prompt, "stress_tests", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("stress_tests", {"message": "Stress tests need LLM connection.", "tests": []}, model_mode=model_mode)
    tests = parsed.get("tests")
    if not isinstance(tests, list):
        tests = []
    parsed["tests"] = tests[:max(1, min(int(count or 6), 12))]
    parsed.setdefault("message", "Bro, stress tests are ready.")
    return parsed


def design_risk_radar(context: str, code: str = "", pseudocode: str = "", model_mode: str = "main") -> Dict[str, Any]:
    schema = """
{
  "risks": [
    {"area":"scaling|safety|consistency|security|observability|cost", "level":"low|medium|high", "risk":"...", "fix":"..."}
  ]
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Produce Design Risk Radar for system design mode.
Return ONLY JSON:
{schema}

Rules:
- Focus on missing scaling, failure, security, consistency and monitoring paths.
- Keep 3-6 risks max.
- Use actual context/code/pseudocode.

Context:
{context}
Code:
{_prepare_code(code, numbered=False)}
Pseudocode:
{pseudocode}
""".strip()
    parsed = _json_llm(prompt, "design_risk_radar", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("design_risk_radar", {"risks": []}, model_mode=model_mode)
    if not isinstance(parsed.get("risks"), list):
        parsed["risks"] = []
    return parsed


def get_quick_prompts(mode: str = "DSA", code: str = "", context: str = "", model_mode: str = "main") -> Dict[str, Any]:
    schema = """
{
  "prompts": ["short command 1", "short command 2", "short command 3", "short command 4"]
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Generate 4 useful quick prompt chips for the current I&AI Code sidebar.
Return ONLY JSON:
{schema}

Rules:
- Make prompts specific to the current mode/code/context.
- Keep each under 45 characters.
- Plain, concise English.
- Do not use the same static list every time.

Mode: {mode}
Context: {context}
Code/pseudocode:
{_prepare_code(code, numbered=False)}
""".strip()
    parsed = _json_llm(prompt, "quick_prompts", timeout=20, model_mode=model_mode, max_tokens=256)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("quick_prompts", {"prompts": []}, model_mode=model_mode)
    prompts = parsed.get("prompts")
    if not isinstance(prompts, list):
        prompts = []
    parsed["prompts"] = [str(x)[:60] for x in prompts if str(x).strip()][:4]
    return parsed


def _deterministic_root_cause(code: str, error: str) -> int:
    """
    Parse the error message and scan the code to find the true root-cause line
    without relying on the LLM. Returns 1-indexed line number, or 0 if unknown.
    """
    lines = code.split('\n')

    # TypeError: funcname() takes N positional arguments but M were given
    m = re.search(r'(\w+)\(\) takes \d+ positional argument', error)
    if m:
        fname = m.group(1)
        for i, ln in enumerate(lines):
            if re.match(rf'^\s*def\s+{re.escape(fname)}\s*\(', ln):
                return i + 1  # found the def — this is the root cause

    # NameError: name 'X' is not defined  → find the def whose body uses X
    m = re.search(r"name '(\w+)' is not defined", error)
    if m:
        varname = m.group(1)
        for i, ln in enumerate(lines):
            if re.match(r'^\s*def\s+\w+\s*\(', ln) and varname not in ln:
                body = '\n'.join(lines[i: i + 30])
                if re.search(rf'\b{re.escape(varname)}\b', body):
                    return i + 1

    # AttributeError: 'X' object has no attribute 'Y'  → find first usage
    m = re.search(r"AttributeError.*'(\w+)'", error)
    if m:
        hint = _extract_line(error)
        if hint > 0:
            return hint

    return 0   # unknown — let LLM decide


def _detect_backtrack_asymmetry(code: str) -> Optional[Dict[str, Any]]:
    """Deterministic scan for backtracking bugs: every set.add / list.append that
    feeds a recursive search must have a matching discard/remove/pop on the
    unwind path. An add without an undo silently corrupts the search state —
    a deep logic bug LLMs routinely misplace. Returns a ready-made analysis
    card dict, or None if the pattern doesn't apply."""
    lines = code.split('\n')

    # Only meaningful when the code already shows an undo pattern (backtracking),
    # otherwise plain accumulator code would false-positive.
    pop_re = re.compile(r'(\w+)\.pop\(')

    adds, undos, pops, appends = [], {}, {}, []
    for i, ln in enumerate(lines, 1):
        for m in re.finditer(r'(\w+)\.(add)\(\s*([^()]*(?:\([^()]*\))?[^()]*)\s*\)', ln):
            adds.append((m.group(1), re.sub(r'\s+', '', m.group(3)), i))
        for m in re.finditer(r'(\w+)\.(append)\(', ln):
            appends.append((m.group(1), i))
        for m in re.finditer(r'(\w+)\.(discard|remove)\(\s*([^()]*(?:\([^()]*\))?[^()]*)\s*\)', ln):
            undos[(m.group(1), re.sub(r'\s+', '', m.group(3)))] = i
        for m in pop_re.finditer(ln):
            pops[m.group(1)] = i

    if not undos and not pops:
        return None   # no unwind pattern → not backtracking code

    # set.add without matching discard/remove of the same receiver+argument
    for recv, arg, add_line in adds:
        if (recv, arg) not in undos:
            # anchor the fix next to the sibling undos (last undo line), else the add line
            anchor = max(undos.values()) if undos else add_line
            anchor_indent = re.match(r'^(\s*)', lines[anchor - 1]).group(1)
            missing = f"{recv}.discard({arg})"
            return {
                "issue_type": "ERROR",
                "line": add_line,
                "explanation": f"Bro, backtracking bug — line {add_line} does `{recv}.add({arg})` but never "
                    f"undoes it after the recursive call. Add `{missing}` next to line {anchor}, "
                    f"otherwise that state stays permanently blocked.",
                "deterministic_patch": {
                    "start_line": anchor + 1,
                    "end_line": anchor + 1,
                    "action": "INSERT",
                    "code_snippet": anchor_indent + missing,
                },
                "available": True,
                "analyzer": "deterministic-backtrack-scan",
            }

    # list.append without any pop on the same receiver
    for recv, add_line in appends:
        if recv not in pops and (undos or pops):
            anchor = max(list(pops.values()) + list(undos.values()))
            anchor_indent = re.match(r'^(\s*)', lines[anchor - 1]).group(1)
            return {
                "issue_type": "ERROR",
                "line": add_line,
                "explanation": f"Bro, backtracking bug — line {add_line} does `{recv}.append(...)` but "
                    f"`{recv}.pop()` is missing after the recursive call — state keeps growing.",
                "deterministic_patch": {
                    "start_line": anchor + 1,
                    "end_line": anchor + 1,
                    "action": "INSERT",
                    "code_snippet": anchor_indent + f"{recv}.pop()",
                },
                "available": True,
                "analyzer": "deterministic-backtrack-scan",
            }

    return None


def analyze_code_judge(code: str, error: str, output: str, mode: str = "DSA", language: str = "python", model_mode: str = "main", user_question: str = "") -> Dict[str, Any]:
    """Algorithmic Judge — returns a structured analysis card for the editor."""
    numbered_code = _prepare_code(code)

    # Deterministic pre-scan 1: backtracking add/undo asymmetry (wrong-answer bugs).
    # This class is exactly where small LLMs misfire, so Python decides, not the model.
    wrong_answer = "wrong answer" in (error + user_question).lower() or not error.strip()
    if wrong_answer:
        asym = _detect_backtrack_asymmetry(code)
        if asym:
            return asym

    # Deterministic pre-scan 2: find root cause line before the LLM sees anything
    precomputed_line = _deterministic_root_cause(code, error) if error.strip() else 0

    # Build context sections only for what's present
    error_section = f"\nExecution error:\n{error[:3000]}" if error.strip() else ""
    output_section = f"\nExecution output:\n{output[:1500]}" if output.strip() else ""
    question_section = f"\nUser question: {user_question}" if user_question.strip() else ""

    # If deterministic scan found the root cause line, tell the LLM exactly where it is
    line_hint = f"\nPRE-ANALYZED ROOT CAUSE: line {precomputed_line} (the `def` with the bug). Set \"line\": {precomputed_line}." if precomputed_line > 0 else ""

    prompt = f"""{BRO_STYLE}
Analyze and return ONLY JSON: {{"issue_type":"ERROR","explanation":"...","line":N}}

MANDATORY PROCEDURE — do these steps silently BEFORE answering:
1. TRACE: pick the smallest failing input (from stdin/error/output). Walk the code line by line with real values.
2. DIVERGE: find the FIRST line where a variable's actual value differs from what a correct solution needs. That line is the root cause — not where the crash appears.
3. Bug classes to check at each suspicious line: off-by-one bound, wrong operator (+/-, min/max, </>) , wrong init value, swapped indices/arguments, wrong formula, state NOT undone after a recursive call (backtracking must remove/pop EVERYTHING it added), mutation while iterating, integer division, missing base case, early return.
4. SYMMETRY CHECK for backtracking code: every `add`/`append` before the recursive call MUST have a matching `discard`/`remove`/`pop` after it. List each add and its undo — any add without an undo is the bug.
5. VERIFY: re-run your trace WITH your fix — confirm expected output. If not, repeat step 2.

STRICT OUTPUT RULES:
- issue_type: ERROR (runtime/logic bug) | TLE (timeout) | OPTIMIZATION (suggest improvement) | QUESTION (no bug, just explanation)
- line: the SINGLE line number of the root cause. Must match real code.
- explanation: 1-2 sentences English, format: "Bro, line <N> has a bug in `<exact code copied from that line>` — <what is wrong> — needs <corrected code>."
- The quoted code MUST be copied from the numbered code below, NOT from these instructions.
- Say ONLY what your trace proves. Do NOT invent problems the error/output doesn't show.
- If there is NO bug and user just asked a question → issue_type QUESTION, line=1.
{line_hint}

Code:
{numbered_code}
{error_section}{output_section}{question_section}""".strip()
    parsed = _json_llm(prompt, "analyze_judge", timeout=90, model_mode=model_mode, max_tokens=512)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("analyze_judge", {"thought_process": "", "issue_type": "ERROR", "explanation": "LLM unavailable — start llama-server.", "line": _extract_line(error)}, model_mode=model_mode)
    issue = str(parsed.get("issue_type", "ERROR")).upper()
    if issue not in {"ERROR", "TLE", "OPTIMIZATION", "QUESTION"}:
        issue = "ERROR"
    parsed["issue_type"] = issue
    parsed.setdefault("thought_process", "")   # kept for compatibility
    parsed.setdefault("explanation", "Issue detected in code.")
    try:
        llm_line = int(parsed.get("line") or _extract_line(error))
    except Exception:
        llm_line = _extract_line(error)
    # Deterministic scan wins over LLM guess when available
    parsed["line"] = precomputed_line if precomputed_line > 0 else llm_line
    return parsed


def _parse_all_functions(all_lines: list) -> dict:
    """Parse every top-level/nested function in the code.
    Returns {name: {"start": int, "end": int, "body": str}} (0-indexed start/end).
    """
    fns = {}
    starts = []
    for i, line in enumerate(all_lines):
        m = re.match(r'^(\s*)def\s+(\w+)\s*\(', line)
        if m:
            starts.append((i, m.group(2), len(m.group(1))))

    for idx, (start, name, indent_len) in enumerate(starts):
        # End = next def at same or lower indent level, or EOF
        end = len(all_lines)
        for j in range(idx + 1, len(starts)):
            next_start, _, next_indent = starts[j]
            if next_indent <= indent_len:
                end = next_start
                break
        body = '\n'.join(all_lines[start:end]).rstrip()
        fns[name] = {"start": start, "end": end, "body": body}
    return fns


def _calls_in_body(body: str, all_fn_names: set) -> set:
    """Return set of function names from all_fn_names that are called inside body."""
    called = set()
    for name in all_fn_names:
        if re.search(rf'\b{re.escape(name)}\s*\(', body):
            called.add(name)
    return called


def _extract_relevant_functions(code: str, issue_line: int) -> tuple[str, int, str]:
    """Return (numbered context, insert_point, body_indent) containing:
    - The function that contains issue_line
    - All user-defined functions it calls (transitive, up to depth 3)
    Numbered with original line numbers.
    """
    all_lines = code.split('\n')
    fns = _parse_all_functions(all_lines)
    all_names = set(fns.keys())

    # Find the function that contains issue_line (1-indexed)
    root_fn = None
    for name, info in fns.items():
        if info["start"] < issue_line <= info["end"]:
            root_fn = name
            break
    if root_fn is None and fns:
        # fallback: nearest function before issue_line
        candidates = [(info["start"], name) for name, info in fns.items() if info["start"] < issue_line]
        if candidates:
            root_fn = max(candidates)[1]

    # BFS to collect dependent functions (transitive callees, depth 3)
    seen = set()
    queue = [root_fn] if root_fn else []
    for _ in range(3):
        next_queue = []
        for fn_name in queue:
            if fn_name not in fns or fn_name in seen:
                continue
            seen.add(fn_name)
            callees = _calls_in_body(fns[fn_name]["body"], all_names - {fn_name})
            next_queue.extend(callees - seen)
        queue = next_queue

    relevant = list(seen)
    if not relevant:
        # No functions found at all — fall back to ±20 line window
        win_s = max(0, issue_line - 20)
        win_e = min(len(all_lines), issue_line + 20)
        numbered = '\n'.join(f'{win_s + i + 1}: {l}' for i, l in enumerate(all_lines[win_s:win_e]))
        return numbered, issue_line, '    '

    # Sort by source order for readability
    relevant.sort(key=lambda n: fns[n]["start"])

    # Build numbered output preserving original line numbers
    included_lines: set[int] = set()
    for name in relevant:
        info = fns[name]
        for i in range(info["start"], info["end"]):
            included_lines.add(i)

    segments = []
    in_block = False
    block_start = 0
    sorted_lines = sorted(included_lines)
    for i, ln in enumerate(sorted_lines):
        if i == 0 or ln != sorted_lines[i-1] + 1:
            if in_block:
                segments.append((block_start, sorted_lines[i-1]))
            block_start = ln
            in_block = True
    if in_block and sorted_lines:
        segments.append((block_start, sorted_lines[-1]))

    parts = []
    for seg_start, seg_end in segments:
        for li in range(seg_start, seg_end + 1):
            parts.append(f'{li + 1}: {all_lines[li]}')

    # Body indent from root function
    body_indent = '    '
    insert_point = issue_line
    if root_fn and root_fn in fns:
        fn_info = fns[root_fn]
        def_line = all_lines[fn_info["start"]]
        def_indent = re.match(r'^(\s*)', def_line).group(1)
        body_indent = def_indent + '    '
        # Insert point: first non-blank, non-comment, non-def line inside the function
        for li in range(fn_info["start"] + 1, fn_info["end"]):
            stripped = all_lines[li].strip()
            if stripped and not stripped.startswith('#'):
                insert_point = li + 1  # 1-indexed
                break

    return '\n'.join(parts), insert_point, body_indent


def _apply_patch_to_code(code: str, patch: Dict[str, Any]) -> str:
    """Apply a patch dict to code and return the resulting source (mirrors frontend logic)."""
    lines = code.split('\n')
    action = str(patch.get("action", "REPLACE")).upper()
    start = max(0, min(len(lines) - 1, int(patch.get("start_line", 1)) - 1))
    end = max(start, min(len(lines) - 1, int(patch.get("end_line", patch.get("start_line", 1))) - 1))
    snippet_lines = str(patch.get("code_snippet", "")).split('\n')
    if action == "INSERT":
        return '\n'.join(lines[:start] + snippet_lines + lines[start:])
    if action == "DELETE":
        return '\n'.join(lines[:start] + lines[end + 1:])
    return '\n'.join(lines[:start] + snippet_lines + lines[end + 1:])


def _validate_python_patch(original_code: str, patched_code: str, issue_line: int) -> Optional[str]:
    """Validate a Python patch. Returns None if OK, else an error string.
    Rejects: syntax errors, undefined names newly introduced, new self-recursion
    inside a function that was previously non-recursive."""
    import ast

    try:
        orig_tree = ast.parse(original_code)
    except SyntaxError:
        orig_tree = None
    try:
        new_tree = ast.parse(patched_code)
    except SyntaxError as e:
        return f"patch produces syntax error: {e.msg} at line {e.lineno}"

    # Collect names defined at module scope in the original (functions, classes, top-level assignments, imports)
    defined_names = set(dir(__builtins__)) if hasattr(__builtins__, '__dict__') else set()
    defined_names |= {
        'print', 'input', 'range', 'len', 'int', 'str', 'float', 'bool', 'list', 'dict',
        'set', 'tuple', 'sum', 'min', 'max', 'abs', 'sorted', 'reversed', 'enumerate',
        'zip', 'map', 'filter', 'any', 'all', 'open', 'iter', 'next', 'type', 'isinstance',
        'True', 'False', 'None', '__name__', '__main__', 'sys', 'os', 're', 'math',
        'collections', 'heapq', 'bisect', 'itertools', 'functools',
    }
    for node in ast.walk(new_tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            defined_names.add(node.name)
        elif isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name):
                    defined_names.add(tgt.id)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                defined_names.add(alias.asname or alias.name.split('.')[0])

    # Find all Name references not accounted for by locals — flag "call-like" names that look like typos of a defined name
    def _fn_signature(tree):
        """Return dict fn_name → (was_recursive, body_calls)."""
        info = {}
        if tree is None:
            return info
        for fn in ast.walk(tree):
            if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                calls = set()
                for c in ast.walk(fn):
                    if isinstance(c, ast.Call) and isinstance(c.func, ast.Name):
                        calls.add(c.func.id)
                info[fn.name] = (fn.name in calls, calls)
        return info

    orig_fns = _fn_signature(orig_tree)
    new_fns = _fn_signature(new_tree)
    for fn_name, (was_rec, _orig_calls) in orig_fns.items():
        if fn_name in new_fns:
            is_rec_now, _ = new_fns[fn_name]
            if is_rec_now and not was_rec:
                return f"patch introduces self-recursion into non-recursive function {fn_name!r}"

    # Undefined-name check: every call target must resolve to a defined name (or a common builtin/import)
    for fn in ast.walk(new_tree):
        if isinstance(fn, ast.Call) and isinstance(fn.func, ast.Name):
            if fn.func.id not in defined_names:
                # Fuzzy: is it a 1-edit typo of a defined name? (e.g. mai() → main())
                candidates = [n for n in defined_names if isinstance(n, str) and abs(len(n) - len(fn.func.id)) <= 1 and n[:1] == fn.func.id[:1]]
                if candidates:
                    return f"patch calls undefined {fn.func.id!r} — did you mean {candidates[0]!r}?"
                return f"patch calls undefined name {fn.func.id!r}"

    return None


def generate_omni_patch(code: str, analysis: Dict[str, Any], language: str = "python", model_mode: str = "main") -> Dict[str, Any]:
    """Omni-Edit & Patch — two-path: INSERT for missing logic, REPLACE for buggy lines."""
    # If the analysis came from a deterministic scanner, its patch is exact — no LLM needed.
    det = analysis.get("deterministic_patch")
    if isinstance(det, dict) and det.get("code_snippet"):
        return {**det, "available": True}

    all_lines = code.split('\n')
    issue_line = int(analysis.get("line") or 1)
    issue_type = str(analysis.get("issue_type", "ERROR"))
    explanation = str(analysis.get("explanation", ""))

    buggy_line_text = all_lines[issue_line - 1] if 0 < issue_line <= len(all_lines) else ""

    # ── Classify: missing logic vs bad line ───────────────────────────────────
    exp_lower = explanation.lower()
    missing_signals = [
        "missing", "not present", "not written", "should add", "needs to add",
        "return missing", "no base", "no return",
        "check missing", "condition missing", "not handled", "needs ",
    ]
    # "base case" only triggers INSERT if it's truly missing, not if the value is wrong
    replace_signals = [
        "wrong", "incorrect", "change", "replace", "update",
        "set to", "should be 0",
        "should be", "instead of",
    ]
    has_replace_hint = any(kw in exp_lower for kw in replace_signals)
    is_missing = any(kw in exp_lower for kw in missing_signals) and not has_replace_hint
    if "base case" in exp_lower and not ("base case missing" in exp_lower or "no base case" in exp_lower):
        is_missing = False

    # Extract buggy function + all functions it calls (transitive, depth 3)
    relevant_code, insert_point, body_indent = _extract_relevant_functions(code, issue_line)

    if is_missing:
        # ── PATH A: INSERT missing code ───────────────────────────────────────
        step1_prompt = f"""Something is MISSING in this code. Write ONLY the {language} lines that must be ADDED.

Problem: {explanation}

{relevant_code}

HARD CONSTRAINTS — if you break any, your answer is WRONG:
1. Every function/variable name you use MUST already exist in the code above — no typos, no new names.
2. If the buggy line is inside function F, do NOT call F() from inside its own body unless F was already recursive.
3. Do NOT insert a call to `main()` unless the surrounding code already calls it that way.
4. Do NOT duplicate any line that already exists in the code above.
5. Your inserted lines must fix the *specific* bug — no scaffolding, no placeholder statements.

BEFORE writing, silently verify:
- Which exact line(s) are missing? (base case / bounds check / state undo / return)
- Mentally insert your lines and re-trace the failing case — confirm correct output.
- Re-read your lines — is every identifier one that already exists?

Rules: No explanation, no markdown. Output ONLY the missing lines. Indent with {repr(body_indent)}.""".strip()

        raw = _call_llamacpp(step1_prompt, timeout=90, model_mode=model_mode, max_tokens=512)
        if not raw:
            return _offline_payload("omni_patch", {"start_line": issue_line, "end_line": issue_line, "action": "INSERT", "code_snippet": ""}, model_mode=model_mode)

        # Strip markdown fences if model added them
        raw = re.sub(r'```[a-z]*\n?', '', raw.strip())
        raw = re.sub(r'\n?```', '', raw.strip()).strip()

        # Normalize indentation: every non-blank line → body_indent + relative indent
        fixed = []
        min_indent = None
        for ln in raw.split('\n'):
            if ln.strip():
                curr = len(ln) - len(ln.lstrip())
                min_indent = curr if min_indent is None else min(min_indent, curr)
        for ln in raw.split('\n'):
            if not ln.strip():
                fixed.append('')
            else:
                relative = ln[min_indent:] if min_indent else ln.lstrip()
                fixed.append(body_indent + relative)
        missing_code = '\n'.join(fixed).strip()

        candidate = {
            "start_line": insert_point,
            "end_line": insert_point,
            "action": "INSERT",
            "code_snippet": missing_code,
            "available": True,
        }
        if language == "python":
            try:
                patched = _apply_patch_to_code(code, candidate)
                err = _validate_python_patch(code, patched, issue_line)
                if err:
                    return _offline_payload(
                        "omni_patch",
                        {"start_line": issue_line, "end_line": issue_line, "action": "INSERT", "code_snippet": "", "rejection_reason": err},
                        model_mode=model_mode,
                    )
            except Exception:
                pass
        return candidate

    else:
        # ── PATH B: REPLACE the buggy line(s) ────────────────────────────────
        prompt = f"""Fix the bug. Return ONLY JSON.

Buggy line {issue_line}: {buggy_line_text}
Bug: {explanation}

MANDATORY — verify silently BEFORE answering:
1. Identify the exact wrong expression on the buggy line (operator, bound, index, init value, formula).
2. Write the corrected line(s). Change ONLY what the bug requires — keep variable names, structure, and indentation identical.
3. Re-trace the failing case with your fix applied — confirm the expected output now comes out. If not, your fix is wrong; find the real change.
4. HARD CONSTRAINTS:
   - Every function/variable name in your snippet MUST already exist in the code (no typos: not `mai()` for `main()`, not `retrun` for `return`).
   - Do NOT introduce a call from a function to itself unless it was already recursive.
   - Do NOT break other callers or shadow existing names.

Return: {{"start_line": {issue_line}, "end_line": <last original line replaced>, "action": "REPLACE", "code_snippet": "<corrected code>"}}

Rules:
- code_snippet: corrected code with proper indentation. Can be multiline — use real newlines if fix needs multiple lines.
- start_line: always {issue_line}
- end_line: last original line your fix replaces (usually {issue_line}; increase only if you're replacing multiple consecutive original lines)
- Raw {language} only. No markdown, no explanation comments, no placeholders like "...".

Context:
{relevant_code}""".strip()

        parsed = _json_llm(prompt, "omni_patch", timeout=90, model_mode=model_mode, max_tokens=768)
        if not isinstance(parsed, dict) or not parsed.get("available", True):
            return _offline_payload("omni_patch", {"start_line": issue_line, "end_line": issue_line, "action": "REPLACE", "code_snippet": ""}, model_mode=model_mode)
        try:
            parsed["start_line"] = int(parsed.get("start_line", issue_line))
            parsed["end_line"] = int(parsed.get("end_line", parsed["start_line"]))
        except Exception:
            parsed["start_line"] = issue_line
            parsed["end_line"] = issue_line
        action = str(parsed.get("action", "REPLACE")).upper()
        if action not in {"REPLACE", "INSERT", "DELETE"}:
            action = "REPLACE"
        parsed["action"] = action
        parsed.setdefault("code_snippet", "")
        # Unescape JSON-escaped newlines that 3B models emit
        snippet = parsed["code_snippet"]
        if isinstance(snippet, str):
            snippet = snippet.replace("\\n", "\n").replace("\\t", "\t").replace('\\"', '"')
            snippet = snippet.strip('"').strip("'")
            parsed["code_snippet"] = snippet

        if action == "REPLACE":
            lines = parsed["code_snippet"].split('\n')
            # Keep all non-empty lines — don't truncate multiline fixes
            body = [l for l in lines if l.strip()]
            if not body:
                body = [buggy_line_text]
            parsed["code_snippet"] = '\n'.join(body)
            # end_line must cover at least start_line
            if parsed["end_line"] < parsed["start_line"]:
                parsed["end_line"] = parsed["start_line"]

        # ── Safety net: validate the patch actually produces valid Python ────
        if language == "python":
            try:
                patched = _apply_patch_to_code(code, parsed)
                err = _validate_python_patch(code, patched, issue_line)
                if err:
                    return _offline_payload(
                        "omni_patch",
                        {"start_line": issue_line, "end_line": issue_line, "action": "REPLACE", "code_snippet": "", "rejection_reason": err},
                        model_mode=model_mode,
                    )
            except Exception:
                pass  # validator crashed → fall through, return patch as-is
        return parsed


def compact_chat_context(messages: List[Dict[str, str]], model_mode: str = "main") -> str:
    """Context Reducer — compresses long chat history into a dense technical summary."""
    history_text = '\n'.join(
        f"{str(m.get('role', 'user')).upper()}: {str(m.get('content') or m.get('text', ''))}"
        for m in messages if isinstance(m, dict)
    )
    prompt = f"""{BRO_STYLE}
Compress the conversation history into a dense technical summary.
INSTRUCTIONS:
1. Identify the core problem constraints (e.g., N <= 10^5, Time Limit: 2.0s).
2. Summarize the approaches that failed (e.g., "O(N^2) DP got TLE").
3. Define the current focal point (e.g., "User is implementing bottom-up DP, test case 4 is failing").
4. Output ONLY the raw summary. No filler.

Conversation history:
{history_text}""".strip()
    raw = _call_llamacpp(prompt, timeout=25, model_mode=model_mode, max_tokens=512)
    return (raw or "Context compacted: debugging session in progress.").strip()


def phrase_user_prompt(raw_message: str, execution_logs: str = "", model_mode: str = "main") -> str:
    """Prompt Phraser — restructures informal user input into a structured directive."""
    prompt = f"""{BRO_STYLE}
Rewrite the user's informal message and execution logs into a structured directive for an algorithmic judge.
INSTRUCTIONS:
1. Read the raw message and logs.
2. Understand the intent: wants an explanation, a failing test case, or an optimization.
3. Write one clear directive — concise and technical.
4. Output ONLY the rewritten directive.

Raw user message: {raw_message}
Execution logs: {execution_logs[:2000]}""".strip()
    raw = _call_llamacpp(prompt, timeout=15, model_mode=model_mode, max_tokens=256)
    return (raw or raw_message).strip()


def start_interview_array(difficulty: str = "Medium", topic: str = "arrays", use_internet: bool = False, model_mode: str = "main") -> Dict[str, Any]:
    is_lld = topic.lower() in {"lld", "low level design", "ood", "object oriented design"}
    search_query = (
        f"{difficulty} LLD object oriented design interview question" if is_lld
        else f"{difficulty} {topic} coding interview problem leetcode"
    )
    internet_context = _web_context(search_query, use_internet, max_results=4)
    if is_lld:
        schema = """
{
  "question_id":"short-id",
  "title":"Design a Parking Lot",
  "difficulty":"Easy|Medium|Hard",
  "question":"full LLD problem statement",
  "constraints":["..."],
  "examples":[{"input":"scenario", "output":"expected class/behavior", "explanation":"..."}],
  "followups":["follow-up design question"],
  "starter_code":"// C++ skeleton with key classes\nclass Vehicle {};\nint main() { return 0; }",
  "duration_minutes": 45
}
""".strip()
        task_hint = "Low Level Design (LLD) / OOD interview question. Focus on classes, interfaces, design patterns."
        rules = """- LLD/OOD question: ask candidate to design classes, interfaces, relationships.
- Include 2-3 meaningful follow-up design questions.
- starter_code: C++ skeleton with 2-3 key class stubs, no implementation.
- Do not repeat Parking Lot every time. Vary: Library, ATM, Chess, Elevator, Movie Booking, etc.
- If internet context has a real LLD question, use it as the base."""
    else:
        schema = """
{
  "question_id":"short-id",
  "title":"...",
  "difficulty":"Easy|Medium|Hard",
  "question":"...",
  "constraints":["..."],
  "examples":[{"input":"...", "output":"...", "explanation":"..."}],
  "followups":["..."],
  "starter_code":"C++ starter with blank main",
  "duration_minutes": 45
}
""".strip()
        task_hint = f"{topic} coding interview question."
        rules = f"""- Topic: {topic}. Do not always pick Two Sum / Maximum Subarray.
- Interviewer style: ask explanation before code.
- Do not include full solution.
- If internet context has a real question, use it as inspiration."""
    prompt = f"""
{BRO_STYLE}
Task: Create one dynamic {task_hint}
Return ONLY JSON:
{schema}

Rules:
{rules}

Difficulty: {difficulty}
Internet context:
{internet_context}
""".strip()
    parsed = _json_llm(prompt, "interview_start", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("interview_start", {"question_id": "unavailable", "title": "Interview question unavailable", "difficulty": difficulty, "question": "Start llama.cpp, then click New Question.", "constraints": [], "examples": [], "followups": [], "starter_code": "", "duration_minutes": 45}, model_mode=model_mode)
    parsed.setdefault("question_id", "array-dynamic")
    parsed.setdefault("title", "Array Interview Question")
    parsed.setdefault("difficulty", difficulty)
    parsed.setdefault("question", "")
    parsed.setdefault("constraints", [])
    parsed.setdefault("examples", [])
    parsed.setdefault("followups", [])
    parsed.setdefault("starter_code", "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}")
    parsed.setdefault("duration_minutes", 45)
    return parsed


def judge_interview_array(question: Dict[str, Any], explanation: str, code: str, language: str = "cpp", run_result: Optional[Dict[str, Any]] = None, model_mode: str = "main") -> Dict[str, Any]:
    schema = """
{
  "overall": 0,
  "scores": {"logic":0, "code":0, "communication":0, "edge_cases":0},
  "strengths": ["..."],
  "mistakes": ["..."],
  "where_wrong": ["line/block/logic area ..."],
  "improvements": ["..."],
  "verdict": "Hire/Strong/Borderline/Needs improvement"
}
""".strip()
    prompt = f"""
{BRO_STYLE}
Task: Judge an array-only coding interview attempt.
Return ONLY JSON:
{schema}

Judge:
- logic correctness
- whether output/code would work
- communication/explanation quality
- missed edge cases
- no repair gaps; final report only

Interview question:
{json.dumps(question, ensure_ascii=False)}
User explanation:
{explanation}
User code:
{_prepare_code(code, numbered=False)}
Compile/run result if available:
{json.dumps(run_result or {}, ensure_ascii=False)}
""".strip()
    parsed = _json_llm(prompt, "interview_judge", timeout=100, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return _offline_payload("interview_judge", {"overall": 0, "scores": {"logic": 0, "code": 0, "communication": 0, "edge_cases": 0}, "strengths": [], "mistakes": ["Interview judge needs LLM connection."], "where_wrong": [], "improvements": ["Start llama.cpp and retry judging."], "verdict": "Not judged"}, model_mode=model_mode)
    parsed.setdefault("overall", 0)
    parsed.setdefault("scores", {"logic": 0, "code": 0, "communication": 0, "edge_cases": 0})
    parsed.setdefault("strengths", [])
    parsed.setdefault("mistakes", [])
    parsed.setdefault("where_wrong", [])
    parsed.setdefault("improvements", [])
    parsed.setdefault("verdict", "Reviewed")
    return parsed


# ── New interview flow ──────────────────────────────────────────────────────

def fetch_dsa_problem(topic: str = "arrays", difficulty: str = "Medium", model_mode: str = "main") -> Dict[str, Any]:
    """Fetch a real DSA problem (GFG-style via internet, or generated)."""
    internet_context = _web_context(
        f"{difficulty} {topic} DSA coding problem geeksforgeeks examples constraints",
        True, max_results=4
    )
    schema = '{"title":"...","problem":"...","examples":[{"input":"...","output":"..."}],"constraints":["..."],"starter_code":"def solution():\\n    pass"}'
    prompt = f"""{BRO_STYLE}
Generate one {difficulty} {topic} DSA coding problem. Return ONLY JSON:
{schema}

Rules:
- problem: clear 3-4 line problem statement.
- examples: 2 concrete input/output examples.
- constraints: 3-4 constraints.
- starter_code: Python skeleton function signature only, no solution.
- Do NOT include the solution or algorithm hint.
- Use the internet context if it has a real problem.

Internet context:
{internet_context[:1200]}""".strip()
    parsed = _json_llm(prompt, "fetch_dsa_problem", timeout=60, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"title": "Two Sum", "problem": "Given an array of integers nums and a target, return indices of two numbers that add up to target.", "examples": [{"input": "nums=[2,7,11,15], target=9", "output": "[0,1]"}], "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9"], "starter_code": "def two_sum(nums, target):\n    pass", "available": True}
    parsed.setdefault("title", f"{topic.title()} Problem")
    parsed.setdefault("problem", "")
    parsed.setdefault("examples", [])
    parsed.setdefault("constraints", [])
    parsed.setdefault("starter_code", "def solution():\n    pass")
    parsed["available"] = True
    return parsed


def answer_clarifying_question(problem: Dict[str, Any], question: str, model_mode: str = "main") -> Dict[str, Any]:
    """Answer a candidate's clarifying question without revealing the algorithm."""
    prompt = f"""{BRO_STYLE}
You are an interviewer. Answer this clarifying question — clarify constraints/format only, do NOT reveal the algorithm.
Return ONLY JSON: {{"answer": "..."}}

Problem: {problem.get("title","")}: {problem.get("problem","")[:400]}
Candidate asked: {question}

Rules: 2-3 sentences max. Never reveal the approach.""".strip()
    parsed = _json_llm(prompt, "interview_clarify", timeout=25, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"answer": "Good question — check the constraints, edge cases ka dhyan rakho.", "available": True}
    return {"answer": str(parsed.get("answer", "Check the constraints.")), "available": True}


def generate_coding_hint(problem: Dict[str, Any], code: str, elapsed_min: int, model_mode: str = "main") -> Dict[str, Any]:
    """At 5/10 min check: look at code progress, give a Socratic hint question."""
    code_preview = _prepare_code(code[:1500]) if code.strip() else "(no code written yet)"
    prompt = f"""{BRO_STYLE}
You are an interviewer checking progress ({elapsed_min} min elapsed of 15 min).
Return ONLY JSON: {{"hint": "...", "code_looks_done": false}}

Problem: {problem.get("title","")}: {problem.get("problem","")[:300]}
Code so far:
{code_preview}

Rules:
- If code empty/barely started: give a directional hint as a Socratic QUESTION pointing toward the approach. Do NOT give algorithm.
- If code is partially there: ask about the missing piece or edge case.
- If code looks complete: set code_looks_done: true, hint = "Looks good! Any edge case you might have missed?"
- hint = 1 sentence question only.""".strip()
    parsed = _json_llm(prompt, "interview_hint", timeout=25, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"hint": "What approach are you thinking of?", "code_looks_done": False, "available": True}
    return {
        "hint": str(parsed.get("hint", "What approach do you have in mind?")),
        "code_looks_done": bool(parsed.get("code_looks_done", False)),
        "available": True,
    }


def get_review_questions(problem: Dict[str, Any], code: str, model_mode: str = "main") -> Dict[str, Any]:
    """After coding phase, generate 3 follow-up questions about their solution."""
    prompt = f"""{BRO_STYLE}
Generate exactly 3 follow-up interviewer questions about this solution. Return ONLY JSON: {{"questions": ["...", "...", "..."]}}

Problem: {problem.get("title","")}: {problem.get("problem","")[:300]}
Code:
{_prepare_code(code[:1500])}

Generate:
1. Time/space complexity — "What is the time complexity and why?"
2. Edge case — "What happens when [specific edge case from problem]?"
3. Optimization — "How would you improve this if [bigger constraint]?"
1 sentence each.""".strip()
    parsed = _json_llm(prompt, "review_questions", timeout=35, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"questions": ["What is the time complexity of this solution and why?", "What happens if the input is empty?", "Is there a better approach than O(n²)?"], "available": True}
    qs = parsed.get("questions", [])
    if not isinstance(qs, list): qs = []
    qs = (list(qs) + ["What is the time complexity?", "Are edge cases handled?", "How would you optimize?"])[:3]
    return {"questions": qs, "available": True}


def judge_dsa_session(problem: Dict[str, Any], code: str, qna_pairs: List[Dict[str, Any]], model_mode: str = "main") -> Dict[str, Any]:
    """Score the full DSA phase (code + review Q&A)."""
    qna_text = "\n".join(f"Q: {p.get('q','')}\nA: {p.get('a','')}" for p in qna_pairs)
    prompt = f"""{BRO_STYLE}
Judge this DSA coding interview. Return ONLY JSON:
{{"score":0,"logic":0,"code_quality":0,"communication":0,"verdict":"Hire/Borderline/No hire","feedback":"..."}}
All numbers 0-100.

Problem: {problem.get("title","")}: {problem.get("problem","")[:300]}
Code:
{_prepare_code(code[:1500])}
Review Q&A:
{qna_text[:800]}""".strip()
    parsed = _json_llm(prompt, "dsa_judge", timeout=60, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"score": 0, "logic": 0, "code_quality": 0, "communication": 0, "verdict": "Not judged", "feedback": "LLM unavailable.", "available": True}
    for k in ["score", "logic", "code_quality", "communication"]:
        try: parsed[k] = max(0, min(100, int(parsed.get(k, 0))))
        except: parsed[k] = 0
    parsed.setdefault("verdict", "Reviewed")
    parsed.setdefault("feedback", "")
    parsed["available"] = True
    return parsed


def start_lld_discussion(model_mode: str = "main") -> Dict[str, Any]:
    """Generate an LLD problem and the first design question."""
    internet_context = _web_context("LLD system design interview question low level design geeksforgeeks", True, max_results=3)
    prompt = f"""{BRO_STYLE}
Generate one LLD interview problem. Return ONLY JSON:
{{"title":"...","problem":"...","requirements":["..."],"first_question":"..."}}

Rules:
- problem: 3-4 sentences describing the system.
- requirements: 4-5 functional requirements as short bullet strings.
- first_question: exactly "How would you design the main classes and their relationships for this system?"
- Vary the system: Parking Lot, Library, ATM, Chess, Elevator, Cab Booking, Hotel, Food Delivery, Movie Ticket.
- Do NOT repeat Parking Lot unless internet context says so.

Internet context:
{internet_context[:1000]}""".strip()
    parsed = _json_llm(prompt, "lld_start", timeout=60, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"title": "Design a Library Management System", "problem": "Design a library system that manages books, members, issue/return workflows, and late fees.", "requirements": ["Track books and availability", "Member registration and login", "Issue and return books", "Calculate late fees", "Search by title/author"], "first_question": "How would you design the main classes and their relationships for this system?", "available": True}
    parsed.setdefault("title", "LLD Problem")
    parsed.setdefault("problem", "")
    parsed.setdefault("requirements", [])
    parsed.setdefault("first_question", "How would you design the main classes for this system?")
    parsed["available"] = True
    return parsed


_LLD_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "have", "from", "will", "would",
    "should", "could", "each", "which", "when", "then", "than", "them", "they",
    "there", "here", "what", "where", "class", "classes", "design", "system",
    "pattern", "patterns", "point", "points", "used", "uses", "using",
}


def _lld_ref_terms(ref: dict) -> set:
    """Meaningful reference-solution terms (class names, patterns, key concepts)."""
    text = " ".join([
        " ".join(ref.get("key_classes", [])),
        " ".join(ref.get("key_points", [])),
        str(ref.get("concurrency", "")),
        " ".join(ref.get("design_patterns", [])),
    ])
    words = re.findall(r"[A-Za-z_]{4,}", text)
    return {w.lower() for w in words if w.lower() not in _LLD_STOPWORDS}


def _lld_coverage_score(answer: str, ref: dict) -> int:
    """Deterministic 0-90 score: fraction of reference terms the answer mentions."""
    terms = _lld_ref_terms(ref)
    if not terms:
        return 40
    ans = answer.lower()
    hit = sum(1 for t in terms if t in ans)
    return min(90, round(100 * hit / len(terms)))


def discuss_lld_answer(problem: Dict[str, Any], conversation: List[Dict[str, Any]], model_mode: str = "main") -> Dict[str, Any]:
    """Evaluate the latest answer against the reference solution and return the next predefined question."""
    questions: list = problem.get("questions", [])
    ref: dict = problem.get("reference_solution", {})
    turn = len(conversation)          # answers submitted so far
    is_last = turn >= len(questions)  # all questions have been answered

    last_turn = conversation[-1] if conversation else {}
    last_q = last_turn.get("q", "")
    last_a = str(last_turn.get("a", "")).strip()

    # Next question from the hardcoded list (index = turn, because turn 0 means first Q was answered)
    next_q = "" if is_last else questions[turn]

    # Input validation only (not judging): a blank or one-word submission has
    # nothing to evaluate — a real interviewer wouldn't score it either.
    word_count = len(re.findall(r"\w+", last_a))
    if not last_a or word_count < 2:
        return {
            "next_question": next_q, "is_done": is_last,
            "brief_feedback": "Bro, there's nothing to evaluate in this answer. "
                "Write a few sentences about the classes, relationships, or patterns.",
            "answer_score": 0,
            "available": True,
        }

    # ── Rubric items: one binary judgement per reference point ────────────────
    items = []
    for c in ref.get("key_classes", []):
        items.append(f"Identifies the class/entity: {c}")
    for p in ref.get("key_points", [])[:4]:
        items.append(f"Addresses: {p}")
    if ref.get("concurrency"):
        items.append(f"Addresses concurrency: {ref['concurrency']}")
    for pat in ref.get("design_patterns", []):
        items.append(f"Applies or names the pattern: {pat}")
    items = items[:12]
    checklist = "\n".join(f"{i+1}. {it}" for i, it in enumerate(items))

    # Rubric grading, like a real interviewer's scorecard: the model makes one
    # semantic yes/no per point WITH a quote as evidence. Binary judgements are
    # reliable where open 0-100 scoring is not; fabricated quotes are discarded.
    prompt = f"""{BRO_STYLE}
You are an LLD interviewer grading ONE answer against a scorecard.
Return ONLY JSON:
{{"items":[{{"n":1,"relevant":true,"addressed":false,"quote":""}}, ...one object per scorecard item...],
"wrong_claims":["incorrect statements in the answer, empty if none"],
"brief_feedback":"..."}}

Question asked: {last_q}
Candidate's answer: {last_a[:700]}

Scorecard (judge each item independently):
{checklist}

Rules for each item:
- relevant: is this item something THIS question asks about? (true/false)
- addressed: does the answer actually cover it — in any wording, synonyms and examples count? (true/false)
- quote: if addressed=true, copy the candidate's OWN words (short fragment) that prove it. If you cannot find such words, addressed must be false.
- brief_feedback: 1-2 sentences — strongest part first, then the most important miss, naming the specific class/pattern/concept.""".strip()

    parsed = _json_llm(prompt, "lld_discuss", timeout=75, model_mode=model_mode, max_tokens=600)

    def _quote_in_answer(quote: str) -> bool:
        """Loose containment check so paraphrase-y quotes still verify."""
        qn = re.sub(r"[^a-z0-9 ]", " ", quote.lower())
        an = re.sub(r"[^a-z0-9 ]", " ", last_a.lower())
        qtokens = [t for t in qn.split() if len(t) > 2]
        if not qtokens:
            return False
        hits = sum(1 for t in qtokens if t in an)
        return hits / len(qtokens) >= 0.6

    if isinstance(parsed, dict) and parsed.get("available", True) and isinstance(parsed.get("items"), list):
        relevant, addressed = 0, 0
        missed_labels = []
        for it in parsed["items"]:
            if not isinstance(it, dict):
                continue
            rel = bool(it.get("relevant", True))
            adr = bool(it.get("addressed", False))
            quote = str(it.get("quote", "") or "")
            # Evidence check: an "addressed" verdict without real words from the
            # candidate's answer is a hallucination — flip it to not addressed.
            if adr and not _quote_in_answer(quote):
                adr = False
            if rel:
                relevant += 1
                if adr:
                    addressed += 1
                else:
                    n = it.get("n")
                    if isinstance(n, int) and 1 <= n <= len(items):
                        missed_labels.append(items[n - 1])
        if relevant == 0:
            # model marked nothing relevant — grade against the full scorecard
            relevant = len(items) or 1
            missed_labels = items[:3]
        score = round(100 * addressed / relevant)
        wrongs = [w for w in parsed.get("wrong_claims", []) if isinstance(w, str) and w.strip()]
        score = max(0, score - 8 * min(3, len(wrongs)))
        feedback = str(parsed.get("brief_feedback") or "").strip() or "Answer evaluated."
        if addressed == 0:
            # Nothing survived evidence verification — don't relay the model's
            # (often flattering) prose; state what was actually missing.
            expected = "; ".join(m.split(": ", 1)[-1] for m in missed_labels[:3]) or "specific classes/patterns"
            feedback = (
                "Bro, the answer shows no concrete evidence of the reference points — "
                f"no specific class or pattern was named. Expected: {expected}."
            )
        if wrongs:
            feedback += f" Incorrect claim: {wrongs[0][:120]}"
        return {
            "next_question": next_q, "is_done": is_last,
            "brief_feedback": feedback,
            "answer_score": min(100, score),
            "available": True,
        }

    # LLM unreachable or malformed — honest fallback, not a flat number
    return {
        "next_question": next_q, "is_done": is_last,
        "brief_feedback": "Scoring unavailable — LLM did not respond. Answer saved; final judge will evaluate it.",
        "answer_score": _lld_coverage_score(last_a, ref),
        "available": True,
    }


def judge_lld_session(problem: Dict[str, Any], conversation: List[Dict[str, Any]], model_mode: str = "main") -> Dict[str, Any]:
    """Score the full LLD discussion against the reference solution."""
    ref: dict = problem.get("reference_solution", {})
    convo_text = "\n".join(f"Q: {t.get('q','')}\nA: {t.get('a','')}" for t in conversation)

    ref_lines = []
    if ref.get("key_classes"):
        ref_lines.append("Expected key classes: " + ", ".join(ref["key_classes"]))
    if ref.get("key_points"):
        ref_lines.append("Key design points: " + " | ".join(ref["key_points"]))
    if ref.get("concurrency"):
        ref_lines.append("Concurrency expectation: " + ref["concurrency"])
    if ref.get("design_patterns"):
        ref_lines.append("Expected patterns: " + ", ".join(ref.get("design_patterns", [])))
    ref_text = "\n".join(ref_lines)

    prompt = f"""{BRO_STYLE}
You are a strict LLD interviewer writing the final evaluation of a full session.
Return ONLY JSON, fields IN THIS ORDER:
{{"strengths":["specific things the candidate demonstrated, with evidence from their answers"],
"gaps":["important reference points never addressed across the whole session"],
"class_design":<0-100>,"concurrency":<0-100>,"scalability":<0-100>,
"score":<0-100>,"verdict":"Hire/Borderline/No hire","feedback":"..."}}

Problem: {problem.get("title","")}

Reference solution:
{ref_text[:1000]}

Candidate's full conversation:
{convo_text[:1500]}

Judging rules — like a real interviewer:
- Fill "strengths"/"gaps" first, ONLY from evidence in the conversation. Every strength must point to something the candidate actually said; accept synonyms and examples that show the same idea as the reference.
- class_design: correctness and completeness of classes/entities/relationships they proposed.
- concurrency: did they address thread safety / locking / race conditions where the reference expects it?
- scalability: scaling, caching, storage choices — only if relevant to this problem.
- Scores must follow from your lists: empty strengths → very low; all reference areas evidenced → high. Short, evasive, or wrong answers pull scores down.
- score: overall weighted judgement (class_design 40%, concurrency 30%, scalability 30%).
- verdict: Hire (score>=70), Borderline (50-69), No hire (<50)
- feedback: 2-3 sentences. Concrete: what they showed, what they must study next.""".strip()

    parsed = _json_llm(prompt, "lld_judge", timeout=60, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"score": 0, "class_design": 0, "concurrency": 0, "scalability": 0, "verdict": "Not judged", "feedback": "LLM unavailable.", "available": True}
    for k in ["score", "class_design", "concurrency", "scalability"]:
        try: parsed[k] = max(0, min(100, int(parsed.get(k, 0))))
        except: parsed[k] = 0
    parsed.setdefault("verdict", "Reviewed")
    parsed.setdefault("feedback", "")
    parsed["available"] = True
    return parsed


# ══════════════════════════════════════════════════════════════════════════════
#  LLD Workspace AI — structure gen, file gen, file patch
# ══════════════════════════════════════════════════════════════════════════════

def generate_lld_structure(context: str, file_list: list, model_mode: str = "main") -> Dict[str, Any]:
    """Generate a class diagram / structure JSON from LLD context."""
    files_hint = "\n".join(f"- {f}" for f in (file_list or [])[:10]) or "No files yet."
    prompt = f"""{BRO_STYLE}
Generate a class structure for this LLD problem. Return ONLY JSON:
{{"classes":[{{"name":"ClassName","type":"class","attributes":["- attr: Type"],"methods":["+ method(): RetType"]}}],"relationships":[{{"from":"A","to":"B","type":"has-many","label":"1..*"}}],"patterns":["Singleton"],"summary":"..."}}

LLD Problem Context:
{context[:1800]}

Existing workspace files:
{files_hint}

Rules:
- 4–8 classes/interfaces maximum.
- type: class | interface | abstract | enum
- relationship type: has-many | has-one | extends | implements | uses | creates
- Keep attributes and methods to 3–4 items each.
- patterns: list 1-3 design patterns this design uses.
- summary: 1-2 sentence overview.""".strip()

    parsed = _json_llm(prompt, "lld_structure", timeout=150, model_mode=model_mode, max_tokens=900)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"classes": [], "relationships": [], "patterns": [], "summary": "Could not generate structure.", "available": True}
    parsed.setdefault("classes", [])
    parsed.setdefault("relationships", [])
    parsed.setdefault("patterns", [])
    parsed.setdefault("summary", "")
    parsed["available"] = True
    return parsed


def ai_generate_lld_file(context: str, filename: str, instruction: str, existing_content: str = "", model_mode: str = "main") -> Dict[str, Any]:
    """AI generates a complete code file for the LLD workspace."""
    ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'py'
    lang_map = {'py': 'Python', 'js': 'JavaScript', 'ts': 'TypeScript', 'java': 'Java', 'cpp': 'C++', 'txt': 'plaintext', 'md': 'Markdown'}
    lang = lang_map.get(ext, ext)
    existing_hint = f"\nExisting content to extend/replace:\n```{ext}\n{existing_content[:1500]}\n```" if existing_content.strip() else ""

    prompt = f"""{BRO_STYLE}
Generate the complete content for file `{filename}` ({lang}).

LLD Context:
{context[:1200]}

Instruction: {instruction}{existing_hint}

Return ONLY JSON:
{{"filename":"{filename}","content":"...complete file content...","explanation":"..."}}

Rules:
- content: complete, runnable {lang} code. No truncation. No placeholder comments like "rest of code here".
- If Python: include proper class definitions, __init__, docstrings, type hints.
- explanation: 1-2 sentences on what this file implements.""".strip()

    parsed = _json_llm(prompt, "lld_gen_file", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"filename": filename, "content": "", "explanation": "LLM unavailable.", "available": True}
    parsed.setdefault("filename", filename)
    parsed.setdefault("content", "")
    parsed.setdefault("explanation", "")
    parsed["available"] = True
    return parsed


def ai_patch_lld_file(context: str, filename: str, file_content: str, instruction: str, model_mode: str = "main") -> Dict[str, Any]:
    """AI patches/modifies an existing workspace file."""
    ext = filename.rsplit('.', 1)[-1] if '.' in filename else 'py'
    prompt = f"""{BRO_STYLE}
Patch the file `{filename}` according to the instruction.

LLD Context:
{context[:800]}

Current file content:
```{ext}
{file_content[:2500]}
```

Patch instruction: {instruction}

Return ONLY JSON:
{{"patched_content":"...","changes_summary":"..."}}

Rules:
- patched_content: the COMPLETE updated file (not just the diff).
- changes_summary: 1-2 sentences describing what changed.""".strip()

    parsed = _json_llm(prompt, "lld_patch_file", timeout=90, model_mode=model_mode)
    if not isinstance(parsed, dict) or not parsed.get("available", True):
        return {"patched_content": file_content, "changes_summary": "LLM unavailable — file unchanged.", "available": True}
    parsed.setdefault("patched_content", file_content)
    parsed.setdefault("changes_summary", "")
    parsed["available"] = True
    return parsed
