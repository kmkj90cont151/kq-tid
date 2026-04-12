const state = {
  manifest: null,
  activeNetworkId: "",
  networkCache: {},
  networkErrors: {},
  detailCache: {},
  detailLoading: {},
  openDetailKeys: {},
  search: "",
  flaggedOnly: false,
  showRaw: true,
  loadingManifest: false,
  loadingNetworkId: "",
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  elements.refreshButton = document.getElementById("refreshButton");
  elements.searchInput = document.getElementById("searchInput");
  elements.flaggedOnlyToggle = document.getElementById("flaggedOnlyToggle");
  elements.showRawToggle = document.getElementById("showRawToggle");
  elements.buildTimestamp = document.getElementById("buildTimestamp");
  elements.buildVersion = document.getElementById("buildVersion");
  elements.tabBar = document.getElementById("tabBar");
  elements.statusBar = document.getElementById("statusBar");
  elements.networkMeta = document.getElementById("networkMeta");
  elements.listings = document.getElementById("listings");

  elements.refreshButton.addEventListener("click", () => refreshAll());
  elements.searchInput.addEventListener("input", (event) => {
    state.search = String(event.target.value || "").trim().toLowerCase();
    render();
  });
  elements.flaggedOnlyToggle.addEventListener("change", (event) => {
    state.flaggedOnly = Boolean(event.target.checked);
    render();
  });
  elements.showRawToggle.addEventListener("change", (event) => {
    state.showRaw = Boolean(event.target.checked);
    render();
  });

  loadManifest().catch((error) => {
    renderFatal(error);
  });
});

async function fetchJson(path, bust = false) {
  const url = new URL(path, window.location.href);
  if (bust) {
    url.searchParams.set("_", String(Date.now()));
  }
  const response = await fetch(url.toString(), { cache: bust ? "reload" : "default" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url.pathname}`);
  }
  return response.json();
}

async function loadManifest(refresh = false) {
  state.loadingManifest = true;
  render();
  try {
    const manifest = await fetchJson("data/manifest.json", refresh);
    state.manifest = manifest;
    const firstNetworkId = manifest.networks && manifest.networks.length > 0 ? manifest.networks[0].id : "";
    if (!state.activeNetworkId || !manifest.networks.some((network) => network.id === state.activeNetworkId)) {
      state.activeNetworkId = firstNetworkId;
    }
    if (state.activeNetworkId) {
      await loadNetwork(state.activeNetworkId, refresh);
    }
  } finally {
    state.loadingManifest = false;
    render();
  }
}

async function loadNetwork(networkId, refresh = false) {
  if (!networkId) {
    return;
  }
  if (!refresh && state.networkCache[networkId]) {
    render();
    return;
  }

  const entry = getManifestNetwork(networkId);
  if (!entry) {
    return;
  }

  state.loadingNetworkId = networkId;
  delete state.networkErrors[networkId];
  render();

  try {
    state.networkCache[networkId] = await fetchJson(entry.dataUrl, refresh);
  } catch (error) {
    state.networkErrors[networkId] = String(error);
  } finally {
    state.loadingNetworkId = "";
    render();
  }
}

async function refreshAll() {
  state.networkCache = {};
  state.networkErrors = {};
  state.detailCache = {};
  state.detailLoading = {};
  state.openDetailKeys = {};
  await loadManifest(true);
}

function getManifestNetwork(networkId) {
  const networks = state.manifest && Array.isArray(state.manifest.networks) ? state.manifest.networks : [];
  return networks.find((entry) => entry.id === networkId) || null;
}

function getActiveNetwork() {
  return state.activeNetworkId ? state.networkCache[state.activeNetworkId] || null : null;
}

function getVisibleTrains() {
  const network = getActiveNetwork();
  const trains = network && Array.isArray(network.trains) ? network.trains : [];
  return trains.filter((train) => {
    if (state.flaggedOnly && !train.researchCandidate) {
      return false;
    }
    if (!state.search) {
      return true;
    }
    const haystack = [
      train.trainNumber,
      train.lineLabel,
      train.locationLabel,
      train.serviceTypeLabel,
      train.directionLabel,
      train.originLabel,
      train.destinationLabel,
      train.ownerLabel,
      train.note,
      train.positionCode,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });
}

function render() {
  renderHeroMeta();
  renderTabs();
  renderStatus();
  renderMetaPanel();
  renderListings();
}

function renderHeroMeta() {
  elements.buildTimestamp.textContent = `ビルド時刻: ${formatTimestamp(state.manifest && state.manifest.buildTimestamp)}`;
  elements.buildVersion.textContent = `バージョン ${escapeText(state.manifest && state.manifest.appVersion || "-")}`;
}

function renderTabs() {
  const networks = state.manifest && Array.isArray(state.manifest.networks) ? state.manifest.networks : [];
  if (networks.length === 0) {
    elements.tabBar.innerHTML = "";
    return;
  }

  elements.tabBar.innerHTML = networks
    .map((network) => {
      const activeClass = network.id === state.activeNetworkId ? " is-active" : "";
      const count = state.networkCache[network.id] && Array.isArray(state.networkCache[network.id].trains)
        ? ` ${state.networkCache[network.id].trains.length}本`
        : "";
      return `<button class="tab-button${activeClass}" type="button" data-network-id="${escapeHtml(network.id)}">${escapeHtml(network.label)}${escapeHtml(count)}</button>`;
    })
    .join("");

  elements.tabBar.querySelectorAll("[data-network-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const networkId = button.dataset.networkId || "";
      state.activeNetworkId = networkId;
      render();
      await loadNetwork(networkId, false);
    });
  });
}

function renderStatus() {
  const network = getActiveNetwork();
  const visibleTrains = getVisibleTrains();
  const delayedCount = visibleTrains.filter((train) => Number(train.delayMinutes || 0) > 0).length;
  const researchCount = visibleTrains.filter((train) => Boolean(train.researchCandidate)).length;
  const loadingText = state.loadingManifest || state.loadingNetworkId ? "読込中" : "準備完了";
  const networkUpdatedAt = network ? formatTimestamp(network.updatedAt) : "-";

  elements.statusBar.innerHTML = [
    renderStatusCard("状態", loadingText),
    renderStatusCard("表示列車", network ? `${visibleTrains.length}本` : "-"),
    renderStatusCard("遅延列車", network ? `${delayedCount}本` : "-"),
    renderStatusCard("要確認", network ? `${researchCount}本` : "-"),
    renderStatusCard("在線更新時刻", networkUpdatedAt),
  ].join("");
}

function renderMetaPanel() {
  const manifestEntry = getManifestNetwork(state.activeNetworkId);
  const network = getActiveNetwork();
  const warnings = network && Array.isArray(network.warnings) ? network.warnings : [];
  const notes = state.manifest && Array.isArray(state.manifest.notes) ? state.manifest.notes : [];
  const sourceUrls = network && Array.isArray(network.sourceUrls) ? network.sourceUrls : manifestEntry && Array.isArray(manifestEntry.sourceUrls) ? manifestEntry.sourceUrls : [];
  const error = state.networkErrors[state.activeNetworkId] || "";

  const topRow = manifestEntry
    ? `
      <div class="info-panel__header">
        <div>
          <h2 class="info-panel__title">${escapeHtml(manifestEntry.label)}</h2>
          <p class="info-panel__desc">${escapeHtml(manifestEntry.description || "")}</p>
        </div>
        <div class="pill-row">
          <span class="pill">${escapeHtml(state.manifest && state.manifest.refreshPolicy || "静的配信")}</span>
          ${network && network.meta && network.meta.detailCount != null ? `<span class="pill">事前生成時刻表 ${escapeHtml(String(network.meta.detailCount))} 本</span>` : ""}
        </div>
      </div>
    `
    : '<div class="info-panel__header"><div><h2 class="info-panel__title">ネットワーク未選択</h2></div></div>';

  const warningRow = warnings.length > 0
    ? `<div class="pill-row">${warnings.map((warning) => `<span class="pill pill--warn">${escapeHtml(warning)}</span>`).join("")}</div>`
    : "";
  const noteRow = notes.length > 0
    ? `<div class="pill-row">${notes.map((note) => `<span class="pill">${escapeHtml(note)}</span>`).join("")}</div>`
    : "";
  const sourceRow = sourceUrls.length > 0
    ? `<div class="link-row">${sourceUrls
        .map((source) => `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`)
        .join("")}</div>`
    : "";
  const errorRow = error ? `<div class="pill-row"><span class="pill pill--error">${escapeHtml(error)}</span></div>` : "";

  elements.networkMeta.innerHTML = `${topRow}${errorRow}${warningRow}${noteRow}${sourceRow}`;
}

function renderListings() {
  const network = getActiveNetwork();
  if (state.loadingManifest || (state.loadingNetworkId && state.loadingNetworkId === state.activeNetworkId && !network)) {
    elements.listings.innerHTML = '<div class="empty-state">在線データを読み込んでいます。</div>';
    return;
  }
  if (state.networkErrors[state.activeNetworkId]) {
    elements.listings.innerHTML = `<div class="empty-state">データ取得に失敗しました。<br>${escapeHtml(state.networkErrors[state.activeNetworkId])}</div>`;
    return;
  }
  if (!network) {
    elements.listings.innerHTML = '<div class="empty-state">表示するネットワークがまだありません。</div>';
    return;
  }

  const trains = getVisibleTrains();
  if (trains.length === 0) {
    elements.listings.innerHTML = '<div class="empty-state">条件に一致する列車がありません。</div>';
    return;
  }

  const grouped = groupTrains(trains);
  elements.listings.innerHTML = grouped.map(renderDirectionGroup).join("");
  bindDetails();
}

function groupTrains(trains) {
  const directionBuckets = new Map();
  trains.forEach((train) => {
    const directionKey = train.directionLabel || "方向不明";
    if (!directionBuckets.has(directionKey)) {
      directionBuckets.set(directionKey, []);
    }
    directionBuckets.get(directionKey).push(train);
  });

  return Array.from(directionBuckets.entries()).map(([directionLabel, directionTrains]) => {
    const locationBuckets = new Map();
    directionTrains.forEach((train) => {
      const key = `${train.positionOrder}:${train.locationLabel || "位置不明"}`;
      if (!locationBuckets.has(key)) {
        locationBuckets.set(key, { locationLabel: train.locationLabel || "位置不明", trains: [] });
      }
      locationBuckets.get(key).trains.push(train);
    });

    return {
      directionLabel,
      trains: directionTrains,
      locations: Array.from(locationBuckets.values()),
    };
  });
}

function renderDirectionGroup(group) {
  const locationBlocks = group.locations
    .map((location) => {
      const cards = location.trains
        .sort((left, right) => compareTrain(left, right))
        .map((train) => renderTrainCard(train))
        .join("");
      return `
        <section class="location-group">
          <h3 class="location-group__title">${escapeHtml(location.locationLabel)} <span class="group__meta">${escapeHtml(String(location.trains.length))}本</span></h3>
          <div class="train-list">${cards}</div>
        </section>
      `;
    })
    .join("");

  return `
    <section class="group">
      <div class="group__header">
        <h2 class="group__title">${escapeHtml(group.directionLabel)}</h2>
        <div class="group__meta">${escapeHtml(String(group.trains.length))}本</div>
      </div>
      <div class="location-grid">${locationBlocks}</div>
    </section>
  `;
}

function renderTrainCard(train) {
  const detail = state.detailCache[train.detailKey] || null;
  const loading = Boolean(state.detailLoading[train.detailKey]);
  const open = Boolean(state.openDetailKeys[train.detailKey]);
  const routeText = [detail && detail.originLabel || train.originLabel, detail && detail.destinationLabel || train.destinationLabel]
    .filter(Boolean)
    .join(" -> ");

  const chips = [
    train.lineLabel ? `<span class="chip">${escapeHtml(train.lineLabel)}</span>` : "",
    train.platform ? `<span class="chip">${escapeHtml(train.platform)}番線</span>` : detail && detail.platform ? `<span class="chip">${escapeHtml(detail.platform)}番線</span>` : "",
    train.ownerLabel ? `<span class="chip">${escapeHtml(train.ownerLabel)}</span>` : "",
    train.vehicleLabel ? `<span class="chip">${escapeHtml(train.vehicleLabel)}</span>` : detail && detail.vehicleLabel ? `<span class="chip">${escapeHtml(detail.vehicleLabel)}</span>` : "",
    Number(train.delayMinutes || 0) > 0 ? `<span class="chip chip--delay">${escapeHtml(formatDelay(train.delayMinutes))}</span>` : "",
    train.researchCandidate ? '<span class="chip chip--research">要確認</span>' : "",
  ]
    .filter(Boolean)
    .join("");

  const detailMarkup = train.detailAvailable
    ? `
      <details data-detail-key="${escapeHtml(train.detailKey)}" ${open ? "open" : ""}>
        <summary>京急列車別時刻表</summary>
        ${renderDetailBody(detail, loading)}
      </details>
    `
    : "";

  return `
    <article class="train-card">
      <div class="train-card__top">
        <div>
          <div class="train-card__number">${escapeHtml(train.trainNumber)}</div>
          <span class="service-badge" style="--service-bg:${escapeHtml(train.serviceColor || "#7c6755")};--service-fg:${escapeHtml(train.serviceTextColor || "#ffffff")}">${escapeHtml(train.serviceTypeLabel || "不明")}</span>
        </div>
        <div class="train-card__direction">${escapeHtml(train.directionLabel || "方向不明")}</div>
      </div>
      <div class="train-card__location">${escapeHtml(train.locationLabel || "位置不明")}</div>
      <div class="train-card__route">${escapeHtml(routeText || "始発・行先情報なし")}</div>
      <div class="chip-row">${chips}</div>
      ${state.showRaw && train.note ? `<div class="train-card__note">${escapeHtml(train.note)}</div>` : ""}
      ${detailMarkup}
    </article>
  `;
}

function renderDetailBody(detail, loading) {
  if (loading) {
    return '<div class="detail-status">時刻表を読み込んでいます。</div>';
  }
  if (detail && detail.error) {
    return `<div class="detail-status is-error">${escapeHtml(detail.error)}</div>`;
  }
  if (!detail) {
    return '<div class="detail-status">カードを開いたタイミングで時刻表 JSON を読み込みます。</div>';
  }

  const rows = Array.isArray(detail.detailRows) ? detail.detailRows : [];
  const summaryChips = [
    detail.originLabel ? `<span class="chip">${escapeHtml(detail.originLabel)}</span>` : "",
    detail.destinationLabel ? `<span class="chip">${escapeHtml(detail.destinationLabel)}</span>` : "",
    detail.platform ? `<span class="chip">${escapeHtml(detail.platform)}番線</span>` : "",
    detail.vehicleLabel ? `<span class="chip">${escapeHtml(detail.vehicleLabel)}</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const table = rows.length > 0
    ? `
      <div class="detail-table">
        <div class="detail-row detail-row--head">
          <span>駅名</span>
          <span>着</span>
          <span>発</span>
          <span>種別</span>
        </div>
        ${rows
          .map(
            (row) => `
              <div class="detail-row">
                <span>${escapeHtml(row.stationLabel || "")}</span>
                <span>${escapeHtml(row.arrivalTime || "-")}</span>
                <span>${escapeHtml(row.departureTime || "-")}</span>
                <span>${escapeHtml(row.stopType || "")}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `
    : '<div class="detail-status">時刻表データは取得できましたが、表示対象の行がありませんでした。</div>';

  return `
    <div class="detail-summary">${summaryChips}</div>
    ${table}
  `;
}

function bindDetails() {
  elements.listings.querySelectorAll("details[data-detail-key]").forEach((detailsElement) => {
    if (detailsElement.dataset.bound === "1") {
      return;
    }
    detailsElement.dataset.bound = "1";
    detailsElement.addEventListener("toggle", () => {
      const detailKey = detailsElement.dataset.detailKey || "";
      if (!detailKey) {
        return;
      }
      if (detailsElement.open) {
        state.openDetailKeys[detailKey] = true;
        const train = findTrainByDetailKey(detailKey);
        if (train && !state.detailCache[detailKey] && !state.detailLoading[detailKey]) {
          loadDetail(train).catch((error) => {
            state.detailCache[detailKey] = { error: String(error), detailRows: [] };
            render();
          });
        } else {
          render();
        }
      } else {
        delete state.openDetailKeys[detailKey];
        render();
      }
    });
  });
}

function findTrainByDetailKey(detailKey) {
  const network = getActiveNetwork();
  const trains = network && Array.isArray(network.trains) ? network.trains : [];
  return trains.find((train) => train.detailKey === detailKey) || null;
}

async function loadDetail(train) {
  if (!train || !train.detailUrl || state.detailLoading[train.detailKey]) {
    return;
  }
  state.detailLoading[train.detailKey] = true;
  render();
  try {
    state.detailCache[train.detailKey] = await fetchJson(train.detailUrl, false);
  } finally {
    delete state.detailLoading[train.detailKey];
    render();
  }
}

function renderStatusCard(label, value) {
  return `
    <article class="status-card">
      <div class="status-card__label">${escapeHtml(label)}</div>
      <div class="status-card__value">${escapeHtml(value)}</div>
    </article>
  `;
}

function renderFatal(error) {
  const message = escapeHtml(String(error));
  elements.statusBar.innerHTML = renderStatusCard("状態", "エラー");
  elements.networkMeta.innerHTML = `<div class="pill-row"><span class="pill pill--error">${message}</span></div>`;
  elements.listings.innerHTML = `<div class="empty-state">${message}</div>`;
}

function compareTrain(left, right) {
  const orderDiff = Number(left.positionOrder || 0) - Number(right.positionOrder || 0);
  if (orderDiff !== 0) {
    return orderDiff;
  }
  return String(left.trainNumber || "").localeCompare(String(right.trainNumber || ""), "ja");
}

function formatDelay(value) {
  const minutes = Number(value || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return "定時";
  }
  return `${minutes}分遅れ`;
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function escapeText(value) {
  return String(value == null ? "" : value);
}

function escapeHtml(value) {
  return escapeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
