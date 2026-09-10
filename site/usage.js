const usageEl = document.getElementById("usage");
const metaEl = document.getElementById("usage-meta");

fetch("data/usage.json")
  .then((res) => res.json())
  .then(render)
  .catch(() => {
    usageEl.innerHTML =
      '<p class="empty">No usage data yet. Run <code>python3 tools/collect-usage.py</code> after a sweep.</p>';
  });

function render(runs) {
  if (!Array.isArray(runs) || !runs.length) {
    metaEl.textContent = "No runs recorded yet.";
    usageEl.innerHTML = '<p class="empty">Nothing to show yet.</p>';
    return;
  }

  const sorted = [...runs].sort((a, b) => key(b).localeCompare(key(a)));
  const allTokens = sum(sorted, total);
  metaEl.textContent = `${sorted.length} run${sorted.length === 1 ? "" : "s"} recorded · ${fmt(allTokens)} tokens all time · ${fmt(Math.round(allTokens / sorted.length))} per run.`;

  usageEl.innerHTML = headline(sorted[0]) + runList(sorted);
}

function headline(run) {
  const cached = run.cached_tokens ?? 0;
  const cacheRate = run.input_tokens ? Math.round((cached / run.input_tokens) * 100) : 0;
  return `
    <section class="card headline">
      <p class="muted">Most recent run &mdash; ${escapeHtml(runLabel(run))}</p>
      <p class="headline-total">${fmt(total(run))}<span class="muted"> tokens</span></p>
      <dl class="headline-split">
        <div><dt>Input</dt><dd>${fmt(run.input_tokens)}</dd></div>
        <div><dt>Output</dt><dd>${fmt(run.output_tokens)}</dd></div>
        <div><dt>Cache hits</dt><dd>${cacheRate}%</dd></div>
        <div><dt>Requests</dt><dd>${fmt(run.requests)}</dd></div>
      </dl>
    </section>`;
}

function runList(runs) {
  const max = Math.max(...runs.map(total), 1);

  return `
    <h2 class="section-title">Cost per run</h2>
    <div class="run-list">
      ${runs
        .map(
          (run, i) => `
      <details class="finding"${i === 0 ? " open" : ""}>
        <summary>
          <span class="finding-title">${escapeHtml(runLabel(run))}<span class="muted"> · ${(run.scouts ?? []).length} scouts</span></span>
          <span class="run-bar"><span class="run-bar-fill" style="width:${(total(run) / max) * 100}%"></span></span>
          <span class="run-total">${fmt(total(run))}<span class="muted"> / ${run.requests} req</span></span>
        </summary>
        <div class="finding-body">
          ${agentTable(run)}
        </div>
      </details>`
        )
        .join("")}
    </div>`;
}

function agentTable(run) {
  const agents = [...(run.agents ?? [])].sort((a, b) => total(b) - total(a));
  if (!agents.length) return '<p class="empty">No per-agent detail recorded.</p>';

  const runTotal = total(run) || 1;

  return `
    <table class="usage-table">
      <thead>
        <tr><th>Agent</th><th class="num">Req</th><th class="num">Input</th><th class="num">Output</th><th class="num">Total</th><th class="num">Share</th></tr>
      </thead>
      <tbody>
        ${agents
          .map(
            (a) => `
        <tr>
          <td>${escapeHtml(a.agent)}<br /><span class="muted">${escapeHtml(a.model)}</span></td>
          <td class="num">${fmt(a.requests)}</td>
          <td class="num">${fmt(a.input_tokens)}</td>
          <td class="num">${fmt(a.output_tokens)}</td>
          <td class="num">${fmt(total(a))}</td>
          <td class="num">${Math.round((total(a) / runTotal) * 100)}%</td>
        </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function total(row) {
  return (row.input_tokens ?? 0) + (row.output_tokens ?? 0);
}

function runLabel(run) {
  const started = run.run_started;
  if (!started) return run.run_date ?? "unknown";
  const [date, time] = started.split("T");
  return time ? `${date} ${time}` : date;
}

function key(run) {
  return `${run.run_started ?? run.run_date ?? ""}${run.run_id ?? ""}`;
}

function sum(items, pick) {
  return items.reduce((acc, item) => acc + (pick(item) ?? 0), 0);
}

function fmt(n) {
  return (n ?? 0).toLocaleString("en-US");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
