from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
TOOLS_DIR = ROOT / "tools"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from keikyu_local_core import APP_VERSION, build_keikyu_snapshot, build_keikyu_train_detail  # noqa: E402


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_slug(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "_", value).strip("_") or "detail"


def copy_web_assets(output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    shutil.copytree(WEB_DIR, output_dir)
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")


def build_keikyu_network(output_dir: Path) -> dict[str, object]:
    snapshot = build_keikyu_snapshot()
    trains = []
    detail_count = 0
    detail_errors: list[str] = []

    for train in snapshot.get("trains", []):
        train_copy = dict(train)
        request = train_copy.get("detailRequest") or {}
        if train_copy.get("detailAvailable") and request:
            direction_code = str(request.get("directionCode") or "1")
            slug = safe_slug(f"{request.get('trainNumber', '')}-{direction_code}")
            detail_relative = Path("data") / "details" / "keikyu" / f"{slug}.json"
            detail_path = output_dir / detail_relative
            try:
                detail_payload = build_keikyu_train_detail(
                    str(request.get("trainNumber") or ""),
                    str(request.get("lineId") or "main"),
                    str(request.get("positionCode") or ""),
                    direction_code,
                )
                detail_count += 1
            except Exception as exc:
                detail_payload = {
                    "detailKey": train_copy.get("detailKey", ""),
                    "detailRows": [],
                    "detailSummary": "京急列車別時刻表",
                    "originLabel": "",
                    "destinationLabel": "",
                    "platform": "",
                    "vehicleLabel": "",
                    "sourceTags": ["timetable"],
                    "error": str(exc),
                }
                detail_errors.append(f"{train_copy.get('trainNumber', '?')}: {exc}")

            write_json(detail_path, detail_payload)
            train_copy["detailUrl"] = detail_relative.as_posix()

        trains.append(train_copy)

    network_payload = dict(snapshot)
    network_payload["trains"] = trains
    network_payload.setdefault("warnings", [])
    if detail_errors:
        network_payload["warnings"] = network_payload["warnings"] + [
            f"時刻表を取得できなかった列車が {len(detail_errors)} 本あります。詳細カードにエラー内容を残しています。"
        ]
    network_payload.setdefault("meta", {})
    network_payload["meta"]["detailCount"] = detail_count

    network_relative = Path("data") / "networks" / "keikyu.json"
    write_json(output_dir / network_relative, network_payload)

    return {
        "id": network_payload["id"],
        "label": network_payload["label"],
        "description": network_payload.get("description", ""),
        "accentColor": network_payload.get("accentColor", "#d72731"),
        "updatedAt": network_payload.get("updatedAt", ""),
        "trainCount": len(trains),
        "detailCount": detail_count,
        "dataUrl": network_relative.as_posix(),
        "sourceUrls": network_payload.get("sourceUrls", []),
    }


def build_site(output_dir: Path) -> Path:
    copy_web_assets(output_dir)
    build_timestamp = datetime.now(timezone.utc).isoformat()
    network_entries = [build_keikyu_network(output_dir)]
    manifest = {
        "appName": "在線位置研究ビューア",
        "appVersion": APP_VERSION,
        "buildTimestamp": build_timestamp,
        "publishTarget": "github-pages",
        "refreshPolicy": "GitHub Actions で約10分ごとに再生成",
        "networks": network_entries,
        "notes": [
            "GitHub Pages 版は Python のビルド結果を静的配信します。",
            "ブラウザでは列車カードを開いたときだけ詳細 JSON を読み込みます。",
            "現在の GitHub Pages 版は京急を正式対応対象にしています。",
        ],
    }
    write_json(output_dir / "data" / "manifest.json", manifest)
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub Pages 向けの静的サイトを生成します。")
    parser.add_argument("--output", default=str(ROOT / "site"), help="出力先ディレクトリ")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    built_dir = build_site(output_dir)
    print(f"Built site: {built_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
