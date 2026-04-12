from __future__ import annotations

import argparse
import json
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from keikyu_local_core import build_keikyu_snapshot, build_keikyu_train_detail

INDEX_HTML = """<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>京急ローカル検証ビューア</title>
    <style>
      body { font-family: "Yu Gothic UI", "Hiragino Sans", sans-serif; margin: 0; background: #f6f3ee; color: #1f2937; }
      .shell { max-width: 1180px; margin: 0 auto; padding: 18px; }
      .hero, .panel, .group { background: #fffdf8; border: 1px solid #eadfd0; border-radius: 18px; padding: 18px; box-shadow: 0 14px 30px rgba(73, 50, 20, 0.06); }
      .hero { margin-bottom: 16px; }
      .hero h1 { margin: 0 0 8px; font-size: 1.8rem; }
      .hero p { margin: 0; color: #6b7280; }
      .controls { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
      .controls input, .controls button { border-radius: 999px; border: 1px solid #d9c7b2; padding: 10px 14px; font-size: 0.95rem; }
      .controls button { background: #d72731; color: white; border-color: #d72731; cursor: pointer; }
      .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 16px; }
      .card { background: #fff; border: 1px solid #eee1d2; border-radius: 14px; padding: 14px; }
      .card__label { color: #8b6b46; font-size: 0.8rem; }
      .card__value { font-size: 1.4rem; margin-top: 6px; }
      .group { margin-bottom: 16px; }
      .group h2 { margin: 0 0 12px; }
      .train-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
      .train { border: 1px solid #efe4d7; border-radius: 16px; padding: 14px; background: #fff; }
      .train__top { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
      .train__number { font-weight: 700; font-size: 1.05rem; }
      .badge { display: inline-flex; align-items: center; border-radius: 999px; background: rgba(215,39,49,0.1); color: #a51220; padding: 4px 10px; font-size: 0.8rem; }
      .train__loc { margin-top: 8px; font-size: 1.05rem; }
      .train__sub { margin-top: 4px; color: #6b7280; }
      .chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
      .chip { border-radius: 999px; background: #f4eee7; color: #4b5563; padding: 4px 10px; font-size: 0.78rem; }
      details { margin-top: 12px; }
      summary { cursor: pointer; color: #0f4c81; }
      .detail-status { margin-top: 10px; color: #6b7280; }
      .detail-status.error { color: #b91c1c; }
      .table { margin-top: 10px; display: grid; gap: 6px; }
      .row { display: grid; grid-template-columns: 1.7fr .7fr .7fr 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1e7da; font-size: 0.9rem; }
      .row.header { font-weight: 700; color: #8b6b46; }
      .muted { color: #6b7280; }
      @media (max-width: 720px) { .row { grid-template-columns: 1.4fr .8fr .8fr .8fr; font-size: 0.82rem; } }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <h1>京急ローカル検証ビューア</h1>
        <p>Python ローカル環境で京急在線と locationTimetable の挙動を確認するための簡易ビューアです。</p>
      </section>
      <section class="panel controls">
        <input id="search" type="search" placeholder="例: 1403A / 京急久里浜 / 快特">
        <button id="reload" type="button">再取得</button>
      </section>
      <section id="meta" class="meta"></section>
      <section id="content"></section>
    </div>
    <script>
      const state = {
        network: null,
        filter: "",
        detailCache: {},
        openKeys: {},
        loadingKeys: {},
      };

      document.getElementById("reload").addEventListener("click", loadNetwork);
      document.getElementById("search").addEventListener("input", (event) => {
        state.filter = event.target.value.trim().toLowerCase();
        render();
      });

      async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      }

      async function loadNetwork() {
        state.network = await fetchJson("/api/network/keikyu");
        render();
      }

      async function loadDetail(train) {
        if (!train.detailAvailable || state.loadingKeys[train.detailKey]) {
          return;
        }
        state.loadingKeys[train.detailKey] = true;
        render();
        try {
          const params = new URLSearchParams({
            train_number: train.detailRequest.trainNumber,
            line_id: train.detailRequest.lineId,
            position_code: train.detailRequest.positionCode || "",
            direction_code: train.detailRequest.directionCode || "1",
          });
          state.detailCache[train.detailKey] = await fetchJson(`/api/detail?${params.toString()}`);
        } catch (error) {
          state.detailCache[train.detailKey] = { error: String(error), detailRows: [] };
        } finally {
          delete state.loadingKeys[train.detailKey];
          render();
        }
      }

      function getTrains() {
        const trains = state.network && Array.isArray(state.network.trains) ? state.network.trains : [];
        if (!state.filter) {
          return trains;
        }
        return trains.filter((train) => {
          const text = [
            train.trainNumber,
            train.lineLabel,
            train.locationLabel,
            train.serviceTypeLabel,
            train.destinationLabel,
            train.originLabel,
          ].join(" ").toLowerCase();
          return text.includes(state.filter);
        });
      }

      function renderMeta() {
        const container = document.getElementById("meta");
        const trains = getTrains();
        const delayed = trains.filter((train) => Number(train.delayMinutes || 0) > 0).length;
        container.innerHTML = [
          card("表示列車", state.network ? String(trains.length) : "-"),
          card("遅延列車", state.network ? String(delayed) : "-"),
          card("更新時刻", state.network ? escapeHtml(state.network.updatedAt || "-") : "-"),
        ].join("");
      }

      function render() {
        renderMeta();
        const container = document.getElementById("content");
        if (!state.network) {
          container.innerHTML = '<section class="group"><p class="muted">在線データを読み込んでいます。</p></section>';
          return;
        }
        const trains = getTrains();
        container.innerHTML = `<section class="group"><h2>${escapeHtml(state.network.label)} (${trains.length} 本)</h2><div class="train-list">${trains.map(renderTrain).join("")}</div></section>`;
        bindDetails();
      }

      function renderTrain(train) {
        const detail = state.detailCache[train.detailKey] || null;
        const detailRows = detail && Array.isArray(detail.detailRows) ? detail.detailRows : [];
        const detailOpen = Boolean(state.openKeys[train.detailKey]);
        let detailBody = '<div class="detail-status">開いたタイミングで時刻表を取得します。</div>';
        if (state.loadingKeys[train.detailKey]) {
          detailBody = '<div class="detail-status">時刻表を読み込んでいます。</div>';
        } else if (detail && detail.error) {
          detailBody = `<div class="detail-status error">${escapeHtml(detail.error)}</div>`;
        } else if (detailRows.length > 0) {
          detailBody = `
            <div class="table">
              <div class="row header"><span>駅名</span><span>着</span><span>発</span><span>種別</span></div>
              ${detailRows.map((row) => `
                <div class="row">
                  <span>${escapeHtml(row.stationLabel || "")}</span>
                  <span>${escapeHtml(row.arrivalTime || "-")}</span>
                  <span>${escapeHtml(row.departureTime || "-")}</span>
                  <span>${escapeHtml(row.stopType || "")}</span>
                </div>
              `).join("")}
            </div>
          `;
        }

        return `
          <article class="train">
            <div class="train__top">
              <div>
                <span class="train__number">${escapeHtml(train.trainNumber)}</span>
                <span class="badge">${escapeHtml(train.serviceTypeLabel)}</span>
              </div>
              <div class="muted">${escapeHtml(train.directionLabel)}</div>
            </div>
            <div class="train__loc">${escapeHtml(train.locationLabel)}</div>
            <div class="train__sub">${escapeHtml([detail && detail.originLabel || train.originLabel, detail && detail.destinationLabel || train.destinationLabel].filter(Boolean).join(" → ") || "始発・行先情報なし")}</div>
            <div class="chips">
              ${train.platform ? `<span class="chip">${escapeHtml(train.platform)} 番線</span>` : ""}
              ${Number(train.delayMinutes || 0) > 0 ? `<span class="chip">${escapeHtml(String(train.delayMinutes))} 分遅れ</span>` : ""}
              ${train.vehicleLabel ? `<span class="chip">${escapeHtml(train.vehicleLabel)}</span>` : detail && detail.vehicleLabel ? `<span class="chip">${escapeHtml(detail.vehicleLabel)}</span>` : ""}
            </div>
            <details ${detailOpen ? "open" : ""} data-detail-key="${escapeHtml(train.detailKey)}">
              <summary>京急列車別時刻表</summary>
              ${detailBody}
            </details>
          </article>
        `;
      }

      function bindDetails() {
        document.querySelectorAll("details[data-detail-key]").forEach((element) => {
          if (element.dataset.bound === "1") {
            return;
          }
          element.dataset.bound = "1";
          element.addEventListener("toggle", () => {
            const detailKey = element.dataset.detailKey;
            if (element.open) {
              state.openKeys[detailKey] = true;
            } else {
              delete state.openKeys[detailKey];
              render();
              return;
            }
            const train = (state.network.trains || []).find((item) => item.detailKey === detailKey);
            if (train && !state.detailCache[detailKey] && !state.loadingKeys[detailKey]) {
              loadDetail(train);
            } else {
              render();
            }
          });
        });
      }

      function card(label, value) {
        return `<article class="card"><div class="card__label">${escapeHtml(label)}</div><div class="card__value">${escapeHtml(value)}</div></article>`;
      }

      function escapeHtml(value) {
        return String(value == null ? "" : value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      loadNetwork().catch((error) => {
        document.getElementById("content").innerHTML = `<section class="group"><p class="detail-status error">${escapeHtml(String(error))}</p></section>`;
      });
    </script>
  </body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "KeikyuLocalServer/1.0"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._send_html(INDEX_HTML)
            return
        if parsed.path == "/api/network/keikyu":
            self._send_json(build_keikyu_snapshot())
            return
        if parsed.path == "/api/detail":
            query = parse_qs(parsed.query)
            train_number = (query.get("train_number") or [""])[0]
            line_id = (query.get("line_id") or ["main"])[0]
            position_code = (query.get("position_code") or [""])[0]
            direction_code = (query.get("direction_code") or ["1"])[0]
            try:
                self._send_json(build_keikyu_train_detail(train_number, line_id, position_code, direction_code))
            except Exception as exc:  # noqa: BLE001
                self._send_json({
                    "detailKey": f"keikyu:{train_number}",
                    "detailRows": [],
                    "detailSummary": "京急列車別時刻表",
                    "error": str(exc),
                })
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        try:
            sys.stderr.write((format % args) + "\n")
            sys.stderr.flush()
        except Exception:  # noqa: BLE001
            pass

    def _send_html(self, body: str) -> None:
        encoded = body.encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _send_json(self, payload) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> int:
    parser = argparse.ArgumentParser(description="京急ローカル検証ビューアを起動します。")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping server")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
