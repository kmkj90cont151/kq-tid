# 在線位置情報ビューア

京急、都営浅草線、京成線、松戸線の在線位置を、旧GAS版に近い見せ方で表示する GitHub Pages 向けの構成です。  
路線タブを開いたタイミングでその路線だけを取得し、アクティブなタブだけを 15 秒ごとに更新します。

## いまの構成

- `web/`
  - GitHub Pages にそのまま載せる静的ファイル
- `scripts/build_site.py`
  - `web/` を `site/` にコピー
- `scripts/serve_site.py`
  - `site/` をローカル配信
  - 京急API用の簡易プロキシ `/proxy?url=...` も提供
- `proxy/cloudflare-worker.js`
  - GitHub Pages 本番で京急APIを読むための Cloudflare Worker 例

## 仕様

- 見せ方は旧GAS版に寄せています
  - 路線タブ
  - 路線別
  - 方向別
  - 区間・駅別
  - 列車カード
  - 京急は在線一覧を先に表示し、現在走っている列車の時刻表だけを最大3件ずつ補完
  - 京成・松戸線の詳細時刻表は列車カードを開いたときに取得
- えるサイト連携は停止しています
  - ページ上にはリンクだけ残しています
- 都営浅草線の遅延は秒値を分へ換算して表示します
- 京急の種別 `6` は `エアポート快特` として扱います

## 路線ごとの取得方式

- 京急
  - `https://app-kq.net/api/train`
  - `https://app-kq.net/api/locationTimetable/<路線コード>-<方向コード>-<列車番号>`
  - 在線一覧を先に表示した後、表示中の列車番号だけを少数並列で補完
  - 取得済み時刻表は Worker で1時間共有し、ブラウザ内でも1時間再利用
- 都営浅草線
  - ODPT 在線 API
  - 泉岳寺・押上の駅時刻表で補完
- 京成線
  - `traffic_info.json`
  - `diainf/<列車番号>.json?ts=YYYYMMDD`
  - 列車カードを開いたときだけ列車別時刻表を取得
- 松戸線
  - `matsudo_train_info.json`
  - `matsudo_id.json`
  - `diainf_SK/<列車番号>.json`

## ローカルで使う

1. 仮想環境を作成します。

```powershell
python -m venv .venv
```

2. ローカルサーバーを起動します。

```powershell
.\.venv\Scripts\python.exe scripts\serve_site.py --port 8000
```

3. ブラウザで開きます。

```text
http://127.0.0.1:8000
```

ローカルでは `web/assets/config.js` が自動で `/proxy?url={url}` を使うため、京急もそのまま確認できます。

## GitHub Pages へ載せる

GitHub Pages では、都営・京成・松戸線はブラウザから直接取得できます。  
京急は CORS の都合で直接取得できないため、先にプロキシを 1 つ用意してください。

### 1. 京急用プロキシを用意する

`proxy/cloudflare-worker.js` を Cloudflare Workers へデプロイします。  
Cloudflare の管理画面では `Workers & Pages -> 対象Worker -> Edit code` を開き、ファイル全体を置き換えて `Deploy` します。  
既存Workerを更新する場合も、GitHub Pagesより先にWorkerを再デプロイしてください。

たとえば Worker の URL が `https://example.workers.dev` なら、次のように設定します。

```js
keikyuProxyTemplate: "https://example.workers.dev/?url={url}"
```

デプロイ後、Worker のルートURLを開き、次が返ることを確認します。

```json
{
  "ok": true,
  "cacheVersion": "20261014-1"
}
```

次に、ブラウザの開発者ツールの Network で、Worker 経由の応答ヘッダーを確認します。

- `X-Proxy-Cache: MISS`: 京急APIから取得してキャッシュへ保存
- `X-Proxy-Cache: HIT`: 保存済みデータを返却
- `X-Proxy-Target-Type: keikyu-train`: 在線API
- `X-Proxy-Target-Type: keikyu-timetable`: 列車別時刻表API
- `X-Service-Day: YYYY-MM-DD`: 午前3時区切りの営業日

### 2. `web/assets/config.js` を設定する

ローカル用の既定値はそのまま残しつつ、GitHub Pages 用に `keikyuProxyTemplate` を自分の Worker URL へ変更してください。

### 3. GitHub Pages を有効化する

このリポジトリには `.github/workflows/deploy-pages.yml` を入れてあります。  
`main` か `master` に push し、GitHub の `Settings -> Pages` で `GitHub Actions` を選べば公開できます。

## ビルド

GitHub Pages 用の `site/` を明示的に作りたい場合は次です。

```powershell
.\.venv\Scripts\python.exe scripts\build_site.py --output site --skip-keikyu-details
```

これは `web/` をそのまま `site/` へコピーするだけです。  
データはビルド時に埋め込まず、ブラウザが live API を直接読みにいきます。

`scripts/serve_site.py` も既定では京急時刻表を事前生成しません。旧方式の事前生成を明示的に検証したい場合だけ `--include-keikyu-details` を付けます。

## 京急キャッシュの動き

午前3時に全列車の時刻表を一括取得する処理はありません。午前3時はキャッシュキーの営業日を切り替えるだけです。

1. 京急タブを開くと、最初に在線APIだけを取得して列車一覧を表示します。
2. その時点で走っている列車について、時刻表キャッシュの有無を確認します。
3. キャッシュにない列車だけを最大3件ずつ取得します。
4. 取得できた列車から始発・行先・番線・時刻表を画面へ追加します。
5. 同じ時刻表は1時間再利用し、その後のアクセスで必要になったときだけ更新します。
6. 403などの失敗時は5分間再試行を抑止し、15秒ごとの大量再試行を防ぎます。

設定値は `web/assets/config.js` で調整できます。

```js
keikyuTimetableConcurrency: 3,
keikyuTimetableCacheSeconds: 3600,
```

Worker側のTTLは `proxy/cloudflare-worker.js` 冒頭で調整できます。在線APIは12秒、時刻表は最大1時間です。時刻表キャッシュのキーには午前3時区切りの営業日を含むため、翌営業日の同じ列車番号と混ざりません。

## 補足

- 京急APIは GitHub Pages から直接は呼べません
- 旧GAS版相当の区間表示ロジックは `web/assets/live-data.js` に移植しています
- 京急の列車別時刻表は在線一覧の描画後に少数並列で補完します

## 参照先

- [京急 在線API](https://app-kq.net/api/train)
- [京急 列車別時刻表API 例](https://app-kq.net/api/locationTimetable/8201-1-1403A)
- [京急 公式在線ページ](https://app-kq.net/web/jp/html/zaisen.html)
- [都営浅草線 ODPT Train](https://api.odpt.org/api/v4/odpt:Train?odpt:railway=odpt.Railway:Toei.Asakusa)
- [都営浅草線 泉岳寺駅時刻表](https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Sengakuji)
- [都営浅草線 押上駅時刻表](https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.Asakusa.Oshiage)
- [京成 在線API](https://zaisen.tid-keisei.jp/data/traffic_info.json)
- [京成 公式在線ページ](https://zaisen.tid-keisei.jp/html/zaisen.html?line=1)
- [松戸線 在線API](https://zaisen.tid-keisei.jp/data/matsudo_train_info.json)
- [えるサイト](https://www.elesite-next.com/train_location)
