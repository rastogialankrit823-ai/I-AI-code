from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

# Load .env before any module reads os.getenv at import time
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import ai_engine
import parallel_runtime
import runner
import session_memory

# ── LLD workspace directory ──────────────────────────────────────────────────
_LLD_WS = Path(os.getenv("LLD_WORKSPACE", "./lld-workspace")).resolve()
_LLD_WS.mkdir(parents=True, exist_ok=True)

def _safe_path(rel: str) -> Path:
    """Resolve a relative path inside the workspace; reject traversal."""
    p = (_LLD_WS / rel).resolve()
    if not str(p).startswith(str(_LLD_WS)):
        raise HTTPException(status_code=400, detail="Path traversal not allowed")
    return p

app = FastAPI(title="I&AI Code Backend", version="1.4.0-parallel-fast")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        # Tauri desktop app origins (macOS uses tauri://, Windows uses http://tauri.localhost)
        "tauri://localhost", "http://tauri.localhost", "https://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StarterCodeRequest(BaseModel):
    mode: str = "DSA"
    language: str = "cpp"
    context: str = ""
    use_internet: bool = False
    model_mode: str = "main"


class RunExplanationRequest(BaseModel):
    code: str = ""
    mode: str = "DSA"
    stdin: str = ""
    output: str = ""
    error: str = ""
    success: bool = False
    use_internet: bool = False
    model_mode: str = "main"


class CodeRequest(BaseModel):
    code: str
    mode: str = "DSA"
    stdin: str = ""
    language: str = "cpp"
    model_mode: str = "main"


class RepairGapRequest(BaseModel):
    code: str = ""
    error: str = ""
    mode: str = "DSA"
    language: str = "cpp"
    model_mode: str = "main"


class ChatRequest(BaseModel):
    message: str
    mode: str = "DSA"
    code: str = ""
    context: str = ""
    use_internet: bool = False
    model_mode: str = "main"
    history: List[Dict[str, str]] = []


class SuggestionRequest(BaseModel):
    code: str = ""
    mode: str = "DSA"
    context: str = ""
    run_output: str = ""
    error: str = ""
    use_internet: bool = False
    model_mode: str = "main"


class SuggestionApplyRequest(BaseModel):
    suggestion: Dict[str, Any]
    code: str = ""
    mode: str = "DSA"
    context: str = ""
    model_mode: str = "main"


class SystemValidateRequest(BaseModel):
    context: str = ""
    diagram_text: str = ""
    code: str = ""
    pseudocode: str = ""
    use_internet: bool = False
    model_mode: str = "main"


class SystemDiagramRequest(BaseModel):
    context: str = ""
    code: str = ""
    pseudocode: str = ""
    use_internet: bool = False
    model_mode: str = "main"


class UnitTestRequest(BaseModel):
    code: str = ""
    requirement: str = ""
    language: str = "cpp"
    use_internet: bool = False
    model_mode: str = "main"


class QuickPromptRequest(BaseModel):
    mode: str = "DSA"
    code: str = ""
    context: str = ""
    model_mode: str = "main"


class ComplexityRequest(BaseModel):
    code: str = ""
    mode: str = "DSA"
    context: str = ""
    model_mode: str = "main"


class StressTestRequest(BaseModel):
    code: str = ""
    context: str = ""
    count: int = 6
    language: str = "cpp"
    model_mode: str = "main"


class MistakeMemoryRequest(BaseModel):
    limit: int = 10


class LLDQuestionRequest(BaseModel):
    difficulty: str = "Medium"
    use_internet: bool = False
    model_mode: str = "main"


class InterviewStartRequest(BaseModel):
    difficulty: str = "Medium"
    topic: str = "arrays"
    use_internet: bool = False
    model_mode: str = "main"


class InterviewJudgeRequest(BaseModel):
    question: Dict[str, Any]
    explanation: str = ""
    code: str = ""
    language: str = "cpp"
    model_mode: str = "main"


class ExplainRequest(BaseModel):
    message: str = ""
    code: str = ""
    mode: str = "DSA"
    model_mode: str = "main"


# ── New interview flow models ──────────────────────────────────────────────
class FetchDSAProblemRequest(BaseModel):
    topic: str = "arrays"
    difficulty: str = "Medium"
    model_mode: str = "main"

class InterviewClarifyRequest(BaseModel):
    problem: Dict[str, Any]
    question: str
    model_mode: str = "main"

class InterviewHintRequest(BaseModel):
    problem: Dict[str, Any]
    code: str = ""
    elapsed_min: int = 5
    model_mode: str = "main"

class InterviewReviewQsRequest(BaseModel):
    problem: Dict[str, Any]
    code: str = ""
    model_mode: str = "main"

class JudgeDSARequest(BaseModel):
    problem: Dict[str, Any]
    code: str = ""
    qna_pairs: list = []
    model_mode: str = "main"

class LLDStartRequest(BaseModel):
    model_mode: str = "main"

class LLDDiscussRequest(BaseModel):
    problem: Dict[str, Any]
    conversation: list = []
    model_mode: str = "main"

class LLDJudgeRequest(BaseModel):
    problem: Dict[str, Any]
    conversation: list = []
    model_mode: str = "main"


class OmniAnalyzeRequest(BaseModel):
    code: str = ""
    error: str = ""
    output: str = ""
    mode: str = "DSA"
    language: str = "python"
    model_mode: str = "main"
    user_question: str = ""


class OmniPatchRequest(BaseModel):
    code: str = ""
    analysis: Dict[str, Any] = {}
    language: str = "python"
    model_mode: str = "main"


class ContextCompactRequest(BaseModel):
    messages: List[Dict[str, Any]] = []
    model_mode: str = "main"


class PhrasePromptRequest(BaseModel):
    message: str = ""
    execution_logs: str = ""
    model_mode: str = "main"


@app.get("/")
async def root():
    return {
        "name": "I&AI Code",
        "status": "ready",
        "version": "1.4.0-parallel-fast",
        "supported_languages": ["cpp", "python"],
        "dynamic": {
            "repair_gap": ai_engine.DYNAMIC_REPAIR,
            "suggestions": ai_engine.DYNAMIC_SUGGESTIONS,
            "suggestion_apply_guide": ai_engine.DYNAMIC_APPLY_GUIDE,
            "system_validation": ai_engine.DYNAMIC_SYSTEM_VALIDATION,
            "system_diagram": ai_engine.DYNAMIC_SYSTEM_DIAGRAM,
            "unit_tests": ai_engine.DYNAMIC_UNIT_TESTS,
            "interview_array": ai_engine.DYNAMIC_INTERVIEW,
            "quick_prompts": ai_engine.DYNAMIC_QUICK_PROMPTS,
            "internet": ai_engine.INTERNET_ENABLED,
            "starter_code": ai_engine.DYNAMIC_STARTER_CODE,
            "model_modes": ai_engine.MODEL_MODES,
            "run_explanation": ai_engine.DYNAMIC_RUN_EXPLANATION,
            "complexity_analysis": ai_engine.DYNAMIC_COMPLEXITY_ANALYSIS,
            "stress_test": ai_engine.DYNAMIC_STRESS_TEST,
            "parallel_fast_path": True,
            "parallel_workers": parallel_runtime.status(),
            "mistake_memory": ai_engine.DYNAMIC_MISTAKE_MEMORY,
            "design_risk_radar": ai_engine.DYNAMIC_DESIGN_RISK_RADAR,
        },
    }


@app.post("/mode/starter-code")
async def starter_code(req: StarterCodeRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_starter_code, req.mode, req.language, req.context, req.use_internet, req.model_mode)


@app.post("/run/explain")
async def run_explain(req: RunExplanationRequest):
    return await parallel_runtime.llm_task(ai_engine.explain_run_result, req.code, req.mode, req.stdin, req.output, req.error, req.success, req.use_internet, req.model_mode)


@app.post("/run")
async def run_code(req: CodeRequest):
    """Fast path for DSA Build & Run.

    This endpoint intentionally does NOT wait for LLM repair/suggestions.
    It runs code, returns stdout/stderr immediately, and provides instant
    heuristic complexity. The frontend then starts LLM repair/explain/suggestions
    in the background using separate endpoints.
    """
    language = runner.normalize_language(req.language)
    if language not in {"cpp", "python"}:
        return {"success": False, "output": "", "error": f"Unsupported language for runner: {req.language}", "repair_gap": None, "language": language}
    result = await parallel_runtime.code_task(runner.execute_code, language, req.code, req.stdin)
    complexity = ai_engine.analyze_complexity(req.code, req.mode, "", req.model_mode) if req.mode.lower() == "dsa" else None
    # Session memory: remember the outcome of this run (TTL-evicted)
    outcome = "OK" if result["success"] else f"ERROR: {str(result['error'])[:200]}"
    session_memory.remember(
        "run", req.mode,
        f"ran {language} code ({len(req.code.splitlines())} lines), stdin={req.stdin[:80]!r} → {outcome}; output={str(result['output'])[:160]!r}",
    )
    return {
        "success": result["success"],
        "output": result["output"],
        "error": result["error"],
        "repair_gap": None,
        "run_explanation": {
            "status_text": "Code ran successfully" if result["success"] else "Run finished with error. AI repair is loading in background.",
            "next_step": "Check output and stress test." if result["success"] else "Wait for repair gap or inspect compiler/runtime error.",
            "background_ai": True,
        },
        "complexity": complexity,
        "runner": result.get("runner", "unknown"),
        "language": result.get("language", language),
        "fast_path": True,
        "background_ai_expected": True,
    }


@app.post("/ai/repair-gap")
async def repair_gap(req: RepairGapRequest):
    return {"repair_gap": await parallel_runtime.llm_task(ai_engine.get_repair_fix, req.code, req.error, req.mode, req.language, req.model_mode)}


@app.post("/chat")
async def chat(req: ChatRequest):
    # Enrich the prompt with recent session context; remember the question topic
    session_ctx = session_memory.recall(req.mode)
    ctx = f"{session_ctx}\n\n{req.context}".strip() if session_ctx else req.context
    session_memory.remember("chat", req.mode, f"user asked: {req.message[:200]}")
    result = await parallel_runtime.llm_task(ai_engine.chat, req.message, req.mode, req.code, ctx, req.use_internet, req.model_mode, req.history)
    return result if isinstance(result, dict) else {"reply": result, "cards": []}


@app.post("/assistant/quick-prompts")
async def quick_prompts(req: QuickPromptRequest):
    return await parallel_runtime.llm_task(ai_engine.get_quick_prompts, req.mode, req.code, req.context, req.model_mode)


@app.post("/suggestions")
async def suggestions(req: SuggestionRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_suggestions, req.code, req.mode, req.context, req.run_output, req.error, req.use_internet, req.model_mode)


@app.post("/chat/explain")
async def chat_explain(req: ExplainRequest):
    return await parallel_runtime.llm_task(ai_engine.explain_code, req.message, req.code, req.mode, req.model_mode)


@app.post("/suggestions/apply")
async def suggestion_apply(req: SuggestionApplyRequest):
    return {"repair_gap": await parallel_runtime.llm_task(ai_engine.get_apply_guide, req.suggestion, req.code, req.mode, req.context, req.model_mode)}


@app.post("/system/diagram")
async def system_diagram(req: SystemDiagramRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_system_diagram, req.context, req.code, req.pseudocode, req.use_internet, req.model_mode)


@app.post("/system/validate")
async def validate_system(req: SystemValidateRequest):
    return await parallel_runtime.llm_task(ai_engine.validate_system_design, req.context, req.diagram_text, req.code, req.pseudocode, req.use_internet, req.model_mode)


@app.post("/unit-tests")
async def unit_tests(req: UnitTestRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_unit_tests, req.code, req.requirement, req.language, req.use_internet, req.model_mode)


@app.post("/dsa/complexity")
async def dsa_complexity(req: ComplexityRequest):
    return await parallel_runtime.llm_task(ai_engine.analyze_complexity, req.code, req.mode, req.context, req.model_mode)


@app.post("/dsa/stress-test")
async def dsa_stress_test(req: StressTestRequest):
    generated = await parallel_runtime.llm_task(ai_engine.generate_stress_tests, req.code, req.context, req.count, req.model_mode)
    tests = generated.get("tests", []) if isinstance(generated, dict) else []
    selected_tests = tests[: max(1, min(int(req.count or 6), 12))]

    async def run_one(test: Dict[str, Any]):
        stdin = str(test.get("stdin", "")) if isinstance(test, dict) else ""
        run_result = await parallel_runtime.stress_task(runner.execute_code, req.language, req.code, stdin)
        expected = str(test.get("expected", "")) if isinstance(test, dict) else ""
        passed = bool(run_result.get("success"))
        if expected.strip():
            passed = passed and str(run_result.get("output", "")).strip() == expected.strip()
        return {
            "name": test.get("name", "stress case") if isinstance(test, dict) else "stress case",
            "stdin": stdin,
            "expected": expected,
            "why": test.get("why", "") if isinstance(test, dict) else "",
            "success": bool(run_result.get("success")),
            "passed": passed,
            "output": run_result.get("output", ""),
            "error": run_result.get("error", ""),
            "runner": run_result.get("runner", "unknown"),
        }

    results = await asyncio.gather(*(run_one(t) for t in selected_tests)) if selected_tests else []
    return {
        "message": generated.get("message", "Stress test ready") if isinstance(generated, dict) else "Stress test ready",
        "tests": tests,
        "results": results,
        "parallel_workers": parallel_runtime.status().get("stress_run_workers", 1),
    }


@app.post("/memory/mistakes")
async def mistake_memory(req: MistakeMemoryRequest):
    return await parallel_runtime.llm_task(ai_engine.get_mistake_memory, req.limit)


@app.post("/lld/question")
async def lld_question(req: LLDQuestionRequest):
    return await parallel_runtime.llm_task(ai_engine.get_lld_question, req.difficulty, req.use_internet, req.model_mode)


@app.post("/interview/start")
async def interview_start(req: InterviewStartRequest):
    return await parallel_runtime.llm_task(ai_engine.start_interview_array, req.difficulty, req.topic, req.use_internet, req.model_mode)


@app.post("/interview/judge")
async def interview_judge(req: InterviewJudgeRequest):
    run_result = None
    language = runner.normalize_language(req.language)
    if language in {"cpp", "python"} and req.code.strip():
        examples = req.question.get("examples") or []
        if examples and isinstance(examples, list) and isinstance(examples[0], dict):
            run_result = await parallel_runtime.code_task(runner.execute_code, language, req.code, str(examples[0].get("input", "")))
    return await parallel_runtime.llm_task(ai_engine.judge_interview_array, req.question, req.explanation, req.code, req.language, run_result, req.model_mode)


# ── New interview flow routes ──────────────────────────────────────────────
@app.post("/interview/dsa/fetch")
async def fetch_dsa_problem(req: FetchDSAProblemRequest):
    return await parallel_runtime.llm_task(ai_engine.fetch_dsa_problem, req.topic, req.difficulty, req.model_mode)

@app.post("/interview/dsa/clarify")
async def interview_clarify(req: InterviewClarifyRequest):
    return await parallel_runtime.llm_task(ai_engine.answer_clarifying_question, req.problem, req.question, req.model_mode)

@app.post("/interview/dsa/hint")
async def interview_hint(req: InterviewHintRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_coding_hint, req.problem, req.code, req.elapsed_min, req.model_mode)

@app.post("/interview/dsa/review-questions")
async def interview_review_qs(req: InterviewReviewQsRequest):
    return await parallel_runtime.llm_task(ai_engine.get_review_questions, req.problem, req.code, req.model_mode)

@app.post("/interview/dsa/judge")
async def judge_dsa(req: JudgeDSARequest):
    return await parallel_runtime.llm_task(ai_engine.judge_dsa_session, req.problem, req.code, req.qna_pairs, req.model_mode)

@app.post("/interview/lld/start")
async def lld_start(req: LLDStartRequest):
    return await parallel_runtime.llm_task(ai_engine.start_lld_discussion, req.model_mode)

@app.post("/interview/lld/discuss")
async def lld_discuss(req: LLDDiscussRequest):
    return await parallel_runtime.llm_task(ai_engine.discuss_lld_answer, req.problem, req.conversation, req.model_mode)

@app.post("/interview/lld/judge")
async def lld_judge(req: LLDJudgeRequest):
    return await parallel_runtime.llm_task(ai_engine.judge_lld_session, req.problem, req.conversation, req.model_mode)


@app.post("/ai/analyze")
async def analyze_code(req: OmniAnalyzeRequest):
    result = await parallel_runtime.llm_task(ai_engine.analyze_code_judge, req.code, req.error, req.output, req.mode, req.language, req.model_mode, req.user_question)
    if isinstance(result, dict) and result.get("explanation"):
        session_memory.remember(
            "analysis", req.mode,
            f"bug at line {result.get('line')}: {str(result.get('explanation'))[:220]}",
        )
    return result


@app.post("/ai/patch")
async def omni_patch(req: OmniPatchRequest):
    return await parallel_runtime.llm_task(ai_engine.generate_omni_patch, req.code, req.analysis, req.language, req.model_mode)


@app.post("/chat/compact")
async def compact_context(req: ContextCompactRequest):
    summary = await parallel_runtime.llm_task(ai_engine.compact_chat_context, req.messages, req.model_mode)
    return {"summary": summary}


@app.post("/chat/phrase")
async def phrase_prompt(req: PhrasePromptRequest):
    phrased = await parallel_runtime.llm_task(ai_engine.phrase_user_prompt, req.message, req.execution_logs, req.model_mode)
    return {"phrased": phrased}


# ══════════════════════════════════════════════════════════════════════════════
#  Session memory — TTL-evicted context store for the current session
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/session/memory")
async def session_memory_list():
    return {"stats": session_memory.stats(), "entries": session_memory.list_entries()}


@app.post("/session/memory/clear")
async def session_memory_clear():
    removed = session_memory.clear()
    return {"cleared": removed}


@app.delete("/session/memory/{entry_id}")
async def session_memory_delete(entry_id: str):
    ok = session_memory.remove(entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No such entry")
    return {"removed": entry_id}


@app.post("/session/memory/sweep")
async def session_memory_sweep():
    return {"removed": session_memory.sweep(), "stats": session_memory.stats()}


# ══════════════════════════════════════════════════════════════════════════════
#  LLD Workspace — file ops + terminal + AI file generation
# ══════════════════════════════════════════════════════════════════════════════

class WsReadReq(BaseModel):
    path: str

class WsWriteReq(BaseModel):
    path: str
    content: str

class WsDeleteReq(BaseModel):
    path: str

class WsRunReq(BaseModel):
    command: str

class LLDStructureReq(BaseModel):
    context: str
    files: List[str] = []
    model_mode: str = "main"

class LLDAIFileReq(BaseModel):
    context: str
    filename: str
    instruction: str
    existing_content: str = ""
    model_mode: str = "main"

class LLDPatchReq(BaseModel):
    context: str
    filename: str
    file_content: str
    instruction: str
    model_mode: str = "main"


def _file_tree(root: Path, base: Path, depth: int = 0) -> list:
    items = []
    try:
        entries = sorted(root.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
    except PermissionError:
        return items
    for e in entries:
        if e.name.startswith('.'):
            continue
        rel = str(e.relative_to(base))
        if e.is_dir() and depth < 3:
            items.append({"name": e.name, "path": rel, "is_dir": True,
                          "children": _file_tree(e, base, depth + 1)})
        elif e.is_file():
            items.append({"name": e.name, "path": rel, "is_dir": False,
                          "ext": e.suffix.lstrip('.'), "size": e.stat().st_size})
    return items


@app.get("/lld/workspace/files")
async def ws_list_files():
    return {"files": _file_tree(_LLD_WS, _LLD_WS), "workspace": str(_LLD_WS)}


@app.post("/lld/workspace/read")
async def ws_read_file(req: WsReadReq):
    p = _safe_path(req.path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"path": req.path, "content": content}


@app.post("/lld/workspace/write")
async def ws_write_file(req: WsWriteReq):
    p = _safe_path(req.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(req.content, encoding="utf-8")
    return {"path": req.path, "size": p.stat().st_size}


@app.post("/lld/workspace/delete")
async def ws_delete_file(req: WsDeleteReq):
    p = _safe_path(req.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if p.is_dir():
        import shutil; shutil.rmtree(p)
    else:
        p.unlink()
    return {"deleted": req.path}


@app.post("/lld/workspace/run")
async def ws_run_command(req: WsRunReq):
    cmd = req.command.strip()
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=str(_LLD_WS),
            capture_output=True, text=True, timeout=15,
        )
        return {
            "stdout": result.stdout[:8000],
            "stderr": result.stderr[:2000],
            "exit_code": result.returncode,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 15s", "exit_code": -1, "timed_out": True}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1, "timed_out": False}


@app.post("/lld/structure/generate")
async def lld_generate_structure(req: LLDStructureReq):
    return await parallel_runtime.llm_task(
        ai_engine.generate_lld_structure, req.context, req.files, req.model_mode
    )


@app.post("/lld/ai/generate-file")
async def lld_ai_generate_file(req: LLDAIFileReq):
    result = await parallel_runtime.llm_task(
        ai_engine.ai_generate_lld_file, req.context, req.filename,
        req.instruction, req.existing_content, req.model_mode
    )
    # Auto-save to workspace
    if result.get("content") and result.get("filename"):
        p = _safe_path(result["filename"])
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(result["content"], encoding="utf-8")
    return result


@app.post("/lld/ai/patch-file")
async def lld_ai_patch_file(req: LLDPatchReq):
    result = await parallel_runtime.llm_task(
        ai_engine.ai_patch_lld_file, req.context, req.filename,
        req.file_content, req.instruction, req.model_mode
    )
    # Auto-save patched content
    if result.get("patched_content") and req.filename:
        p = _safe_path(req.filename)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(result["patched_content"], encoding="utf-8")
    return result


# ══════════════════════════════════════════════════════════════════════════════
#  Local filesystem browser — open any folder/file on the user's machine
# ══════════════════════════════════════════════════════════════════════════════

FS_IGNORE = {'.git', '.venv', 'venv', 'node_modules', '__pycache__', '.next',
             'dist', 'build', '.DS_Store', '.idea', '.vscode', '.pytest_cache',
             '.mypy_cache', '.cache', 'target'}

FS_TEXT_EXT = {'py','js','jsx','ts','tsx','java','cpp','c','h','hpp','rs','go',
               'rb','php','swift','kt','scala','sh','bash','zsh','fish',
               'html','css','scss','sass','less','vue','svelte',
               'json','yaml','yml','toml','xml','ini','conf','env','md','txt',
               'sql','graphql','proto','dockerfile','makefile','cmake',
               'gitignore','editorconfig'}

FS_MAX_READ_BYTES = 2 * 1024 * 1024   # 2 MB


class FsBrowseReq(BaseModel):
    path: Optional[str] = None
    show_hidden: bool = False

class FsReadReq(BaseModel):
    path: str

class FsWriteReq(BaseModel):
    path: str
    content: str

class FsPathReq(BaseModel):
    path: str

class FsCreateReq(BaseModel):
    path: str
    is_dir: bool = False

class FsRenameReq(BaseModel):
    old_path: str
    new_path: str


def _expand(path: str) -> Path:
    """Expand ~ and env vars; return absolute Path."""
    if not path:
        raise HTTPException(status_code=400, detail="path required")
    p = Path(os.path.expandvars(os.path.expanduser(path))).resolve()
    return p


def _entry_meta(p: Path, base: Path) -> dict:
    try:
        st = p.stat()
    except (OSError, PermissionError):
        return None
    return {
        "name": p.name,
        "path": str(p),
        "rel": str(p.relative_to(base)) if base in p.parents or p == base else p.name,
        "is_dir": p.is_dir(),
        "ext": p.suffix.lstrip('.').lower() if p.is_file() else '',
        "size": st.st_size,
        "mtime": int(st.st_mtime),
    }


@app.get("/files/home")
async def fs_home():
    """Return the user's home dir + a few common starting points."""
    home = Path.home()
    common = []
    for name in ("Desktop", "Documents", "Downloads", "Projects", "Code", "Developer"):
        p = home / name
        if p.exists() and p.is_dir():
            common.append({"name": name, "path": str(p)})
    return {"home": str(home), "cwd": str(Path.cwd()), "common": common}


@app.post("/files/browse")
async def fs_browse(req: FsBrowseReq):
    """List contents of any directory on disk (single level)."""
    p = _expand(req.path) if req.path else Path.home()
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Path not found: {p}")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"Not a directory: {p}")

    entries = []
    try:
        items = sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Permission denied: {p}")

    for e in items:
        if not req.show_hidden and e.name.startswith('.'):
            continue
        if e.name in FS_IGNORE:
            continue
        meta = _entry_meta(e, p)
        if meta:
            entries.append(meta)

    parent = str(p.parent) if p.parent != p else None
    return {
        "path": str(p),
        "parent": parent,
        "entries": entries,
    }


@app.post("/files/read")
async def fs_read(req: FsReadReq):
    p = _expand(req.path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    size = p.stat().st_size
    if size > FS_MAX_READ_BYTES:
        return {
            "path": str(p),
            "content": "",
            "size": size,
            "too_large": True,
            "error": f"File too large ({size} bytes > {FS_MAX_READ_BYTES})",
        }

    ext = p.suffix.lstrip('.').lower()
    # Quick binary detection: read first 1024 bytes and check for null bytes
    try:
        with p.open('rb') as f:
            head = f.read(1024)
        if b'\x00' in head and ext not in FS_TEXT_EXT:
            return {"path": str(p), "content": "", "size": size, "binary": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        content = p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"path": str(p), "content": content, "size": size, "ext": ext}


@app.post("/files/write")
async def fs_write(req: FsWriteReq):
    p = _expand(req.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(req.content, encoding="utf-8")
    return {"path": str(p), "size": p.stat().st_size}


@app.post("/files/create")
async def fs_create(req: FsCreateReq):
    p = _expand(req.path)
    if p.exists():
        raise HTTPException(status_code=409, detail="Already exists")
    if req.is_dir:
        p.mkdir(parents=True)
    else:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch()
    return {"path": str(p), "is_dir": req.is_dir}


@app.post("/files/delete")
async def fs_delete(req: FsPathReq):
    p = _expand(req.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Not found")
    if p.is_dir():
        import shutil; shutil.rmtree(p)
    else:
        p.unlink()
    return {"deleted": str(p)}


@app.post("/files/rename")
async def fs_rename(req: FsRenameReq):
    src = _expand(req.old_path)
    dst = _expand(req.new_path)
    if not src.exists():
        raise HTTPException(status_code=404, detail="Source not found")
    if dst.exists():
        raise HTTPException(status_code=409, detail="Destination exists")
    src.rename(dst)
    return {"path": str(dst)}


# ══════════════════════════════════════════════════════════════════════════════
#  App settings — AI language (hinglish | english)
# ══════════════════════════════════════════════════════════════════════════════

class LanguageReq(BaseModel):
    language: str


@app.get("/settings")
async def get_settings():
    return {"language": ai_engine.get_language()}


@app.post("/settings/language")
async def set_language(req: LanguageReq):
    lang = ai_engine.set_language(req.language)
    return {"language": lang}
