const CACHE_VERSION = "20261014-1";
const KEIKYU_TRAIN_TTL_SECONDS = 12;
const KEIKYU_TIMETABLE_TTL_SECONDS = 60 * 60;
const KEIKYU_TIMETABLE_BROWSER_TTL_SECONDS = 5 * 60;

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, {
        Allow: "GET,OPTIONS",
      });
    }

    const requestUrl = new URL(request.url);
    const targetText = requestUrl.searchParams.get("url") || requestUrl.searchParams.get("target") || "";
    if (!targetText) {
      return json(
        {
          ok: true,
          message: "train api proxy is running",
          cacheVersion: CACHE_VERSION,
          usage: [
            `${requestUrl.origin}/?url=${encodeURIComponent("https://app-kq.net/api/train")}`,
            `${requestUrl.origin}/?url=${encodeURIComponent("https://zaisen.tid-keisei.jp/data/traffic_info.json")}`,
          ],
        },
        200,
      );
    }

    const target = parseAllowedTarget(targetText);
    if (!target) {
      return json({ error: "forbidden", layer: "proxy" }, 403);
    }

    const policy = cachePolicyFor(target);
    const serviceDay = policy.useServiceDay ? getJstServiceDay() : "";
    const cacheKey = buildCacheKey(requestUrl, serviceDay);
    const cache = caches.default;
    const cached = policy.edgeTtlSeconds > 0 ? await cache.match(cacheKey) : null;

    if (cached) {
      return prepareOutgoingResponse(cached, policy, "HIT", serviceDay);
    }

    // The former application-specific User-Agent is rejected by the upstream.
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: "application/json,text/plain,*/*",
      },
      redirect: "manual",
    });

    const cacheable = upstream.status >= 200 && upstream.status < 300 && policy.edgeTtlSeconds > 0;
    const storedResponse = buildStoredResponse(upstream, policy);

    if (cacheable) {
      ctx.waitUntil(cache.put(cacheKey, storedResponse.clone()));
    }

    return prepareOutgoingResponse(storedResponse, policy, "MISS", serviceDay);
  },
};

function parseAllowedTarget(value) {
  let target;
  try {
    target = new URL(value);
  } catch (error) {
    return null;
  }

  if (target.protocol !== "https:" || target.username || target.password || target.port) {
    return null;
  }

  if (target.hostname === "app-kq.net") {
    if (target.pathname === "/api/train" || target.pathname.startsWith("/api/locationTimetable/")) {
      return target;
    }
    return null;
  }

  if (target.hostname === "zaisen.tid-keisei.jp") {
    if (target.pathname.startsWith("/data/") || target.pathname.startsWith("/config/")) {
      return target;
    }
  }

  return null;
}

function cachePolicyFor(target) {
  if (target.hostname === "app-kq.net" && target.pathname === "/api/train") {
    return {
      label: "keikyu-train",
      edgeTtlSeconds: KEIKYU_TRAIN_TTL_SECONDS,
      browserTtlSeconds: 0,
      useServiceDay: false,
    };
  }

  if (target.hostname === "app-kq.net" && target.pathname.startsWith("/api/locationTimetable/")) {
    return {
      label: "keikyu-timetable",
      edgeTtlSeconds: Math.min(KEIKYU_TIMETABLE_TTL_SECONDS, secondsUntilNextJstServiceDay()),
      browserTtlSeconds: KEIKYU_TIMETABLE_BROWSER_TTL_SECONDS,
      useServiceDay: true,
    };
  }

  return {
    label: "pass-through",
    edgeTtlSeconds: 0,
    browserTtlSeconds: 0,
    useServiceDay: false,
  };
}

function buildCacheKey(requestUrl, serviceDay) {
  const keyUrl = new URL(requestUrl.toString());
  keyUrl.searchParams.set("__cache_version", CACHE_VERSION);
  if (serviceDay) {
    keyUrl.searchParams.set("__service_day", serviceDay);
  }
  return new Request(keyUrl.toString(), { method: "GET" });
}

function buildStoredResponse(upstream, policy) {
  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", policy.edgeTtlSeconds > 0
    ? `public, max-age=${policy.edgeTtlSeconds}`
    : "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function prepareOutgoingResponse(response, policy, cacheStatus, serviceDay) {
  const headers = new Headers(response.headers);
  const browserTtlSeconds = response.ok ? policy.browserTtlSeconds : 0;
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
  headers.set("Cache-Control", browserTtlSeconds > 0
    ? `public, max-age=${browserTtlSeconds}`
    : "no-store");
  headers.set("X-Proxy-Cache", cacheStatus);
  headers.set("X-Proxy-Target-Type", policy.label);
  headers.set("X-Upstream-Status", String(response.status));
  if (serviceDay) {
    headers.set("X-Service-Day", serviceDay);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getJstServiceDay(now = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (shifted.getUTCHours() < 3) {
    shifted.setUTCDate(shifted.getUTCDate() - 1);
  }
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function secondsUntilNextJstServiceDay(now = new Date()) {
  const offsetMs = 9 * 60 * 60 * 1000;
  const shifted = new Date(now.getTime() + offsetMs);
  let boundaryMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    3,
    0,
    0,
  ) - offsetMs;

  if (boundaryMs <= now.getTime()) {
    boundaryMs += 24 * 60 * 60 * 1000;
  }

  return Math.max(1, Math.ceil((boundaryMs - now.getTime()) / 1000));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "X-Proxy-Cache,X-Proxy-Target-Type,X-Upstream-Status,X-Service-Day",
  };
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}
