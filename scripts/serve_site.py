from __future__ import annotations

import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from build_site import ROOT, build_site

ALLOWED_PROXY_PREFIXES = ("https://app-kq.net/api/",)


class LocalSiteHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/proxy":
            self.handle_proxy(parsed)
            return
        super().do_GET()

    def handle_proxy(self, parsed) -> None:
        params = parse_qs(parsed.query)
        target_url = (params.get("url") or [""])[0]
        if not target_url or not any(target_url.startswith(prefix) for prefix in ALLOWED_PROXY_PREFIXES):
            self.send_json({"error": "forbidden"}, status=403)
            return

        request = Request(target_url, headers={"User-Agent": "keikyu-mytid-local/1.0"})
        try:
            with urlopen(request, timeout=25) as response:
                body = response.read()
                self.send_response(getattr(response, "status", 200))
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json; charset=utf-8"))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as exc:
            body = exc.read() if hasattr(exc, "read") else b""
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json; charset=utf-8"))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body or json.dumps({"error": str(exc)}).encode("utf-8"))
        except URLError as exc:
            self.send_json({"error": str(exc)}, status=502)

    def send_json(self, payload: object, status: int = 200) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="site/ をローカル配信し、京急API用の簡易プロキシも提供します。")
    parser.add_argument("--port", type=int, default=8000, help="待受ポート")
    parser.add_argument("--skip-build", action="store_true", help="既存の site/ をそのまま配信します。")
    args = parser.parse_args()

    site_dir = ROOT / "site"
    if not args.skip_build:
        build_site(site_dir)

    handler = functools.partial(LocalSiteHandler, directory=str(site_dir))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"ローカル配信中: {site_dir} -> http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
