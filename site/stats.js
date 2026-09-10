const statsEl = document.getElementById("stats");
const metaEl = document.getElementById("stats-meta");

fetch("data/history.json")
  .then((res) => res.json())
  .then(render)
  .catch(() => {
    statsEl.innerHTML = '<p class="empty">Could not load data/history.json.</p>';
  });

function render(items) {
  if (!Array.isArray(items) || !items.length) {
    metaEl.textContent = "No history recorded yet.";
    statsEl.innerHTML = '<p class="empty">Nothing to show yet.</p>';
    return;
  }

  const runs = new Set(items.map((i) => i.run_date).filter(Boolean));
  metaEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"} across ${runs.size} run${runs.size === 1 ? "" : "s"}.`;

  statsEl.innerHTML = [
    section("Threat class", count(items, (i) => i.threat_class), items.length),
    section("Source", count(items, (i) => i.source), items.length),
    section("Items per run", count(items, (i) => i.run_date), items.length),
  ].join("");
}

function count(items, pick) {
  const map = new Map();
  for (const item of items) {
    const key = pick(item) || "(unspecified)";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function section(title, rows, total) {
  const max = rows[0]?.[1] ?? 1;
  return `
    <section class="card">
      <h2>${escapeHtml(title)}</h2>
      <ul class="bars">
        ${rows
          .map(
            ([label, n]) => `
        <li>
          <span class="bar-label">${escapeHtml(label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(n / max) * 100}%"></span></span>
          <span class="bar-value">${n} <span class="muted">(${Math.round((n / total) * 100)}%)</span></span>
        </li>`
          )
          .join("")}
      </ul>
    </section>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
