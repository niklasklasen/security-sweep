const listEl = document.getElementById("list");
const metaEl = document.getElementById("run-meta");

fetch("data/latest.json")
  .then((res) => res.json())
  .then(render)
  .catch(() => {
    listEl.innerHTML = '<p class="empty">Could not load data/latest.json.</p>';
  });

function render(items) {
  if (!items.length) {
    metaEl.textContent = "No items cleared the bar in the latest run.";
    listEl.innerHTML = '<p class="empty">Nothing to show yet.</p>';
    return;
  }

  const runDate = items[0].run_date ?? "";
  metaEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"} from the ${runDate} run.`;

  listEl.innerHTML = items
    .map(
      (item) => `
    <article class="card">
      <h2><a href="${item.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h2>
      <p>${escapeHtml(item.why_it_matters)}</p>
      <div class="tags">
        <span class="tag">${escapeHtml(item.threat_class)}</span>
        <span class="tag">${escapeHtml(item.source)}</span>
        ${item.published ? `<span class="tag">${item.published}</span>` : ""}
      </div>
    </article>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
