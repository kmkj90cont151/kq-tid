const REFRESH_INTERVAL_MS = Number(window.APP_CONFIG?.refreshIntervalMs) || 15000;

const SOURCE_TAG_LABELS = {
  live: "リアルタイム",
  timetable: "時刻表補完",
  enrichment: "補完情報",
  "official-web": "公式補完",
};

const appState = {
  manifest: null,
  networksById: {},
  detailCache: {},
  detailRequests: {},
  openDetailKeys: {},
  loadingNetworks: {},
  loadingDetails: {},
  error: "",
  activeNetworkId: "keikyu",
  filters: {
    query: "",
    inferredOnly: false,
    showRaw: true,
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  setupControls();
  syncHeader();
  await requestManifest();
  window.setInterval(refreshActiveNetwork, REFRESH_INTERVAL_MS);
});

function setupControls() {
  document.getElementById("refreshButton").addEventListener("click", async () => {
    if (appState.manifest) {
      await requestNetworkSnapshot(appState.activeNetworkId);
      return;
    }
    await requestManifest();
  });

  document.getElementById("searchInput").addEventListener("input", (event) => {
    appState.filters.query = String(event.target.value || "").trim();
    render();
  });

  document.getElementById("inferredOnlyToggle").addEventListener("change", (event) => {
    appState.filters.inferredOnly = Boolean(event.target.checked);
    render();
  });

  document.getElementById("showRawToggle").addEventListener("change", (event) => {
    appState.filters.showRaw = Boolean(event.target.checked);
    render();
  });
}

function syncHeader() {
  document.getElementById("refreshMeta").textContent = `更新間隔: ${Math.round(REFRESH_INTERVAL_MS / 1000)}秒`;
}

async function requestManifest() {
  try {
    const manifest = await window.LiveTrainData.getAppManifest();
    appState.manifest = manifest;
    appState.error = "";

    if (!findNetwork(appState.activeNetworkId) && Array.isArray(manifest.networks) && manifest.networks.length > 0) {
      appState.activeNetworkId = manifest.networks[0].id;
    }

    document.getElementById("buildVersion").textContent = `バージョン: ${manifest.appVersion || "-"}`;
    document.getElementById("buildTimestamp").textContent = `初回読込: ${formatTimestamp(manifest.buildTimestamp)}`;

    render();
    await requestNetworkSnapshot(appState.activeNetworkId);
  } catch (error) {
    appState.error = error?.message || String(error);
    render();
  }
}

async function refreshActiveNetwork() {
  if (!appState.manifest || !appState.activeNetworkId) {
    return;
  }
  await requestNetworkSnapshot(appState.activeNetworkId);
}

async function requestNetworkSnapshot(networkId) {
  if (!networkId || appState.loadingNetworks[networkId]) {
    return;
  }

  appState.loadingNetworks[networkId] = true;
  renderStatus();
  renderInfoPanel();
  renderListings();

  try {
    const network = await window.LiveTrainData.getNetworkSnapshot(networkId);
    appState.networksById[networkId] = hydrateNetworkSnapshot(network);
    appState.error = "";
  } catch (error) {
    const meta = getNetworkMeta(networkId);
    appState.networksById[networkId] = hydrateNetworkSnapshot({
      id: networkId,
      label: meta?.label || networkId,
      description: meta?.description || "",
      accentColor: meta?.accentColor || "#333333",
      status: "error",
      updatedAt: "",
      trains: [],
      warnings: ["データ取得に失敗しました。設定やAPI到達性を確認してください。"],
      error: error?.message || String(error),
      sourceUrls: Array.isArray(meta?.sourceUrls) ? meta.sourceUrls : [],
      meta: {},
      loaded: true,
    });
    appState.error = error?.message || String(error);
  } finally {
    delete appState.loadingNetworks[networkId];
    render();
  }
}

async function requestTrainDetail(networkId, detailKey) {
  if (!networkId || !detailKey || appState.loadingDetails[detailKey]) {
    return;
  }

  const request = appState.detailRequests[detailKey];
  if (!request) {
    return;
  }

  appState.loadingDetails[detailKey] = true;
  renderListings();

  try {
    const detail = await window.LiveTrainData.getTrainDetail(networkId, request);
    const normalized = Object.assign({}, detail, { detailLoaded: true, error: "" });
    appState.detailCache[detailKey] = normalized;
    mergeDetailIntoNetworks(detailKey, normalized);
  } catch (error) {
    const normalized = {
      detailRows: [],
      detailSummary: "列車別時刻表",
      detailLoaded: true,
      error: error?.message || String(error),
    };
    appState.detailCache[detailKey] = normalized;
    mergeDetailIntoNetworks(detailKey, normalized);
  } finally {
    delete appState.loadingDetails[detailKey];
    render();
  }
}

function hydrateNetworkSnapshot(network) {
  const hydrated = Object.assign({}, network, { loaded: true });
  hydrated.trains = (Array.isArray(network.trains) ? network.trains : []).map((train) => hydrateTrain(network.id, train));
  return hydrated;
}

function hydrateTrain(networkId, train) {
  const hydrated = Object.assign({}, train, { networkId });
  const detailKey = hydrated.detailKey || (hydrated.detailAvailable ? buildFallbackDetailKey(networkId, hydrated) : "");

  if (detailKey) {
    hydrated.detailKey = detailKey;
    if (hydrated.detailRequest) {
      appState.detailRequests[detailKey] = Object.assign({ networkId }, hydrated.detailRequest);
    }
    if (appState.detailCache[detailKey]) {
      return mergeTrainDetail(hydrated, appState.detailCache[detailKey]);
    }
  }

  return hydrated;
}

function buildFallbackDetailKey(networkId, train) {
  return [networkId, train.lineId || "", train.trainNumber || ""].join(":");
}

function mergeTrainDetail(train, detail) {
  const merged = Object.assign({}, train);

  if (detail.originLabel) {
    merged.originLabel = detail.originLabel;
  }
  if (detail.destinationLabel) {
    merged.destinationLabel = detail.destinationLabel;
  }
  if (detail.platform) {
    merged.platform = detail.platform;
  }
  if (detail.vehicleLabel) {
    merged.vehicleLabel = detail.vehicleLabel;
  }
  if (detail.detailSummary) {
    merged.detailSummary = detail.detailSummary;
  }
  if (Array.isArray(detail.detailRows)) {
    merged.detailRows = detail.detailRows;
  }
  if (Array.isArray(detail.sourceTags)) {
    merged.sourceTags = uniqueStringsJs([...(merged.sourceTags || []), ...detail.sourceTags]);
  }

  merged.detailLoaded = Boolean(detail.detailLoaded);
  merged.detailError = detail.error || "";
  return merged;
}

function mergeDetailIntoNetworks(detailKey, detail) {
  Object.keys(appState.networksById).forEach((networkId) => {
    const network = appState.networksById[networkId];
    network.trains = (network.trains || []).map((train) => {
      if (train.detailKey !== detailKey) {
        return train;
      }
      return mergeTrainDetail(train, detail);
    });
  });
}

function render() {
  renderTabs();
  renderStatus();
  renderInfoPanel();
  renderListings();
  attachDetailListeners();
}

function renderTabs() {
  const container = document.getElementById("tabBar");
  const networks = getNetworkList();

  if (networks.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = networks.map((network) => {
    const isActive = appState.activeNetworkId === network.id;
    const isLoading = Boolean(appState.loadingNetworks[network.id]);
    const countLabel = Array.isArray(network.trains) && network.loaded ? String(network.trains.length) : "…";
    return `
      <button type="button" class="tab-button ${isActive ? "is-active" : ""}" data-network-id="${escapeHtml(network.id)}">
        <span>${escapeHtml(network.label)}</span>
        <span class="tab-button__count">${escapeHtml(isLoading ? "..." : countLabel)}</span>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", async () => {
      appState.activeNetworkId = button.dataset.networkId;
      render();
      await requestNetworkSnapshot(button.dataset.networkId);
    });
  });
}

function renderStatus() {
  const container = document.getElementById("statusBar");
  const active = findNetwork(appState.activeNetworkId);
  const activeLoaded = appState.networksById[appState.activeNetworkId] || null;
  const trains = activeLoaded ? getFilteredTrains(activeLoaded) : [];
  const summary = buildLoadedSummary();
  const isLoading = Boolean(appState.loadingNetworks[appState.activeNetworkId]);

  const cards = [
    statusCard(
      "表示列車",
      activeLoaded ? String(trains.length) : "-",
      active ? `${active.label} の現在表示件数` : "路線タブを選択してください"
    ),
    statusCard(
      "遅延列車",
      activeLoaded ? String(trains.filter((train) => Number(train.delayMinutes || 0) > 0).length) : "-",
      "遅延表示あり"
    ),
    statusCard(
      "補完・推定",
      activeLoaded ? String(trains.filter((train) => isInferred(train)).length) : "-",
      "時刻表補完や推定位置を含む列車"
    ),
    statusCard(
      "更新状態",
      isLoading ? "更新中" : (activeLoaded ? "読込済み" : "未取得"),
      activeLoaded ? `最新 ${formatTimestamp(activeLoaded.updatedAt)}` : "タブ選択時に取得"
    ),
    statusCard(
      "読込状況",
      `${summary.loadedNetworks}/${summary.totalNetworks} 路線`,
      summary.loadedNetworks > 0 ? `${summary.totalTrains} 本を読込済み` : "まだ取得していません",
      true
    ),
  ];

  if (appState.error) {
    cards.push(`
      <article class="status-card status-card--wide status-card--error">
        <div class="status-card__label">エラー</div>
        <div class="status-card__value">取得失敗</div>
        <div class="status-card__hint">${escapeHtml(appState.error)}</div>
      </article>
    `);
  }

  container.innerHTML = cards.join("");
}

function renderInfoPanel() {
  const container = document.getElementById("networkMeta");
  const active = findNetwork(appState.activeNetworkId);
  const isLoading = Boolean(appState.loadingNetworks[appState.activeNetworkId]);

  if (!active) {
    container.innerHTML = `<div class="empty-state">路線情報を読み込んでいます。</div>`;
    return;
  }

  const warnings = Array.isArray(active.warnings) ? active.warnings.slice() : [];
  if (active.error) {
    warnings.unshift(`取得失敗: ${active.error}`);
  }

  const sourceLinks = Array.isArray(active.sourceUrls)
    ? active.sourceUrls.map((item) => (
      `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>`
    )).join("")
    : "";

  const statusLabel = isLoading
    ? "更新中"
    : active.status === "ok"
      ? "正常"
      : active.status === "error"
        ? "取得失敗"
        : active.loaded
          ? "読込済み"
          : "未取得";

  container.innerHTML = `
    <div class="info-panel__header">
      <div>
        <h2>${escapeHtml(active.label)}</h2>
        <p>${escapeHtml(active.description || "")}</p>
      </div>
      <div class="network-pill" style="--accent:${escapeHtml(active.accentColor || "#333333")}">
        ${escapeHtml(statusLabel)}
      </div>
    </div>
    ${warnings.length > 0 ? `<div class="warning-list">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
    <div class="source-links">${sourceLinks}</div>
  `;
}

function renderListings() {
  const container = document.getElementById("listings");
  const active = appState.networksById[appState.activeNetworkId] || null;
  const isLoading = Boolean(appState.loadingNetworks[appState.activeNetworkId]);

  if (!appState.manifest && !appState.error) {
    container.innerHTML = `<div class="empty-state">路線一覧を読み込んでいます。</div>`;
    return;
  }

  if (!active) {
    container.innerHTML = `<div class="empty-state">${isLoading ? "この路線のデータを取得しています。" : "タブを選ぶとその路線のデータを取得します。"}</div>`;
    return;
  }

  const trains = getFilteredTrains(active);
  if (trains.length === 0) {
    container.innerHTML = `<div class="empty-state">現在の条件に一致する列車はありません。</div>`;
    return;
  }

  const lineGroups = groupBy(trains, (train) => `${train.lineId}__${train.lineLabel}`);
  const panels = Array.from(lineGroups.values())
    .sort((left, right) => String(left.items[0].lineLabel || "").localeCompare(String(right.items[0].lineLabel || ""), "ja"))
    .map((group) => renderLinePanel(active, group.items[0].lineLabel, group.items));

  container.innerHTML = panels.join("");
}

function renderLinePanel(network, lineLabel, trains) {
  const directions = groupBy(trains, (train) => `${train.directionCode}__${train.directionLabel}`);
  const directionPanels = Array.from(directions.values())
    .sort((left, right) => compareDirectionLabel(left.items[0].directionLabel, right.items[0].directionLabel))
    .map((group) => renderDirectionPanel(group.items[0].directionLabel, group.items));

  return `
    <section class="line-panel" style="--accent:${escapeHtml(network.accentColor || "#333333")}">
      <div class="line-panel__header">
        <div>
          <h2>${escapeHtml(lineLabel)}</h2>
          <p>${trains.length} 本</p>
        </div>
        <div class="line-panel__badge">${escapeHtml(network.label)}</div>
      </div>
      <div class="line-panel__columns">${directionPanels.join("")}</div>
    </section>
  `;
}

function renderDirectionPanel(directionLabel, trains) {
  const positionGroups = groupBy(trains, (train) => `${train.positionCode}__${train.locationLabel}`);
  const positions = Array.from(positionGroups.values())
    .sort((left, right) => Number(left.items[0].positionOrder || 0) - Number(right.items[0].positionOrder || 0))
    .map((group) => renderPositionGroup(group.items[0], group.items));

  return `
    <section class="direction-panel">
      <div class="direction-panel__heading">
        <h3>${escapeHtml(directionLabel || "方向未設定")}</h3>
        <div class="direction-panel__count">${trains.length} 本</div>
      </div>
      <div class="position-groups">${positions.join("")}</div>
    </section>
  `;
}

function renderPositionGroup(sample, trains) {
  return `
    <article class="position-group">
      <div class="position-group__header">
        <div>
          <div class="position-group__title">${escapeHtml(sample.locationLabel)}</div>
          <div class="position-group__sub">${escapeHtml(locationTypeLabel(sample.locationType))} / ${escapeHtml(confidenceLabel(sample.confidence))}</div>
        </div>
        ${appState.filters.showRaw ? `<div class="position-group__raw">${escapeHtml(sample.positionCode || "-")}</div>` : ""}
      </div>
      <div class="train-list">${trains.map(renderTrainCard).join("")}</div>
    </article>
  `;
}

function renderTrainCard(train) {
  const chips = [
    train.destinationLabel ? chip(train.destinationLabel, "default") : "",
    train.platform ? chip(`${train.platform} 番線`, "default") : "",
    Number(train.delayMinutes || 0) > 0 ? chip(`${formatDelayMinutes(train.delayMinutes)} 分遅れ`, "delay") : "",
    train.ownerLabel ? chip(train.ownerLabel, "owner") : "",
    train.vehicleLabel ? chip(train.vehicleLabel, "default") : "",
    Array.isArray(train.sourceTags) ? train.sourceTags.map((tag) => chip(labelSourceTag(tag), "source")).join("") : "",
    train.researchCandidate ? chip("要確認", "research") : "",
    appState.filters.showRaw ? chip(`種別:${train.serviceTypeCode || "-"}`, "raw") : "",
    appState.filters.showRaw ? chip(`方向:${train.directionCode || "-"}`, "raw") : "",
  ].filter(Boolean).join("");

  const detailRows = Array.isArray(train.detailRows) ? train.detailRows : [];
  const detailKey = train.detailKey || "";
  const detailLoading = Boolean(appState.loadingDetails[detailKey]);
  const detailError = train.detailError || "";
  const detailOpen = Boolean(appState.openDetailKeys[detailKey]);
  const badgeStyle = train.serviceColor
    ? ` style="background:${escapeHtml(train.serviceColor)};color:${escapeHtml(train.serviceTextColor || "#ffffff")}"`
    : "";

  let detailBlock = "";
  if (detailRows.length > 0 || train.detailAvailable) {
    const summaryLabel = train.detailSummary || "列車別時刻表";
    const summaryCount = detailRows.length > 0 ? ` (${detailRows.length} 駅)` : "";
    let detailBody = "";

    if (detailRows.length > 0) {
      detailBody = `
        <div class="timetable-list">
          <div class="timetable-row timetable-row--header">
            <span class="timetable-row__station">駅</span>
            <span class="timetable-row__time">着</span>
            <span class="timetable-row__time">発</span>
            <span class="timetable-row__type">扱い</span>
          </div>
          ${detailRows.map((row) => `
            <div class="timetable-row">
              <span class="timetable-row__station">${escapeHtml(row.stationLabel || row.stationCode || "")}</span>
              <span class="timetable-row__time">${escapeHtml(row.arrivalTime || "-")}</span>
              <span class="timetable-row__time">${escapeHtml(row.departureTime || "-")}</span>
              <span class="timetable-row__type">${escapeHtml(row.stopType || "")}</span>
            </div>
          `).join("")}
        </div>
      `;
    } else if (detailLoading) {
      detailBody = `<div class="train-card__detail-status">列車別時刻表を読み込んでいます。</div>`;
    } else if (detailError) {
      detailBody = `<div class="train-card__detail-status train-card__detail-status--error">${escapeHtml(detailError)}</div>`;
    } else {
      detailBody = `<div class="train-card__detail-status">開いたタイミングで時刻表を取得します。</div>`;
    }

    const dataset = train.detailAvailable
      ? ` data-network-id="${escapeHtml(train.networkId || "")}" data-detail-key="${escapeHtml(detailKey)}"`
      : "";

    detailBlock = `
      <details class="train-card__details" ${detailOpen ? "open" : ""}${dataset}>
        <summary>${escapeHtml(summaryLabel)}${escapeHtml(summaryCount)}</summary>
        ${detailBody}
      </details>
    `;
  }

  return `
    <article class="train-card ${train.researchCandidate ? "is-research" : ""}">
      <div class="train-card__top">
        <div class="train-card__identity">
          <span class="train-no">${escapeHtml(train.trainNumber || "(列番なし)")}</span>
          <span class="service-badge"${badgeStyle}>${escapeHtml(train.serviceTypeLabel || "不明")}</span>
        </div>
        <div class="train-card__direction">${escapeHtml(train.directionLabel || "")}</div>
      </div>
      <div class="train-card__location">${escapeHtml(train.locationLabel || "")}</div>
      <div class="train-card__secondary">${escapeHtml([train.originLabel, train.destinationLabel].filter(Boolean).join(" → ") || "始発・行先情報なし")}</div>
      <div class="train-card__meta">${chips}</div>
      ${train.note ? `<div class="train-card__note">${escapeHtml(train.note)}</div>` : ""}
      ${detailBlock}
    </article>
  `;
}

function attachDetailListeners() {
  document.querySelectorAll(".train-card__details[data-detail-key][data-network-id]").forEach((detailsElement) => {
    if (detailsElement.dataset.bound === "1") {
      return;
    }

    detailsElement.dataset.bound = "1";
    detailsElement.addEventListener("toggle", async () => {
      const detailKey = detailsElement.dataset.detailKey;
      if (detailKey) {
        if (detailsElement.open) {
          appState.openDetailKeys[detailKey] = true;
        } else {
          delete appState.openDetailKeys[detailKey];
        }
      }

      if (!detailsElement.open) {
        return;
      }

      const networkId = detailsElement.dataset.networkId;
      const train = findTrainByDetailKey(networkId, detailKey);
      if (!train || (Array.isArray(train.detailRows) && train.detailRows.length > 0) || appState.loadingDetails[detailKey]) {
        return;
      }

      await requestTrainDetail(networkId, detailKey);
    });
  });
}

function findTrainByDetailKey(networkId, detailKey) {
  const network = appState.networksById[networkId];
  if (!network || !Array.isArray(network.trains)) {
    return null;
  }
  return network.trains.find((train) => train.detailKey === detailKey) || null;
}

function getFilteredTrains(network) {
  const trains = Array.isArray(network.trains) ? network.trains : [];
  return trains.filter((train) => {
    if (appState.filters.inferredOnly && !isInferred(train)) {
      return false;
    }
    if (!appState.filters.query) {
      return true;
    }
    const haystack = [
      train.trainNumber,
      train.lineLabel,
      train.locationLabel,
      train.serviceTypeLabel,
      train.destinationLabel,
      train.originLabel,
      train.ownerLabel,
      train.positionCode,
      train.note,
      train.detailSummary,
    ].join(" ").toLowerCase();
    return haystack.includes(appState.filters.query.toLowerCase());
  });
}

function getNetworkList() {
  if (appState.manifest && Array.isArray(appState.manifest.networks)) {
    return appState.manifest.networks.map((network) => appState.networksById[network.id] || network);
  }
  return Object.values(appState.networksById);
}

function findNetwork(networkId) {
  return getNetworkList().find((network) => network.id === networkId) || null;
}

function getNetworkMeta(networkId) {
  if (!appState.manifest || !Array.isArray(appState.manifest.networks)) {
    return null;
  }
  return appState.manifest.networks.find((network) => network.id === networkId) || null;
}

function buildLoadedSummary() {
  const loadedNetworks = Object.values(appState.networksById);
  let totalTrains = 0;
  let delayedTrains = 0;
  let researchTrains = 0;
  let healthyNetworks = 0;

  loadedNetworks.forEach((network) => {
    if (network.status === "ok") {
      healthyNetworks += 1;
    }
    (network.trains || []).forEach((train) => {
      totalTrains += 1;
      if (Number(train.delayMinutes || 0) > 0) {
        delayedTrains += 1;
      }
      if (train.researchCandidate) {
        researchTrains += 1;
      }
    });
  });

  return {
    totalTrains,
    delayedTrains,
    researchTrains,
    healthyNetworks,
    loadedNetworks: loadedNetworks.length,
    totalNetworks: appState.manifest?.summary?.totalNetworks || loadedNetworks.length,
  };
}

function isInferred(train) {
  const tags = Array.isArray(train.sourceTags) ? train.sourceTags : [];
  return train.researchCandidate || tags.includes("timetable") || tags.includes("enrichment") || train.confidence !== "high";
}

function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) {
      map.set(key, { key, items: [] });
    }
    map.get(key).items.push(item);
  });
  return map;
}

function compareDirectionLabel(left, right) {
  const order = [
    "品川・泉岳寺方面",
    "京急蒲田方面",
    "京急川崎方面",
    "金沢八景方面",
    "堀ノ内方面",
    "西馬込方面",
    "上り",
    "松戸方面",
    "浦賀・三崎口方面",
    "羽田空港方面",
    "小島新田方面",
    "逗子・葉山方面",
    "三崎口方面",
    "押上方面",
    "下り",
    "京成上野方面",
  ];
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  if (leftIndex >= 0 || rightIndex >= 0) {
    return (leftIndex >= 0 ? leftIndex : 999) - (rightIndex >= 0 ? rightIndex : 999);
  }
  return String(left).localeCompare(String(right), "ja");
}

function statusCard(label, value, hint, isWide = false) {
  return `
    <article class="status-card ${isWide ? "status-card--wide" : ""}">
      <div class="status-card__label">${escapeHtml(label)}</div>
      <div class="status-card__value">${escapeHtml(value)}</div>
      <div class="status-card__hint">${escapeHtml(hint)}</div>
    </article>
  `;
}

function chip(text, tone) {
  return `<span class="chip chip--${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
}

function labelSourceTag(tag) {
  return SOURCE_TAG_LABELS[tag] || tag;
}

function locationTypeLabel(value) {
  if (value === "station") {
    return "駅";
  }
  if (value === "section") {
    return "区間";
  }
  return value || "";
}

function confidenceLabel(value) {
  if (value === "high") {
    return "高";
  }
  if (value === "medium") {
    return "中";
  }
  if (value === "low") {
    return "低";
  }
  return value || "";
}

function formatDelayMinutes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "0";
  }
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
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
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function uniqueStringsJs(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
