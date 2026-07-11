"""Session context/memory manager for I&AI Code.

Keeps a small, TTL-evicted store of what happened this session (runs,
analyses, chat topics, design context) so AI calls can reuse recent
context — and stale context disappears on its own.

Design:
- Every entry has created_at / last_used_at; an entry expires when it
  hasn't been used for TTL_MINUTES (recall refreshes last_used_at).
- Hard caps: MAX_ENTRIES entries, MAX_CONTENT chars each — the store can
  never grow unbounded.
- Persisted to JSON so an app restart within the TTL window keeps context.
- sweep() runs on every operation; no background thread needed.
"""
from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any, Dict, List, Optional

TTL_MINUTES = int(os.getenv("SESSION_MEMORY_TTL_MINUTES", "30"))
MAX_ENTRIES = int(os.getenv("SESSION_MEMORY_MAX_ENTRIES", "40"))
MAX_CONTENT = 1200
_STORE_PATH = os.getenv("SESSION_MEMORY_PATH", "./.session_memory.json")

_entries: List[Dict[str, Any]] = []
_loaded = False


def _now() -> float:
    return time.time()


def _load() -> None:
    global _entries, _loaded
    if _loaded:
        return
    _loaded = True
    try:
        with open(_STORE_PATH) as f:
            data = json.load(f)
        if isinstance(data, list):
            _entries = [e for e in data if isinstance(e, dict) and "content" in e]
    except Exception:
        _entries = []
    sweep()


def _save() -> None:
    try:
        with open(_STORE_PATH, "w") as f:
            json.dump(_entries, f)
    except Exception:
        pass


def sweep() -> int:
    """Drop entries unused for TTL_MINUTES. Returns how many were removed."""
    _load()
    global _entries
    cutoff = _now() - TTL_MINUTES * 60
    before = len(_entries)
    _entries = [e for e in _entries if float(e.get("last_used_at", 0)) >= cutoff]
    # Enforce entry cap: drop least-recently-used first
    if len(_entries) > MAX_ENTRIES:
        _entries.sort(key=lambda e: float(e.get("last_used_at", 0)), reverse=True)
        _entries = _entries[:MAX_ENTRIES]
    removed = before - len(_entries)
    if removed:
        _save()
    return removed


def remember(kind: str, mode: str, content: str) -> Optional[str]:
    """Store a context entry. Returns its id (or None for empty content)."""
    _load()
    sweep()
    content = str(content or "").strip()[:MAX_CONTENT]
    if not content:
        return None
    # Dedupe: same kind+mode+content refreshes instead of duplicating
    for e in _entries:
        if e.get("kind") == kind and e.get("mode") == mode and e.get("content") == content:
            e["last_used_at"] = _now()
            e["uses"] = int(e.get("uses", 0)) + 1
            _save()
            return e["id"]
    entry = {
        "id": uuid.uuid4().hex[:10],
        "kind": kind,           # run | analysis | chat | design | note
        "mode": mode,           # DSA | System Design | Interview
        "content": content,
        "created_at": _now(),
        "last_used_at": _now(),
        "uses": 0,
    }
    _entries.append(entry)
    sweep()
    _save()
    return entry["id"]


def recall(mode: str = "", budget_chars: int = 1600, max_items: int = 5) -> str:
    """Return a compact context block of the most recent relevant entries.
    Touching an entry refreshes its TTL — actively used context stays alive."""
    _load()
    sweep()
    pool = [e for e in _entries if not mode or e.get("mode") == mode]
    pool.sort(key=lambda e: float(e.get("last_used_at", 0)), reverse=True)
    lines: List[str] = []
    used = 0
    for e in pool[:max_items]:
        line = f"[{e.get('kind', 'note')}] {e.get('content', '')}"
        if used + len(line) > budget_chars:
            break
        lines.append(line)
        used += len(line)
        e["last_used_at"] = _now()
        e["uses"] = int(e.get("uses", 0)) + 1
    if lines:
        _save()
        return "Recent session context (newest first):\n" + "\n".join(lines)
    return ""


def list_entries() -> List[Dict[str, Any]]:
    _load()
    sweep()
    now = _now()
    out = []
    for e in sorted(_entries, key=lambda x: float(x.get("last_used_at", 0)), reverse=True):
        age_min = (now - float(e.get("created_at", now))) / 60
        idle_min = (now - float(e.get("last_used_at", now))) / 60
        out.append({
            "id": e["id"],
            "kind": e.get("kind"),
            "mode": e.get("mode"),
            "preview": e.get("content", "")[:140],
            "age_minutes": round(age_min, 1),
            "idle_minutes": round(idle_min, 1),
            "expires_in_minutes": round(max(0.0, TTL_MINUTES - idle_min), 1),
            "uses": e.get("uses", 0),
        })
    return out


def remove(entry_id: str) -> bool:
    _load()
    global _entries
    before = len(_entries)
    _entries = [e for e in _entries if e.get("id") != entry_id]
    if len(_entries) != before:
        _save()
        return True
    return False


def clear() -> int:
    _load()
    global _entries
    n = len(_entries)
    _entries = []
    _save()
    return n


def stats() -> Dict[str, Any]:
    _load()
    sweep()
    return {
        "entries": len(_entries),
        "ttl_minutes": TTL_MINUTES,
        "max_entries": MAX_ENTRIES,
    }
