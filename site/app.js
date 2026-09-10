const listEl = document.getElementById("list");
const metaEl = document.getElementById("run-meta");

fetch("data/history.json")
  .then((res) => res.json())
  .then(render)
  .catch(() => {
    listEl.innerHTML = '<p class="empty">Could not load data/history.json.</p>';
  });

function render(items) {
  if (!Array.isArray(items) || !items.length) {
    metaEl.textContent = "Nothing published yet.";
    listEl.innerHTML = '<p class="empty">Nothing to show yet.</p>';
    return;
  }

  const sorted = [...items].sort(
    (a, b) => sortKey(b).localeCompare(sortKey(a)) || (a.title ?? "").localeCompare(b.title ?? "")
  );

  metaEl.textContent = `${sorted.length} finding${sorted.length === 1 ? "" : "s"}. Click a title for the TL;DR.`;

  listEl.innerHTML = sorted
    .map(
      (item) => `
    <details class="finding">
      <summary>
        <span class="finding-title">${escapeHtml(item.title)}</span>
        <span class="finding-meta">
          <span class="tag">${escapeHtml(item.threat_class)}</span>
          <span class="tag">${escapeHtml(item.source)}</span>
          <time>${escapeHtml(item.published ?? "date unknown")}</time>
        </span>
      </summary>
      <div class="finding-body">
        <p>${escapeHtml(item.why_it_matters)}</p>
        ${sourceLink(item.url)}
      </div>
    </details>`
    )
    .join("");
}

function sourceLink(url) {
  const safe = safeUrl(url);
  return safe
    ? `<a class="source-link" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">Read the source &rarr;</a>`
    : "";
}

// Data is agent-generated, so only let real web links through.
function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function sortKey(item) {
  return item.published ?? item.run_date ?? "";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
