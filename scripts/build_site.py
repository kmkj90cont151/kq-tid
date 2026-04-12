from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"


def build_site(output_dir: Path) -> Path:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(WEB_DIR, output_dir)
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub Pages 向けに web/ を site/ へコピーします。")
    parser.add_argument("--output", default=str(ROOT / "site"), help="出力ディレクトリ")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    built_dir = build_site(output_dir)
    print(f"site を更新しました: {built_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
