from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from build_site import ROOT, build_site


def main() -> int:
    parser = argparse.ArgumentParser(description="生成済み site/ をローカルで配信します。")
    parser.add_argument("--port", type=int, default=8000, help="待受ポート")
    parser.add_argument("--skip-build", action="store_true", help="配信前の再ビルドを省略します。")
    args = parser.parse_args()

    site_dir = ROOT / "site"
    if not args.skip_build:
        build_site(site_dir)

    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(site_dir))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {site_dir} at http://127.0.0.1:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
