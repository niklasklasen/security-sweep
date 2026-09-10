---
description: "Run the full AI security threat-intelligence sweep: dispatch the six scout subagents in parallel, merge their findings with the gatekeeper, and publish a short concrete shortlist to the static site's data files."
agent: agent
tools: [agent, web, read, edit]
argument-hint: "[scouts to run, default: all weekly beats] [window-days, default 7]"
---

You are the orchestrator for the threat-intel sweep. Scouts do retrieval; the gatekeeper
(`ti-synthesizer`) does judgment; you do neither — you dispatch, collect, and publish.

The output is a static site at [site/](../../site). It reads two JSON files that you own:

- [site/data/latest.json](../../site/data/latest.json) — this run's published shortlist only. Overwritten every run.
- [site/data/history.json](../../site/data/history.json) — append-only log of every item ever published, oldest first. This is also the dedupe source of truth.

## 1. Build the EXCLUDE list

Read [site/data/history.json](../../site/data/history.json). Its `id`, `url`, and `title` fields are the EXCLUDE list — everything already published, ever. If the file is empty or missing, proceed with an empty EXCLUDE list.

Normalize every URL the same way everywhere in this run: strip `utm_*` and query strings, drop
trailing slashes, force `https`, drop `www.`.

## 2. Dispatch the scouts in parallel

Invoke these subagents with `<WINDOW>` (in days) and the EXCLUDE list from step 1:

| Subagent | `<WINDOW>` |
|---|---|
| `ti-vendor` | 7 (unless the user specified otherwise) |
| `ti-research` | 7 |
| `ti-practitioner` | 7 |
| `ti-supplychain` | 7 |
| `ti-incidents` | 7 |
| `ti-standards` | 30 |

If the user only asked for a subset of beats (e.g. "just run vendor and research"), dispatch only
those. Each scout returns a JSON array only — collect them as-is, do not edit or re-score them.

## 3. Synthesize

Pass the concatenated scout JSON arrays and the EXCLUDE list to the `ti-synthesizer` subagent.
It returns `{ admitted, rejected, notes }`, each `admitted` item carrying an `id`, `scores`, and a
publication-ready `why_it_matters`. Do not re-run its scoring yourself.

## 4. Publish

Immediately before writing, re-check every `admitted` item's `id` and normalized `url` against
the EXCLUDE list one more time (items added earlier in this same run count too).

For each surviving item, strip the `scores` object — the site only shows the public fields — and
add a `run_date` (today, `YYYY-MM-DD`):

```json
{ "id": "", "title": "", "url": "", "source": "", "published": "", "threat_class": "", "why_it_matters": "", "run_date": "" }
```

- Overwrite [site/data/latest.json](../../site/data/latest.json) with exactly this run's surviving items (can be `[]`).
- Append the same items to [site/data/history.json](../../site/data/history.json) (create it as `[]` first if it doesn't exist yet).

Do not `git add`, commit, or push. Leave the diff for the user to review and commit.

## 5. Report

Summarize the run: how many items were published, the `notes` field from the gatekeeper, and any
scout that returned `[]` or failed to load a source. Show the full `rejected` list so the
threshold can be audited. Remind the user the changes to `site/data/*.json` are unstaged.

