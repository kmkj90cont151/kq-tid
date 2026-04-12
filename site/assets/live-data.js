(function initLiveTrainData() {
  const LIVE_APP_VERSION = "github-pages-live-3";
  const LIVE_CONFIG = window.APP_CONFIG || {};
  const NETWORK_IDS = ["keikyu", "toei", "keisei", "matsudo"];

  const KEIKYU_API_ENDPOINT = "https://app-kq.net/api/train";
  const KEIKYU_LOCATION_TIMETABLE_ENDPOINT = "https://app-kq.net/api/locationTimetable/";
  const TOEI_TRAIN_ENDPOINT = "https://api.odpt.org/api/v4/odpt:Train";
  const TOEI_TIMETABLE_ENDPOINTS = {
    sengakuji: "https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Sengakuji",
    oshiage: "https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Oshiage",
  };
  const KEISEI_ENDPOINTS = {
    traffic: "https://zaisen.tid-keisei.jp/data/traffic_info.json",
    diainfBase: "https://zaisen.tid-keisei.jp/data/diainf/",
    matsudoTrainInfo: "https://zaisen.tid-keisei.jp/data/matsudo_train_info.json",
    matsudoDate: "https://zaisen.tid-keisei.jp/data/matsudo_date.json",
    matsudoStatus: "https://zaisen.tid-keisei.jp/data/matsudo_status.json",
    syasyu: "https://zaisen.tid-keisei.jp/config/syasyu.json?ver=2.06",
    ikisaki: "https://zaisen.tid-keisei.jp/config/ikisaki.json?ver=2.06",
    station: "https://zaisen.tid-keisei.jp/config/station.json?ver=2.06",
    stop: "https://zaisen.tid-keisei.jp/config/stop.json?ver=2.06",
    rosen: "https://zaisen.tid-keisei.jp/config/rosen.json?ver=2.06",
    coordinate: "https://zaisen.tid-keisei.jp/config/coordinate.json?ver=2.06",
    matsudoId: "https://zaisen.tid-keisei.jp/config/matsudo_id.json?ver=2.06",
    ikMatsudo: "https://zaisen.tid-keisei.jp/config/ik_matsudo.json?ver=2.06",
  };

  const NETWORK_META = {
    keikyu: {
      id: "keikyu",
      label: "京急線",
      description: "旧GAS版の区間表示を土台に、在線APIと列車別時刻表を重ねて表示します。GitHub Pages 上では外部API用のプロキシ設定が必要です。",
      accentColor: "#d72731",
      sourceUrls: [
        { label: "在線API", url: KEIKYU_API_ENDPOINT },
        { label: "公式在線ページ", url: "https://app-kq.net/web/jp/html/zaisen.html" },
        { label: "列車別時刻表API例", url: "https://app-kq.net/api/locationTimetable/8201-1-1403A" },
      ],
    },
    toei: {
      id: "toei",
      label: "都営浅草線",
      description: "ODPT の在線APIを主に、泉岳寺・押上の駅時刻表で行先や番線を補完します。",
      accentColor: "#cb8c15",
      sourceUrls: [
        { label: "ODPT在線API", url: `${TOEI_TRAIN_ENDPOINT}?odpt:railway=odpt.Railway:Toei.Asakusa` },
        { label: "泉岳寺駅時刻表", url: TOEI_TIMETABLE_ENDPOINTS.sengakuji },
        { label: "押上駅時刻表", url: TOEI_TIMETABLE_ENDPOINTS.oshiage },
      ],
    },
    keisei: {
      id: "keisei",
      label: "京成線",
      description: "traffic_info.json を主に、列車別時刻表 diainf を必要時のみ後読みして表示します。GitHub Pages 上ではプロキシ経由で取得します。",
      accentColor: "#0b5bd3",
      sourceUrls: [
        { label: "在線API", url: KEISEI_ENDPOINTS.traffic },
        { label: "公式在線ページ", url: "https://zaisen.tid-keisei.jp/html/zaisen.html?line=1" },
        { label: "種別辞書", url: KEISEI_ENDPOINTS.syasyu },
      ],
    },
    matsudo: {
      id: "matsudo",
      label: "松戸線",
      description: "matsudo_train_info.json と matsudo_id.json を組み合わせて位置と運用番号を表示します。GitHub Pages 上ではプロキシ経由で取得します。",
      accentColor: "#13866f",
      sourceUrls: [
        { label: "在線API", url: KEISEI_ENDPOINTS.matsudoTrainInfo },
        { label: "公式在線ページ", url: "https://zaisen.tid-keisei.jp/html/zaisen.html?line=7" },
        { label: "位置辞書", url: KEISEI_ENDPOINTS.matsudoId },
      ],
    },
  };

  const SERVICE_PALETTE = {
    local: { color: "#2f2f2f", textColor: "#ffffff" },
    express: { color: "#1358b8", textColor: "#ffffff" },
    limited: { color: "#7a3db8", textColor: "#ffffff" },
    special: { color: "#6b7280", textColor: "#ffffff" },
    unknown: { color: "#7c6755", textColor: "#ffffff" },
  };

  const KEIKYU_TIMETABLE_ROUTE_CODES = {
    main: "8201",
    airport: "8401",
    kurihama: "8301",
    daishi: "8501",
    zushi: "8601",
  };

  const KEIKYU_LINE_CONFIG = {
    main: {
      id: "main",
      name: "本線",
      directions: { "1": "浦賀・三崎口方面", "2": "品川・泉岳寺方面" },
    },
    airport: {
      id: "airport",
      name: "空港線",
      directions: { "1": "羽田空港方面", "2": "京急蒲田方面" },
    },
    daishi: {
      id: "daishi",
      name: "大師線",
      directions: { "1": "小島新田方面", "2": "京急川崎方面" },
    },
    zushi: {
      id: "zushi",
      name: "逗子線",
      directions: { "1": "逗子・葉山方面", "2": "金沢八景方面" },
    },
    kurihama: {
      id: "kurihama",
      name: "久里浜線",
      directions: { "1": "三崎口方面", "2": "堀ノ内方面" },
    },
  };

  const KEIKYU_STATION_SEQUENCES = {
    main: [
      [1, "品川"], [2, "北品川"], [3, "新馬場"], [4, "青物横丁"], [5, "鮫洲"], [6, "立会川"],
      [7, "大森海岸"], [8, "平和島"], [9, "大森町"], [10, "梅屋敷"], [11, "京急蒲田"],
      [18, "雑色"], [19, "六郷土手"], [20, "京急川崎"], [27, "八丁畷"], [28, "鶴見市場"],
      [29, "京急鶴見"], [30, "花月総持寺"], [31, "生麦"], [32, "京急新子安"], [33, "子安"],
      [34, "神奈川新町"], [35, "京急東神奈川"], [36, "神奈川"], [37, "横浜"], [38, "戸部"],
      [39, "日ノ出町"], [40, "黄金町"], [41, "南太田"], [42, "井土ヶ谷"], [43, "弘明寺"],
      [44, "上大岡"], [45, "屏風浦"], [46, "杉田"], [47, "京急富岡"], [48, "能見台"],
      [49, "金沢文庫"], [50, "金沢八景"], [54, "追浜"], [55, "京急田浦"], [56, "安針塚"],
      [57, "逸見"], [58, "汐入"], [59, "横須賀中央"], [60, "県立大学"], [61, "堀ノ内"],
      [62, "京急大津"], [63, "馬堀海岸"], [64, "浦賀"],
    ],
    airport: [
      [11, "京急蒲田"], [12, "糀谷"], [13, "大鳥居"], [14, "穴守稲荷"], [15, "天空橋"], [16, "羽田空港第3ターミナル"], [17, "羽田空港第1・第2ターミナル"],
    ],
    daishi: [
      [20, "京急川崎"], [21, "港町"], [22, "鈴木町"], [23, "川崎大師"], [24, "東門前"], [25, "大師橋"], [26, "小島新田"],
    ],
    zushi: [
      [50, "金沢八景"], [51, "六浦"], [52, "神武寺"], [53, "逗子・葉山"],
    ],
    kurihama: [
      [61, "堀ノ内"], [65, "新大津"], [66, "北久里浜"], [67, "京急久里浜"], [68, "YRP野比"], [69, "京急長沢"], [70, "津久井浜"], [71, "三浦海岸"], [72, "三崎口"],
    ],
  };

  const KEIKYU_EXACT_POSITION_META = {
    B033: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 33, neighborStationNumber: 34, neighborSide: "next", confidence: "high" },
    B049: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 49, neighborStationNumber: 50, neighborSide: "next", confidence: "high" },
    D020: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 20, neighborStationNumber: 19, neighborSide: "previous", confidence: "high" },
    D050: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 50, neighborStationNumber: 49, neighborSide: "previous", confidence: "high" },
    D061: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 61, neighborStationNumber: 60, neighborSide: "previous", confidence: "high" },
    E1011: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 11, confidence: "high" },
    E4011: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 11, confidence: "high" },
    E8050: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 50, neighborStationNumber: 54, neighborSide: "next", confidence: "high" },
    ED011: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 11, confidence: "high" },
    ED020: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 20, confidence: "high" },
    ED050: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 50, confidence: "high" },
    ED061: { lineId: "main", sequenceId: "main", locationType: "station", stationNumber: 61, confidence: "high" },
    EU065: { lineId: "kurihama", sequenceId: "kurihama", locationType: "station", stationNumber: 61, label: "堀ノ内", confidence: "high" },
    N050: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 50, neighborStationNumber: 49, neighborSide: "previous", confidence: "high" },
    S011: { lineId: "airport", sequenceId: "airport", locationType: "section", stationNumber: 11, neighborStationNumber: 12, neighborSide: "next", confidence: "high" },
    S020: { lineId: "daishi", sequenceId: "daishi", locationType: "section", stationNumber: 20, neighborStationNumber: 21, neighborSide: "next", confidence: "high" },
    S050: { lineId: "zushi", sequenceId: "zushi", locationType: "section", stationNumber: 50, neighborStationNumber: 51, neighborSide: "next", confidence: "high" },
    S061: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 61, neighborStationNumber: 62, neighborSide: "next", confidence: "high" },
    SD020: { lineId: "daishi", sequenceId: "daishi", locationType: "station", stationNumber: 20, confidence: "high" },
    SU020: { lineId: "daishi", sequenceId: "daishi", locationType: "station", stationNumber: 20, confidence: "high" },
    U011: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 11, neighborStationNumber: 18, neighborSide: "next", confidence: "high" },
    U020: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 20, neighborStationNumber: 27, neighborSide: "next", confidence: "high" },
    U050: { lineId: "main", sequenceId: "main", locationType: "section", stationNumber: 50, neighborStationNumber: 54, neighborSide: "next", confidence: "high" },
    U061: { lineId: "kurihama", sequenceId: "kurihama", locationType: "section", stationNumber: 61, neighborStationNumber: 65, neighborSide: "next", confidence: "high" },
  };

  const KEIKYU_TRAIN_KIND_META = {
    "1": { label: "快特", color: "#009944", textColor: "#ffffff" },
    "2": { label: "特急", color: "#d23431", textColor: "#ffffff" },
    "3": { label: "急行", color: "#1358b8", textColor: "#ffffff" },
    "4": { label: "普通", color: "#2f2f2f", textColor: "#ffffff" },
    "6": { label: "エアポート快特", color: "#f39800", textColor: "#111111" },
    "12": { label: "ウィング", color: "#6a2fb5", textColor: "#ffffff" },
    unknown: { label: "不明", color: "#7c6755", textColor: "#ffffff" },
  };

  const STATION_LABEL_REPLACEMENTS = {
    "羽田空港第1･第2ターミナル": "羽田空港第1・第2ターミナル",
    "羽田空港第1・第2ターミナル駅": "羽田空港第1・第2ターミナル",
    "羽田空港第3ターミナル駅": "羽田空港第3ターミナル",
    "YRP野比駅": "YRP野比",
    "逗子・葉山駅": "逗子・葉山",
  };

  const TOEI_STATION_ORDER = [
    "西馬込", "馬込", "中延", "戸越", "五反田", "高輪台", "泉岳寺", "三田", "大門", "新橋",
    "東銀座", "宝町", "日本橋", "人形町", "東日本橋", "浅草橋", "蔵前", "浅草", "本所吾妻橋", "押上",
  ];

  const TOEI_DIRECTION_LABELS = { Northbound: "押上方面", Southbound: "西馬込方面" };

  const TOEI_TRAIN_TYPE_LABELS = {
    Local: "普通",
    Express: "急行",
    Rapid: "快速",
    LimitedExpress: "特急",
    RapidLimitedExpress: "快特",
    AirportRapidLimitedExpress: "エアポート快特",
    AccessExpress: "アクセス特急",
    CommuterLimitedExpress: "通勤特急",
  };

  const ODPT_LABELS = {
    NishiMagome: "西馬込", Magome: "馬込", Nakanobu: "中延", Togoshi: "戸越", Gotanda: "五反田", Takanawadai: "高輪台",
    Sengakuji: "泉岳寺", Mita: "三田", Daimon: "大門", Shimbashi: "新橋", HigashiGinza: "東銀座", Takaracho: "宝町",
    Nihombashi: "日本橋", Ningyocho: "人形町", HigashiNihombashi: "東日本橋", Asakusabashi: "浅草橋", Kuramae: "蔵前",
    Asakusa: "浅草", HonjoAzumabashi: "本所吾妻橋", Oshiage: "押上", HanedaAirportTerminal1and2: "羽田空港第1・第2ターミナル",
    HanedaAirportTerminal3: "羽田空港第3ターミナル", Miurakaigan: "三浦海岸", Misakiguchi: "三崎口", KeiseiTakasago: "京成高砂",
    Aoto: "青砥", ImbaNihonIdai: "印旛日本医大", InzaiMakinohara: "印西牧の原", NishiShiroi: "西白井",
    NaritaAirportTerminal1: "成田空港第1ターミナル", NaritaAirportTerminal2and3: "成田空港第2・第3ターミナル",
    Shinagawa: "品川", KanazawaBunko: "金沢文庫", KeikyuKawasaki: "京急川崎", Uraga: "浦賀", KeikyuKurihama: "京急久里浜",
    KeiseiNakayama: "京成中山", KeiseiYawata: "京成八幡",
  };

  const KEISEI_DIRECTION_LABELS = { "0": "上り", "1": "下り" };
  const MATSUDO_DIRECTION_LABELS = { "0": "下り", "1": "上り" };

  const LIVE_CACHE = new Map();

  function stringOrEmpty(value) {
    return value == null ? "" : String(value);
  }

  function ensureArray(value) {
    if (value == null) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function firstNonEmpty(values) {
    for (const value of values || []) {
      const text = stringOrEmpty(value).trim();
      if (text) {
        return text;
      }
    }
    return "";
  }

  function uniqueStrings(values) {
    const seen = new Set();
    const result = [];
    (values || []).forEach((value) => {
      const text = stringOrEmpty(value);
      if (!text || seen.has(text)) {
        return;
      }
      seen.add(text);
      result.push(text);
    });
    return result;
  }

  function tokenTail(value) {
    const text = stringOrEmpty(value);
    if (!text) {
      return "";
    }
    const parts = text.split(".");
    return parts[parts.length - 1];
  }

  function localeCompareJa(left, right) {
    return stringOrEmpty(left).localeCompare(stringOrEmpty(right), "ja");
  }

  function buildUrl(base, params) {
    const url = new URL(base, window.location.href);
    Object.entries(params || {}).forEach(([key, value]) => {
      const text = stringOrEmpty(value);
      if (text) {
        url.searchParams.set(key, text);
      }
    });
    return url.toString();
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function normalizeEncoding(encoding) {
    const text = stringOrEmpty(encoding).toLowerCase();
    if (!text || text === "utf8") {
      return "utf-8";
    }
    if (text === "cp932" || text === "windows-31j" || text === "shift_jis") {
      return "shift_jis";
    }
    return text;
  }

  function getCacheEntry(key) {
    const cached = LIVE_CACHE.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
      LIVE_CACHE.delete(key);
      return null;
    }
    return cached.value;
  }

  async function getCachedObject(key, ttlSeconds, supplier) {
    const cached = getCacheEntry(key);
    if (cached !== null) {
      return cached;
    }
    const value = await supplier();
    LIVE_CACHE.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return value;
  }

  function resolveRequestUrl(url, options = {}) {
    const useProxy = Boolean(options.proxy || options.keikyuProxy);
    if (!useProxy) {
      return url;
    }
    const template = stringOrEmpty(LIVE_CONFIG.apiProxyTemplate || LIVE_CONFIG.keikyuProxyTemplate);
    if (!template) {
      const label = stringOrEmpty(options.proxyLabel) || "対象API";
      throw new Error(`${label} は GitHub Pages から直接取得できません。web/assets/config.js に apiProxyTemplate を設定してください。`);
    }
    return template.includes("{url}") ? template.replace("{url}", encodeURIComponent(url)) : `${template}${encodeURIComponent(url)}`;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(resolveRequestUrl(url, options), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${url}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let lastError = null;
    for (const encoding of options.encodings || ["utf-8"]) {
      try {
        const decoder = new TextDecoder(normalizeEncoding(encoding));
        return JSON.parse(decoder.decode(bytes));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(`JSON decode failed: ${url}`);
  }

  function getTokyoNowParts() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = {};
    formatter.formatToParts(new Date()).forEach((part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
    });
    return parts;
  }

  function getOperationalDate() {
    const parts = getTokyoNowParts();
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    if (Number(parts.hour) < 4) {
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return date;
  }

  function getOperationalDateString() {
    const date = getOperationalDate();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function getOperationalDateCompact() {
    return getOperationalDateString().replaceAll("-", "");
  }

  function isHolidayServiceDay() {
    const weekday = getOperationalDate().getUTCDay();
    return weekday === 0 || weekday === 6;
  }

  function padNumber(value, size = 2) {
    return String(value).padStart(size, "0");
  }

  function toTokyoIso(year, month, day, hour = 0, minute = 0, second = 0) {
    const text = `${padNumber(year, 4)}-${padNumber(month)}-${padNumber(day)}T${padNumber(hour)}:${padNumber(minute)}:${padNumber(second)}+09:00`;
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? isoNow() : date.toISOString();
  }

  function buildManifestSummary(totalNetworks) {
    return { totalTrains: 0, delayedTrains: 0, researchTrains: 0, healthyNetworks: 0, loadedNetworks: 0, totalNetworks };
  }

  function buildNetworkShell(networkId) {
    const meta = NETWORK_META[networkId];
    return {
      id: networkId,
      label: meta.label,
      description: meta.description,
      accentColor: meta.accentColor,
      status: "idle",
      updatedAt: "",
      trains: [],
      warnings: [],
      error: "",
      sourceUrls: meta.sourceUrls,
      meta: {},
      loaded: false,
    };
  }

  function compareGenericTrain(left, right) {
    const lineCompare = localeCompareJa(left.lineLabel, right.lineLabel);
    if (lineCompare !== 0) {
      return lineCompare;
    }
    const directionCompare = localeCompareJa(left.directionLabel, right.directionLabel);
    if (directionCompare !== 0) {
      return directionCompare;
    }
    const positionCompare = toNumber(left.positionOrder, 999999) - toNumber(right.positionOrder, 999999);
    if (positionCompare !== 0) {
      return positionCompare;
    }
    return localeCompareJa(left.trainNumber, right.trainNumber);
  }

  function classifyServiceTone(label) {
    const text = stringOrEmpty(label);
    if (!text) {
      return "unknown";
    }
    if (text.includes("普通")) {
      return "local";
    }
    if (text.includes("ライナー") || text.includes("ウィング")) {
      return "limited";
    }
    if (["快特", "特急", "急行", "快速", "アクセス特急"].some((token) => text.includes(token))) {
      return "express";
    }
    if (["回送", "試運転", "臨時"].some((token) => text.includes(token))) {
      return "special";
    }
    return "unknown";
  }

  function pickPalette(label) {
    return SERVICE_PALETTE[classifyServiceTone(label)] || SERVICE_PALETTE.unknown;
  }

  function inferOwnerLabelFromTrainNumber(trainNumber, networkId) {
    const text = stringOrEmpty(trainNumber);
    if (!text) {
      return "";
    }
    if (/H$/i.test(text)) {
      return "京急";
    }
    if (/T$/i.test(text)) {
      return "都営";
    }
    if (/N$/i.test(text)) {
      return "北総";
    }
    if (/K$/i.test(text) || /AE/i.test(text)) {
      return "京成";
    }
    if (/^\d+$/.test(text)) {
      return networkId === "keikyu" ? "京急" : "京成";
    }
    return "";
  }

  function decodeKeikyuStationLabel(value) {
    const text = stringOrEmpty(value).replaceAll("縲", " ").trim();
    return STATION_LABEL_REPLACEMENTS[text] || text;
  }

  function inferKeikyuLineId(stationNumber, positionCode) {
    if (stationNumber >= 12 && stationNumber <= 17) {
      return "airport";
    }
    if (stationNumber >= 21 && stationNumber <= 26) {
      return "daishi";
    }
    if (stationNumber >= 51 && stationNumber <= 53) {
      return "zushi";
    }
    if (stationNumber >= 65 && stationNumber <= 72) {
      return "kurihama";
    }
    return "main";
  }

  function findStationEntry(sequence, stationNumber) {
    return (sequence || []).find((entry) => entry[0] === stationNumber) || null;
  }

  function findStationIndex(sequence, stationNumber) {
    return (sequence || []).findIndex((entry) => entry[0] === stationNumber);
  }

  function buildKeikyuSectionLabel(stationEntry, neighborEntry) {
    if (!stationEntry) {
      return "";
    }
    if (!neighborEntry) {
      return stationEntry[1];
    }
    return `${neighborEntry[1]} - ${stationEntry[1]} 間`;
  }

  function finalizeKeikyuPosition(lineId, locationType, stationNumber, positionCode, forcedLabel, confidence, options = {}) {
    const sequenceId = stringOrEmpty(options.sequenceId) || lineId;
    const sequence = KEIKYU_STATION_SEQUENCES[sequenceId] || KEIKYU_STATION_SEQUENCES.main;
    const stationEntry = findStationEntry(sequence, stationNumber);
    const stationLabel = forcedLabel || (stationEntry ? stationEntry[1] : positionCode);
    let locationLabel = stationLabel;
    let positionOrder = 999999;

    if (stationEntry) {
      const index = findStationIndex(sequence, stationNumber);
      positionOrder = index * 10;
      if (locationType === "section") {
        const neighborEntry = options.neighborStationNumber
          ? findStationEntry(sequence, options.neighborStationNumber)
          : ((options.neighborSide === "previous" ? sequence[index - 1] : sequence[index + 1]) || sequence[index + 1] || sequence[index - 1] || stationEntry);
        const neighborSide = options.neighborSide === "previous" ? "previous" : "next";
        locationLabel = buildKeikyuSectionLabel(stationEntry, neighborEntry);
        positionOrder = index * 10 + (neighborSide === "previous" ? -5 : 5);
      }
    }

    return {
      lineId,
      locationLabel,
      locationType,
      positionOrder,
      confidence,
      stationLabel,
      stationNumber,
    };
  }

  function resolveKeikyuPosition(positionCode) {
    const exact = KEIKYU_EXACT_POSITION_META[positionCode];
    if (exact) {
      return finalizeKeikyuPosition(
        exact.lineId,
        exact.locationType,
        exact.stationNumber,
        positionCode,
        exact.label || "",
        exact.confidence || "high",
        exact
      );
    }

    let match = /^(EU|ED)(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[2]), positionCode), "station", Number(match[2]), positionCode, "", "high");
    }
    match = /^U(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[1]), positionCode), "section", Number(match[1]), positionCode, "", "high", { neighborSide: "next" });
    }
    match = /^D(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[1]), positionCode), "section", Number(match[1]), positionCode, "", "high", { neighborSide: "previous" });
    }
    match = /^S(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[1]), positionCode), "section", Number(match[1]), positionCode, "", "high", { neighborSide: "next" });
    }
    match = /^N(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[1]), positionCode), "section", Number(match[1]), positionCode, "", "high", { neighborSide: "previous" });
    }
    match = /^(SU|SD)(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(inferKeikyuLineId(Number(match[2]), positionCode), "station", Number(match[2]), positionCode, "", "high");
    }
    match = /(\d{3})$/.exec(positionCode);
    if (match) {
      return finalizeKeikyuPosition(
        inferKeikyuLineId(Number(match[1]), positionCode),
        positionCode.startsWith("E") ? "station" : "section",
        Number(match[1]),
        positionCode,
        "",
        "low",
        { neighborSide: "next" }
      );
    }

    return {
      lineId: "main",
      locationLabel: positionCode || "位置不明",
      locationType: "section",
      positionOrder: 999999,
      confidence: "low",
      stationLabel: "",
      stationNumber: 0,
    };
  }

  function normalizeKeikyuTimetableTime(value) {
    const text = stringOrEmpty(value).trim();
    return text && text !== "-" ? text : "";
  }

  function normalizeKeikyuTimetablePayload(payload) {
    const rows = [];
    const info = payload && typeof payload === "object" ? payload.info || {} : {};

    ensureArray(payload && payload.stations).forEach((row) => {
      const platform = firstNonEmpty([row.platform, row.platformNumber]);
      const arrivalTime = normalizeKeikyuTimetableTime(row.arrival || row.arrivalTime);
      const departureTime = normalizeKeikyuTimetableTime(row.departure || row.departureTime || row.time);
      const isSkip = stringOrEmpty(row.isSkip || row.isPass || row.pass) === "1";
      const stationLabel = decodeKeikyuStationLabel(firstNonEmpty([row.stationName, row.name]));
      if (!(stationLabel || arrivalTime || departureTime || platform)) {
        return;
      }
      rows.push({
        stationCode: stringOrEmpty(row.stationCode || row.code),
        stationLabel,
        arrivalTime,
        departureTime,
        stopType: isSkip ? "通過" : (platform ? `${platform}番線` : "停車"),
        platform,
        formation: stringOrEmpty(row.formation),
        numberOfCars: stringOrEmpty(row.numberOfCars),
      });
    });

    let vehicleLabel = firstNonEmpty([info.formation, info.numberOfCars]);
    if (vehicleLabel && /^\d+$/.test(vehicleLabel)) {
      vehicleLabel = `${vehicleLabel}両`;
    }
    if (!vehicleLabel) {
      vehicleLabel = firstNonEmpty(rows.map((row) => row.formation));
    }
    if (!vehicleLabel) {
      const cars = firstNonEmpty(rows.map((row) => row.numberOfCars));
      vehicleLabel = cars ? (cars.endsWith("両") ? cars : `${cars}両`) : "";
    }

    return {
      originLabel: firstNonEmpty([decodeKeikyuStationLabel(info.from), decodeKeikyuStationLabel(payload && payload.from)]),
      destinationLabel: firstNonEmpty([decodeKeikyuStationLabel(info.to), decodeKeikyuStationLabel(payload && payload.to)]),
      detailRows: rows,
      detailSummary: "京急列車別時刻表",
      vehicleLabel,
    };
  }

  function directionCandidates(preferredDirection = "1") {
    const mapped = preferredDirection === "1" ? "0" : preferredDirection === "2" ? "1" : stringOrEmpty(preferredDirection || "1");
    const opposite = mapped === "0" ? "1" : mapped === "1" ? "0" : "";
    return uniqueStrings([mapped, opposite, "0", "1"]);
  }

  function buildKeikyuCandidateUrls(trainNumber, lineId, preferredDirection = "1") {
    const primaryRoute = KEIKYU_TIMETABLE_ROUTE_CODES[lineId] || KEIKYU_TIMETABLE_ROUTE_CODES.main;
    const routeCodes = uniqueStrings([primaryRoute, ...Object.values(KEIKYU_TIMETABLE_ROUTE_CODES)]);
    const urls = [];
    routeCodes.forEach((routeCode) => {
      directionCandidates(preferredDirection).forEach((directionCode) => {
        urls.push(`${KEIKYU_LOCATION_TIMETABLE_ENDPOINT}${routeCode}-${directionCode}-${trainNumber}`);
      });
    });
    return urls;
  }

  async function fetchKeikyuTimetable(trainNumber, lineId, directionCode) {
    return getCachedObject(`keikyu:timetable:${trainNumber}:${lineId}:${directionCode}`, 60, async () => {
      let lastError = null;
      for (const url of buildKeikyuCandidateUrls(trainNumber, lineId, directionCode)) {
        try {
          const payload = await fetchJson(url, { encodings: ["shift_jis", "cp932", "utf-8"], keikyuProxy: true });
          if (payload && Array.isArray(payload.stations)) {
            return normalizeKeikyuTimetablePayload(payload);
          }
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`京急列車別時刻表を取得できませんでした${lastError ? `: ${lastError.message || String(lastError)}` : ""}`);
    });
  }

  function pickKeikyuPlatform(positionInfo, detailRows) {
    const stationLabel = stringOrEmpty(positionInfo && positionInfo.stationLabel);
    if (stationLabel) {
      const row = ensureArray(detailRows).find((item) => item.platform && item.stationLabel === stationLabel);
      if (row) {
        return stringOrEmpty(row.platform);
      }
    }
    const firstRow = ensureArray(detailRows).find((item) => item.platform);
    return firstRow ? stringOrEmpty(firstRow.platform) : "";
  }

  function normalizeKeikyuTrain(record) {
    const positionCode = stringOrEmpty(record.position || record.id);
    const directionCode = stringOrEmpty(record.direction);
    const positionInfo = resolveKeikyuPosition(positionCode);
    const lineConfig = KEIKYU_LINE_CONFIG[positionInfo.lineId] || KEIKYU_LINE_CONFIG.main;
    const trainNumber = stringOrEmpty(record.train_no);
    const serviceMeta = KEIKYU_TRAIN_KIND_META[stringOrEmpty(record.train_kind)] || KEIKYU_TRAIN_KIND_META.unknown;
    const detailAvailable = Boolean(trainNumber && trainNumber !== "0");

    return {
      networkId: "keikyu",
      trainNumber: trainNumber || "(列番なし)",
      lineId: positionInfo.lineId,
      lineLabel: lineConfig.name,
      directionCode,
      directionLabel: lineConfig.directions[directionCode] || "方向不明",
      positionCode,
      locationLabel: positionInfo.locationLabel,
      locationType: positionInfo.locationType,
      positionOrder: positionInfo.positionOrder,
      confidence: positionInfo.confidence,
      serviceTypeCode: stringOrEmpty(record.train_kind),
      serviceTypeLabel: serviceMeta.label,
      serviceTone: classifyServiceTone(serviceMeta.label),
      serviceColor: serviceMeta.color,
      serviceTextColor: serviceMeta.textColor,
      originLabel: firstNonEmpty([record.origin, record.from, record.origin_name]),
      destinationLabel: firstNonEmpty([record.destination, record.ikisaki, record.to, record.destination_name]),
      platform: stringOrEmpty(record.platform),
      delayMinutes: toNumber(record.late_minutes, 0),
      ownerLabel: firstNonEmpty([record.owner, record.train_owner, inferOwnerLabelFromTrainNumber(trainNumber, "keikyu")]),
      vehicleLabel: firstNonEmpty([record.vehicle, record.formation, record.car_info]),
      sourceTags: ["live"],
      researchCandidate: positionInfo.confidence !== "high" || trainNumber === "0",
      note: [positionCode ? `位置コード ${positionCode}` : "", stringOrEmpty(record.is_alert) === "1" ? "公式アラートあり" : ""].filter(Boolean).join(" / "),
      detailAvailable,
      detailKey: detailAvailable ? `keikyu:${trainNumber}:${directionCode || "x"}` : "",
      detailRequest: detailAvailable ? { trainNumber, lineId: positionInfo.lineId, positionCode, directionCode: directionCode || "1" } : null,
      detailRows: [],
      detailSummary: "京急列車別時刻表",
    };
  }

  async function buildKeikyuSnapshot() {
    return getCachedObject("network:keikyu", 10, async () => {
      const payload = await fetchJson(KEIKYU_API_ENDPOINT, { encodings: ["utf-8", "cp932", "shift_jis"], keikyuProxy: true });
      if (!Array.isArray(payload)) {
        throw new Error("京急APIの応答形式が想定外です。");
      }
      return {
        id: "keikyu",
        label: NETWORK_META.keikyu.label,
        description: NETWORK_META.keikyu.description,
        accentColor: NETWORK_META.keikyu.accentColor,
        status: "ok",
        updatedAt: firstNonEmpty([payload[0] && payload[0].receive_datetime, isoNow()]),
        trains: payload.map(normalizeKeikyuTrain).sort(compareGenericTrain),
        warnings: [
          "未解読の位置コードや train_no=0 の列車は raw のまま残します。",
          "京急蒲田、京急川崎、金沢八景、堀ノ内まわりの分岐は API 優先で補完しています。",
          "GitHub Pages 本番では京急API用のプロキシ設定が必要です。",
        ],
        error: "",
        sourceUrls: NETWORK_META.keikyu.sourceUrls,
        meta: {
          requiresProxy: true,
          detailMode: "列車カード展開時に後読み",
          positionMappingMode: "旧GAS版準拠の推定付き",
        },
        loaded: true,
      };
    });
  }

  async function buildKeikyuTrainDetail(request) {
    const trainNumber = stringOrEmpty(request && request.trainNumber);
    const lineId = stringOrEmpty(request && request.lineId) || "main";
    const positionCode = stringOrEmpty(request && request.positionCode);
    const directionCode = stringOrEmpty(request && request.directionCode) || "1";
    const positionInfo = positionCode ? resolveKeikyuPosition(positionCode) : { stationLabel: "" };
    const timetable = await fetchKeikyuTimetable(trainNumber, lineId, directionCode);
    return {
      detailKey: `keikyu:${trainNumber}:${directionCode || "x"}`,
      detailRows: ensureArray(timetable.detailRows),
      detailSummary: timetable.detailSummary || "京急列車別時刻表",
      originLabel: timetable.originLabel || "",
      destinationLabel: timetable.destinationLabel || "",
      platform: pickKeikyuPlatform(positionInfo, timetable.detailRows),
      vehicleLabel: timetable.vehicleLabel || "",
      sourceTags: ["timetable"],
    };
  }

  function labelOdptToken(value) {
    const tail = tokenTail(value);
    if (!tail) {
      return "";
    }
    return ODPT_LABELS[tail] || tail.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  function labelOdptList(value) {
    const items = ensureArray(value);
    return items.length > 0 ? labelOdptToken(items[0]) : "";
  }

  function normalizeToeiDelayMinutes(value) {
    const seconds = toNumber(value, 0);
    if (seconds <= 0) {
      return 0;
    }
    return Number.isInteger(seconds / 60) ? seconds / 60 : Number((seconds / 60).toFixed(1));
  }

  function matchesToeiCalendar(calendarToken) {
    const tail = tokenTail(calendarToken);
    return isHolidayServiceDay() ? tail === "SaturdayHoliday" : tail === "Weekday";
  }

  function resolveToeiPosition(fromStation, toStation) {
    const fromLabel = labelOdptToken(fromStation);
    const toLabel = labelOdptToken(toStation);
    if (fromLabel && toLabel) {
      return {
        locationLabel: fromLabel,
        locationType: "station",
        positionOrder: TOEI_STATION_ORDER.indexOf(fromLabel) >= 0 ? TOEI_STATION_ORDER.indexOf(fromLabel) : 999999,
        confidence: "high",
      };
    }
    if (fromLabel || toLabel) {
      const label = fromLabel || toLabel;
      return {
        locationLabel: label,
        locationType: "station",
        positionOrder: TOEI_STATION_ORDER.indexOf(label) >= 0 ? TOEI_STATION_ORDER.indexOf(label) : 999999,
        confidence: "medium",
      };
    }
    return {
      locationLabel: "位置不明",
      locationType: "section",
      positionOrder: 999999,
      confidence: "low",
    };
  }

  function pickToeiSupplement(directionCode, supplementRows) {
    if (!supplementRows.length) {
      return null;
    }
    const preferredStation = directionCode === "Northbound" ? "泉岳寺" : directionCode === "Southbound" ? "押上" : "";
    return supplementRows.find((row) => row.stationLabel === preferredStation) || supplementRows[0];
  }

  function normalizeToeiDetailRows(rows) {
    return rows.map((row) => ({
      stationCode: row.stationCode || "",
      stationLabel: row.stationLabel || "",
      arrivalTime: "",
      departureTime: row.departureTime || "",
      stopType: row.platform ? `${row.platform}番線` : "境界時刻",
    }));
  }

  function labelToeiTrainType(trainTypeToken) {
    const tail = tokenTail(trainTypeToken);
    return TOEI_TRAIN_TYPE_LABELS[tail] || labelOdptToken(trainTypeToken) || "不明";
  }

  async function buildToeiTimetableLookup() {
    return getCachedObject(`toei:timetable:${getOperationalDateString()}`, 600, async () => {
      const lookup = {};
      for (const url of Object.values(TOEI_TIMETABLE_ENDPOINTS)) {
        const payload = await fetchJson(url, { encodings: ["utf-8"] });
        ensureArray(payload).forEach((table) => {
          if (!table || typeof table !== "object" || !matchesToeiCalendar(table["odpt:calendar"])) {
            return;
          }
          const stationLabel = labelOdptToken(table["odpt:station"]);
          const stationCode = tokenTail(table["odpt:station"]);
          const directionCode = tokenTail(table["odpt:railDirection"]);
          ensureArray(table["odpt:stationTimetableObject"]).forEach((row) => {
            if (!row || typeof row !== "object") {
              return;
            }
            const trainNumber = stringOrEmpty(row["odpt:trainNumber"]);
            if (!trainNumber) {
              return;
            }
            lookup[trainNumber] = lookup[trainNumber] || [];
            lookup[trainNumber].push({
              stationCode,
              stationLabel,
              directionCode,
              departureTime: stringOrEmpty(row["odpt:departureTime"]),
              platform: stringOrEmpty(row["odpt:platformNumber"]),
              destinationLabel: labelOdptList(row["odpt:destinationStation"]),
            });
          });
        });
      }
      return lookup;
    });
  }

  function normalizeToeiTrain(record, timetableLookup) {
    const trainNumber = stringOrEmpty(record["odpt:trainNumber"]);
    const directionToken = tokenTail(record["odpt:railDirection"]);
    const directionLabel = TOEI_DIRECTION_LABELS[directionToken] || labelOdptToken(record["odpt:railDirection"]) || "方向不明";
    const supplementRows = timetableLookup[trainNumber] || [];
    const supplement = pickToeiSupplement(directionToken, supplementRows);
    const positionInfo = resolveToeiPosition(record["odpt:fromStation"], record["odpt:toStation"]);
    const destinationLabel = firstNonEmpty([
      labelOdptList(record["odpt:destinationStation"]),
      supplement ? supplement.destinationLabel : "",
    ]);
    const serviceTypeLabel = labelToeiTrainType(record["odpt:trainType"]);
    const palette = pickPalette(serviceTypeLabel);
    const sourceTags = ["live"];
    if (supplement) {
      sourceTags.push("timetable");
    }

    return {
      networkId: "toei",
      trainNumber: trainNumber || "(列番なし)",
      lineId: "asakusa",
      lineLabel: "都営浅草線",
      directionCode: directionToken,
      directionLabel,
      positionCode: [stringOrEmpty(record["odpt:fromStation"]), stringOrEmpty(record["odpt:toStation"])].filter(Boolean).join(" -> "),
      locationLabel: positionInfo.locationLabel,
      locationType: positionInfo.locationType,
      positionOrder: positionInfo.positionOrder,
      confidence: positionInfo.confidence,
      serviceTypeCode: tokenTail(record["odpt:trainType"]),
      serviceTypeLabel,
      serviceTone: classifyServiceTone(serviceTypeLabel),
      serviceColor: palette.color,
      serviceTextColor: palette.textColor,
      originLabel: labelOdptList(record["odpt:originStation"]),
      destinationLabel,
      platform: firstNonEmpty([record["odpt:platformNumber"], supplement ? supplement.platform : ""]),
      delayMinutes: normalizeToeiDelayMinutes(record["odpt:delay"]),
      ownerLabel: labelOdptToken(record["odpt:trainOwner"] || record["odpt:operator"]),
      vehicleLabel: "",
      sourceTags,
      researchCandidate: positionInfo.confidence !== "high" || !destinationLabel,
      note: supplement ? "境界駅時刻表で行先または番線を補完" : "",
      detailRows: normalizeToeiDetailRows(supplementRows),
      detailSummary: supplementRows.length ? "境界駅時刻表" : "",
      detailAvailable: false,
      detailKey: "",
      detailRequest: null,
    };
  }

  async function buildToeiSnapshot() {
    return getCachedObject("network:toei", 10, async () => {
      const consumerKey = stringOrEmpty(LIVE_CONFIG.odptConsumerKey);
      const payload = await fetchJson(buildUrl(TOEI_TRAIN_ENDPOINT, {
        "odpt:railway": "odpt.Railway:Toei.Asakusa",
        "acl:consumerKey": consumerKey,
      }));
      if (!Array.isArray(payload)) {
        throw new Error("都営浅草線ODPTの応答形式が想定外です。");
      }
      const timetableLookup = await buildToeiTimetableLookup();
      return {
        id: "toei",
        label: NETWORK_META.toei.label,
        description: NETWORK_META.toei.description,
        accentColor: NETWORK_META.toei.accentColor,
        status: "ok",
        updatedAt: firstNonEmpty([payload[0] && payload[0]["dc:date"], isoNow()]),
        trains: payload.filter((row) => row && typeof row === "object").map((row) => normalizeToeiTrain(row, timetableLookup)).sort(compareGenericTrain),
        warnings: [
          "fromStation / toStation を主情報として扱い、不足分だけ時刻表で補完します。",
          "直通先の表示は、辞書に無い場合は ODPT トークンを整形して使います。",
        ],
        error: "",
        sourceUrls: NETWORK_META.toei.sourceUrls,
        meta: {
          timetableStations: ["泉岳寺", "押上"],
          consumerKeyConfigured: Boolean(consumerKey),
        },
        loaded: true,
      };
    });
  }

  function normalizeRailwayName(value) {
    return stringOrEmpty(value)
      .replace(/空港第２ビル/g, "空港第2ビル")
      .replace(/千葉ﾆｭｰﾀｳﾝ中央/g, "千葉ニュータウン中央")
      .replace(/\s+/g, "");
  }

  function normalizeDisplayRailwayName(value) {
    return normalizeRailwayName(value);
  }

  function denormalizeRailwayName(value) {
    return stringOrEmpty(value);
  }

  async function getKeiseiConfigBundle() {
    return getCachedObject("keisei:config", 3600, async () => {
      const loaded = {};
      for (const [key, url] of Object.entries({
        syasyu: KEISEI_ENDPOINTS.syasyu,
        ikisaki: KEISEI_ENDPOINTS.ikisaki,
        station: KEISEI_ENDPOINTS.station,
        stop: KEISEI_ENDPOINTS.stop,
        rosen: KEISEI_ENDPOINTS.rosen,
        coordinate: KEISEI_ENDPOINTS.coordinate,
        matsudoId: KEISEI_ENDPOINTS.matsudoId,
        ikMatsudo: KEISEI_ENDPOINTS.ikMatsudo,
      })) {
        loaded[key] = await fetchJson(url, {
          encodings: ["utf-8", "cp932", "shift_jis"],
          proxy: true,
          proxyLabel: "京成設定API",
        });
      }

      const syasyu = ensureArray((loaded.syasyu || {}).syasyu);
      const ikisaki = ensureArray((loaded.ikisaki || {}).ikisaki);
      const station = ensureArray((loaded.station || {}).station);
      const stop = ensureArray((loaded.stop || {}).stop);
      const rosen = ensureArray((loaded.rosen || {}).rosen);
      const coordinate = ensureArray((loaded.coordinate || {}).coordinate);
      const matsudoId = ensureArray((loaded.matsudoId || {}).matsudo);
      const ikMatsudo = ensureArray((loaded.ikMatsudo || {}).ik_matsudo);

      const bundle = {
        syasyuByCode: Object.fromEntries(syasyu.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.code), row])),
        ikisakiByCode: Object.fromEntries(ikisaki.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.code), row])),
        stationById: Object.fromEntries(station.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.id), row])),
        stopByCode: Object.fromEntries(stop.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.code), row])),
        rosenByCode: Object.fromEntries(rosen.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.code), row])),
        matsudoIdBySection: Object.fromEntries(matsudoId.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.sectionid), row])),
        ikMatsudoByCode: Object.fromEntries(ikMatsudo.filter((row) => row && typeof row === "object").map((row) => [stringOrEmpty(row.code), row])),
        coordinateByName: {},
        lineStations: {},
        syasyuCount: syasyu.length,
        ikisakiCount: ikisaki.length,
        stationCount: station.length,
        stopCount: stop.length,
      };

      coordinate.forEach((row) => {
        if (!row || typeof row !== "object") {
          return;
        }
        const name = normalizeDisplayRailwayName(row.ifname);
        if (!name) {
          return;
        }
        const items = [];
        ensureArray(row.zh).forEach((item) => {
          if (!item || typeof item !== "object") {
            return;
          }
          const rs = stringOrEmpty(item.rs);
          const y = toNumber(item.y, -1);
          if (rs && y >= 0) {
            items.push({ rs, x: toNumber(item.x, 0), y });
          }
        });
        if (items.length > 0) {
          bundle.coordinateByName[name] = (bundle.coordinateByName[name] || []).concat(items);
        }
      });

      Object.entries(bundle.coordinateByName).forEach(([name, items]) => {
        items.forEach((item) => {
          bundle.lineStations[item.rs] = bundle.lineStations[item.rs] || [];
          bundle.lineStations[item.rs].push({ name, y: item.y });
        });
      });

      Object.values(bundle.lineStations).forEach((stations) => {
        stations.sort((left, right) => left.y - right.y);
      });

      return bundle;
    });
  }

  function flattenKeiseiTraffic(trafficInfo) {
    const records = [];
    ["TS", "EK"].forEach((bucket) => {
      ensureArray((trafficInfo || {})[bucket]).forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        const positionCode = stringOrEmpty(entry.id);
        ensureArray(entry.tr).forEach((train, index) => {
          if (!train || typeof train !== "object") {
            return;
          }
          records.push({
            positionBucket: bucket,
            positionCode,
            trainNumber: stringOrEmpty(train.no),
            raw: {
              bs: stringOrEmpty(train.bs),
              sy: stringOrEmpty(train.sy),
              ik: stringOrEmpty(train.ik),
              dl: stringOrEmpty(train.dl),
              hk: stringOrEmpty(train.hk),
              sr: stringOrEmpty(train.sr),
              index,
            },
          });
        });
      });
    });
    return records;
  }

  function extractDigits(value) {
    const match = stringOrEmpty(value).match(/(\d+)$/);
    if (!match) {
      return "";
    }
    const number = Number(match[1]);
    return Number.isFinite(number) ? String(number) : match[1];
  }

  function lookupKeiseiStationName(code, config, isMatsudo) {
    if (!code) {
      return "";
    }
    const stopEntry = config.stopByCode[code];
    const matsudoEntry = config.ikMatsudoByCode[code];
    if (isMatsudo && matsudoEntry) {
      return normalizeDisplayRailwayName(matsudoEntry.name);
    }
    if (stopEntry) {
      return normalizeDisplayRailwayName(stopEntry.name);
    }
    if (matsudoEntry) {
      return normalizeDisplayRailwayName(matsudoEntry.name);
    }
    return "";
  }

  function guessKeiseiLineFromDestinationCode(code) {
    const value = Number(code);
    if (!value) {
      return "";
    }
    if ((value >= 47 && value <= 51) || (value >= 90 && value <= 95)) {
      return "4";
    }
    if (value === 52 || value === 53) {
      return "5";
    }
    if ((value >= 54 && value <= 84) || value === 61 || value === 62) {
      return "6";
    }
    if (value === 46 || value === 130) {
      return "2";
    }
    if ((value >= 140 && value <= 149) || (value >= 211 && value <= 216)) {
      return "3";
    }
    if ((value >= 131 && value <= 136) || (value >= 221 && value <= 237)) {
      return "7";
    }
    return "1";
  }

  function guessKeiseiLineFromSr(sr) {
    if (sr === "8") {
      return "3";
    }
    if (sr === "4") {
      return "4";
    }
    if (sr === "6") {
      return "1";
    }
    return "";
  }

  function isKeiseiSubwayThrough(destinationCode) {
    const value = Number(destinationCode);
    return (value >= 90 && value <= 121) || value === 47;
  }

  function getKeiseiLineCandidates(stationLabel, config) {
    if (!stationLabel) {
      return [];
    }
    return uniqueStrings((config.coordinateByName[normalizeRailwayName(stationLabel)] || []).map((item) => stringOrEmpty(item.rs)).filter(Boolean));
  }

  function pickKeiseiCoordinate(stationLabel, lineCode, config) {
    const items = config.coordinateByName[normalizeRailwayName(stationLabel)] || [];
    if (!items.length) {
      return null;
    }
    return items.find((item) => stringOrEmpty(item.rs) === stringOrEmpty(lineCode)) || items[0];
  }

  function buildKeiseiSectionLabel(stationLabel, lineCode, config) {
    if (!stationLabel) {
      return "";
    }
    const stations = config.lineStations[stringOrEmpty(lineCode)] || [];
    const normalized = normalizeRailwayName(stationLabel);
    const index = stations.findIndex((row) => row.name === normalized);
    if (index < 0) {
      return `${stationLabel}付近`;
    }
    const neighbor = stations[index + 1] || stations[index - 1] || null;
    if (!neighbor) {
      return `${stationLabel}付近`;
    }
    return `${denormalizeRailwayName(neighbor.name)} - ${stationLabel}間`;
  }

  function inferKeiseiLineCode(record, stationLabel, config, stationCode) {
    const candidates = getKeiseiLineCandidates(stationLabel, config);
    if (candidates.length === 1) {
      return candidates[0];
    }

    const destinationLine = guessKeiseiLineFromDestinationCode(record.raw.ik);
    if (destinationLine && candidates.includes(destinationLine)) {
      return destinationLine;
    }

    const srHint = guessKeiseiLineFromSr(record.raw.sr);
    if (srHint && candidates.includes(srHint)) {
      return srHint;
    }

    if (stationLabel === "青砥") {
      return isKeiseiSubwayThrough(record.raw.ik) ? "4" : "1";
    }

    if (stationLabel === "京成高砂") {
      if (destinationLine === "5") {
        return "5";
      }
      if (destinationLine === "3") {
        return "3";
      }
      if (record.raw.sy === "17" || record.raw.sy === "18") {
        return "3";
      }
      return "1";
    }

    if (stationLabel === "京成津田沼") {
      if (destinationLine === "7") {
        return "7";
      }
      if (destinationLine === "6") {
        return "6";
      }
      return "1";
    }

    if (stationLabel === "京成成田") {
      return destinationLine === "2" ? "2" : "1";
    }

    if (candidates.length > 0) {
      return candidates[0];
    }
    if (destinationLine) {
      return destinationLine;
    }
    if (stationCode && Number(stationCode) >= 131) {
      return "7";
    }
    return "1";
  }

  function resolveKeiseiPosition(record, config, forcedLineCode = "") {
    const stationCode = extractDigits(record.positionCode || "");
    const stationLabel = lookupKeiseiStationName(stationCode, config, forcedLineCode === "7");
    const locationType = record.positionBucket === "TS" ? "station" : "section";
    const lineCode = forcedLineCode || inferKeiseiLineCode(record, stationLabel, config, stationCode);
    const lineLabel = normalizeDisplayRailwayName((config.rosenByCode[lineCode] || {}).name) || "路線不明";
    const coord = pickKeiseiCoordinate(stationLabel, lineCode, config);
    const confidence = stationLabel && coord ? "high" : stationLabel ? "medium" : "low";
    let locationLabel = stationLabel || record.positionCode || "位置不明";
    let positionOrder = coord ? coord.y : 999999;

    if (locationType === "section") {
      locationLabel = buildKeiseiSectionLabel(stationLabel, lineCode, config) || (stationLabel ? `${stationLabel}付近` : (record.positionCode || "位置不明"));
      positionOrder = coord ? coord.y + 0.5 : 999999;
    }

    return { lineCode, lineLabel, locationLabel, locationType, positionOrder, confidence };
  }

  function normalizeKeiseiTime(value) {
    const text = stringOrEmpty(value).trim();
    return text && text.includes(":") ? text : "";
  }

  function normalizeKeiseiDiaRows(payload, config) {
    const rows = [];
    ensureArray((payload || {}).dy).forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }
      const stationCode = stringOrEmpty(row.st);
      rows.push({
        stationCode,
        stationLabel: lookupKeiseiStationName(stationCode, config, false),
        arrivalTime: normalizeKeiseiTime(row.tt),
        departureTime: normalizeKeiseiTime(row.ht),
        stopType: stringOrEmpty(row.pa) === "1" ? "通過" : "停車",
      });
    });
    return rows;
  }

  async function fetchKeiseiDiaRows(trainNumber, config) {
    return getCachedObject(`keisei:diainf:${trainNumber}:${getOperationalDateCompact()}`, 60, async () => {
      const payload = await fetchJson(`${KEISEI_ENDPOINTS.diainfBase}${trainNumber}.json?ts=${getOperationalDateCompact()}`, {
        encodings: ["utf-8", "cp932", "shift_jis"],
        proxy: true,
        proxyLabel: "京成列車別時刻表API",
      });
      return normalizeKeiseiDiaRows(payload, config);
    });
  }

  function normalizeKeiseiTrain(record, config) {
    const positionInfo = resolveKeiseiPosition(record, config, "");
    const serviceEntry = config.syasyuByCode[record.raw.sy] || null;
    const destinationEntry = config.ikisakiByCode[record.raw.ik] || null;
    const serviceTypeLabel = stringOrEmpty(serviceEntry && serviceEntry.name) || "不明";
    const destinationLabel = stringOrEmpty(destinationEntry && destinationEntry.name);
    const palette = pickPalette(serviceTypeLabel);
    const trainNumber = record.trainNumber || "(列番なし)";

    return {
      networkId: "keisei",
      trainNumber,
      lineId: positionInfo.lineCode || "1",
      lineLabel: positionInfo.lineLabel || "路線不明",
      directionCode: record.raw.hk,
      directionLabel: KEISEI_DIRECTION_LABELS[record.raw.hk] || `方向コード ${record.raw.hk || "-"}`,
      positionCode: record.positionCode || "",
      locationLabel: positionInfo.locationLabel,
      locationType: positionInfo.locationType,
      positionOrder: positionInfo.positionOrder,
      confidence: positionInfo.confidence,
      serviceTypeCode: record.raw.sy || "",
      serviceTypeLabel,
      serviceTone: classifyServiceTone(serviceTypeLabel),
      serviceColor: palette.color,
      serviceTextColor: palette.textColor,
      originLabel: "",
      destinationLabel,
      platform: "",
      delayMinutes: toNumber(record.raw.dl, 0),
      ownerLabel: "京成",
      vehicleLabel: "",
      sourceTags: ["live"],
      researchCandidate: positionInfo.confidence !== "high" || !serviceEntry || !destinationEntry || !positionInfo.lineCode,
      note: [record.raw.sr ? `sr=${record.raw.sr}` : "", record.raw.bs ? `bs=${record.raw.bs}` : ""].filter(Boolean).join(" / "),
      detailAvailable: Boolean(trainNumber && trainNumber !== "(列番なし)"),
      detailKey: trainNumber ? `keisei:${trainNumber}` : "",
      detailRequest: trainNumber ? { trainNumber } : null,
      detailRows: [],
      detailSummary: "公式列車別時刻表",
    };
  }

  function parseKeiseiUpdateTimestamp(payload) {
    const entry = Array.isArray((payload || {}).UP) ? payload.UP[0] : null;
    if (!entry || typeof entry !== "object") {
      return isoNow();
    }
    const dt = Array.isArray(entry.dt) ? entry.dt[0] : null;
    if (!dt || typeof dt !== "object") {
      return isoNow();
    }
    return toTokyoIso(dt.yy || 1970, dt.mt || 1, dt.dy || 1, dt.hh || 0, dt.mm || 0, dt.ss || 0);
  }

  async function buildKeiseiSnapshot() {
    return getCachedObject("network:keisei", 10, async () => {
      const [trafficInfo, config] = await Promise.all([
        fetchJson(KEISEI_ENDPOINTS.traffic, {
          encodings: ["utf-8", "cp932", "shift_jis"],
          proxy: true,
          proxyLabel: "京成在線API",
        }),
        getKeiseiConfigBundle(),
      ]);
      const records = flattenKeiseiTraffic(trafficInfo);
      return {
        id: "keisei",
        label: NETWORK_META.keisei.label,
        description: NETWORK_META.keisei.description,
        accentColor: NETWORK_META.keisei.accentColor,
        status: "ok",
        updatedAt: parseKeiseiUpdateTimestamp(trafficInfo),
        trains: records.map((record) => normalizeKeiseiTrain(record, config)).sort(compareGenericTrain),
        warnings: [
          "列車位置は stop.json / coordinate.json を使って可能な範囲で駅名に変換し、未解読コードは raw のまま残します。",
          "列車別時刻表 diainf は列車カードを開いたときだけ取得します。",
        ],
        error: "",
        sourceUrls: NETWORK_META.keisei.sourceUrls,
        meta: {
          configLoaded: {
            syasyu: config.syasyuCount,
            ikisaki: config.ikisakiCount,
            station: config.stationCount,
            stop: config.stopCount,
          },
          positionMappingMode: "旧GAS版相当の辞書補完",
        },
        loaded: true,
      };
    });
  }

  async function buildKeiseiTrainDetail(request) {
    const trainNumber = stringOrEmpty(request && request.trainNumber);
    const config = await getKeiseiConfigBundle();
    const detailRows = await fetchKeiseiDiaRows(trainNumber, config);
    return {
      detailKey: `keisei:${trainNumber}`,
      detailRows,
      detailSummary: "公式列車別時刻表",
      sourceTags: ["timetable"],
    };
  }

  function parseMatsudoUpdateTimestamp(payload) {
    const entry = ensureArray(payload)[0];
    const stamp = entry && typeof entry === "object" ? entry.trainPositionUpdatePK : null;
    if (!stamp || typeof stamp !== "object" || !stamp.currentdate || !stamp.currenttime) {
      return isoNow();
    }
    const dateText = String(stamp.currentdate);
    const timeText = String(stamp.currenttime).padStart(6, "0");
    return toTokyoIso(
      Number(dateText.slice(0, 4)),
      Number(dateText.slice(4, 6)),
      Number(dateText.slice(6, 8)),
      Number(timeText.slice(0, 2)),
      Number(timeText.slice(2, 4)),
      Number(timeText.slice(4, 6))
    );
  }

  function resolveMatsudoPosition(mapping, config) {
    if (!mapping) {
      return { locationLabel: "位置不明", locationType: "section", positionOrder: 999999, confidence: "low" };
    }

    const locationType = stringOrEmpty(mapping.id).startsWith("E") ? "station" : "section";
    const stationCode = extractDigits(mapping.id || "");
    const stationLabel = lookupKeiseiStationName(stationCode, config, true) || lookupKeiseiStationName(stationCode, config, false);
    const coord = pickKeiseiCoordinate(stationLabel, "7", config);
    const positionOrder = coord ? (locationType === "section" ? coord.y + 0.5 : coord.y) : 999999;
    return {
      locationLabel: locationType === "section" ? (buildKeiseiSectionLabel(stationLabel, "7", config) || "位置不明") : (stationLabel || "位置不明"),
      locationType,
      positionOrder,
      confidence: coord ? "high" : stationLabel ? "medium" : "low",
    };
  }

  function normalizeMatsudoTrain(record, config) {
    const trainInfoPk = record && typeof record === "object" && record.trainPositionInfoPK && typeof record.trainPositionInfoPK === "object"
      ? record.trainPositionInfoPK
      : {};
    const sectionId = stringOrEmpty(trainInfoPk.sectionid);
    const mapping = config.matsudoIdBySection[sectionId];
    const positionInfo = resolveMatsudoPosition(mapping, config);
    const directionCode = stringOrEmpty(mapping && mapping.hk);
    const orbitNumber = stringOrEmpty(trainInfoPk.orbitnumber);
    const rawTrainNumber = stringOrEmpty(record.trainno);
    const trainNumber = orbitNumber || rawTrainNumber || "(列番なし)";
    const palette = SERVICE_PALETTE.local;

    return {
      networkId: "matsudo",
      trainNumber,
      lineId: "7",
      lineLabel: "松戸線",
      directionCode,
      directionLabel: MATSUDO_DIRECTION_LABELS[directionCode] || `方向コード ${directionCode || "-"}`,
      positionCode: stringOrEmpty(mapping && mapping.id) || `section:${sectionId}`,
      locationLabel: positionInfo.locationLabel,
      locationType: positionInfo.locationType,
      positionOrder: positionInfo.positionOrder,
      confidence: positionInfo.confidence,
      serviceTypeCode: "",
      serviceTypeLabel: "普通",
      serviceTone: "local",
      serviceColor: palette.color,
      serviceTextColor: palette.textColor,
      originLabel: "",
      destinationLabel: normalizeDisplayRailwayName(record.laststop),
      platform: "",
      delayMinutes: toNumber(record.delayminute, 0),
      ownerLabel: "京成",
      vehicleLabel: orbitNumber ? `運用 ${orbitNumber}` : "",
      sourceTags: ["live", "enrichment"],
      researchCandidate: positionInfo.confidence !== "high",
      note: [rawTrainNumber ? `列車番号 ${rawTrainNumber}` : "", trainInfoPk.blockno ? `block ${trainInfoPk.blockno}` : ""].filter(Boolean).join(" / "),
      detailAvailable: false,
      detailKey: "",
      detailRequest: null,
      detailRows: [],
      detailSummary: "",
    };
  }

  async function buildMatsudoSnapshot() {
    return getCachedObject("network:matsudo", 10, async () => {
      const [config, trainPayload, datePayload, statusPayload] = await Promise.all([
        getKeiseiConfigBundle(),
        fetchJson(KEISEI_ENDPOINTS.matsudoTrainInfo, {
          encodings: ["utf-8", "cp932", "shift_jis"],
          proxy: true,
          proxyLabel: "京成松戸線API",
        }),
        fetchJson(KEISEI_ENDPOINTS.matsudoDate, {
          encodings: ["utf-8", "cp932", "shift_jis"],
          proxy: true,
          proxyLabel: "京成松戸線日付API",
        }),
        fetchJson(KEISEI_ENDPOINTS.matsudoStatus, {
          encodings: ["utf-8", "cp932", "shift_jis"],
          proxy: true,
          proxyLabel: "京成松戸線状態API",
        }),
      ]);

      const warnings = [];
      if (stringOrEmpty((statusPayload || {}).st) !== "0") {
        warnings.push("公式の松戸線ステータスが平常以外を示しています。");
      }
      warnings.push("松戸線は matsudo_id.json と座標辞書を使って位置を補完します。");
      warnings.push("列車番号よりも orbitnumber を優先表示し、運用番号として追いやすくしています。");

      return {
        id: "matsudo",
        label: NETWORK_META.matsudo.label,
        description: NETWORK_META.matsudo.description,
        accentColor: NETWORK_META.matsudo.accentColor,
        status: "ok",
        updatedAt: parseMatsudoUpdateTimestamp(datePayload),
        trains: ensureArray(trainPayload).filter((row) => row && typeof row === "object").map((row) => normalizeMatsudoTrain(row, config)).sort(compareGenericTrain),
        warnings,
        error: "",
        sourceUrls: NETWORK_META.matsudo.sourceUrls,
        meta: {
          matsudoStatus: statusPayload,
          positionMappingMode: "matsudo_id と座標辞書で補完",
        },
        loaded: true,
      };
    });
  }

  async function getAppManifest() {
    return {
      appName: "在線位置情報ビューア",
      appVersion: LIVE_APP_VERSION,
      buildTimestamp: isoNow(),
      publishTarget: "github-pages",
      refreshPolicy: "アクティブなタブを15秒ごとに更新",
      networks: NETWORK_IDS.map((networkId) => buildNetworkShell(networkId)),
      summary: buildManifestSummary(NETWORK_IDS.length),
      notes: [
        "タブを開いた路線だけを取得し、列車別時刻表は列車カードを開いたときだけ後読みします。",
        "京急・京成系APIは GitHub Pages 本番から直接読めないため、apiProxyTemplate の設定と Worker の再デプロイが必要です。",
        "えるサイト連携は停止し、リンクのみを残しています。",
      ],
    };
  }

  async function getNetworkSnapshot(networkId) {
    if (networkId === "keikyu") {
      return buildKeikyuSnapshot();
    }
    if (networkId === "toei") {
      return buildToeiSnapshot();
    }
    if (networkId === "keisei") {
      return buildKeiseiSnapshot();
    }
    if (networkId === "matsudo") {
      return buildMatsudoSnapshot();
    }
    throw new Error(`未知の路線IDです: ${networkId}`);
  }

  async function getTrainDetail(networkId, request) {
    if (networkId === "keikyu") {
      return buildKeikyuTrainDetail(request);
    }
    if (networkId === "keisei") {
      return buildKeiseiTrainDetail(request);
    }
    return { detailRows: [], detailSummary: "", sourceTags: [] };
  }

  window.LiveTrainData = {
    getAppManifest,
    getNetworkSnapshot,
    getTrainDetail,
  };
})();
