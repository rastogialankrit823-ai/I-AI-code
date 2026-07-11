"""Optional internet retrieval helpers for I&AI Code.

Works best with TAVILY_API_KEY. Without it, uses DuckDuckGo Instant Answer as
a lightweight best-effort fallback. Keep this for local trusted use.
"""

from __future__ import annotations

import os
from typing import Dict, List

import requests

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")


def _tavily(query: str, max_results: int) -> List[Dict[str, str]]:
    if not TAVILY_API_KEY:
        return []
    resp = requests.post(
        "https://api.tavily.com/search",
        json={
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": max_results,
            "search_depth": "basic",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    out: List[Dict[str, str]] = []
    for item in data.get("results", [])[:max_results]:
        out.append({
            "title": item.get("title", ""),
            "url": item.get("url", ""),
            "content": item.get("content", ""),
        })
    return out


def _duckduckgo(query: str, max_results: int) -> List[Dict[str, str]]:
    resp = requests.get(
        "https://api.duckduckgo.com/",
        params={"q": query, "format": "json", "no_redirect": 1, "no_html": 1},
        timeout=12,
    )
    resp.raise_for_status()
    data = resp.json()
    out: List[Dict[str, str]] = []
    if data.get("AbstractText"):
        out.append({
            "title": data.get("Heading") or query,
            "url": data.get("AbstractURL", ""),
            "content": data.get("AbstractText", ""),
        })
    for topic in data.get("RelatedTopics", []):
        if len(out) >= max_results:
            break
        if isinstance(topic, dict) and topic.get("Text"):
            out.append({
                "title": topic.get("FirstURL", "Result"),
                "url": topic.get("FirstURL", ""),
                "content": topic.get("Text", ""),
            })
    return out[:max_results]


def search_web(query: str, max_results: int = 5) -> str:
    query = (query or "").strip()
    if not query:
        return ""
    results: List[Dict[str, str]] = []
    try:
        results = _tavily(query, max_results)
    except Exception:
        results = []
    if not results:
        try:
            results = _duckduckgo(query, max_results)
        except Exception as exc:
            return f"Internet search failed: {exc}"
    lines = []
    for i, r in enumerate(results[:max_results], 1):
        lines.append(
            f"[{i}] {r.get('title', 'Untitled')}\n"
            f"URL: {r.get('url', '')}\n"
            f"Summary: {r.get('content', '')[:600]}"
        )
    return "\n\n".join(lines)
