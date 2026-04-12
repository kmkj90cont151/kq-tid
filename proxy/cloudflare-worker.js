export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url") || url.searchParams.get("target") || "";
    if (!target) {
      return json(
        {
          ok: true,
          message: "train api proxy is running",
          usage: [
            `${url.origin}/?url=${encodeURIComponent("https://app-kq.net/api/train")}`,
            `${url.origin}/?url=${encodeURIComponent("https://zaisen.tid-keisei.jp/data/traffic_info.json")}`,
          ],
        },
        200,
      );
    }
    if (!isAllowedTarget(target)) {
      return json({ error: "forbidden" }, 403);
    }

    const upstream = await fetch(target, {
      headers: {
        "user-agent": "keikyu-mytid-worker/2.0",
      },
    });

    const headers = new Headers(upstream.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};

const ALLOWED_PREFIXES = [
  "https://app-kq.net/api/",
  "https://zaisen.tid-keisei.jp/data/",
  "https://zaisen.tid-keisei.jp/config/",
];

function isAllowedTarget(target) {
  return ALLOWED_PREFIXES.some((prefix) => target.startsWith(prefix));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}
