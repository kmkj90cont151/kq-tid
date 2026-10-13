import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cacheEntries = new Map();
const pendingTasks = [];
let upstreamCalls = 0;

globalThis.caches = {
  default: {
    async match(request) {
      const response = cacheEntries.get(request.url);
      return response ? response.clone() : undefined;
    },
    async put(request, response) {
      cacheEntries.set(request.url, response.clone());
    },
  },
};

globalThis.fetch = async (url) => {
  upstreamCalls += 1;
  return new Response(JSON.stringify({ stations: [{ stationName: "品川" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

const source = await readFile(new URL("../proxy/cloudflare-worker.js", import.meta.url), "utf8");
const encodedSource = Buffer.from(source, "utf8").toString("base64");
const workerModule = await import(`data:text/javascript;base64,${encodedSource}`);
const handler = workerModule.default;
const ctx = {
  waitUntil(task) {
    pendingTasks.push(task);
  },
};

const target = encodeURIComponent("https://app-kq.net/api/locationTimetable/8201-0-574K");
const requestUrl = `https://example.workers.dev/?url=${target}`;

const first = await handler.fetch(new Request(requestUrl), {}, ctx);
assert.equal(first.status, 200);
assert.equal(first.headers.get("X-Proxy-Cache"), "MISS");
assert.equal(first.headers.get("X-Proxy-Target-Type"), "keikyu-timetable");
assert.match(first.headers.get("X-Service-Day") || "", /^\d{4}-\d{2}-\d{2}$/);
await Promise.all(pendingTasks.splice(0));

const second = await handler.fetch(new Request(requestUrl), {}, ctx);
assert.equal(second.status, 200);
assert.equal(second.headers.get("X-Proxy-Cache"), "HIT");
assert.equal(upstreamCalls, 1);

const forbiddenTarget = encodeURIComponent("https://example.com/api/train");
const forbidden = await handler.fetch(new Request(`https://example.workers.dev/?url=${forbiddenTarget}`), {}, ctx);
assert.equal(forbidden.status, 403);

console.log("worker cache verification passed");
