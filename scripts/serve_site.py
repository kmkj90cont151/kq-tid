from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from build_site import ROOT, build_site


def main() -> int:
    parser = argparse.ArgumentParser(description="site/ をローカルで配信します。")
    parser.add_argument("--port", type=int, default=8000, help="待ち受けポート")
    parser.add_argument("--skip-build", action="store_true", help="起動前のビルドを省略します。")
    parser.add_argument("--fixtures-dir", default="", help="ローカル fixture のディレクトリ")
    args = parser.parse_args()

    site_dir = ROOT / "site"
    if not args.skip_build:
        fixtures_dir = Path(args.fixtures_dir).resolve() if args.fixtures_dir else None
        build_site(site_dir, fixtures_dir)

    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(site_dir))
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
