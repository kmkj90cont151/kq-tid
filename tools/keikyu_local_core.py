from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

APP_VERSION = "github-pages-1"
KEIKYU_API_ENDPOINT = "https://app-kq.net/api/train"
KEIKYU_LOCATION_TIMETABLE_ENDPOINT = "https://app-kq.net/api/locationTimetable/"

NETWORK_META = {
    "id": "keikyu",
    "label": "京急線",
    "description": "京急の在線位置と列車別時刻表をまとめて確認できる GitHub Pages 向けの静的サイトです。",
    "accentColor": "#d72731",
    "sourceUrls": [
        {"label": "京急在線 API", "url": KEIKYU_API_ENDPOINT},
        {"label": "京急公式在線", "url": "https://app-kq.net/web/jp/html/zaisen.html"},
        {
            "label": "京急列車別時刻表 API 例",
            "url": "https://app-kq.net/api/locationTimetable/8201-1-1403A",
        },
    ],
}

KEIKYU_TIMETABLE_ROUTE_CODES = {
    "main": "8201",
    "airport": "8401",
    "kurihama": "8301",
    "daishi": "8501",
    "zushi": "8601",
}

KEIKYU_LINE_CONFIG = {
    "main": {
        "id": "main",
        "name": "本線",
        "directions": {"1": "浦賀・三崎口方面", "2": "品川・泉岳寺方面"},
    },
    "airport": {
        "id": "airport",
        "name": "空港線",
        "directions": {"1": "羽田空港方面", "2": "京急蒲田方面"},
    },
    "daishi": {
        "id": "daishi",
        "name": "大師線",
        "directions": {"1": "小島新田方面", "2": "京急川崎方面"},
    },
    "zushi": {
        "id": "zushi",
        "name": "逗子線",
        "directions": {"1": "逗子・葉山方面", "2": "金沢八景方面"},
    },
    "kurihama": {
        "id": "kurihama",
        "name": "久里浜線",
        "directions": {"1": "三崎口方面", "2": "堀ノ内方面"},
    },
}

KEIKYU_STATION_SEQUENCES = {
    "main": [
        (1, "泉岳寺"),
        (2, "品川"),
        (3, "北品川"),
        (4, "新馬場"),
        (5, "青物横丁"),
        (6, "鮫洲"),
        (7, "立会川"),
        (8, "大森海岸"),
        (9, "平和島"),
        (10, "大森町"),
        (11, "梅屋敷"),
        (18, "京急蒲田"),
        (19, "雑色"),
        (20, "六郷土手"),
        (27, "京急川崎"),
        (28, "八丁畷"),
        (29, "鶴見市場"),
        (30, "京急鶴見"),
        (31, "花月総持寺"),
        (32, "生麦"),
        (33, "京急新子安"),
        (34, "子安"),
        (35, "神奈川新町"),
        (36, "京急東神奈川"),
        (37, "神奈川"),
        (38, "横浜"),
        (39, "戸部"),
        (40, "日ノ出町"),
        (41, "黄金町"),
        (42, "南太田"),
        (43, "井土ヶ谷"),
        (44, "弘明寺"),
        (45, "上大岡"),
        (46, "屏風浦"),
        (47, "杉田"),
        (48, "京急富岡"),
        (49, "能見台"),
        (50, "金沢文庫"),
        (54, "金沢八景"),
        (55, "追浜"),
        (56, "京急田浦"),
        (57, "安針塚"),
        (58, "逸見"),
        (59, "汐入"),
        (60, "横須賀中央"),
        (61, "県立大学"),
        (62, "堀ノ内"),
        (63, "京急大津"),
        (64, "馬堀海岸"),
        (65, "浦賀"),
    ],
    "airport": [
        (18, "京急蒲田"),
        (12, "糀谷"),
        (13, "大鳥居"),
        (14, "穴守稲荷"),
        (15, "天空橋"),
        (16, "羽田空港第3ターミナル"),
        (17, "羽田空港第1・第2ターミナル"),
    ],
    "daishi": [
        (27, "京急川崎"),
        (21, "港町"),
        (22, "鈴木町"),
        (23, "川崎大師"),
        (24, "東門前"),
        (25, "大師橋"),
        (26, "小島新田"),
    ],
    "zushi": [
        (54, "金沢八景"),
        (51, "六浦"),
        (52, "神武寺"),
        (53, "逗子・葉山"),
    ],
    "kurihama": [
        (62, "堀ノ内"),
        (66, "新大津"),
        (67, "北久里浜"),
        (68, "京急久里浜"),
        (69, "YRP野比"),
        (70, "京急長沢"),
        (71, "津久井浜"),
        (72, "三浦海岸"),
        (73, "三崎口"),
    ],
}

KEIKYU_SPECIAL_POSITION_META = {
    "B033": {"line_id": "main", "kind": "section", "anchor": 33, "confidence": "medium"},
    "B049": {"line_id": "main", "kind": "section", "anchor": 49, "confidence": "medium"},
    "E1011": {"line_id": "main", "kind": "station", "station_number": 11, "confidence": "medium"},
    "E4011": {"line_id": "main", "kind": "station", "station_number": 11, "confidence": "medium"},
    "E8050": {"line_id": "main", "kind": "section", "anchor": 50, "confidence": "medium"},
    "N050": {"line_id": "main", "kind": "section", "anchor": 50, "confidence": "medium"},
    "S011": {"line_id": "airport", "kind": "section", "anchor": 18, "confidence": "medium"},
    "S020": {"line_id": "daishi", "kind": "section", "anchor": 27, "confidence": "medium"},
    "SD020": {"line_id": "daishi", "kind": "station", "station_number": 27, "confidence": "medium"},
    "SU020": {"line_id": "daishi", "kind": "station", "station_number": 27, "confidence": "medium"},
    "S050": {"line_id": "zushi", "kind": "section", "anchor": 54, "confidence": "medium"},
    "S061": {"line_id": "main", "kind": "section", "anchor": 62, "confidence": "medium"},
    "U061": {"line_id": "kurihama", "kind": "section", "anchor": 62, "confidence": "medium"},
    "EU065": {
        "line_id": "kurihama",
        "kind": "station",
        "station_number": 62,
        "label": "堀ノ内",
        "confidence": "low",
    },
}

KEIKYU_TRAIN_KIND_META = {
    "1": {"label": "快特", "color": "#009944", "textColor": "#ffffff"},
    "2": {"label": "特急", "color": "#d23431", "textColor": "#ffffff"},
    "3": {"label": "急行", "color": "#1358b8", "textColor": "#ffffff"},
    "4": {"label": "普通", "color": "#2f2f2f", "textColor": "#ffffff"},
    "6": {"label": "エアポート快特", "color": "#f39800", "textColor": "#111111"},
    "12": {"label": "ウィング", "color": "#6a2fb5", "textColor": "#ffffff"},
    "unknown": {"label": "不明", "color": "#7c6755", "textColor": "#ffffff"},
}

STATION_LABEL_REPLACEMENTS = {
    "羽田空港第1･第2ターミナル": "羽田空港第1・第2ターミナル",
    "羽田空港第1・第2ターミナル駅": "羽田空港第1・第2ターミナル",
    "羽田空港第3ターミナル駅": "羽田空港第3ターミナル",
    "YRP野比駅": "YRP野比",
    "逗子・葉山駅": "逗子・葉山",
}

_CACHE: dict[str, tuple[float, Any]] = {}


def ttl_cache(key: str, ttl_seconds: float, supplier):
    now = time.time()
    cached = _CACHE.get(key)
    if cached and cached[0] > now:
        return cached[1]
    value = supplier()
    _CACHE[key] = (now + ttl_seconds, value)
    return value


def string_or_empty(value: Any) -> str:
    return "" if value is None else str(value)


def first_non_empty(values: list[Any]) -> str:
    for value in values:
        text = string_or_empty(value).strip()
        if text:
            return text
    return ""


def to_number(value: Any, fallback: float = 0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def unique_strings(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = string_or_empty(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_json(url: str, encodings: tuple[str, ...] = ("utf-8", "cp932", "shift_jis")) -> tuple[Any, str]:
    with urlopen(url, timeout=20) as response:
        raw = response.read()
    last_error: Exception | None = None
    for encoding in encodings:
        try:
            return json.loads(raw.decode(encoding)), encoding
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"JSON decode failed for {url}: {last_error}")


def infer_keikyu_line_id(station_number: int, position_code: str) -> str:
    if position_code == "U061":
        return "kurihama"
    if 12 <= station_number <= 17:
        return "airport"
    if 21 <= station_number <= 26:
        return "daishi"
    if 51 <= station_number <= 53:
        return "zushi"
    if 66 <= station_number <= 73:
        return "kurihama"
    return "main"


def find_station_entry(sequence: list[tuple[int, str]], station_number: int) -> tuple[int, str] | None:
    for entry in sequence:
        if entry[0] == station_number:
            return entry
    return None


def find_station_index(sequence: list[tuple[int, str]], station_number: int) -> int:
    for index, entry in enumerate(sequence):
        if entry[0] == station_number:
            return index
    return -1


def finalize_keikyu_position(
    line_id: str,
    location_type: str,
    station_number: int,
    position_code: str,
    forced_label: str,
    confidence: str,
) -> dict[str, Any]:
    sequence = KEIKYU_STATION_SEQUENCES.get(line_id, KEIKYU_STATION_SEQUENCES["main"])
    station_entry = find_station_entry(sequence, station_number)
    station_label = forced_label or (station_entry[1] if station_entry else position_code)
    location_label = station_label
    position_order = 999999
    if station_entry:
        index = find_station_index(sequence, station_number)
        position_order = index * 10
        if location_type == "section":
            next_entry = sequence[index + 1] if index + 1 < len(sequence) else station_entry
            if next_entry == station_entry and index > 0:
                next_entry = sequence[index - 1]
            location_label = f"{station_entry[1]} - {next_entry[1]} 間"
            position_order = index * 10 + 5
    return {
        "lineId": line_id,
        "locationLabel": location_label,
        "locationType": location_type,
        "positionOrder": position_order,
        "confidence": confidence,
        "stationLabel": station_label,
        "stationNumber": station_number,
    }


def resolve_keikyu_position(position_code: str) -> dict[str, Any]:
    special = KEIKYU_SPECIAL_POSITION_META.get(position_code)
    if special:
        return finalize_keikyu_position(
            special["line_id"],
            "station" if special["kind"] == "station" else "section",
            int(special.get("station_number") or special.get("anchor") or 0),
            position_code,
            string_or_empty(special.get("label")),
            string_or_empty(special.get("confidence") or "medium"),
        )

    for prefix, location_type, confidence in (
        ("EU", "station", "high"),
        ("U", "section", "high"),
        ("S", "section", "medium"),
    ):
        suffix = position_code[len(prefix):]
        if position_code.startswith(prefix) and suffix.isdigit():
            station_number = int(suffix)
            return finalize_keikyu_position(
                infer_keikyu_line_id(station_number, position_code),
                location_type,
                station_number,
                position_code,
                "",
                confidence,
            )

    digits = "".join(ch for ch in position_code[-3:] if ch.isdigit())
    if len(digits) == 3:
        station_number = int(digits)
        return finalize_keikyu_position(
            infer_keikyu_line_id(station_number, position_code),
            "station" if position_code.startswith("E") else "section",
            station_number,
            position_code,
            "",
            "low",
        )

    return {
        "lineId": "main",
        "locationLabel": position_code or "位置不明",
        "locationType": "section",
        "positionOrder": 999999,
        "confidence": "low",
        "stationLabel": "",
        "stationNumber": 0,
    }


def classify_service_tone(label: str) -> str:
    if "普通" in label:
        return "local"
    if any(token in label for token in ("快特", "特急", "急行")):
        return "express"
    if "ウィング" in label:
        return "limited"
    return "unknown"


def decode_station_label(value: Any) -> str:
    text = string_or_empty(value).replace("　", " ").strip()
    for source, target in STATION_LABEL_REPLACEMENTS.items():
        text = text.replace(source, target)
    return text


def normalize_timetable_time(value: Any) -> str:
    text = string_or_empty(value).strip()
    return "" if text in ("", "-") else text


def normalize_timetable_payload(payload: dict[str, Any]) -> dict[str, Any]:
    rows = []
    for row in payload.get("stations") or []:
        platform = first_non_empty([row.get("platform"), row.get("platformNumber")])
        arrival_time = normalize_timetable_time(row.get("arrival") or row.get("arrivalTime"))
        departure_time = normalize_timetable_time(row.get("departure") or row.get("departureTime") or row.get("time"))
        is_skip = string_or_empty(row.get("isSkip")) == "1"
        station_label = decode_station_label(first_non_empty([row.get("stationName"), row.get("name")]))
        if not (station_label or arrival_time or departure_time or platform):
            continue
        rows.append(
            {
                "stationCode": string_or_empty(row.get("stationCode") or row.get("code")),
                "stationLabel": station_label,
                "arrivalTime": arrival_time,
                "departureTime": departure_time,
                "stopType": "通過" if is_skip else (f"{platform}番線" if platform else ""),
                "platform": platform,
                "formation": string_or_empty(row.get("formation")),
                "numberOfCars": string_or_empty(row.get("numberOfCars")),
                "toNextStation": string_or_empty(row.get("toNextStation")),
            }
        )

    info = payload.get("info") or {}
    vehicle_label = first_non_empty(
        [
            string_or_empty(info.get("formation")),
            string_or_empty(info.get("numberOfCars")),
        ]
    )
    if vehicle_label and vehicle_label.isdigit():
        vehicle_label = f"{vehicle_label}両"

    if not vehicle_label:
        for row in rows:
            formation = string_or_empty(row.get("formation"))
            if formation:
                vehicle_label = formation
                break
        if not vehicle_label:
            for row in rows:
                cars = string_or_empty(row.get("numberOfCars"))
                if cars:
                    vehicle_label = cars if cars.endswith("両") else f"{cars}両"
                    break

    return {
        "originLabel": first_non_empty([decode_station_label(info.get("from")), decode_station_label(payload.get("from"))]),
        "destinationLabel": first_non_empty([decode_station_label(info.get("to")), decode_station_label(payload.get("to"))]),
        "detailRows": rows,
        "detailSummary": "京急列車別時刻表",
        "vehicleLabel": vehicle_label,
    }


def direction_candidates(preferred_direction: str = "1") -> list[str]:
    mapped_direction = "0" if preferred_direction == "1" else "1" if preferred_direction == "2" else string_or_empty(preferred_direction or "1")
    opposite_direction = "1" if mapped_direction == "0" else "0" if mapped_direction == "1" else ""
    return unique_strings([mapped_direction, opposite_direction, "0", "1"])


def build_candidate_urls(train_number: str, line_id: str, preferred_direction: str = "1") -> list[str]:
    primary_route = KEIKYU_TIMETABLE_ROUTE_CODES.get(line_id, KEIKYU_TIMETABLE_ROUTE_CODES["main"])
    route_codes = unique_strings([primary_route, *KEIKYU_TIMETABLE_ROUTE_CODES.values()])
    urls: list[str] = []
    for route_code in route_codes:
        for direction_code in direction_candidates(preferred_direction):
            urls.append(f"{KEIKYU_LOCATION_TIMETABLE_ENDPOINT}{route_code}-{direction_code}-{train_number}")
    return urls


def fetch_keikyu_timetable(train_number: str, line_id: str, direction_code: str = "1") -> dict[str, Any]:
    def supplier():
        last_error = None
        for url in build_candidate_urls(train_number, line_id, direction_code):
            try:
                payload, encoding = fetch_json(url, ("shift_jis", "cp932", "utf-8"))
            except (HTTPError, URLError, RuntimeError) as exc:
                last_error = exc
                continue
            if isinstance(payload, dict) and isinstance(payload.get("stations"), list):
                normalized = normalize_timetable_payload(payload)
                normalized["encoding"] = encoding
                normalized["sourceUrl"] = url
                return normalized
        raise RuntimeError(f"京急時刻表を取得できませんでした: {last_error}")

    return ttl_cache(f"keikyu:timetable:{train_number}:{line_id}:{direction_code}", 60, supplier)


def pick_platform(position_info: dict[str, Any], detail_rows: list[dict[str, Any]]) -> str:
    station_label = string_or_empty(position_info.get("stationLabel"))
    if station_label:
        for row in detail_rows:
            if row.get("platform") and row.get("stationLabel") == station_label:
                return string_or_empty(row["platform"])
    for row in detail_rows:
        if row.get("platform"):
            return string_or_empty(row["platform"])
    return ""


def infer_owner_label(train_number: str) -> str:
    text = string_or_empty(train_number)
    if text.endswith("H"):
        return "京急"
    if text.endswith("T"):
        return "都営"
    if text.endswith("N"):
        return "北総"
    if text.endswith("K"):
        return "京成"
    return ""


def normalize_live_train(record: dict[str, Any]) -> dict[str, Any]:
    position_code = string_or_empty(record.get("position") or record.get("id"))
    direction_code = string_or_empty(record.get("direction"))
    position_info = resolve_keikyu_position(position_code)
    line_config = KEIKYU_LINE_CONFIG.get(position_info["lineId"], KEIKYU_LINE_CONFIG["main"])
    train_number = string_or_empty(record.get("train_no"))
    train_kind_code = string_or_empty(record.get("train_kind"))
    service_meta = KEIKYU_TRAIN_KIND_META.get(train_kind_code, KEIKYU_TRAIN_KIND_META["unknown"])
    detail_available = bool(train_number and train_number != "0")
    detail_key = f"keikyu:{train_number}:{direction_code or 'x'}" if detail_available else ""

    note_parts = []
    if position_code:
        note_parts.append(f"位置コード: {position_code}")
    if string_or_empty(record.get("is_alert")) == "1":
        note_parts.append("公式アラートあり")

    return {
        "networkId": "keikyu",
        "trainNumber": train_number or "(列番なし)",
        "lineId": position_info["lineId"],
        "lineLabel": line_config["name"],
        "directionCode": direction_code,
        "directionLabel": line_config["directions"].get(direction_code, "方向不明"),
        "positionCode": position_code,
        "locationLabel": position_info["locationLabel"],
        "locationType": position_info["locationType"],
        "positionOrder": position_info["positionOrder"],
        "confidence": position_info["confidence"],
        "serviceTypeCode": train_kind_code,
        "serviceTypeLabel": service_meta["label"],
        "serviceColor": service_meta["color"],
        "serviceTextColor": service_meta["textColor"],
        "serviceTone": classify_service_tone(service_meta["label"]),
        "originLabel": first_non_empty([record.get("origin"), record.get("from"), record.get("origin_name")]),
        "destinationLabel": first_non_empty([record.get("destination"), record.get("ikisaki"), record.get("to"), record.get("destination_name")]),
        "platform": string_or_empty(record.get("platform")),
        "delayMinutes": to_number(record.get("late_minutes"), 0),
        "ownerLabel": first_non_empty([record.get("owner"), record.get("train_owner"), infer_owner_label(train_number)]),
        "vehicleLabel": first_non_empty([record.get("vehicle"), record.get("formation"), record.get("car_info")]),
        "sourceTags": ["live"],
        "researchCandidate": position_info["confidence"] != "high" or train_number == "0",
        "note": " / ".join(note_parts),
        "detailAvailable": detail_available,
        "detailKey": detail_key,
        "detailRequest": (
            {
                "trainNumber": train_number,
                "lineId": position_info["lineId"],
                "positionCode": position_code,
                "directionCode": direction_code or "1",
            }
            if detail_available
            else None
        ),
        "detailRows": [],
        "detailSummary": "京急列車別時刻表",
    }


def compare_train(train: dict[str, Any]) -> tuple[Any, ...]:
    return (
        train.get("lineLabel", ""),
        train.get("directionCode", ""),
        train.get("positionOrder", 999999),
        train.get("trainNumber", ""),
    )


def build_keikyu_snapshot() -> dict[str, Any]:
    def supplier():
        payload, _ = fetch_json(KEIKYU_API_ENDPOINT, ("utf-8", "cp932", "shift_jis"))
        if not isinstance(payload, list):
            raise RuntimeError("Unexpected 京急 API response")
        trains = [normalize_live_train(record) for record in payload]
        trains.sort(key=compare_train)
        return {
            "id": NETWORK_META["id"],
            "label": NETWORK_META["label"],
            "description": NETWORK_META["description"],
            "accentColor": NETWORK_META["accentColor"],
            "status": "ok",
            "updatedAt": first_non_empty([payload[0].get("receive_datetime") if payload else "", iso_now()]),
            "trains": trains,
            "warnings": [
                "GitHub Pages 版はビルド時点のスナップショットを配信します。",
                "列車カードの時刻表はビルド時に列車番号ごとへ展開し、画面では後読みします。",
            ],
            "error": "",
            "sourceUrls": NETWORK_META["sourceUrls"],
            "meta": {
                "detailMode": "prebuilt-per-train",
                "networkSource": KEIKYU_API_ENDPOINT,
            },
        }

    return ttl_cache("keikyu:network", 12, supplier)


def build_keikyu_train_detail(
    train_number: str,
    line_id: str,
    position_code: str = "",
    direction_code: str = "1",
) -> dict[str, Any]:
    position_info = resolve_keikyu_position(position_code) if position_code else {"stationLabel": ""}
    timetable = fetch_keikyu_timetable(train_number, line_id, direction_code)
    detail_rows = timetable.get("detailRows") or []
    return {
        "detailKey": f"keikyu:{train_number}:{direction_code or 'x'}",
        "detailRows": detail_rows,
        "detailSummary": timetable.get("detailSummary") or "京急列車別時刻表",
        "originLabel": timetable.get("originLabel", ""),
        "destinationLabel": timetable.get("destinationLabel", ""),
        "platform": pick_platform(position_info, detail_rows),
        "vehicleLabel": timetable.get("vehicleLabel", ""),
        "sourceTags": ["timetable"],
        "encoding": timetable.get("encoding", ""),
        "sourceUrl": timetable.get("sourceUrl", ""),
    }
