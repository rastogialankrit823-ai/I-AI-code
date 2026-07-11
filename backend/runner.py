"""Multi-language build/run helper for I&AI Code.

Supports sandboxed execution through Docker when available.
RUNNER_MODE:
  - docker (default): require Docker sandbox
  - auto: try Docker sandbox, fallback to local runner
  - local: local subprocess only, for private/dev use

Languages:
  - C++: cpp, c++
  - Python: python, py
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict

RUNNER_MODE = os.getenv("RUNNER_MODE", "docker").lower()
SANDBOX_IMAGE_CPP = os.getenv("SANDBOX_IMAGE_CPP", os.getenv("SANDBOX_IMAGE", "gcc:13"))
SANDBOX_IMAGE_PYTHON = os.getenv("SANDBOX_IMAGE_PYTHON", "python:3.11-slim")
COMPILE_TIMEOUT = int(os.getenv("COMPILE_TIMEOUT_SECONDS", "12"))
RUN_TIMEOUT = int(os.getenv("RUN_TIMEOUT_SECONDS", "2"))


def normalize_language(language: str = "cpp") -> str:
    lang = (language or "cpp").lower().strip()
    if lang in {"cpp", "c++", "cc", "cxx"}:
        return "cpp"
    if lang in {"python", "py", "python3"}:
        return "python"
    return lang


def _local_execute_cpp(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    with tempfile.TemporaryDirectory(prefix="i-and-ai-code-local-cpp-") as tmpdir:
        tmp_path = Path(tmpdir)
        cpp_file = tmp_path / "main.cpp"
        exe_file = tmp_path / ("main.exe" if platform.system() == "Windows" else "main.out")
        cpp_file.write_text(code, encoding="utf-8")
        compile_cmd = ["g++", str(cpp_file), "-std=c++17", "-O2", "-Wall", "-Wextra", "-o", str(exe_file)]
        try:
            compile_proc = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=COMPILE_TIMEOUT)
        except FileNotFoundError:
            return {"success": False, "output": "", "error": "g++ was not found. Install g++/MinGW and make sure it is available in PATH."}
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Compilation timed out after {COMPILE_TIMEOUT} seconds."}
        if compile_proc.returncode != 0:
            return {"success": False, "output": compile_proc.stdout, "error": compile_proc.stderr}
        try:
            run_proc = subprocess.run([str(exe_file)], input=stdin, capture_output=True, text=True, timeout=timeout_seconds, cwd=str(tmp_path))
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Time Limit Exceeded: program took more than {timeout_seconds} seconds."}
        if run_proc.returncode != 0:
            return {"success": False, "output": run_proc.stdout, "error": run_proc.stderr or f"Program exited with code {run_proc.returncode}"}
        return {"success": True, "output": run_proc.stdout, "error": ""}


def _local_execute_python(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    with tempfile.TemporaryDirectory(prefix="i-and-ai-code-local-python-") as tmpdir:
        tmp_path = Path(tmpdir)
        py_file = tmp_path / "main.py"
        py_file.write_text(code, encoding="utf-8")
        python_bin = shutil.which("python3") or shutil.which("python") or sys.executable
        try:
            run_proc = subprocess.run(
                [python_bin, str(py_file)],
                input=stdin,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                cwd=str(tmp_path),
            )
        except FileNotFoundError:
            return {"success": False, "output": "", "error": "Python was not found. Install Python 3 and make sure it is available in PATH."}
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Time Limit Exceeded: program took more than {timeout_seconds} seconds."}
        if run_proc.returncode != 0:
            return {"success": False, "output": run_proc.stdout, "error": run_proc.stderr or f"Program exited with code {run_proc.returncode}"}
        return {"success": True, "output": run_proc.stdout, "error": ""}


def _docker_available() -> bool:
    if not shutil.which("docker"):
        return False
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _docker_base(tmp_path: Path, image: str, memory: str = "256m") -> list[str]:
    volume = f"{tmp_path}:/work"
    return [
        "docker", "run", "--rm", "--network", "none", "--cpus", "1", "--memory", memory,
        "-v", volume, "-w", "/work", image,
    ]


def _docker_execute_cpp(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    if not _docker_available():
        return {"success": False, "output": "", "error": "Docker not found. Install Docker or set RUNNER_MODE=local for private dev use."}
    with tempfile.TemporaryDirectory(prefix="i-and-ai-code-sandbox-cpp-") as tmpdir:
        tmp_path = Path(tmpdir)
        (tmp_path / "main.cpp").write_text(code, encoding="utf-8")
        base = _docker_base(tmp_path, SANDBOX_IMAGE_CPP, memory=os.getenv("SANDBOX_MEMORY_CPP", "256m"))
        compile_cmd = base + ["bash", "-lc", "g++ main.cpp -std=c++17 -O2 -Wall -Wextra -o main.out"]
        try:
            compile_proc = subprocess.run(compile_cmd, capture_output=True, text=True, timeout=COMPILE_TIMEOUT + 8)
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Sandbox compilation timed out after {COMPILE_TIMEOUT} seconds."}
        if compile_proc.returncode != 0:
            return {"success": False, "output": compile_proc.stdout, "error": compile_proc.stderr}
        run_cmd = base + ["bash", "-lc", f"timeout {timeout_seconds}s ./main.out"]
        try:
            run_proc = subprocess.run(run_cmd, input=stdin, capture_output=True, text=True, timeout=timeout_seconds + 5)
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Time Limit Exceeded: sandbox took more than {timeout_seconds} seconds."}
        if run_proc.returncode == 124:
            return {"success": False, "output": run_proc.stdout, "error": f"Time Limit Exceeded: program took more than {timeout_seconds} seconds."}
        if run_proc.returncode != 0:
            return {"success": False, "output": run_proc.stdout, "error": run_proc.stderr or f"Program exited with code {run_proc.returncode}"}
        return {"success": True, "output": run_proc.stdout, "error": ""}


def _docker_execute_python(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    if not _docker_available():
        return {"success": False, "output": "", "error": "Docker not found. Install Docker or set RUNNER_MODE=local for private dev use."}
    with tempfile.TemporaryDirectory(prefix="i-and-ai-code-sandbox-python-") as tmpdir:
        tmp_path = Path(tmpdir)
        (tmp_path / "main.py").write_text(code, encoding="utf-8")
        base = _docker_base(tmp_path, SANDBOX_IMAGE_PYTHON, memory=os.getenv("SANDBOX_MEMORY_PYTHON", "256m"))
        run_cmd = base + ["bash", "-lc", f"timeout {timeout_seconds}s python3 main.py"]
        try:
            run_proc = subprocess.run(run_cmd, input=stdin, capture_output=True, text=True, timeout=timeout_seconds + 5)
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Time Limit Exceeded: sandbox took more than {timeout_seconds} seconds."}
        if run_proc.returncode == 124:
            return {"success": False, "output": run_proc.stdout, "error": f"Time Limit Exceeded: program took more than {timeout_seconds} seconds."}
        if run_proc.returncode != 0:
            return {"success": False, "output": run_proc.stdout, "error": run_proc.stderr or f"Program exited with code {run_proc.returncode}"}
        return {"success": True, "output": run_proc.stdout, "error": ""}


def _local_execute(language: str, code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    lang = normalize_language(language)
    if lang == "cpp":
        return _local_execute_cpp(code, stdin, timeout_seconds)
    if lang == "python":
        return _local_execute_python(code, stdin, timeout_seconds)
    return {"success": False, "output": "", "error": f"Unsupported language for runner: {language}"}


def _docker_execute(language: str, code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    lang = normalize_language(language)
    if lang == "cpp":
        return _docker_execute_cpp(code, stdin, timeout_seconds)
    if lang == "python":
        return _docker_execute_python(code, stdin, timeout_seconds)
    return {"success": False, "output": "", "error": f"Unsupported language for runner: {language}"}


def execute_code(language: str, code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    lang = normalize_language(language)
    if lang not in {"cpp", "python"}:
        return {"success": False, "output": "", "error": f"Unsupported language for runner: {language}", "runner": "none", "language": lang}
    if RUNNER_MODE == "docker":
        result = _docker_execute(lang, code, stdin, timeout_seconds)
        result["runner"] = "docker"
        result["language"] = lang
        return result
    if RUNNER_MODE == "local":
        result = _local_execute(lang, code, stdin, timeout_seconds)
        result["runner"] = "local"
        result["language"] = lang
        return result
    # auto: use sandbox if Docker is available, otherwise private local fallback.
    if _docker_available():
        result = _docker_execute(lang, code, stdin, timeout_seconds)
        result["runner"] = "docker"
        result["language"] = lang
        if result["success"] or "Docker not found" not in str(result.get("error", "")):
            return result
    result = _local_execute(lang, code, stdin, timeout_seconds)
    result["runner"] = "local"
    result["language"] = lang
    return result


def execute_cpp(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    """Backward-compatible wrapper for old call sites."""
    return execute_code("cpp", code, stdin, timeout_seconds)


def execute_python(code: str, stdin: str = "", timeout_seconds: int = RUN_TIMEOUT) -> Dict[str, str | bool]:
    return execute_code("python", code, stdin, timeout_seconds)
