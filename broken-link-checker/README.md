# @emdash-star/plugin-broken-link-checker

WordPress の **Broken Link Checker** を EmDash 用に作り替えたプラグイン。コンテンツ内のリンクを巡回し、リンク切れ（4xx/5xx/到達不可）を検出してレポートする。

## インストール

```bash
pnpm add @emdash-star/plugin-broken-link-checker
```

```ts
// live.config.ts
import { brokenLinkCheckerPlugin } from "@emdash-star/plugin-broken-link-checker";

export default defineConfig({
  plugins: [brokenLinkCheckerPlugin()],
});
```

> リンク 1 本ごとに HTTP リクエストへ fan-out するため、**trusted モード（`plugins: []`）想定**。コードは standard フォーマットでサンドボックス互換だが、大規模サイトでは sandbox の subrequest/CPU 制限を超える。

## 動作

- `content:read` で対象コレクション（既定 `posts`,`pages`）の**公開エントリ**を走査。
- `data` を再帰走査して `href`/`url`/`src`（Portable Text の link markDefs・画像・埋め込みを含む）から **外部 http(s) URL** を抽出（内部リンクは任意）。
- 各ユニーク URL を `HEAD`（不可なら `GET` フォールバック・タイムアウト付き）で確認。`>=400` か到達不可を **broken** と判定。
- 結果を storage に保存（エントリ×URL 単位）。上限 `maxLinks`（既定 500）超過時は `truncated:true` と log で明示（サイレント切り捨てなし）。
- `@weekly` 等の cron で自動スキャン（`plugin:activate` で登録）。

## 管理画面

- **Settings**: `schedule`（cron）/ `collections`（カンマ区切り）/ `includeInternal`（"true"/"false"）/ `maxLinks`。
- **Broken Links ページ**（Block Kit）: リンク切れ一覧テーブル + 「Scan now」ボタン + 件数 stats。

## AI / CLI から使う（REST ルート）

`/_emdash/api/plugins/broken-link-checker/<route>`、JSON、admin セッション保護（localhost dev はバイパス）。

| METHOD | route | input | 用途 |
| --- | --- | --- | --- |
| GET | `status` | — | 最終スキャン要約 `{ lastScan }` |
| POST | `scan` | `{ maxLinks? }` | 今すぐスキャン → `{ success, summary }` |
| GET | `results` | `?status=broken&limit=&cursor=` | リンク（切れ）一覧（ページング） |

```bash
curl -X POST http://localhost:4321/_emdash/api/plugins/broken-link-checker/scan -H "Content-Type: application/json" -d '{}'
curl "http://localhost:4321/_emdash/api/plugins/broken-link-checker/results?status=broken&limit=50"
```

## API（再利用・テスト用）

`extractUrls(data, opts)` / `checkUrl(fetchFn, url)` / `runScan(deps)` / `recordId(...)` を named export。

## 未対応（将来）

- 削除済みエントリ/URL の古いレコード掃除、リンクの並列チェック、内部アンカー検証、画像 alt 欠落チェック、再試行/レート制御。

## ライセンス

MIT
