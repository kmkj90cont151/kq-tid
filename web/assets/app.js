const state = {
  manifest: null,
  activeNetworkId: "",
  viewMode: "list",
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
  cacheElements();
  bindEvents();
  loadManifest().catch(renderFatal);
});

function cacheElements() {
  elements.refreshButton = document.getElementById("refreshButton");
  elements.searchInput = document.getElementById("searchInput");
  elements.flaggedOnlyToggle = document.getElementById("flaggedOnlyToggle");
  elements.showRawToggle = document.getElementById("showRawToggle");
  elements.buildTimestamp = document.getElementById("buildTimestamp");
  elements.buildVersion = document.getElementById("buildVersion");
  elements.networkCount = document.getElementById("networkCount");
  elements.tabBar = document.getElementById("tabBar");
  elements.modeBar = document.getElementById("modeBar");
  elements.statusBar = document.getElementById("statusBar");
  elements.networkMeta = document.getElementById("networkMeta");
  elements.listings = document.getElementById("listings");
}

function bindEvents() {
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
  elements.tabBar.addEventListener("click", onTabBarClick);
  elements.modeBar.addEventListener("click", onModeBarClick);
}

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

    const networks = Array.isArray(manifest.networks) ? manifest.networks : [];
    const firstNetworkId = networks.length > 0 ? networks[0].id : "";
    const activeStillValid = networks.some((network) => network.id === state.activeNetworkId);
    if (!state.activeNetworkId || !activeStillValid) {
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
    const network = await fetchJson(entry.dataUrl, refresh);
    state.networkCache[networkId] = normalizeNetwork(network, entry);
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

function normalizeNetwork(network, manifestEntry) {
  return {
    ...manifestEntry,
    ...network,
    sourceUrls: Array.isArray(network.sourceUrls) && network.sourceUrls.length > 0
      ? network.sourceUrls
      : Array.isArray(manifestEntry.sourceUrls)
        ? manifestEntry.sourceUrls
        : [],
  };
}

function onTabBarClick(event) {
  const button = event.target.closest("[data-network-id]");
  if (!button) {
    return;
  }
  const networkId = button.dataset.networkId || "";
  state.activeNetworkId = networkId;
  render();
  loadNetwork(networkId, false).catch(renderFatal);
}

function onModeBarClick(event) {
  const button = event.target.closest("[data-view-mode]");
  if (!button) {
    return;
  }
  const nextMode = button.dataset.viewMode || "list";
  if (nextMode === state.viewMode) {
    return;
  }
  state.viewMode = nextMode === "route" ? "route" : "list";
  render();
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
      train.vehicleLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.search);
  });
}

function render() {
  document.documentElement.dataset.viewMode = state.viewMode;
  syncTheme();
  renderHeroMeta();
  renderTabs();
  renderModeBar();
  renderStatus();
  renderMetaPanel();
  renderListings();
}

function syncTheme() {
  const network = getActiveNetwork();
  const accent = network && network.accentColor ? network.accentColor : "#d72731";
  document.documentElement.style.setProperty("--network-accent", accent);
}

function renderHeroMeta() {
  const manifest = state.manifest || {};
  const networks = Array.isArray(manifest.networks) ? manifest.networks : [];
  elements.buildTimestamp.textContent = `ビルド時刻: ${formatTimestamp(manifest.buildTimestamp)}`;
  elements.buildVersion.textContent = `バージョン: ${escapeText(manifest.appVersion || "-")}`;
  elements.networkCount.textContent = `路線数: ${networks.length}`;
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
      const cached = state.networkCache[network.id];
      const count = cached && Array.isArray(cached.trains)
        ? cached.trains.length
        : typeof network.trainCount === "number"
          ? network.trainCount
          : null;
      const countLabel = count == null ? "" : ` ${count}`;
      return `
        <button class="tab-button${activeClass}" type="button" data-network-id="${escapeHtml(network.id)}" aria-pressed="${network.id === state.activeNetworkId ? "true" : "false"}">
          ${escapeHtml(network.label || network.id)}${escapeHtml(countLabel)}
        </button>
      `;
    })
    .join("");
}

function renderModeBar() {
  elements.modeBar.querySelectorAll("[data-view-mode]").forEach((button) => {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderStatus() {
  const network = getActiveNetwork();
  const visibleTrains = getVisibleTrains();
  const delayedCount = visibleTrains.filter((train) => Number(train.delayMinutes || 0) > 0).length;
  const researchCount = visibleTrains.filter((train) => Boolean(train.researchCandidate)).length;
  const loadingText = state.loadingManifest || state.loadingNetworkId ? "読込中" : "準備完了";
  const networkUpdatedAt = network ? formatTimestamp(network.updatedAt) : "-";
  const modeLabel = state.viewMode === "route" ? "路線図" : "一覧";

  elements.statusBar.innerHTML = [
    renderStatusCard("状態", loadingText),
    renderStatusCard("表示モード", modeLabel),
    renderStatusCard("表示列車", network ? `${visibleTrains.length}` : "-"),
    renderStatusCard("遅延列車", network ? `${delayedCount}` : "-"),
    renderStatusCard("要確認", network ? `${researchCount}` : "-"),
    renderStatusCard("更新時刻", network ? networkUpdatedAt : "-"),
  ].join("");
}

function renderMetaPanel() {
  const manifestEntry = getManifestNetwork(state.activeNetworkId);
  const network = getActiveNetwork();

  if (!manifestEntry) {
    elements.networkMeta.innerHTML = '<div class="empty-state">路線データを読み込んでいます。</div>';
    return;
  }

  const warnings = network && Array.isArray(network.warnings) ? network.warnings : [];
  const notes = state.manifest && Array.isArray(state.manifest.notes) ? state.manifest.notes : [];
  const sourceUrls = Array.isArray(network && network.sourceUrls) && network.sourceUrls.length > 0
    ? network.sourceUrls
    : Array.isArray(manifestEntry.sourceUrls)
      ? manifestEntry.sourceUrls
      : [];
  const error = state.networkErrors[state.activeNetworkId] || "";
  const routeMap = extractRouteMapMeta(network);
  const elesite = extractElesiteMeta(network);

  const header = `
    <div class="info-panel__header">
      <div>
        <h2 class="info-panel__title">${escapeHtml(manifestEntry.label || manifestEntry.id)}</h2>
        <p class="info-panel__desc">${escapeHtml(manifestEntry.description || "")}</p>
      </div>
      <div class="pill-row">
        <span class="pill">${escapeHtml(state.manifest && state.manifest.refreshPolicy ? state.manifest.refreshPolicy : "静的配信")}</span>
        ${network && network.meta && network.meta.detailMode ? `<span class="pill">時刻表取得: ${escapeHtml(String(network.meta.detailMode))}</span>` : ""}
        ${network && network.meta && network.meta.routeMapMode ? `<span class="pill">路線図: ${escapeHtml(String(network.meta.routeMapMode))}</span>` : ""}
        ${network && network.meta && network.meta.detailCount != null ? `<span class="pill">詳細 JSON ${escapeHtml(String(network.meta.detailCount))} 件</span>` : ""}
      </div>
    </div>
  `;

  const sourceRow = sourceUrls.length > 0
    ? `
      <div class="link-row">
        ${sourceUrls.map((source) => `
          <a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(source.label || source.url)}
          </a>
        `).join("")}
      </div>
    `
    : "";

  const warningRow = warnings.length > 0
    ? `<div class="pill-row">${warnings.map((warning) => `<span class="pill pill--warn">${escapeHtml(warning)}</span>`).join("")}</div>`
    : "";

  const noteRow = notes.length > 0
    ? `<div class="pill-row">${notes.map((note) => `<span class="pill">${escapeHtml(note)}</span>`).join("")}</div>`
    : "";

  const routeMapRow = routeMap ? renderMetaSection("路線図メタ", routeMap) : "";
  const elesiteRow = elesite ? renderElesitePanel(elesite) : "";
  const errorRow = error ? `<div class="pill-row"><span class="pill pill--error">${escapeHtml(error)}</span></div>` : "";

  elements.networkMeta.innerHTML = [
    header,
    errorRow,
    warningRow,
    noteRow,
    sourceRow,
    routeMapRow,
    elesiteRow,
  ].join("");
}

function renderMetaSection(title, meta, excludeKeys = []) {
  const entries = collectMetaEntries(meta, excludeKeys);
  if (entries.length === 0) {
    return "";
  }
  return `
    <section class="meta-section">
      <h3 class="meta-section__title">${escapeHtml(title)}</h3>
      <dl class="meta-list">
        ${entries
          .map(
            ({ label, value }) => `
              <div class="meta-list__item">
                <dt>${escapeHtml(label)}</dt>
                <dd>${value}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderElesitePanel(meta) {
  const specialKeys = [
    "directionInfo",
    "direction_info",
    "railwayInfo",
    "railway_info",
    "todayDiaPattern",
    "today_dia_pattern",
    "rosenInfo",
    "rosen_info",
    "currentHenseiList",
    "current_hensei_list",
  ];
  const blocks = [];

  if (collectMetaEntries(meta).length > 0) {
    blocks.push(renderMetaSection("えるサイト連携", meta));
  }

  const currentHenseiList = meta.currentHenseiList || meta.current_hensei_list;
  if (Array.isArray(currentHenseiList) && currentHenseiList.length > 0) {
    const chips = currentHenseiList
      .slice(0, 12)
      .map((item) => `<span class="chip">${escapeHtml(summarizeAny(item))}</span>`)
      .join("");
    blocks.push(`
      <section class="meta-section">
        <h3 class="meta-section__title">えるサイト編成情報</h3>
        <div class="pill-row">${chips}</div>
      </section>
    `);
  }

  const routeMapMeta = meta.routeMap || meta.route_map;
  if (routeMapMeta) {
    blocks.push(renderMetaSection("えるサイト路線補助情報", routeMapMeta));
  }

  return blocks.join("");
}

function extractElesiteMeta(network) {
  if (!network) {
    return null;
  }
  const candidates = [
    network.elesite,
    network.elesiteMeta,
    network.elesiteMetadata,
    network.meta && network.meta.elesite,
    network.meta && network.meta.elesiteMeta,
    network.meta && network.meta.elesiteMetadata,
    network.meta && network.meta.elesiteInfo,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object") || null;
}

function extractRouteMapMeta(network) {
  if (!network) {
    return null;
  }
  const candidates = [
    network.routeMap,
    network.routeMapMeta,
    network.routeMapMetadata,
    network.meta && network.meta.routeMap,
    network.meta && network.meta.routeMapMeta,
    network.meta && network.meta.routeMapMetadata,
  ];
  const routeMap = candidates.find((candidate) => candidate && typeof candidate === "object") || null;
  if (!routeMap) {
    return null;
  }
  const summary = {
    name: routeMap.title || routeMap.name || routeMap.label || network.label || network.id,
    description: routeMap.description || routeMap.summary || routeMap.note || "",
  };
  const stations = routeMap.stations || routeMap.nodes || routeMap.locations;
  if (Array.isArray(stations)) {
    summary.stations = `${stations.length}`;
  }
  const lines = routeMap.lines || routeMap.lanes;
  if (Array.isArray(lines)) {
    summary.lanes = `${lines.length}`;
  }
  if (routeMap.updatedAt) {
    summary.updatedAt = formatTimestamp(routeMap.updatedAt);
  }
  return summary;
}

function collectMetaEntries(meta, excludeKeys = []) {
  if (!meta || typeof meta !== "object") {
    return [];
  }
  return Object.entries(meta)
    .filter(([key, value]) => !excludeKeys.includes(key) && value !== undefined && value !== null && value !== "")
    .map(([key, value]) => ({
      label: labelizeKey(key),
      value: renderMetaValue(value),
    }));
}

function renderMetaValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="meta-value">0件</span>';
    }
    const preview = value.slice(0, 3).map((item) => escapeHtml(summarizeAny(item))).join(" / ");
    const suffix = value.length > 3 ? ` ... +${value.length - 3}` : "";
    return `<span class="meta-value">${preview}${escapeHtml(suffix)}</span>`;
  }

  if (value && typeof value === "object") {
    const pairs = Object.entries(value)
      .filter(([, child]) => child !== undefined && child !== null && child !== "")
      .slice(0, 4)
      .map(([key, child]) => `${labelizeKey(key)}: ${summarizeAny(child)}`);
    return `<span class="meta-value">${escapeHtml(pairs.join(" / ") || JSON.stringify(value).slice(0, 180))}</span>`;
  }

  return `<span class="meta-value">${escapeHtml(String(value))}</span>`;
}

function summarizeAny(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length}件`;
  }
  if (typeof value === "object") {
    return value.label || value.name || value.title || value.id || JSON.stringify(value);
  }
  return String(value);
}

function labelizeKey(key) {
  const mapping = {
    id: "ID",
    label: "ラベル",
    description: "説明",
    status: "状態",
    updatedAt: "更新時刻",
    source: "参照元",
    sourceUrl: "参照 URL",
    networkSource: "在線取得元",
    detailMode: "時刻表取得方式",
    routeMapMode: "路線図方式",
    detailCount: "detail 件数",
    title: "タイトル",
    name: "名称",
    summary: "概要",
    note: "メモ",
    directionInfo: "方向情報",
    direction_info: "方向情報",
    railwayInfo: "運行情報",
    railway_info: "運行情報",
    todayDiaPattern: "当日ダイヤ",
    today_dia_pattern: "当日ダイヤ",
    rosenInfo: "路線情報",
    rosen_info: "路線情報",
    currentHenseiList: "現行編成",
    current_hensei_list: "現行編成",
  };
  if (mapping[key]) {
    return mapping[key];
  }
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderListings() {
  const network = getActiveNetwork();
  if (state.loadingManifest || (state.loadingNetworkId && state.loadingNetworkId === state.activeNetworkId && !network)) {
    elements.listings.innerHTML = '<div class="empty-state">路線データを読み込んでいます。</div>';
    return;
  }
  if (state.networkErrors[state.activeNetworkId]) {
    elements.listings.innerHTML = `<div class="empty-state">データ取得に失敗しました。<br>${escapeHtml(state.networkErrors[state.activeNetworkId])}</div>`;
    return;
  }
  if (!network) {
    elements.listings.innerHTML = '<div class="empty-state">表示できる路線がまだありません。</div>';
    return;
  }

  const trains = getVisibleTrains();
  if (trains.length === 0) {
    elements.listings.innerHTML = '<div class="empty-state">条件に一致する列車がありません。</div>';
    return;
  }

  elements.listings.innerHTML = state.viewMode === "route"
    ? renderRouteMapView(trains)
    : renderListView(trains);
  bindDetails();
}

function renderListView(trains) {
  return groupTrainsByDirection(trains).map(renderDirectionGroup).join("");
}

function renderRouteMapView(trains) {
  return groupTrainsByDirection(trains).map(renderRouteMapDirectionGroup).join("");
}

function groupTrainsByDirection(trains) {
  const directionBuckets = new Map();

  trains.forEach((train) => {
    const directionKey = train.directionCode || train.directionLabel || "unknown";
    if (!directionBuckets.has(directionKey)) {
      directionBuckets.set(directionKey, {
        directionLabel: train.directionLabel || "方向不明",
        trains: [],
      });
    }
    directionBuckets.get(directionKey).trains.push(train);
  });

  return Array.from(directionBuckets.values()).map((bucket) => {
    const locationBuckets = new Map();
    bucket.trains.forEach((train) => {
      const key = `${Number(train.positionOrder || 0)}:${train.locationLabel || "位置不明"}`;
      if (!locationBuckets.has(key)) {
        locationBuckets.set(key, {
          locationLabel: train.locationLabel || "位置不明",
          positionOrder: Number(train.positionOrder || 0),
          positionCode: train.positionCode || "",
          trains: [],
        });
      }
      locationBuckets.get(key).trains.push(train);
    });

    return {
      directionLabel: bucket.directionLabel,
      trains: bucket.trains.slice().sort(compareTrain),
      locations: Array.from(locationBuckets.values())
        .sort((left, right) => left.positionOrder - right.positionOrder)
        .map((location) => ({
          ...location,
          trains: location.trains.slice().sort(compareTrain),
        })),
    };
  });
}

function renderDirectionGroup(group) {
  const locationBlocks = group.locations
    .map((location) => {
      const cards = location.trains.map((train) => renderTrainCard(train)).join("");
      return `
        <section class="location-group">
          <h3 class="location-group__title">
            ${escapeHtml(location.locationLabel)}
            <span class="group__meta">${escapeHtml(String(location.trains.length))}</span>
          </h3>
          <div class="train-list">${cards}</div>
        </section>
      `;
    })
    .join("");

  return `
    <section class="group">
      <div class="group__header">
        <h2 class="group__title">${escapeHtml(group.directionLabel)}</h2>
        <div class="group__meta">${escapeHtml(String(group.trains.length))}</div>
      </div>
      <div class="location-grid">${locationBlocks}</div>
    </section>
  `;
}

function renderRouteMapDirectionGroup(group) {
  const lane = group.locations
    .map((location) => {
      const cards = location.trains.map((train) => renderTrainCard(train, { compact: true })).join("");
      return `
        <article class="route-node">
          <div class="route-node__head">
            <div class="route-node__position">${escapeHtml(location.positionCode || String(location.positionOrder))}</div>
            <div class="route-node__label">${escapeHtml(location.locationLabel)}</div>
          </div>
          <div class="route-node__meta">${escapeHtml(String(location.trains.length))}</div>
          <div class="route-node__body">${cards}</div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="route-map">
      <div class="route-map__header">
        <h2 class="route-map__title">${escapeHtml(group.directionLabel)}</h2>
        <div class="route-map__meta">${escapeHtml(String(group.trains.length))}</div>
      </div>
      <div class="route-map__lane">${lane}</div>
    </section>
  `;
}

function getInlineDetail(train) {
  if (!train) {
    return null;
  }
  const rows = Array.isArray(train.detailRows) ? train.detailRows : [];
  if (rows.length === 0 && !train.originLabel && !train.destinationLabel && !train.platform && !train.vehicleLabel) {
    return null;
  }
  return {
    detailKey: train.detailKey || "",
    detailRows: rows,
    detailSummary: train.detailSummary || "",
    originLabel: train.originLabel || "",
    destinationLabel: train.destinationLabel || "",
    platform: train.platform || "",
    vehicleLabel: train.vehicleLabel || "",
    sourceTags: Array.isArray(train.sourceTags) ? train.sourceTags : [],
  };
}

function renderTrainCard(train, options = {}) {
  const compact = Boolean(options.compact);
  const detail = state.detailCache[train.detailKey] || getInlineDetail(train) || null;
  const loading = Boolean(state.detailLoading[train.detailKey]);
  const open = Boolean(state.openDetailKeys[train.detailKey]);
  const routeText = [detail && detail.originLabel || train.originLabel, detail && detail.destinationLabel || train.destinationLabel]
    .filter(Boolean)
    .join(" → ");

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
        <summary>時刻表</summary>
        ${renderDetailBody(detail, loading)}
      </details>
    `
    : "";

  return `
    <article class="train-card${compact ? " train-card--compact" : ""}">
      <div class="train-card__top">
        <div>
          <div class="train-card__number">${escapeHtml(train.trainNumber)}</div>
          <span
            class="service-badge"
            style="--service-bg:${escapeHtml(train.serviceColor || "#7c6755")};--service-fg:${escapeHtml(train.serviceTextColor || "#ffffff")}"
          >${escapeHtml(train.serviceTypeLabel || "種別不明")}</span>
        </div>
        <div class="train-card__direction">${escapeHtml(train.directionLabel || "方向不明")}</div>
      </div>
      <div class="train-card__location">${escapeHtml(train.locationLabel || "位置不明")}</div>
      <div class="train-card__route">${escapeHtml(routeText || "行先情報なし")}</div>
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
    return '<div class="detail-status">列車カードを開くと時刻表を読み込みます。</div>';
  }

  const rows = Array.isArray(detail.detailRows) ? detail.detailRows : Array.isArray(detail.rows) ? detail.rows : [];
  const summaryChips = [
    detail.originLabel ? `<span class="chip">${escapeHtml(detail.originLabel)}</span>` : "",
    detail.destinationLabel ? `<span class="chip">${escapeHtml(detail.destinationLabel)}</span>` : "",
    detail.platform ? `<span class="chip">${escapeHtml(detail.platform)}番線</span>` : "",
    detail.vehicleLabel ? `<span class="chip">${escapeHtml(detail.vehicleLabel)}</span>` : "",
    detail.encoding ? `<span class="chip">${escapeHtml(detail.encoding)}</span>` : "",
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
        if (train && train.detailUrl && !state.detailCache[detailKey] && !state.detailLoading[detailKey]) {
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
  const normalized = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1).replace(/\.0$/, "");
  return `${normalized}分遅れ`;
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
