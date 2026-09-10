#!/usr/bin/env python3
"""Aggregate token usage for a threat-sweep run into site/data/usage.json.

Copilot writes one JSONL debug log per subagent under the workspace's
debug-logs folder; every `llm_request` event carries input/output/cached token
counts. This walks the most recent sweep session and rolls those up per agent.

Usage:
  python3 tools/collect-usage.py                  # newest sweep session
  python3 tools/collect-usage.py --session <dir>  # a specific session folder
  python3 tools/collect-usage.py --dry-run
"""

import argparse
import datetime as dt
import json
import pathlib
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
USAGE_FILE = REPO_ROOT / "site" / "data" / "usage.json"
LOG_GLOB = "*/GitHub.copilot-chat/debug-logs/*"
# Orchestrator requests count toward the run only if they bracket the scouts.
MAIN_LOG_MARGIN_MS = 10 * 60 * 1000


def candidate_roots():
    support = pathlib.Path.home() / "Library" / "Application Support"
    for app in ("Code", "Code - Insiders"):
        root = support / app / "User" / "workspaceStorage"
        if root.is_dir():
            yield root


def find_session(explicit):
    if explicit:
        session = pathlib.Path(explicit).expanduser().resolve()
        if not session.is_dir():
            sys.exit(f"No such session folder: {session}")
        return session

    sessions = [
        path
        for root in candidate_roots()
        for path in root.glob(LOG_GLOB)
        if path.is_dir() and any(path.glob("runSubagent-ti-*.jsonl"))
    ]
    if not sessions:
        return None
    return max(sessions, key=lambda p: p.stat().st_mtime)


def llm_requests(path):
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "llm_request":
            yield event


def agent_name(path):
    stem = path.stem
    if stem == "main":
        return "orchestrator"
    if stem.startswith("runSubagent-"):
        return stem[len("runSubagent-") :].rsplit("-call_", 1)[0]
    return stem


def collect(session):
    rows = []
    scout_window = []

    for path in sorted(session.glob("*.jsonl")):
        if path.stem == "main":
            continue
        for event in llm_requests(path):
            rows.append((agent_name(path), event))
            scout_window.append(event.get("ts", 0))

    main_log = session / "main.jsonl"
    if main_log.exists() and scout_window:
        low = min(scout_window) - MAIN_LOG_MARGIN_MS
        high = max(scout_window) + MAIN_LOG_MARGIN_MS
        for event in llm_requests(main_log):
            if low <= event.get("ts", 0) <= high:
                rows.append(("orchestrator", event))

    if not rows:
        sys.exit(f"No llm_request events in {session}")

    agents = {}
    for name, event in rows:
        attrs = event.get("attrs", {})
        key = (name, attrs.get("model", "unknown"))
        bucket = agents.setdefault(
            key,
            {
                "agent": name,
                "model": attrs.get("model", "unknown"),
                "requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cached_tokens": 0,
            },
        )
        bucket["requests"] += 1
        bucket["input_tokens"] += attrs.get("inputTokens", 0) or 0
        bucket["output_tokens"] += attrs.get("outputTokens", 0) or 0
        bucket["cached_tokens"] += attrs.get("cachedTokens", 0) or 0

    ordered = sorted(agents.values(), key=lambda a: a["input_tokens"] + a["output_tokens"], reverse=True)
    first_ts = min(event.get("ts", 0) for _, event in rows) / 1000

    return {
        "run_date": dt.datetime.fromtimestamp(first_ts).strftime("%Y-%m-%d"),
        "session_id": session.name,
        "requests": sum(a["requests"] for a in ordered),
        "input_tokens": sum(a["input_tokens"] for a in ordered),
        "output_tokens": sum(a["output_tokens"] for a in ordered),
        "cached_tokens": sum(a["cached_tokens"] for a in ordered),
        "agents": ordered,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", help="Path to a debug-logs session folder")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    args = parser.parse_args()

    session = find_session(args.session)
    if session is None:
        print("No sweep session found in the local debug logs; leaving usage.json unchanged.")
        return
    record = collect(session)

    if args.dry_run:
        print(json.dumps(record, indent=2))
        return

    history = []
    if USAGE_FILE.exists():
        try:
            history = json.loads(USAGE_FILE.read_text(encoding="utf-8")) or []
        except json.JSONDecodeError:
            history = []

    history = [r for r in history if r.get("session_id") != record["session_id"]]
    history.append(record)
    history.sort(key=lambda r: (r.get("run_date", ""), r.get("session_id", "")))

    USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    USAGE_FILE.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")

    total = record["input_tokens"] + record["output_tokens"]
    print(f"{session.name}: {total:,} tokens over {record['requests']} requests -> {USAGE_FILE}")


if __name__ == "__main__":
    main()
