from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
TOOLS_DIR = ROOT / "tools"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from keikyu_local_core import build_keikyu_train_detail  # noqa: E402
from multi_network_build import build_site_payloads  # noqa: E402


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


def load_json_if_exists(path: Path) -> object | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def build_keikyu_detail_files(output_dir: Path, network: dict[str, object]) -> int:
    detail_count = 0
    detail_errors: list[str] = []

    for train in network.get("trains", []):
        if not isinstance(train, dict):
            continue
        request = train.get("detailRequest") or {}
        if not (train.get("detailAvailable") and isinstance(request, dict)):
            continue

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
                "detailKey": train.get("detailKey", ""),
                "detailRows": [],
                "detailSummary": "京急列車別時刻表",
                "originLabel": "",
                "destinationLabel": "",
                "platform": "",
                "vehicleLabel": "",
                "sourceTags": ["timetable"],
                "error": str(exc),
            }
            detail_errors.append(f"{train.get('trainNumber', '?')}: {exc}")

        write_json(detail_path, detail_payload)
        train["detailUrl"] = detail_relative.as_posix()

    network.setdefault("meta", {})
    network["meta"]["detailCount"] = detail_count
    if detail_errors:
        warnings = list(network.get("warnings", []))
        warnings.append(f"京急時刻表を作成できなかった列車が {len(detail_errors)} 本ありました。")
        network["warnings"] = warnings
        network["meta"]["detailErrors"] = detail_errors[:10]

    return detail_count


def build_site(output_dir: Path, fixtures_dir: Path | None = None) -> Path:
    keikyu_fallback = load_json_if_exists(output_dir / "data" / "networks" / "keikyu.json")
    keikyu_detail_stash: Path | None = None
    existing_detail_dir = output_dir / "data" / "details" / "keikyu"
    if existing_detail_dir.exists():
        keikyu_detail_stash = Path(tempfile.mkdtemp(prefix="keikyu-details-", dir=str(ROOT)))
        shutil.copytree(existing_detail_dir, keikyu_detail_stash / "keikyu", dirs_exist_ok=True)

    copy_web_assets(output_dir)
    networks, manifest = build_site_payloads(fixtures_dir)

    for network in networks:
        if network.get("id") == "keikyu" and network.get("status") != "ok" and isinstance(keikyu_fallback, dict):
            fallback_network = dict(keikyu_fallback)
            fallback_network.setdefault("loaded", True)
            network.clear()
            network.update(fallback_network)
            if keikyu_detail_stash:
                fallback_detail_dir = keikyu_detail_stash / "keikyu"
                if fallback_detail_dir.exists():
                    shutil.copytree(
                        fallback_detail_dir,
                        output_dir / "data" / "details" / "keikyu",
                        dirs_exist_ok=True,
                    )

    for network in networks:
        if network.get("id") == "keikyu":
            build_keikyu_detail_files(output_dir, network)
        write_json(output_dir / "data" / "networks" / f"{network['id']}.json", network)

    manifest["networks"] = [
        {
            "id": network["id"],
            "label": network["label"],
            "description": network["description"],
            "accentColor": network["accentColor"],
            "updatedAt": network.get("updatedAt", ""),
            "trainCount": len(network.get("trains", [])) if isinstance(network.get("trains"), list) else 0,
            "detailCount": network.get("meta", {}).get("detailCount", 0) if isinstance(network.get("meta"), dict) else 0,
            "dataUrl": f"data/networks/{network['id']}.json",
            "sourceUrls": network.get("sourceUrls", []),
        }
        for network in networks
    ]
    write_json(output_dir / "data" / "manifest.json", manifest)
    return output_dir


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub Pages 用の静的サイトを生成します。")
    parser.add_argument("--output", default=str(ROOT / "site"), help="出力先ディレクトリ")
    parser.add_argument("--fixtures-dir", default="", help="ローカル fixture のディレクトリ")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    fixtures_dir = Path(args.fixtures_dir).resolve() if args.fixtures_dir else None
    built_dir = build_site(output_dir, fixtures_dir)
    print(f"Built site: {built_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

