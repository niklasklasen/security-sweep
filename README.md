# security-sweep

An AI security threat-intelligence sweep run by a team of GitHub Copilot custom agents. Six
read-only scouts cover non-overlapping source beats in parallel; a gatekeeper dedupes and
scores what they return; the `/threat-sweep` orchestrator prompt dispatches all of it and
publishes the survivors as a short, concrete list on a static site.

Created 2026-09-10.

## The team

| File | Beat | Cadence | Model |
|---|---|---|---|
| `.github/agents/ti-vendor.agent.md` | Cloud/vendor advisories — MSRC, Azure AI Foundry, Azure OpenAI, Defender for Cloud AI, Bedrock, Vertex | Weekly | Claude Sonnet 4.5 |
| `.github/agents/ti-research.agent.md` | arXiv `cs.CR`/`cs.LG` — injection, jailbreak, RAG poisoning, agent attacks | Weekly | Claude Sonnet 4.5 |
| `.github/agents/ti-practitioner.agent.md` | Security-research blogs — Lakera, Embrace The Red, HiddenLayer, NVIDIA AI Red Team | Weekly | Claude Sonnet 4.5 |
| `.github/agents/ti-supplychain.agent.md` | Model artifacts, poisoned packages, CVEs in the LLM tooling stack, MCP servers | Weekly | Claude Sonnet 4.5 |
| `.github/agents/ti-incidents.agent.md` | Real-world AI security incidents and production failures | Weekly | Claude Sonnet 4.5 |
| `.github/agents/ti-standards.agent.md` | OWASP, MITRE ATLAS, NIST AI RMF, EU AI Act, ISO 42001 | Monthly | Claude Sonnet 4.5 |
| `.github/agents/ti-synthesizer.agent.md` | Gatekeeper — cross-agent dedupe, rubric scoring, ranking | Per run | Claude Opus 4.5 (falls back to Sonnet 4.5) |
| `.github/prompts/threat-sweep.prompt.md` | Orchestrator — dispatches scouts, hands off to the gatekeeper, publishes to `site/data/` | Per run | inherits from chat |

Scouts do retrieval; the gatekeeper does judgment. That split is why the scouts run on a
cheaper model and why their scores get re-derived rather than trusted.

## The static site

[`site/`](./site) is a dependency-free static page: `index.html` + `app.js` fetch
[`site/data/latest.json`](./site/data/latest.json) and render it as a list of cards. Deploy the
`site/` folder as-is to Azure Static Web Apps, GitHub Pages, or any static host — no build step.

- `site/data/latest.json` — this run's published shortlist only, overwritten every run.
- `site/data/history.json` — append-only log of every item ever published. This is also the
  dedupe source of truth across runs (see below).

The orchestrator writes both files locally; it never commits or pushes. Review the diff and
commit it yourself so CI can deploy.

## Why scouts never write anything

Six agents writing concurrently would duplicate entries within two runs — two scouts find the
same story under different URLs, and neither can see what the other just found. So scouts
return JSON only. Dedupe happens in three passes:

1. **Pre-filter** — the orchestrator reads `site/data/history.json` once and passes the
   URL/title EXCLUDE set into every scout prompt, so they self-reject before returning anything.
2. **Cross-agent** — the gatekeeper merges the same story arriving on different beats,
   keeping the primary source.
3. **Pre-publish** — the orchestrator re-checks each item immediately before writing, including
   against items added earlier in the same run.

URL normalization is the same everywhere: strip `utm_*` and query strings, drop trailing
slashes, force `https`, drop `www.`.

## The admission rubric

```
NOVEL      — new technique, first-of-kind incident, real version change
ACTIONABLE — changes something Niklas would build, configure, advise, or say
CREDIBLE   — primary source, named researcher, established vendor, assigned CVE
DISTINCT   — not conceptually covered by an already-published item

Admit total >= 6 with novel >= 1. Cap 7 items per run.
```

An empty run is a valid result. The threshold exists because finding AI security content is
trivial and the real failure mode is a public page full of "What is prompt injection?"
explainers.

## Prompt variables

Both are injected by the orchestrator at spawn time:

- `<WINDOW>` — lookback in days. 7 for weekly scouts, 30 for `ti-standards`.
- **EXCLUDE list** — previously published items (`id` + URL + title, from `site/data/history.json`) to self-reject against.

## Installing

Agent and prompt definitions live in the workspace under `.github/`, so GitHub Copilot in VS
Code picks them up automatically — no copy step needed:

```
.github/agents/ti-vendor.agent.md
.github/agents/ti-research.agent.md
.github/agents/ti-practitioner.agent.md
.github/agents/ti-supplychain.agent.md
.github/agents/ti-incidents.agent.md
.github/agents/ti-standards.agent.md
.github/agents/ti-synthesizer.agent.md
.github/prompts/threat-sweep.prompt.md
```

Run the whole sweep by typing `/threat-sweep` in Copilot Chat. To run a single beat for
testing, select the scout's agent directly from the agent picker, or invoke it as a subagent
from another custom agent.

After a run, review the diff in `site/data/latest.json` and `site/data/history.json`, then
commit and push — CI/your static host takes it from there.

## Suggested starting set

Run `ti-vendor`, `ti-research`, `ti-practitioner`, and `ti-supplychain` first. Add
`ti-incidents` and `ti-standards` once dedupe is proven against a populated `site/data/history.json`.
