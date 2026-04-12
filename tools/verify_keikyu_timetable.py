#!/usr/bin/env python
from __future__ import annotations

import argparse
import json

from keikyu_local_core import KEIKYU_TIMETABLE_ROUTE_CODES, build_candidate_urls, fetch_keikyu_timetable

ROUTE_TO_LINE_ID = {value: key for key, value in KEIKYU_TIMETABLE_ROUTE_CODES.items()}


def resolve_line_id(line_id: str, route_code: str) -> str:
    if line_id:
        return line_id
    return ROUTE_TO_LINE_ID.get(route_code, "main")


def main() -> int:
    parser = argparse.ArgumentParser(description="京急 locationTimetable をローカルで検証します。")
    parser.add_argument("train_number", help="例: 1403A")
    parser.add_argument(
        "--line-id",
        choices=sorted(KEIKYU_TIMETABLE_ROUTE_CODES),
        default="",
        help="line id で指定します。未指定時は --route を優先します。",
    )
    parser.add_argument(
        "--route",
        default="8201",
        help="路線コードで指定します。8201=本線 / 8301=久里浜線 / 8401=空港線 / 8501=大師線 / 8601=逗子線",
    )
    parser.add_argument(
        "--direction",
        default="1",
        help="在線 API 側の direction コードを指定します。1=下り系、2=上り系。",
    )
    parser.add_argument("--limit", type=int, default=8, help="先頭から表示する駅数です。")
    parser.add_argument("--show-candidates", action="store_true", help="試行する URL 候補も表示します。")
    parser.add_argument("--dump-json", action="store_true", help="正規化後 JSON をそのまま表示します。")
    args = parser.parse_args()

    line_id = resolve_line_id(args.line_id, args.route)

    if args.show_candidates:
        print("候補 URL:")
        for url in build_candidate_urls(args.train_number, line_id, args.direction):
            print(f"- {url}")
        print()

    timetable = fetch_keikyu_timetable(args.train_number, line_id, args.direction)

    print(f"列番: {args.train_number}")
    print(f"路線: {line_id} ({KEIKYU_TIMETABLE_ROUTE_CODES.get(line_id, '-')})")
    print(f"在線方向コード: {args.direction}")
    print(f"取得 URL: {timetable.get('sourceUrl', '-')}")
    print(f"文字コード: {timetable.get('encoding', '-')}")
    print(f"始発: {timetable.get('originLabel', '-')}")
    print(f"行先: {timetable.get('destinationLabel', '-')}")
    print(f"駅数: {len(timetable.get('detailRows') or [])}")

    for row in (timetable.get("detailRows") or [])[: max(args.limit, 0)]:
        platform = f" / {row['platform']}番線" if row.get("platform") else ""
        stop_type = f" / {row['stopType']}" if row.get("stopType") else ""
        print(
            f"- {row.get('stationLabel', '-')}: "
            f"着 {row.get('arrivalTime') or '-'} / 発 {row.get('departureTime') or '-'}"
            f"{platform}{stop_type}"
        )

    if args.dump_json:
        print(json.dumps(timetable, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
