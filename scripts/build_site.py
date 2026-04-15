from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
TOOLS_DIR = ROOT / "tools"
DEFAULT_FIXTURES_DIR = ROOT / "source"

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from keikyu_local_core import build_keikyu_train_detail  # noqa: E402
from multi_network_build import build_site_payloads  # noqa: E402


def log(message: str) -> None:
    """Emit progress logs immediately so Codex/terminal does not look frozen."""
    print(message, flush=True)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def safe_slug(value: str) -> str:
    return re.sub(r"[^0-9A-Za-z_-]+", "_", value).strip("_") or "detail"


def copy_web_assets(output_dir: Path) -> None:
    if not WEB_DIR.exists():
        raise FileNotFoundError(f"Web assets directory not found: {WEB_DIR}")
    shutil.copytree(WEB_DIR, output_dir, dirs_exist_ok=True)
    (output_dir / ".nojekyll").write_text("", encoding="utf-8")


def safe_rmtree(path: Path, label: str = "") -> None:
    """Best-effort removal with logging and existence checks."""
    if not path.exists():
        return
    started = time.perf_counter()
    log(f"[clean] removing {label or path}")
    shutil.rmtree(path, ignore_errors=True)
    elapsed = time.perf_counter() - started
    log(f"[clean] removed {label or path} in {elapsed:.2f}s")


def cleanup_build_artifacts() -> None:
    """
    Remove only known build directories.

    The original version scanned ROOT.iterdir() and removed matching directories.
    On Windows / OneDrive / large repos this can be unexpectedly slow, and it can
    make Codex appear frozen. Keeping cleanup targeted is safer and faster.
    """
    removable_dirs = [
        ROOT / ".site-build-staging",
        ROOT / ".keikyu-detail-stash",
    ]
    for path in removable_dirs:
        safe_rmtree(path)


def load_json_if_exists(path: Path) -> object | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log(f"[warn] failed to load fallback JSON {path}: {exc}")
        return None


def build_keikyu_detail_files(
    output_dir: Path,
    network: dict[str, object],
    *,
    max_details: int | None = None,
) -> int:
    """
    Build Keikyu detail files with per-train progress logging.

    max_details can be used during debugging to prevent long hangs when the
    upstream detail builder is slow.
    """
    detail_count = 0
    detail_errors: list[str] = []

    trains = network.get("trains", [])
    if not isinstance(trains, list):
        log("[warn] network['trains'] is not a list; skipping details")
        return 0

    log(f"[keikyu] detail build candidates: {len(trains)}")

    for index, train in enumerate(trains, start=1):
        if max_details is not None and detail_count >= max_details:
            log(f"[keikyu] reached max_details={max_details}; stopping detail generation early")
            break

        if not isinstance(train, dict):
            continue

        request = train.get("detailRequest") or {}
        if not (train.get("detailAvailable") and isinstance(request, dict)):
            continue

        direction_code = str(request.get("directionCode") or "1")
        train_number = str(request.get("trainNumber") or "")
        line_id = str(request.get("lineId") or "main")
        position_code = str(request.get("positionCode") or "")

        slug = safe_slug(f"{train_number}-{direction_code}")
        detail_relative = Path("data") / "details" / "keikyu" / f"{slug}.json"
        detail_path = output_dir / detail_relative

        log(
            f"[keikyu] ({index}/{len(trains)}) building detail "
            f"train={train_number or '?'} line={line_id} dir={direction_code}"
        )

        try:
            detail_payload = build_keikyu_train_detail(
                train_number,
                line_id,
                position_code,
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
            detail_errors.append(f"{train_number or '?'}: {exc}")
            log(f"[warn] failed detail for train={train_number or '?'}: {exc}")

        write_json(detail_path, detail_payload)
        train["detailUrl"] = detail_relative.as_posix()

    network.setdefault("meta", {})
    if isinstance(network["meta"], dict):
        network["meta"]["detailCount"] = detail_count
        if detail_errors:
            network["meta"]["detailErrors"] = detail_errors[:10]

    if detail_errors:
        warnings = network.get("warnings", [])
        if not isinstance(warnings, list):
            warnings = []
        warnings.append(f"京急時刻表を作成できなかった列車が {len(detail_errors)} 本ありました。")
        network["warnings"] = warnings

    log(f"[keikyu] detail build complete: success={detail_count}, errors={len(detail_errors)}")
    return detail_count


def build_site(
    output_dir: Path,
    fixtures_dir: Path | None = None,
    *,
    skip_keikyu_details: bool = False,
    max_keikyu_details: int | None = None,
) -> Path:
    """
    Build the static site in a staging directory and then move it into place.

    Changes from the original:
    - immediate progress logging
    - targeted cleanup only
    - optional skip/limit for heavy Keikyu detail generation
    - more defensive error handling around fallback data
    """
    log("[start] build_site")

    resolved_fixtures_dir = fixtures_dir or (
        DEFAULT_FIXTURES_DIR if DEFAULT_FIXTURES_DIR.exists() else None
    )
    log(f"[info] fixtures_dir={resolved_fixtures_dir}")

    cleanup_build_artifacts()

    keikyu_fallback = load_json_if_exists(output_dir / "data" / "networks" / "keikyu.json")
    keikyu_detail_stash_root: Path | None = None
    keikyu_detail_stash: Path | None = None

    existing_detail_dir = output_dir / "data" / "details" / "keikyu"
    if not skip_keikyu_details and existing_detail_dir.exists():
        keikyu_detail_stash_root = ROOT / ".keikyu-detail-stash"
        safe_rmtree(keikyu_detail_stash_root, label="old keikyu stash")
        keikyu_detail_stash = keikyu_detail_stash_root / "keikyu"
        log("[info] stashing existing keikyu detail files")
        shutil.copytree(existing_detail_dir, keikyu_detail_stash, dirs_exist_ok=True)

    staging_dir = ROOT / ".site-build-staging"

    try:
        safe_rmtree(staging_dir, label="staging dir")
        staging_dir.mkdir(parents=True, exist_ok=True)

        log("[info] copying web assets")
        copy_web_assets(staging_dir)

        log("[info] building site payloads")
        networks, manifest = build_site_payloads(resolved_fixtures_dir)
        log(f"[info] build_site_payloads complete: networks={len(networks)}")

        for network in networks:
            if not isinstance(network, dict):
                continue

            network_id = str(network.get("id") or "")
            log(f"[info] processing network={network_id}")

            if (
                network_id == "keikyu"
                and network.get("status") != "ok"
                and isinstance(keikyu_fallback, dict)
            ):
                if keikyu_fallback.get("trains") or keikyu_fallback.get("status") == "ok":
                    log("[warn] using fallback keikyu network data")
                    fallback_network = dict(keikyu_fallback)
                    fallback_network.setdefault("loaded", True)
                    network.clear()
                    network.update(fallback_network)

                    if keikyu_detail_stash and keikyu_detail_stash.exists():
                        log("[info] restoring stashed keikyu detail files")
                        shutil.copytree(
                            keikyu_detail_stash,
                            staging_dir / "data" / "details" / "keikyu",
                            dirs_exist_ok=True,
                        )

        for network in networks:
            if not isinstance(network, dict):
                continue

            network_id = str(network.get("id") or "")
            if not network_id:
                log("[warn] skipping network with missing id")
                continue

            if network_id == "keikyu" and not skip_keikyu_details:
                build_keikyu_detail_files(
                    staging_dir,
                    network,
                    max_details=max_keikyu_details,
                )
            elif network_id == "keikyu":
                log("[info] skipping keikyu detail generation by option")

            write_json(staging_dir / "data" / "networks" / f"{network_id}.json", network)

        manifest["networks"] = [
            {
                "id": network["id"],
                "label": network["label"],
                "description": network["description"],
                "accentColor": network["accentColor"],
                "updatedAt": network.get("updatedAt", ""),
                "trainCount": len(network.get("trains", []))
                if isinstance(network.get("trains"), list)
                else 0,
                "detailCount": network.get("meta", {}).get("detailCount", 0)
                if isinstance(network.get("meta"), dict)
                else 0,
                "dataUrl": f"data/networks/{network['id']}.json",
                "sourceUrls": network.get("sourceUrls", []),
            }
            for network in networks
            if isinstance(network, dict) and "id" in network
        ]
        log("[info] writing manifest")
        write_json(staging_dir / "data" / "manifest.json", manifest)

        if output_dir.exists():
            safe_rmtree(output_dir, label="output dir")

        log("[info] moving staging to output")
        shutil.move(str(staging_dir), str(output_dir))
        log(f"[done] built site: {output_dir}")
        return output_dir

    except Exception as exc:
        log(f"[error] build failed: {exc}")
        safe_rmtree(staging_dir, label="failed staging dir")
        raise
    finally:
        if keikyu_detail_stash_root:
            safe_rmtree(keikyu_detail_stash_root, label="keikyu stash")
        cleanup_build_artifacts()


def main() -> int:
    parser = argparse.ArgumentParser(description="GitHub Pages 用の静的サイトを生成します。")
    parser.add_argument("--output", default=str(ROOT / "site"), help="出力先ディレクトリ")
    parser.add_argument("--fixtures-dir", default="", help="ローカル fixture のディレクトリ")
    parser.add_argument(
        "--skip-keikyu-details",
        action="store_true",
        help="京急列車別詳細 JSON の生成をスキップします",
    )
    parser.add_argument(
        "--max-keikyu-details",
        type=int,
        default=None,
        help="京急詳細 JSON の生成数を制限します（デバッグ向け）",
    )
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    fixtures_dir = Path(args.fixtures_dir).resolve() if args.fixtures_dir else None

    built_dir = build_site(
        output_dir,
        fixtures_dir,
        skip_keikyu_details=args.skip_keikyu_details,
        max_keikyu_details=args.max_keikyu_details,
    )
    log(f"Built site: {built_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
