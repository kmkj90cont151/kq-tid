from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import urlopen

from keikyu_local_core import (
    APP_VERSION,
    build_keikyu_snapshot,
    first_non_empty,
    iso_now,
    string_or_empty,
    to_number,
    unique_strings,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source"

ELESITE_API_BASE = "https://www.elesite-next.com/fastapi"
DEFAULT_ODPT_CONSUMER_KEY = (
    "qkpjriztbhvaxwjzum1oluug1hnfvwfq3ztxnsb56xtbt6qve7zdwv8bb73ajavy"
)

TOEI_TRAIN_ENDPOINT = "https://api.odpt.org/api/v4/odpt:Train"
TOEI_TIMETABLE_ENDPOINTS = {
    "sengakuji": "https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Sengakuji",
    "oshiage": "https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Oshiage",
}

KEISEI_ENDPOINTS = {
    "traffic": "https://zaisen.tid-keisei.jp/data/traffic_info.json",
    "diainfBase": "https://zaisen.tid-keisei.jp/data/diainf/",
    "matsudoTrainInfo": "https://zaisen.tid-keisei.jp/data/matsudo_train_info.json",
    "matsudoDate": "https://zaisen.tid-keisei.jp/data/matsudo_date.json",
    "matsudoStatus": "https://zaisen.tid-keisei.jp/data/matsudo_status.json",
    "syasyu": "https://zaisen.tid-keisei.jp/config/syasyu.json",
    "ikisaki": "https://zaisen.tid-keisei.jp/config/ikisaki.json",
    "station": "https://zaisen.tid-keisei.jp/config/station.json",
    "stop": "https://zaisen.tid-keisei.jp/config/stop.json",
    "rosen": "https://zaisen.tid-keisei.jp/config/rosen.json",
    "coordinate": "https://zaisen.tid-keisei.jp/config/coordinate.json",
    "matsudoId": "https://zaisen.tid-keisei.jp/config/matsudo_id.json",
    "ikMatsudo": "https://zaisen.tid-keisei.jp/config/ik_matsudo.json",
}

NETWORK_META = {
    "keikyu": {
        "id": "keikyu",
        "label": "京急線",
        "description": "京急の在線情報と列車別時刻表を静的に配信します。",
        "accentColor": "#d72731",
        "sourceUrls": [
            {"label": "京急API", "url": "https://app-kq.net/api/train"},
            {"label": "京急在線ページ", "url": "https://app-kq.net/web/jp/html/zaisen.html"},
            {
                "label": "京急列車別時刻表",
                "url": "https://app-kq.net/api/locationTimetable/8201-1-1403A",
            },
        ],
    },
    "toei": {
        "id": "toei",
        "label": "都営浅草線",
        "description": "ODPT の在線データと境界駅時刻表を組み合わせて表示します。",
        "accentColor": "#cb8c15",
        "sourceUrls": [
            {
                "label": "ODPT在線情報",
                "url": "https://api.odpt.org/api/v4/odpt:Train?odpt:railway=odpt.Railway:Toei.Asakusa",
            },
            {"label": "泉岳寺時刻表", "url": TOEI_TIMETABLE_ENDPOINTS["sengakuji"]},
            {"label": "押上時刻表", "url": TOEI_TIMETABLE_ENDPOINTS["oshiage"]},
            {"label": "えるサイト", "url": "https://kisaragi-cure.github.io/ToeiAsakusa/"},
        ],
    },
    "keisei": {
        "id": "keisei",
        "label": "京成線",
        "description": "京成の在線情報、列番別時刻表、えるサイトの路線メタをまとめて表示します。",
        "accentColor": "#0b5bd3",
        "sourceUrls": [
            {"label": "在線情報", "url": "https://zaisen.tid-keisei.jp/data/traffic_info.json"},
            {"label": "在線ページ", "url": "https://zaisen.tid-keisei.jp/html/zaisen.html?line=1"},
            {"label": "えるサイト", "url": "https://www.elesite-next.com/train_location"},
        ],
    },
    "matsudo": {
        "id": "matsudo",
        "label": "京成松戸線",
        "description": "松戸線の在線情報とえるサイト由来の補助メタを表示します。",
        "accentColor": "#13866f",
        "sourceUrls": [
            {"label": "松戸線在線情報", "url": "https://zaisen.tid-keisei.jp/data/matsudo_train_info.json"},
            {"label": "在線ページ", "url": "https://zaisen.tid-keisei.jp/html/zaisen.html?line=7"},
            {"label": "えるサイト", "url": "https://www.elesite-next.com/train_location"},
        ],
    },
}

ELESITE_DEFAULT_ROUTE_CODES = {
    "keikyu": "keikyu_hon",
    "toei": "toei_asakusa",
    "keisei": "keisei_hon",
    "matsudo": "keisei_matsudo",
}

TOEI_STATION_ORDER = [
    "西馬込",
    "馬込",
    "中延",
    "戸越",
    "五反田",
    "高輪台",
    "泉岳寺",
    "三田",
    "大門",
    "新橋",
    "東銀座",
    "宝町",
    "日本橋",
    "人形町",
    "東日本橋",
    "浅草橋",
    "蔵前",
    "浅草",
    "本所吾妻橋",
    "押上",
]

TOEI_DIRECTION_LABELS = {"Northbound": "北行", "Southbound": "南行"}

TOEI_TRAIN_TYPE_LABELS = {
    "Local": "普通",
    "Express": "急行",
    "Rapid": "快速",
    "LimitedExpress": "特急",
    "RapidLimitedExpress": "快特",
    "AirportRapidLimitedExpress": "エアポート快特",
    "AccessExpress": "アクセス特急",
    "CommuterLimitedExpress": "通勤特急",
}

ODPT_LABELS = {
    "NishiMagome": "西馬込",
    "Magome": "馬込",
    "Nakanobu": "中延",
    "Togoshi": "戸越",
    "Gotanda": "五反田",
    "Takanawadai": "高輪台",
    "Sengakuji": "泉岳寺",
    "Mita": "三田",
    "Daimon": "大門",
    "Shimbashi": "新橋",
    "HigashiGinza": "東銀座",
    "Takaracho": "宝町",
    "Nihombashi": "日本橋",
    "Ningyocho": "人形町",
    "HigashiNihombashi": "東日本橋",
    "Asakusabashi": "浅草橋",
    "Kuramae": "蔵前",
    "Asakusa": "浅草",
    "HonjoAzumabashi": "本所吾妻橋",
    "Oshiage": "押上",
    "HanedaAirportTerminal1and2": "羽田空港第1・第2ターミナル",
    "HanedaAirportTerminal3": "羽田空港第3ターミナル",
    "Miurakaigan": "三浦海岸",
    "Misakiguchi": "三崎口",
    "KeiseiTakasago": "京成高砂",
    "Aoto": "青砥",
    "ImbaNihonIdai": "印旛日本医大",
    "InzaiMakinohara": "印西牧の原",
    "NishiShiroi": "西白井",
    "NaritaAirportTerminal1": "成田空港第1ターミナル",
    "NaritaAirportTerminal2and3": "成田空港第2・第3ターミナル",
    "Shinagawa": "品川",
    "KanazawaBunko": "金沢文庫",
    "KeikyuKawasaki": "京急川崎",
    "Uraga": "浦賀",
    "KeikyuKurihama": "京急久里浜",
    "KeiseiNakayama": "京成中山",
    "KeiseiYawata": "京成八幡",
}

KEISEI_DIRECTION_LABELS = {"0": "下り", "1": "上り"}
MATSUDO_DIRECTION_LABELS = {"0": "下り", "1": "上り"}

SERVICE_PALETTE = {
    "local": {"color": "#2f2f2f", "textColor": "#ffffff"},
    "express": {"color": "#1358b8", "textColor": "#ffffff"},
    "limited": {"color": "#7a3db8", "textColor": "#ffffff"},
    "special": {"color": "#6b7280", "textColor": "#ffffff"},
    "unknown": {"color": "#7c6755", "textColor": "#ffffff"},
}


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def fetch_json(url: str, encodings: tuple[str, ...] = ("utf-8", "cp932", "shift_jis")) -> tuple[Any, str]:
    with urlopen(url, timeout=25) as response:
        raw = response.read()
    last_error: Exception | None = None
    for encoding in encodings:
        try:
            return json.loads(raw.decode(encoding)), encoding
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"JSON decode failed for {url}: {last_error}")


def read_json_file(path: Path) -> Any:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw)


def build_url(base: str, params: dict[str, Any]) -> str:
    return f"{base}?{urlencode({k: string_or_empty(v) for k, v in params.items()})}"


def token_tail(value: Any) -> str:
    text = string_or_empty(value)
    if not text:
        return ""
    return text.split(".")[-1]


def normalize_station_name(value: str) -> str:
    return string_or_empty(value).strip()


def label_odpt_token(value: Any) -> str:
    tail = token_tail(value)
    if not tail:
        return ""
    return ODPT_LABELS.get(tail, re.sub(r"([a-z])([A-Z])", r"\1 \2", tail))


def label_odpt_list(value: Any) -> str:
    items = ensure_list(value)
    return label_odpt_token(items[0]) if items else ""


def classify_service_tone(label: str) -> str:
    text = string_or_empty(label)
    if not text:
        return "unknown"
    if "普通" in text:
        return "local"
    if "ライナー" in text or "ウィング" in text:
        return "limited"
    if any(token in text for token in ("快特", "特急", "急行", "快速")):
        return "express"
    if "回送" in text or "臨時" in text:
        return "special"
    return "unknown"


def pick_palette(label: str) -> dict[str, str]:
    return SERVICE_PALETTE.get(classify_service_tone(label), SERVICE_PALETTE["unknown"])


def pick_keisei_palette(service_type_code: Any, label: str) -> dict[str, str]:
    code = string_or_empty(service_type_code).strip()
    text = string_or_empty(label)

    if code in {"0", "1", "2", "16"} or any(token in text for token in ("スカイライナー", "モーニングライナー", "臨時ライナー", "イブニングライナー", "シティライナー")):
        return {"color": "#0b3b8c", "textColor": "#ffffff"}
    if code in {"17", "18"} or "アクセス特急" in text:
        return {"color": "#f39800", "textColor": "#1f2937"}
    if code == "3" or "通勤特急" in text:
        return {"color": "#69c7f0", "textColor": "#083344"}
    if code in {"13", "14", "15"} or "快速特急" in text:
        return {"color": "#009944", "textColor": "#ffffff"}
    if code == "4" or text == "特急":
        return {"color": "#d23431", "textColor": "#ffffff"}
    if code in {"10", "11"} or text == "快速":
        return {"color": "#ff5fa2", "textColor": "#ffffff"}
    if code == "6" or text == "普通":
        return {"color": "#2f2f2f", "textColor": "#ffffff"}
    return pick_palette(text)


def normalize_display_railway_name(value: Any) -> str:
    return string_or_empty(value).strip()


def build_network_error(network_id: str, error: Exception | str) -> dict[str, Any]:
    meta = NETWORK_META[network_id]
    error_text = getattr(error, "message", None) or str(error)
    return {
        "id": network_id,
        "label": meta["label"],
        "description": meta["description"],
        "accentColor": meta["accentColor"],
        "status": "error",
        "updatedAt": "",
        "trains": [],
        "warnings": ["データ取得に失敗しました。"],
        "error": error_text,
        "sourceUrls": meta["sourceUrls"],
        "meta": {},
        "loaded": True,
    }


def compare_generic_train(train: dict[str, Any]) -> tuple[Any, ...]:
    return (
        string_or_empty(train.get("lineLabel")),
        to_number(train.get("positionOrder"), 999999),
        string_or_empty(train.get("directionCode")),
        string_or_empty(train.get("trainNumber")),
    )


def sort_trains(trains: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(trains, key=compare_generic_train)


def get_fixture_path(fixtures_dir: Path | None, relative_path: str) -> Path | None:
    if fixtures_dir is None:
        return None
    path = fixtures_dir / relative_path
    return path if path.exists() else None


def load_json_with_fallback(
    url: str,
    fixtures_dir: Path | None = None,
    fixture_names: tuple[str, ...] = (),
    encodings: tuple[str, ...] = ("utf-8", "cp932", "shift_jis"),
) -> tuple[Any, str]:
    for fixture_name in fixture_names:
        fixture_path = get_fixture_path(fixtures_dir, fixture_name)
        if fixture_path:
            return read_json_file(fixture_path), f"fixture:{fixture_name}"
    return fetch_json(url, encodings)


def operational_date() -> datetime:
    return datetime.now(timezone.utc)


def operational_date_string() -> str:
    return operational_date().date().isoformat()


def operational_date_compact() -> str:
    return operational_date().strftime("%Y%m%d")


def is_holiday_service_day() -> bool:
    return operational_date().weekday() >= 5


def normalize_delay_minutes(value: Any) -> float:
    seconds = to_number(value)
    if seconds <= 0:
        return 0.0
    return round(seconds / 60, 1 if seconds % 60 else 0)


def get_elesite_route_code(network_id: str) -> str:
    return ELESITE_DEFAULT_ROUTE_CODES.get(network_id, "")


def build_elesite_meta(network_id: str, fixtures_dir: Path | None = None) -> dict[str, Any]:
    route_code = get_elesite_route_code(network_id)
    select_date = operational_date_string()
    if not route_code:
        return {
            "enabled": False,
            "routeCode": "",
            "directionInfo": None,
            "alerts": [],
            "shoteiList": [],
            "todayDiaPattern": None,
            "currentHenseiCount": 0,
            "currentHenseiPreview": [],
            "error": "",
        }

    errors: list[str] = []

    def safe_load(url: str, fixture_names: tuple[str, ...]) -> Any:
        try:
            payload, _ = load_json_with_fallback(url, fixtures_dir, fixture_names)
            return payload
        except Exception as exc:
            errors.append(str(exc))
            return None

    direction_info = safe_load(
        build_url(ELESITE_API_BASE + "/get_direction_info", {"rosen_code": route_code}),
        (f"elesite-direction-{route_code}.json",),
    )
    railway_info = safe_load(
        build_url(ELESITE_API_BASE + "/get_railwayInfo", {"rosen_code": route_code}),
        (f"elesite-railwayInfo-{route_code}.json",),
    )
    today_dia_pattern = safe_load(
        build_url(
            ELESITE_API_BASE + "/get_today_dia_pattern",
            {"rosen_code": route_code, "select_date": select_date},
        ),
        (f"elesite-today-{route_code}.json",),
    )
    rosen_info = safe_load(
        build_url(ELESITE_API_BASE + "/get_rosen_info", {"rosen_code": route_code}),
        (f"elesite-roseninfo-{route_code}.json",),
    )

    current_hensei_count = 0
    current_hensei_preview: list[str] = []
    day_id = string_or_empty((today_dia_pattern or {}).get("day_id"))
    if day_id:
        current_hensei_payload: Any = None
        if fixtures_dir is not None:
            for fixture_name in (
                "elesite-current-hensei.json",
                "elesite-hensei-test-1.json",
                "elesite-hensei-test-2.json",
                "elesite-hensei-test-3.json",
            ):
                fixture_path = get_fixture_path(fixtures_dir, fixture_name)
                if fixture_path:
                    current_hensei_payload = read_json_file(fixture_path)
                    break
        if current_hensei_payload is None:
            if fixtures_dir is None:
                try:
                    current_hensei_payload, _ = fetch_json(
                        build_url(
                            ELESITE_API_BASE + "/get_current_hensei_list",
                            {
                                "rosen_code": route_code,
                                "day_id": day_id,
                                "select_date": select_date,
                            },
                        )
                    )
                except Exception as exc:
                    errors.append(str(exc))
                    current_hensei_payload = None

        if isinstance(current_hensei_payload, dict):
            payload_list = current_hensei_payload.get("hensei_list")
            hensei_list = ensure_list(payload_list) if payload_list is not None else ensure_list(current_hensei_payload)
        else:
            hensei_list = ensure_list(current_hensei_payload)

        current_hensei_count = len(hensei_list)
        current_hensei_preview = [
            first_non_empty(
                [
                    row.get("sharyo"),
                    row.get("formation"),
                    row.get("retsuban"),
                    row.get("unyou_id"),
                    row.get("unyou_ids"),
                ]
            )
            for row in hensei_list[:8]
            if isinstance(row, dict)
        ]
        current_hensei_preview = [value for value in current_hensei_preview if value]

    alerts = [
        {
            "info": string_or_empty(alert.get("info")),
            "reason": string_or_empty(alert.get("reason")),
            "detail": string_or_empty(alert.get("detail")),
            "postedAt": string_or_empty(alert.get("toukou_time")),
        }
        for alert in ensure_list((railway_info or {}).get("railway_info_list"))
        if isinstance(alert, dict)
    ]
    shotei_list = [string_or_empty(value) for value in ensure_list((rosen_info or {}).get("shotei_list")) if string_or_empty(value)]
    dia_pattern_names = [
        string_or_empty(row.get("name"))
        for row in ensure_list((rosen_info or {}).get("dia_pattern_list"))
        if isinstance(row, dict) and string_or_empty(row.get("name"))
    ]
    current_hensei_preview = unique_strings(current_hensei_preview)
    left_terminal = string_or_empty((direction_info or {}).get("c_left"))
    right_terminal = string_or_empty((direction_info or {}).get("c_right"))
    today_dia_label = first_non_empty(
        [
            (today_dia_pattern or {}).get("name"),
            ((rosen_info or {}).get("today_dia_pattern") or {}).get("name"),
        ]
    )

    return {
        "enabled": True,
        "routeCode": route_code,
        "directionInfo": direction_info,
        "alerts": alerts,
        "alertCount": len(alerts),
        "leftTerminal": left_terminal,
        "rightTerminal": right_terminal,
        "originSide": "left" if bool((direction_info or {}).get("is_kiten_left")) else "right",
        "formationCount": len(shotei_list),
        "formationLabels": shotei_list,
        "diaPatternNames": dia_pattern_names,
        "todayDiaLabel": today_dia_label,
        "userRank": to_number((railway_info or {}).get("user_rank"), 0),
        "shoteiList": shotei_list,
        "todayDiaPattern": today_dia_pattern,
        "currentHenseiCount": current_hensei_count,
        "currentHenseiList": current_hensei_preview,
        "currentHenseiPreview": current_hensei_preview,
        "routeMap": {
            "title": f"{NETWORK_META.get(network_id, {}).get('label', network_id)} 路線補助",
            "leftTerminal": left_terminal,
            "rightTerminal": right_terminal,
            "formationCount": len(shotei_list),
            "diaPatternCount": len(dia_pattern_names),
            "todayPattern": today_dia_label,
        },
        "error": " / ".join(unique_strings(errors)),
    }


def infer_detail_mode(network: dict[str, Any]) -> str:
    network_id = string_or_empty(network.get("id"))
    if network_id == "keikyu":
        return "列車別 JSON を後読み"
    trains = [train for train in ensure_list(network.get("trains")) if isinstance(train, dict)]
    if any(train.get("detailRows") for train in trains):
        return "路線 JSON に内蔵"
    return "詳細情報なし"


def normalize_meta_value_labels(meta: dict[str, Any]) -> None:
    detail_mode = string_or_empty(meta.get("detailMode"))
    position_mapping_mode = string_or_empty(meta.get("positionMappingMode"))

    if detail_mode == "prebuilt-per-train":
        meta["detailMode"] = "列車別 JSON を後読み"

    if position_mapping_mode == "dictionary-plus-raw":
        meta["positionMappingMode"] = "辞書補完 + raw 保持"
    elif position_mapping_mode == "matsudo-id-plus-coordinate":
        meta["positionMappingMode"] = "matsudo_id + 座標辞書"


def build_route_map_from_trains(network: dict[str, Any]) -> dict[str, Any]:
    trains = [train for train in ensure_list(network.get("trains")) if isinstance(train, dict)]
    station_map: dict[str, dict[str, Any]] = {}
    line_map: dict[str, dict[str, Any]] = {}
    direction_map: dict[str, dict[str, Any]] = {}

    for train in sort_trains(trains):
        location_label = string_or_empty(train.get("locationLabel")) or "位置不明"
        position_code = string_or_empty(train.get("positionCode"))
        position_order = to_number(train.get("positionOrder"), 999999)
        line_id = string_or_empty(train.get("lineId")) or string_or_empty(train.get("lineLabel")) or "unknown"
        line_label = string_or_empty(train.get("lineLabel")) or "路線不明"
        direction_id = string_or_empty(train.get("directionCode")) or string_or_empty(train.get("directionLabel")) or "unknown"
        direction_label = string_or_empty(train.get("directionLabel")) or "方向不明"
        node_id = f"{line_id}:{position_code or location_label}:{position_order}"

        station_map.setdefault(
            node_id,
            {
                "id": node_id,
                "label": location_label,
                "positionCode": position_code,
                "positionOrder": position_order,
                "lineId": line_id,
                "lineLabel": line_label,
            },
        )

        line_entry = line_map.setdefault(
            line_id,
            {
                "id": line_id,
                "label": line_label,
                "nodes": [],
            },
        )
        if node_id not in line_entry["nodes"]:
            line_entry["nodes"].append(node_id)

        direction_entry = direction_map.setdefault(
            direction_id,
            {
                "id": direction_id,
                "label": direction_label,
                "nodes": [],
                "trainCount": 0,
            },
        )
        if node_id not in direction_entry["nodes"]:
            direction_entry["nodes"].append(node_id)
        direction_entry["trainCount"] += 1

    stations = sorted(station_map.values(), key=lambda row: (to_number(row.get("positionOrder"), 999999), row.get("label", "")))
    lines = sorted(
        (
            {
                **entry,
                "stationCount": len(entry["nodes"]),
            }
            for entry in line_map.values()
        ),
        key=lambda row: row.get("label", ""),
    )
    directions = sorted(direction_map.values(), key=lambda row: row.get("label", ""))

    elesite = ((network.get("meta") or {}).get("elesite") or {}) if isinstance(network.get("meta"), dict) else {}
    terminals = {
        "left": string_or_empty(elesite.get("leftTerminal")),
        "right": string_or_empty(elesite.get("rightTerminal")),
    }

    route_map = {
        "title": f"{string_or_empty(network.get('label')) or string_or_empty(network.get('id'))} 路線図モード",
        "description": "positionOrder と在線位置ラベルをもとに組み立てた簡易路線図です。",
        "updatedAt": string_or_empty(network.get("updatedAt")),
        "stations": stations,
        "lines": lines,
        "directions": directions,
    }
    if terminals["left"] or terminals["right"]:
        route_map["terminals"] = terminals
    return route_map


def enrich_network_snapshot(network_id: str, network: dict[str, Any], fixtures_dir: Path | None = None) -> dict[str, Any]:
    meta = network.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        network["meta"] = meta

    if network_id in ELESITE_DEFAULT_ROUTE_CODES and "elesite" not in meta:
        meta["elesite"] = build_elesite_meta(network_id, fixtures_dir)

    meta.setdefault("detailMode", infer_detail_mode(network))
    meta.setdefault("routeMapMode", "位置順レーン")
    meta["detailCount"] = sum(
        1 for train in ensure_list(network.get("trains")) if isinstance(train, dict) and ensure_list(train.get("detailRows"))
    )
    normalize_meta_value_labels(meta)
    network["routeMap"] = build_route_map_from_trains(network)
    return network


def get_keisei_config_bundle(fixtures_dir: Path | None = None) -> dict[str, Any]:
    file_map = {
        "syasyu": "keisei-syasyu.json",
        "ikisaki": "keisei-ikisaki.json",
        "station": "keisei-station.json",
        "stop": "keisei-stop.json",
        "rosen": "keisei-rosen.json",
        "coordinate": "keisei-coordinate.json",
        "matsudoId": "keisei-matsudo_id.json",
        "ikMatsudo": "keisei-ik_matsudo.json",
    }
    loaded: dict[str, Any] = {}
    for key, filename in file_map.items():
        payload, _ = load_json_with_fallback(KEISEI_ENDPOINTS[key], fixtures_dir, (filename,))
        loaded[key] = payload

    syasyu = ensure_list((loaded["syasyu"] or {}).get("syasyu"))
    ikisaki = ensure_list((loaded["ikisaki"] or {}).get("ikisaki"))
    station = ensure_list((loaded["station"] or {}).get("station"))
    stop = ensure_list((loaded["stop"] or {}).get("stop"))
    rosen = ensure_list((loaded["rosen"] or {}).get("rosen"))
    coordinate = ensure_list((loaded["coordinate"] or {}).get("coordinate"))
    matsudo_id = ensure_list((loaded["matsudoId"] or {}).get("matsudo"))
    ik_matsudo = ensure_list((loaded["ikMatsudo"] or {}).get("ik_matsudo"))

    bundle = {
        "syasyuByCode": {string_or_empty(row.get("code")): row for row in syasyu if isinstance(row, dict)},
        "ikisakiByCode": {string_or_empty(row.get("code")): row for row in ikisaki if isinstance(row, dict)},
        "stationById": {string_or_empty(row.get("id")): row for row in station if isinstance(row, dict)},
        "stopByCode": {string_or_empty(row.get("code")): row for row in stop if isinstance(row, dict)},
        "rosenByCode": {string_or_empty(row.get("code")): row for row in rosen if isinstance(row, dict)},
        "matsudoIdBySection": {string_or_empty(row.get("sectionid")): row for row in matsudo_id if isinstance(row, dict)},
        "ikMatsudoByCode": {string_or_empty(row.get("code")): row for row in ik_matsudo if isinstance(row, dict)},
        "coordinateByName": {},
        "lineStations": {},
        "syasyuCount": len(syasyu),
        "ikisakiCount": len(ikisaki),
        "stationCount": len(station),
        "stopCount": len(stop),
    }

    for row in coordinate:
        if not isinstance(row, dict):
            continue
        name = normalize_station_name(row.get("ifname"))
        if not name:
            continue
        items = []
        for item in ensure_list(row.get("zh")):
            if not isinstance(item, dict):
                continue
            rs = string_or_empty(item.get("rs"))
            y = to_number(item.get("y"), -1)
            if rs and y >= 0:
                items.append({"rs": rs, "x": to_number(item.get("x")), "y": y})
        if not items:
            continue
        bundle["coordinateByName"].setdefault(name, []).extend(items)

    for name, items in bundle["coordinateByName"].items():
        for item in items:
            bundle["lineStations"].setdefault(item["rs"], []).append({"name": name, "y": item["y"]})
    for line_code, stations in bundle["lineStations"].items():
        stations.sort(key=lambda row: row["y"])

    return bundle


def flatten_keisei_traffic(traffic_info: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for bucket in ("TS", "EK"):
        for entry in ensure_list((traffic_info or {}).get(bucket)):
            if not isinstance(entry, dict):
                continue
            position_code = string_or_empty(entry.get("id"))
            for index, train in enumerate(ensure_list(entry.get("tr"))):
                if not isinstance(train, dict):
                    continue
                records.append(
                    {
                        "positionBucket": bucket,
                        "positionCode": position_code,
                        "trainNumber": string_or_empty(train.get("no")),
                        "raw": {
                            "bs": string_or_empty(train.get("bs")),
                            "sy": string_or_empty(train.get("sy")),
                            "ik": string_or_empty(train.get("ik")),
                            "dl": string_or_empty(train.get("dl")),
                            "hk": string_or_empty(train.get("hk")),
                            "sr": string_or_empty(train.get("sr")),
                            "index": index,
                        },
                    }
                )
    return records


def extract_digits(value: str) -> str:
    return "".join(ch for ch in string_or_empty(value) if ch.isdigit())


def lookup_keisei_station_name(code: str, config: dict[str, Any], is_matsudo: bool) -> str:
    if not code:
        return ""
    stop_entry = config["stopByCode"].get(code)
    matsudo_entry = config["ikMatsudoByCode"].get(code)
    if is_matsudo and matsudo_entry:
        return normalize_display_railway_name(matsudo_entry.get("name"))
    if stop_entry:
        return normalize_display_railway_name(stop_entry.get("name"))
    if matsudo_entry:
        return normalize_display_railway_name(matsudo_entry.get("name"))
    return ""


def guess_keisei_line_from_destination_code(code: str) -> str:
    value = int(code or 0)
    if 47 <= value <= 51 or 90 <= value <= 95:
        return "4"
    if value in (52, 53):
        return "5"
    return ""


def get_keisei_line_candidates(station_label: str, config: dict[str, Any]) -> list[str]:
    if not station_label:
        return []
    return unique_strings(
        [
            item["rs"]
            for item in config["coordinateByName"].get(normalize_station_name(station_label), [])
            if isinstance(item, dict) and string_or_empty(item.get("rs"))
        ]
    )


def pick_keisei_coordinate(station_label: str, line_code: str, config: dict[str, Any]) -> dict[str, Any] | None:
    items = config["coordinateByName"].get(normalize_station_name(station_label), [])
    if not items:
        return None
    for item in items:
        if string_or_empty(item.get("rs")) == string_or_empty(line_code):
            return item
    return items[0]


def build_keisei_section_label(station_label: str, line_code: str, config: dict[str, Any]) -> str:
    if not station_label:
        return ""
    stations = config["lineStations"].get(string_or_empty(line_code), [])
    normalized = normalize_station_name(station_label)
    index = next((i for i, row in enumerate(stations) if row["name"] == normalized), -1)
    if index < 0:
        return f"{station_label}付近"
    neighbor = stations[index + 1] if index + 1 < len(stations) else stations[index - 1] if index - 1 >= 0 else None
    if not neighbor:
        return f"{station_label}付近"
    return f"{neighbor['name']} - {station_label}間"


def infer_keisei_line_code(record: dict[str, Any], station_label: str, config: dict[str, Any]) -> str:
    candidates = get_keisei_line_candidates(station_label, config)
    if len(candidates) == 1:
        return candidates[0]

    destination_line = guess_keisei_line_from_destination_code(record["raw"].get("ik"))
    if destination_line and destination_line in candidates:
        return destination_line

    if station_label == "青砥":
        if guess_keisei_line_from_destination_code(record["raw"].get("ik")) == "4":
            return "4"
        return "1"

    if station_label == "京成高砂":
        if destination_line == "5":
            return "5"
        if destination_line == "4" or record["raw"].get("sy") in {"17", "18"}:
            return "4"
        if destination_line == "3":
            return "3"
        return "1"

    return candidates[0] if candidates else ""


def resolve_keisei_position(record: dict[str, Any], config: dict[str, Any], forced_line_code: str = "") -> dict[str, Any]:
    station_code = extract_digits(record.get("positionCode", ""))
    station_label = lookup_keisei_station_name(station_code, config, forced_line_code == "7")
    location_type = "station" if record.get("positionBucket") == "TS" else "section"
    line_code = forced_line_code or infer_keisei_line_code(record, station_label, config)
    line_label = normalize_display_railway_name(config["rosenByCode"].get(line_code, {}).get("name")) or "路線不明"
    coord = pick_keisei_coordinate(station_label, line_code, config)
    confidence = "high" if station_label and coord else "medium" if station_label else "low"
    location_label = station_label or record.get("positionCode") or "位置不明"
    position_order = coord["y"] if coord else 999999

    if location_type == "section":
        location_label = build_keisei_section_label(station_label, line_code, config) or (
            f"{station_label}付近" if station_label else record.get("positionCode") or "位置不明"
        )
        position_order = (coord["y"] + 0.5) if coord else 999999

    return {
        "lineCode": line_code,
        "lineLabel": line_label,
        "locationLabel": location_label,
        "locationType": location_type,
        "positionOrder": position_order,
        "confidence": confidence,
    }


def normalize_keisei_time(value: Any) -> str:
    text = string_or_empty(value).strip()
    if not text or ":" not in text:
        return ""
    return text


def normalize_keisei_dia_rows(payload: Any, config: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in ensure_list((payload or {}).get("dy")):
        if not isinstance(row, dict):
            continue
        station_code = string_or_empty(row.get("st"))
        rows.append(
            {
                "stationCode": station_code,
                "stationLabel": lookup_keisei_station_name(station_code, config, False),
                "arrivalTime": normalize_keisei_time(row.get("tt")),
                "departureTime": normalize_keisei_time(row.get("ht")),
                "stopType": "通過" if string_or_empty(row.get("pa")) == "1" else "停車",
            }
        )
    return rows


def build_keisei_timetable_lookup(
    records: list[dict[str, Any]],
    config: dict[str, Any],
    fixtures_dir: Path | None = None,
) -> dict[str, list[dict[str, Any]]]:
    lookup: dict[str, list[dict[str, Any]]] = {}
    service_date = operational_date_compact()
    for train_number in unique_strings([record["trainNumber"] for record in records]):
        if not train_number:
            continue

        fixture_name = f"keisei-diainf-{train_number}.json"
        payload: Any = None
        if fixtures_dir is not None:
            fixture_path = get_fixture_path(fixtures_dir, fixture_name)
            if fixture_path:
                payload = read_json_file(fixture_path)
        if payload is None and fixtures_dir is None:
            url = f"{KEISEI_ENDPOINTS['diainfBase']}{train_number}.json?ts={service_date}"
            try:
                payload, _ = fetch_json(url)
            except Exception:
                payload = None
        if payload is not None:
            lookup[train_number] = normalize_keisei_dia_rows(payload, config)
    return lookup


def normalize_keisei_train(
    record: dict[str, Any],
    config: dict[str, Any],
    dia_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    position_info = resolve_keisei_position(record, config, "")
    service_entry = config["syasyuByCode"].get(record["raw"].get("sy")) or None
    destination_entry = config["ikisakiByCode"].get(record["raw"].get("ik")) or None
    service_type_label = string_or_empty(service_entry.get("name")) if service_entry else "不明"
    destination_label = string_or_empty(destination_entry.get("name")) if destination_entry else ""
    train_number = record.get("trainNumber") or "(列番なし)"
    palette = pick_keisei_palette(record["raw"].get("sy"), service_type_label)
    source_tags = ["live"]
    if dia_rows:
        source_tags.append("timetable")

    return {
        "trainNumber": train_number,
        "lineId": position_info["lineCode"] or "1",
        "lineLabel": position_info["lineLabel"] or "路線不明",
        "directionCode": record["raw"].get("hk"),
        "directionLabel": KEISEI_DIRECTION_LABELS.get(record["raw"].get("hk"), f"方向コード {record['raw'].get('hk') or '-'}"),
        "positionCode": record.get("positionCode", ""),
        "locationLabel": position_info["locationLabel"],
        "locationType": position_info["locationType"],
        "positionOrder": position_info["positionOrder"],
        "confidence": position_info["confidence"],
        "serviceTypeCode": record["raw"].get("sy", ""),
        "serviceTypeLabel": service_type_label or "不明",
        "serviceTone": classify_service_tone(service_type_label),
        "serviceColor": palette["color"],
        "serviceTextColor": palette["textColor"],
        "originLabel": "",
        "destinationLabel": destination_label,
        "platform": "",
        "delayMinutes": to_number(record["raw"].get("dl"), 0),
        "ownerLabel": "京成",
        "vehicleLabel": "",
        "sourceTags": source_tags,
        "researchCandidate": position_info["confidence"] != "high" or not service_entry or not destination_entry or not position_info["lineCode"],
        "note": " / ".join(
            part
            for part in (
                f"sr={record['raw'].get('sr')}" if record["raw"].get("sr") else "",
                f"bs={record['raw'].get('bs')}" if record["raw"].get("bs") else "",
            )
            if part
        ),
        "detailRows": dia_rows,
        "detailSummary": "公式列車別時刻表" if dia_rows else "",
    }


def parse_keisei_update_timestamp(payload: Any) -> str:
    entry = ensure_list((payload or {}).get("UP"))[0] if isinstance(payload, dict) else None
    if not isinstance(entry, dict):
        return iso_now()
    dt = ensure_list(entry.get("dt"))[0] if entry.get("dt") else None
    if not isinstance(dt, dict):
        return iso_now()
    return datetime(
        int(dt.get("yy", 1970)),
        int(dt.get("mt", 1)),
        int(dt.get("dy", 1)),
        int(dt.get("hh", 0)),
        int(dt.get("mm", 0)),
        int(dt.get("ss", 0)),
        tzinfo=timezone.utc,
    ).isoformat()


def parse_matsudo_update_timestamp(payload: Any) -> str:
    entry = ensure_list(payload)[0] if payload else None
    stamp = entry.get("trainPositionUpdatePK") if isinstance(entry, dict) else None
    if not isinstance(stamp, dict) or not stamp.get("currentdate") or not stamp.get("currenttime"):
        return iso_now()
    date_text = str(stamp.get("currentdate"))
    time_text = str(stamp.get("currenttime")).zfill(6)
    return datetime(
        int(date_text[0:4]),
        int(date_text[4:6]),
        int(date_text[6:8]),
        int(time_text[0:2]),
        int(time_text[2:4]),
        int(time_text[4:6]),
        tzinfo=timezone.utc,
    ).isoformat()


def resolve_matsudo_position(mapping: dict[str, Any] | None, config: dict[str, Any]) -> dict[str, Any]:
    if not mapping:
        return {
            "locationLabel": "位置不明",
            "locationType": "section",
            "positionOrder": 999999,
            "confidence": "low",
        }

    location_type = "station" if string_or_empty(mapping.get("id")).startswith("E") else "section"
    station_code = extract_digits(mapping.get("id", ""))
    station_label = lookup_keisei_station_name(station_code, config, True) or lookup_keisei_station_name(
        station_code, config, False
    )
    coord = pick_keisei_coordinate(station_label, "7", config)
    position_order = (coord["y"] + 0.5) if coord and location_type == "section" else coord["y"] if coord else 999999

    return {
        "locationLabel": build_keisei_section_label(station_label, "7", config)
        if location_type == "section"
        else (station_label or "位置不明"),
        "locationType": location_type,
        "positionOrder": position_order,
        "confidence": "high" if coord else ("medium" if station_label else "low"),
    }


def normalize_matsudo_train(record: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    train_info_pk = record.get("trainPositionInfoPK") if isinstance(record, dict) else None
    train_info_pk = train_info_pk if isinstance(train_info_pk, dict) else {}
    section_id = string_or_empty(train_info_pk.get("sectionid"))
    mapping = config["matsudoIdBySection"].get(section_id)
    position_info = resolve_matsudo_position(mapping, config)
    direction_code = string_or_empty(mapping.get("hk")) if mapping else ""
    orbit_number = string_or_empty(train_info_pk.get("orbitnumber"))
    raw_train_number = string_or_empty(record.get("trainno"))
    train_number = orbit_number or raw_train_number or "(列番なし)"
    destination_label = normalize_display_railway_name(record.get("laststop"))

    return {
        "trainNumber": train_number,
        "lineId": "7",
        "lineLabel": "松戸線",
        "directionCode": direction_code,
        "directionLabel": MATSUDO_DIRECTION_LABELS.get(direction_code, f"方向コード {direction_code or '-'}"),
        "positionCode": mapping.get("id") if mapping else f"section:{section_id}",
        "locationLabel": position_info["locationLabel"],
        "locationType": position_info["locationType"],
        "positionOrder": position_info["positionOrder"],
        "confidence": position_info["confidence"],
        "serviceTypeCode": "",
        "serviceTypeLabel": "普通",
        "serviceTone": "local",
        "serviceColor": SERVICE_PALETTE["local"]["color"],
        "serviceTextColor": SERVICE_PALETTE["local"]["textColor"],
        "originLabel": "",
        "destinationLabel": destination_label,
        "platform": "",
        "delayMinutes": to_number(record.get("delayminute"), 0),
        "ownerLabel": "京成",
        "vehicleLabel": f"運用 {orbit_number}" if orbit_number else "",
        "sourceTags": ["live", "enrichment"],
        "researchCandidate": position_info["confidence"] != "high",
        "note": " / ".join(
            part
            for part in (
                f"列車番号 {raw_train_number}" if raw_train_number else "",
                f"block {train_info_pk.get('blockno')}" if train_info_pk.get("blockno") else "",
            )
            if part
        ),
        "detailRows": [],
        "detailSummary": "",
    }


def normalize_toei_delay_minutes(value: Any) -> float:
    return normalize_delay_minutes(value)


def matches_toei_calendar(calendar_token: Any) -> bool:
    tail = token_tail(calendar_token)
    return (tail == "SaturdayHoliday") if is_holiday_service_day() else (tail == "Weekday")


def resolve_toei_position(from_station: Any, to_station: Any) -> dict[str, Any]:
    from_label = label_odpt_token(from_station)
    to_label = label_odpt_token(to_station)
    if from_label and to_label:
        return {
            "locationLabel": from_label,
            "locationType": "station",
            "positionOrder": TOEI_STATION_ORDER.index(from_label) if from_label in TOEI_STATION_ORDER else 999999,
            "confidence": "high",
        }
    if from_label or to_label:
        label = from_label or to_label
        return {
            "locationLabel": label,
            "locationType": "station",
            "positionOrder": TOEI_STATION_ORDER.index(label) if label in TOEI_STATION_ORDER else 999999,
            "confidence": "medium",
        }
    return {
        "locationLabel": "位置不明",
        "locationType": "section",
        "positionOrder": 999999,
        "confidence": "low",
    }


def pick_toei_supplement(direction_code: str, supplement_rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not supplement_rows:
        return None
    preferred_station = "泉岳寺" if direction_code == "Northbound" else "押上" if direction_code == "Southbound" else ""
    for row in supplement_rows:
        if preferred_station and row.get("stationLabel") == preferred_station:
            return row
    return supplement_rows[0]


def normalize_toei_detail_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "stationCode": row.get("stationCode", ""),
            "stationLabel": row.get("stationLabel", ""),
            "arrivalTime": "",
            "departureTime": row.get("departureTime", ""),
            "stopType": f"{row.get('platform')}番線" if row.get("platform") else "境界駅",
        }
        for row in rows
    ]


def label_toei_train_type(train_type_token: Any) -> str:
    tail = token_tail(train_type_token)
    return TOEI_TRAIN_TYPE_LABELS.get(tail, label_odpt_token(train_type_token) or "不明")


def normalize_toei_train(record: dict[str, Any], timetable_lookup: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    train_number = string_or_empty(record.get("odpt:trainNumber"))
    direction_token = token_tail(record.get("odpt:railDirection"))
    direction_label = TOEI_DIRECTION_LABELS.get(direction_token, label_odpt_token(record.get("odpt:railDirection")) or "方向不明")
    supplement_rows = timetable_lookup.get(train_number, [])
    supplement = pick_toei_supplement(direction_token, supplement_rows)
    position_info = resolve_toei_position(record.get("odpt:fromStation"), record.get("odpt:toStation"))
    destination_label = first_non_empty(
        [
            label_odpt_list(record.get("odpt:destinationStation")),
            supplement.get("destinationLabel") if supplement else "",
        ]
    )
    source_tags = ["live"]
    if supplement:
        source_tags.append("timetable")

    service_type_label = label_toei_train_type(record.get("odpt:trainType"))
    detail_rows = normalize_toei_detail_rows(supplement_rows)

    return {
        "trainNumber": train_number or "(列番なし)",
        "lineId": "asakusa",
        "lineLabel": "都営浅草線",
        "directionCode": direction_token,
        "directionLabel": direction_label,
        "positionCode": " -> ".join(
            part for part in (string_or_empty(record.get("odpt:fromStation")), string_or_empty(record.get("odpt:toStation"))) if part
        ),
        "locationLabel": position_info["locationLabel"],
        "locationType": position_info["locationType"],
        "positionOrder": position_info["positionOrder"],
        "confidence": position_info["confidence"],
        "serviceTypeCode": token_tail(record.get("odpt:trainType")),
        "serviceTypeLabel": service_type_label,
        "serviceTone": classify_service_tone(service_type_label),
        "serviceColor": pick_palette(service_type_label)["color"],
        "serviceTextColor": pick_palette(service_type_label)["textColor"],
        "originLabel": label_odpt_list(record.get("odpt:originStation")),
        "destinationLabel": destination_label,
        "platform": first_non_empty([record.get("odpt:platformNumber"), supplement.get("platform") if supplement else ""]),
        "delayMinutes": normalize_toei_delay_minutes(record.get("odpt:delay")),
        "ownerLabel": label_odpt_token(record.get("odpt:trainOwner") or record.get("odpt:operator")),
        "vehicleLabel": "",
        "sourceTags": source_tags,
        "researchCandidate": position_info["confidence"] != "high" or not destination_label,
        "note": "境界駅時刻表で行先または番線を補完" if supplement else "",
        "detailRows": detail_rows,
        "detailSummary": "境界駅時刻表" if detail_rows else "",
    }


def build_toei_timetable_lookup(fixtures_dir: Path | None = None) -> dict[str, list[dict[str, Any]]]:
    lookup: dict[str, list[dict[str, Any]]] = {}
    for key, url in TOEI_TIMETABLE_ENDPOINTS.items():
        payload, _ = load_json_with_fallback(url, fixtures_dir, (f"toei-timetable-{key}.json",))
        for table in ensure_list(payload):
            if not isinstance(table, dict) or not matches_toei_calendar(table.get("odpt:calendar")):
                continue
            station_label = label_odpt_token(table.get("odpt:station"))
            station_code = token_tail(table.get("odpt:station"))
            direction_code = token_tail(table.get("odpt:railDirection"))
            for row in ensure_list(table.get("odpt:stationTimetableObject")):
                if not isinstance(row, dict):
                    continue
                train_number = string_or_empty(row.get("odpt:trainNumber"))
                if not train_number:
                    continue
                lookup.setdefault(train_number, []).append(
                    {
                        "stationCode": station_code,
                        "stationLabel": station_label,
                        "directionCode": direction_code,
                        "departureTime": string_or_empty(row.get("odpt:departureTime")),
                        "platform": string_or_empty(row.get("odpt:platformNumber")),
                        "destinationLabel": label_odpt_list(row.get("odpt:destinationStation")),
                    }
                )
    return lookup


def build_toei_snapshot(fixtures_dir: Path | None = None) -> dict[str, Any]:
    consumer_key = os.environ.get("ODPT_CONSUMER_KEY", DEFAULT_ODPT_CONSUMER_KEY)
    payload, _ = load_json_with_fallback(
        build_url(
            TOEI_TRAIN_ENDPOINT,
            {
                "odpt:railway": "odpt.Railway:Toei.Asakusa",
                "acl:consumerKey": consumer_key,
            },
        ),
        fixtures_dir,
        ("toei-train.json",),
    )
    timetable_lookup = build_toei_timetable_lookup(fixtures_dir)
    if not isinstance(payload, list):
        raise RuntimeError("Unexpected Toei API response")
    trains = [normalize_toei_train(record, timetable_lookup) for record in payload if isinstance(record, dict)]
    trains = sort_trains(trains)
    return {
        "id": "toei",
        "label": NETWORK_META["toei"]["label"],
        "description": NETWORK_META["toei"]["description"],
        "accentColor": NETWORK_META["toei"]["accentColor"],
        "status": "ok",
        "updatedAt": string_or_empty(payload[0].get("dc:date")) if payload else iso_now(),
        "trains": trains,
        "warnings": [
            "fromStation / toStation を主情報として扱い、不足分だけ時刻表で補完します。",
            "直通先の表示は、辞書に無い場合は ODPT トークンを整形して使います。",
        ],
        "error": "",
        "sourceUrls": NETWORK_META["toei"]["sourceUrls"],
        "meta": {
            "consumerKeyConfigured": bool(consumer_key),
            "timetableStations": ["Sengakuji", "Oshiage"],
            "elesite": build_elesite_meta("toei", fixtures_dir),
        },
    }


def build_keisei_snapshot(fixtures_dir: Path | None = None) -> dict[str, Any]:
    traffic_info, _ = load_json_with_fallback(
        KEISEI_ENDPOINTS["traffic"],
        fixtures_dir,
        ("keisei-traffic_info.json",),
    )
    config = get_keisei_config_bundle(fixtures_dir)
    elesite = build_elesite_meta("keisei", fixtures_dir)
    records = flatten_keisei_traffic(traffic_info)
    dia_lookup = build_keisei_timetable_lookup(records, config, fixtures_dir)

    trains = [normalize_keisei_train(record, config, dia_lookup.get(record["trainNumber"], [])) for record in records]
    trains = sort_trains(trains)

    return {
        "id": "keisei",
        "label": NETWORK_META["keisei"]["label"],
        "description": NETWORK_META["keisei"]["description"],
        "accentColor": NETWORK_META["keisei"]["accentColor"],
        "status": "ok",
        "updatedAt": parse_keisei_update_timestamp(traffic_info),
        "trains": trains,
        "warnings": [
            "列車位置は stop.json / coordinate.json を使って可能な範囲で駅名に変換し、未解読コードは raw のまま残します。",
            "列車別時刻表 diainf は列番ベースで取得し、停車・通過時刻を展開します。",
            "えるサイト連携は route メタ中心で、列車単位の編成突合は今後の拡張対象です。",
        ],
        "error": "",
        "sourceUrls": NETWORK_META["keisei"]["sourceUrls"],
        "meta": {
            "elesite": elesite,
            "configLoaded": {
                "syasyu": config["syasyuCount"],
                "ikisaki": config["ikisakiCount"],
                "station": config["stationCount"],
                "stop": config["stopCount"],
            },
            "timetableLookupCount": len(dia_lookup),
            "positionMappingMode": "dictionary-plus-raw",
        },
    }


def build_matsudo_snapshot(fixtures_dir: Path | None = None) -> dict[str, Any]:
    config = get_keisei_config_bundle(fixtures_dir)
    responses = []
    for key in ("matsudoTrainInfo", "matsudoDate", "matsudoStatus"):
        fixture_name = (
            "keisei-matsudo_train_info.json"
            if key == "matsudoTrainInfo"
            else "keisei-matsudo_date.json"
            if key == "matsudoDate"
            else "keisei-matsudo_status.json"
        )
        payload, _ = load_json_with_fallback(KEISEI_ENDPOINTS[key], fixtures_dir, (fixture_name,))
        responses.append(payload)

    train_payload, date_payload, status_payload = responses
    elesite = build_elesite_meta("matsudo", fixtures_dir)
    trains = [normalize_matsudo_train(record, config) for record in ensure_list(train_payload) if isinstance(record, dict)]
    trains = sort_trains(trains)

    warnings = []
    if string_or_empty((status_payload or {}).get("st")) != "0":
        warnings.append("公式の松戸線ステータスが平常以外を示しています。")
    warnings.extend(
        [
            "松戸線は matsudo_id.json と座標辞書を使って位置を補完します。",
            "列車番号よりも orbitnumber を優先表示し、運用番号として追いやすくしています。",
        ]
    )

    return {
        "id": "matsudo",
        "label": NETWORK_META["matsudo"]["label"],
        "description": NETWORK_META["matsudo"]["description"],
        "accentColor": NETWORK_META["matsudo"]["accentColor"],
        "status": "ok",
        "updatedAt": parse_matsudo_update_timestamp(date_payload),
        "trains": trains,
        "warnings": warnings,
        "error": "",
        "sourceUrls": NETWORK_META["matsudo"]["sourceUrls"],
        "meta": {
            "elesite": elesite,
            "matsudoStatus": status_payload,
            "positionMappingMode": "matsudo-id-plus-coordinate",
        },
    }


NETWORK_BUILDERS = {
    "keikyu": lambda fixtures_dir=None: build_keikyu_snapshot(),
    "toei": build_toei_snapshot,
    "keisei": build_keisei_snapshot,
    "matsudo": build_matsudo_snapshot,
}


def build_networks(fixtures_dir: Path | None = None) -> list[dict[str, Any]]:
    return [NETWORK_BUILDERS[network_id](fixtures_dir) for network_id in ("keikyu", "toei", "keisei", "matsudo")]


def build_manifest_summary(networks: list[dict[str, Any]]) -> dict[str, Any]:
    total_trains = 0
    delayed_trains = 0
    research_trains = 0
    healthy_networks = 0

    for network in networks:
        if network.get("status") == "ok":
            healthy_networks += 1
        for train in ensure_list(network.get("trains")):
            if not isinstance(train, dict):
                continue
            total_trains += 1
            if to_number(train.get("delayMinutes"), 0) > 0:
                delayed_trains += 1
            if train.get("researchCandidate"):
                research_trains += 1

    return {
        "totalTrains": total_trains,
        "delayedTrains": delayed_trains,
        "researchTrains": research_trains,
        "healthyNetworks": healthy_networks,
        "loadedNetworks": healthy_networks,
        "totalNetworks": len(networks),
    }


def safe_build_network(network_id: str, builder, fixtures_dir: Path | None = None) -> dict[str, Any]:
    try:
        network = builder(fixtures_dir)
        network = enrich_network_snapshot(network_id, network, fixtures_dir)
        network["loaded"] = True
        return network
    except Exception as exc:
        return build_network_error(network_id, exc)


def build_site_payloads(fixtures_dir: Path | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    networks = [safe_build_network(network_id, builder, fixtures_dir) for network_id, builder in NETWORK_BUILDERS.items()]
    manifest = {
        "appName": "私鉄在線情報ビューア",
        "appVersion": APP_VERSION,
        "buildTimestamp": datetime.now(timezone.utc).isoformat(),
        "publishTarget": "github-pages",
        "refreshPolicy": "GitHub Actions で定期ビルド",
        "networks": [
            {
                "id": network["id"],
                "label": network["label"],
                "description": network["description"],
                "accentColor": network["accentColor"],
                "updatedAt": network.get("updatedAt", ""),
                "trainCount": len(ensure_list(network.get("trains"))),
                "detailCount": sum(
                    1 for train in ensure_list(network.get("trains")) if isinstance(train, dict) and train.get("detailRows")
                ),
                "dataUrl": f"data/networks/{network['id']}.json",
                "sourceUrls": network.get("sourceUrls", []),
            }
            for network in networks
        ],
        "summary": build_manifest_summary(networks),
        "notes": [
            "Python のビルド出力を GitHub Pages へ静的配信します。",
            "ブラウザは manifest.json から路線タブごとに JSON を遅延読み込みします。",
            "京急の列車別時刻表は列車カード展開時に個別 JSON を後読みします。",
            "都営浅草線・京成線・松戸線は Python ビルド時に補完済みデータを内蔵します。",
            "えるサイト由来の方向・ダイヤ・編成メタは route 補助情報として同梱します。",
        ],
    }
    return networks, manifest
