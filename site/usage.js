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

  const totalIn = sum(runs, (r) => r.input_tokens);
  const totalOut = sum(runs, (r) => r.output_tokens);
  metaEl.textContent = `${runs.length} run${runs.length === 1 ? "" : "s"} · ${fmt(totalIn + totalOut)} tokens total · ${fmt(Math.round((totalIn + totalOut) / runs.length))} per run on average.`;

  const latest = runs[runs.length - 1];

  usageEl.innerHTML = `
    ${summaryCards(latest)}
    ${perRunChart(runs)}
    ${perAgentChart(latest)}
  `;
}

function summaryCards(run) {
  const cached = run.cached_tokens ?? 0;
  const cacheRate = run.input_tokens ? Math.round((cached / run.input_tokens) * 100) : 0;
  return `
    <h2 class="section-title">Latest run &mdash; ${escapeHtml(run.run_date)}</h2>
    <div class="stat-grid">
      ${stat("Input", fmt(run.input_tokens))}
      ${stat("Output", fmt(run.output_tokens))}
      ${stat("Cached input", `${fmt(cached)} <span class="muted">(${cacheRate}%)</span>`)}
      ${stat("LLM requests", fmt(run.requests))}
    </div>`;
}

function stat(label, value) {
  return `<div class="card stat"><span class="muted">${label}</span><strong>${value}</strong></div>`;
}

function perRunChart(runs) {
  const max = Math.max(...runs.map((r) => r.input_tokens + r.output_tokens), 1);
  return `
    <h2 class="section-title">Tokens per run</h2>
    <section class="card">
      <ul class="bars">
        ${runs
          .map((run) => {
            const total = run.input_tokens + run.output_tokens;
            return `
        <li>
          <span class="bar-label">${escapeHtml(run.run_date)}</span>
          <span class="bar-track" title="input ${fmt(run.input_tokens)} / output ${fmt(run.output_tokens)}">
            <span class="bar-fill" style="width:${(run.input_tokens / max) * 100}%"></span><span class="bar-fill out" style="width:${(run.output_tokens / max) * 100}%"></span>
          </span>
          <span class="bar-value">${fmt(total)}</span>
        </li>`;
          })
          .join("")}
      </ul>
      <p class="legend"><span class="swatch"></span>input <span class="swatch out"></span>output</p>
    </section>`;
}

function perAgentChart(run) {
  const agents = [...(run.agents ?? [])].sort(
    (a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens)
  );
  if (!agents.length) return "";
  const max = agents[0].input_tokens + agents[0].output_tokens || 1;

  return `
    <h2 class="section-title">By agent &mdash; latest run</h2>
    <section class="card">
      <ul class="bars">
        ${agents
          .map((a) => {
            const total = a.input_tokens + a.output_tokens;
            return `
        <li>
          <span class="bar-label">${escapeHtml(a.agent)}<br /><span class="muted">${escapeHtml(a.model)} · ${a.requests} req</span></span>
          <span class="bar-track" title="input ${fmt(a.input_tokens)} / output ${fmt(a.output_tokens)}">
            <span class="bar-fill" style="width:${(a.input_tokens / max) * 100}%"></span><span class="bar-fill out" style="width:${(a.output_tokens / max) * 100}%"></span>
          </span>
          <span class="bar-value">${fmt(total)}</span>
        </li>`;
          })
          .join("")}
      </ul>
      <p class="legend"><span class="swatch"></span>input <span class="swatch out"></span>output</p>
    </section>`;
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
