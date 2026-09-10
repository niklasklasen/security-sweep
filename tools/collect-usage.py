#!/usr/bin/env python3
"""Aggregate token usage per threat-sweep run into site/data/usage.json.

Copilot writes one JSONL debug log per subagent invocation under the
workspace's debug-logs folder; every `llm_request` event carries
input/output/cached token counts. Several sweeps can share a single chat
session, so runs are detected by clustering those call logs rather than by
session folder.

Rebuilds the whole file from the logs still on disk, then keeps any older
records whose logs have since been cleaned up.

Usage:
  python3 tools/collect-usage.py                  # rebuild from all sweep logs
  python3 tools/collect-usage.py --session <dir>  # one session folder only
  python3 tools/collect-usage.py --dry-run
"""

import argparse
import datetime as dt
import json
import pathlib

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
USAGE_FILE = REPO_ROOT / "site" / "data" / "usage.json"
LOG_GLOB = "*/GitHub.copilot-chat/debug-logs/*"
# A scout is never dispatched twice in one sweep, so a repeated agent name marks
# a new run; so does a long silence between subagent calls.
RUN_GAP_MS = 30 * 60 * 1000
# Orchestrator turns belong to a run when they bracket its subagent calls.
MAIN_LOG_MARGIN_MS = 10 * 60 * 1000


def candidate_roots():
    support = pathlib.Path.home() / "Library" / "Application Support"
    for app in ("Code", "Code - Insiders"):
        root = support / app / "User" / "workspaceStorage"
        if root.is_dir():
            yield root


def find_sessions(explicit):
    if explicit:
        session = pathlib.Path(explicit).expanduser().resolve()
        if not session.is_dir():
            raise SystemExit(f"No such session folder: {session}")
        return [session]

    found = [
        path
        for root in candidate_roots()
        for path in root.glob(LOG_GLOB)
        if path.is_dir() and any(path.glob("runSubagent-ti-*.jsonl"))
    ]
    return sorted(found, key=lambda p: p.name)


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


def subagent_logs(session):
    logs = []
    for path in sorted(session.glob("runSubagent-*.jsonl")):
        events = list(llm_requests(path))
        if not events:
            continue
        stamps = [event.get("ts", 0) for event in events]
        logs.append(
            {
                "agent": agent_name(path),
                "start": min(stamps),
                "end": max(stamps),
                "events": events,
                "main_events": [],
            }
        )
    logs.sort(key=lambda log: log["start"])
    return logs


def cluster_runs(logs):
    runs = []
    for log in logs:
        current = runs[-1] if runs else None
        starts_new_run = (
            current is None
            or log["agent"] in current["agents"]
            or log["start"] - current["end"] > RUN_GAP_MS
        )
        if starts_new_run:
            current = {
                "agents": set(),
                "logs": [],
                "main_events": [],
                "start": log["start"],
                "end": log["end"],
            }
            runs.append(current)
        current["agents"].add(log["agent"])
        current["logs"].append(log)
        current["end"] = max(current["end"], log["end"])
    return runs


def attach_orchestrator(session, runs):
    main_log = session / "main.jsonl"
    if not main_log.exists() or not runs:
        return

    for event in llm_requests(main_log):
        ts = event.get("ts", 0)
        best = None
        for run in runs:
            if run["start"] - MAIN_LOG_MARGIN_MS <= ts <= run["end"] + MAIN_LOG_MARGIN_MS:
                if best is None or abs(ts - run["start"]) < abs(ts - best["start"]):
                    best = run
        if best is not None:
            best["main_events"].append(event)


def summarize(session, run):
    rows = [(log["agent"], event) for log in run["logs"] for event in log["events"]]
    rows += [("orchestrator", event) for event in run["main_events"]]

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

    ordered = sorted(
        agents.values(), key=lambda a: a["input_tokens"] + a["output_tokens"], reverse=True
    )
    started = dt.datetime.fromtimestamp(run["start"] / 1000)

    return {
        "run_id": f"{session.name[:8]}-{started:%Y%m%dT%H%M}",
        "run_date": started.strftime("%Y-%m-%d"),
        "run_started": started.isoformat(timespec="minutes"),
        "session_id": session.name,
        "scouts": sorted(name for name in run["agents"] if name.startswith("ti-")),
        "requests": sum(a["requests"] for a in ordered),
        "input_tokens": sum(a["input_tokens"] for a in ordered),
        "output_tokens": sum(a["output_tokens"] for a in ordered),
        "cached_tokens": sum(a["cached_tokens"] for a in ordered),
        "agents": ordered,
    }


def collect(sessions):
    records = []
    for session in sessions:
        runs = cluster_runs(subagent_logs(session))
        attach_orchestrator(session, runs)
        records.extend(summarize(session, run) for run in runs)
    records.sort(key=lambda r: r["run_started"])
    return records


def load_existing():
    if not USAGE_FILE.exists():
        return []
    try:
        return json.loads(USAGE_FILE.read_text(encoding="utf-8")) or []
    except json.JSONDecodeError:
        return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", help="Path to a debug-logs session folder")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    args = parser.parse_args()

    sessions = find_sessions(args.session)
    if not sessions:
        print("No sweep session found in the local debug logs; leaving usage.json unchanged.")
        return

    records = collect(sessions)
    if not records:
        print("No llm_request events found; leaving usage.json unchanged.")
        return

    if args.dry_run:
        print(json.dumps(records, indent=2))
        return

    # Records without a run_id predate run clustering and are rebuilt from logs.
    rebuilt = {r["run_id"] for r in records}
    kept = [r for r in load_existing() if r.get("run_id") and r["run_id"] not in rebuilt]

    merged = sorted(kept + records, key=lambda r: r.get("run_started", r.get("run_date", "")))

    USAGE_FILE.parent.mkdir(parents=True, exist_ok=True)
    USAGE_FILE.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")

    print(f"{len(merged)} run(s) recorded -> {USAGE_FILE}")
    for record in merged:
        total = record["input_tokens"] + record["output_tokens"]
        print(f"  {record['run_started']}  {total:>10,} tokens  {record['requests']:>3} req  {len(record.get('scouts', []))} scouts")


if __name__ == "__main__":
    main()
