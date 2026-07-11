"""Controlled parallel runtime for I&AI Code.

Fast rule:
- Code execution can run in a small parallel pool.
- Stress cases can run in a limited parallel pool.
- LLM calls are queued by default so one local model does not get overloaded.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Callable

CODE_RUN_WORKERS = int(os.getenv("CODE_RUN_WORKERS", "2"))
STRESS_RUN_WORKERS = int(os.getenv("STRESS_RUN_WORKERS", "3"))
LLM_WORKERS = int(os.getenv("LLM_WORKERS", "1"))

_code_semaphore = asyncio.Semaphore(max(1, CODE_RUN_WORKERS))
_stress_semaphore = asyncio.Semaphore(max(1, STRESS_RUN_WORKERS))
_llm_semaphore = asyncio.Semaphore(max(1, LLM_WORKERS))

async def code_task(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    async with _code_semaphore:
        return await asyncio.to_thread(fn, *args, **kwargs)

async def stress_task(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    async with _stress_semaphore:
        return await asyncio.to_thread(fn, *args, **kwargs)

async def llm_task(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    async with _llm_semaphore:
        return await asyncio.to_thread(fn, *args, **kwargs)

def status() -> dict[str, int]:
    return {
        "code_run_workers": max(1, CODE_RUN_WORKERS),
        "stress_run_workers": max(1, STRESS_RUN_WORKERS),
        "llm_workers": max(1, LLM_WORKERS),
    }
