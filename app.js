const STORAGE_KEY = "market-timing-listings-v1";
const DAY = 86400000;
const today = new Date().toISOString().slice(0, 10);

const form = document.querySelector("#listing-form");
const table = document.querySelector("#listing-table");
const emptyState = document.querySelector("#empty-state");
const categoryGrid = document.querySelector("#category-grid");
const searchInput = document.querySelector("#search-input");
const filterSelect = document.querySelector("#filter-select");
const statusSelect = document.querySelector("#status-select");
const soldDateLabel = document.querySelector("#sold-date-label");
const toast = document.querySelector("#toast");
let listings = loadListings();

form.elements.listedAt.value = today;
statusSelect.addEventListener("change", () => {
  soldDateLabel.hidden = statusSelect.value !== "sold";
  form.elements.soldAt.required = statusSelect.value === "sold";
  if (statusSelect.value === "sold" && !form.elements.soldAt.value) form.elements.soldAt.value = today;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  listings.unshift({
    id: crypto.randomUUID(),
    title: values.title.trim(),
    category: values.category.trim(),
    price: Number(values.price),
    url: values.url.trim(),
    listedAt: values.listedAt,
    status: values.status,
    soldAt: values.status === "sold" ? values.soldAt : ""
  });
  persist();
  form.reset();
  form.elements.listedAt.value = today;
  soldDateLabel.hidden = true;
  render();
  showToast("Listing added");
});

searchInput.addEventListener("input", renderTable);
filterSelect.addEventListener("change", renderTable);
document.querySelector("#demo-button").addEventListener("click", () => {
  if (listings.length && !confirm("Replace your current listings with the demo data?")) return;
  listings = demoListings();
  persist();
  render();
  showToast("Demo listings loaded");
});
document.querySelector("#export-button").addEventListener("click", exportCsv);
document.querySelector("#import-input").addEventListener("change", importCsv);
document.querySelector("#share-button").addEventListener("click", shareApp);

function loadListings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

function daysBetween(start, end = today) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / DAY));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function benchmarkFor(listing) {
  const category = listing.category.toLowerCase();
  const similar = listings.filter((item) => item.category.toLowerCase() === category);
  const sold = similar.filter((item) => item.status === "sold" && item.soldAt);
  const soldAges = sold.map((item) => daysBetween(item.listedAt, item.soldAt));
  const categoryAverage = average(soldAges);
  const allSoldAges = listings.filter((item) => item.status === "sold" && item.soldAt).map((item) => daysBetween(item.listedAt, item.soldAt));
  const baselineDays = categoryAverage || average(allSoldAges) || 14;
  const soldPrices = sold.map((item) => item.price);
  const categoryPrices = similar.map((item) => item.price);
  const baselinePrice = median(soldPrices) || median(categoryPrices) || listing.price || 1;
  return { baselineDays, baselinePrice, soldCount: sold.length, trackedCount: similar.length };
}

function predict(listing) {
  if (listing.status === "sold") return { probability: 100, inferred: false, estimatedDays: daysBetween(listing.listedAt, listing.soldAt) };
  if (listing.status !== "active") return { probability: 0, inferred: false, estimatedDays: null };
  const age = daysBetween(listing.listedAt);
  const { baselineDays, baselinePrice, soldCount } = benchmarkFor(listing);
  const ageRatio = age / Math.max(baselineDays, 1);
  const priceRatio = listing.price / Math.max(baselinePrice, 1);
  const agePoints = Math.min(68, ageRatio * 34);
  const pricePoints = priceRatio <= 0.9 ? 23 : priceRatio <= 1.05 ? 15 : priceRatio <= 1.2 ? 5 : -10;
  const evidencePoints = Math.min(9, soldCount * 3);
  const probability = Math.round(Math.max(4, Math.min(96, 8 + agePoints + pricePoints + evidencePoints)));
  const inferred = probability >= 72 && ageRatio >= 1.25 && priceRatio <= 1.1;
  const priceAdjustment = Math.max(0.72, Math.min(1.35, priceRatio));
  return { probability, inferred, estimatedDays: inferred ? Math.min(age, Math.round(baselineDays * priceAdjustment)) : null };
}

function render() {
  renderMetrics();
  renderTable();
  renderCategories();
}

function renderMetrics() {
  const sold = listings.filter((item) => item.status === "sold" && item.soldAt);
  const observedDays = sold.map((item) => daysBetween(item.listedAt, item.soldAt));
  const inferred = listings.map((item) => ({ item, prediction: predict(item) })).filter(({ prediction }) => prediction.inferred);
  const adjustedDays = observedDays.concat(inferred.map(({ prediction }) => prediction.estimatedDays));
  setText("#observed-average", observedDays.length ? `${Math.round(average(observedDays))} days` : "–");
  setText("#observed-caption", observedDays.length ? `${sold.length} confirmed sale${sold.length === 1 ? "" : "s"}` : "Add a sold listing to begin");
  setText("#adjusted-average", adjustedDays.length ? `${Math.round(average(adjustedDays))} days` : "–");
  setText("#likely-count", inferred.length);
  setText("#tracked-count", listings.length);
  setText("#category-caption", `Across ${new Set(listings.map((item) => item.category.toLowerCase())).size} categories`);
}

function renderTable() {
  const query = searchInput.value.trim().toLowerCase();
  const filter = filterSelect.value;
  const visible = listings.filter((item) => {
    const prediction = predict(item);
    const displayStatus = prediction.inferred ? "likely" : item.status;
    return (!query || `${item.title} ${item.category}`.toLowerCase().includes(query)) && (filter === "all" || filter === displayStatus);
  });
  table.innerHTML = visible.map(rowHtml).join("");
  emptyState.hidden = visible.length > 0;
  table.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => {
    listings = listings.filter((item) => item.id !== button.dataset.delete);
    persist();
    render();
    showToast("Listing removed");
  }));
  table.querySelectorAll("[data-sold]").forEach((button) => button.addEventListener("click", () => {
    const listing = listings.find((item) => item.id === button.dataset.sold);
    listing.status = "sold";
    listing.soldAt = today;
    persist();
    render();
    showToast("Marked as sold today");
  }));
}

function rowHtml(item) {
  const prediction = predict(item);
  const age = daysBetween(item.listedAt, item.status === "sold" ? item.soldAt : today);
  const displayStatus = prediction.inferred ? "likely" : item.status;
  const statusLabel = displayStatus === "likely" ? "Likely sold" : displayStatus;
  const title = escapeHtml(item.title);
  const linkedTitle = item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${title} ↗</a>` : title;
  return `<tr>
    <td><div class="listing-title">${linkedTitle}</div><div class="listing-meta">${escapeHtml(item.category)} · listed ${escapeHtml(item.listedAt)}</div></td>
    <td>£${item.price.toFixed(2)}</td>
    <td>${age}d</td>
    <td><span class="status status-${displayStatus}">${statusLabel}</span></td>
    <td><div class="likelihood"><div class="likelihood-bar"><span style="width:${prediction.probability}%"></span></div>${prediction.probability}%</div></td>
    <td><div class="row-actions">${item.status === "active" ? `<button data-sold="${item.id}" title="Mark sold">✓</button>` : ""}<button data-delete="${item.id}" title="Delete listing">×</button></div></td>
  </tr>`;
}

function renderCategories() {
  const names = [...new Set(listings.map((item) => item.category))];
  categoryGrid.innerHTML = names.map((category) => {
    const items = listings.filter((item) => item.category.toLowerCase() === category.toLowerCase());
    const sold = items.filter((item) => item.status === "sold" && item.soldAt);
    const avg = average(sold.map((item) => daysBetween(item.listedAt, item.soldAt)));
    const likely = items.filter((item) => predict(item).inferred).length;
    return `<article class="category-card"><h3>${escapeHtml(category)}</h3><div class="category-stat"><strong>${avg ? `${Math.round(avg)} days` : "–"}</strong><span>${sold.length} confirmed</span></div><p>${items.length} tracked · ${likely} likely sold</p></article>`;
  }).join("") || `<p class="listing-meta">Category benchmarks appear after you add listings.</p>`;
}

function exportCsv() {
  const headers = ["title", "category", "price", "url", "listedAt", "status", "soldAt"];
  const csv = [headers, ...listings.map((item) => headers.map((key) => item[key] ?? ""))]
    .map((row) => row.map(csvCell).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "market-timing-listings.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("CSV exported");
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(reader.result);
    const headers = rows.shift();
    listings = rows.filter((row) => row.length >= 6).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]))).map((item) => ({
      ...item, id: crypto.randomUUID(), price: Number(item.price), status: item.status || "active"
    }));
    persist();
    render();
    showToast(`${listings.length} listings imported`);
  };
  reader.readAsText(file);
  event.target.value = "";
}

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some(Boolean)) rows.push(row);
  return rows;
}

async function shareApp() {
  const data = { title: "Market Timing", text: "Analyze Marketplace listing times locally.", url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(location.href); showToast("Analyzer link copied"); }
  } catch (error) {
    if (error.name !== "AbortError") showToast("Could not share the link");
  }
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}
function setText(selector, value) { document.querySelector(selector).textContent = value; }
function showToast(message) {
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove("show"), 1800);
}
function offsetDate(days) { return new Date(Date.now() - days * DAY).toISOString().slice(0, 10); }
function demoListings() {
  return [
    ["Oak dining table", "Furniture", 85, 18, "sold", 7],
    ["IKEA desk", "Furniture", 42, 33, "active"],
    ["Velvet armchair", "Furniture", 55, 28, "sold", 12],
    ["Nintendo Switch Lite", "Electronics", 95, 16, "sold", 5],
    ["Samsung 32 inch TV", "Electronics", 70, 31, "active"],
    ["Road bike", "Bikes", 130, 25, "sold", 14],
    ["Hybrid commuter bike", "Bikes", 90, 39, "active"],
    ["Coffee machine", "Appliances", 35, 10, "active"]
  ].map(([title, category, price, age, status, saleAge]) => ({
    id: crypto.randomUUID(), title, category, price, url: "", listedAt: offsetDate(age), status, soldAt: saleAge ? offsetDate(age - saleAge) : ""
  }));
}

render();
