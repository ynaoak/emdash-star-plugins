# @emdash-star/plugin-analytics-injector

WordPress の **Insert Headers and Footers（WPCode）/ MonsterInsights / Site Kit** に相当。Google Analytics 4・Google Tag Manager・任意の head/body コードを全公開ページに注入する EmDash プラグイン。

## インストール

```bash
pnpm add @emdash-star/plugin-analytics-injector
```

```ts
// live.config.ts / astro.config.mjs
import { analyticsInjectorPlugin } from "@emdash-star/plugin-analytics-injector";

export default defineConfig({
  plugins: [analyticsInjectorPlugin()], // trusted（plugins:[]）に入れる
});
```

> **trusted 限定**: `page:fragments`（生スクリプト注入）は trusted プラグインのみ。`sandboxed: []` には入れられない。
> サイトのレイアウトが EmDash の貢献をレンダリングしていること（`<EmDashHead>` / `<EmDashBodyStart>` / `<EmDashBodyEnd>` — blog テンプレートは標準で wiring 済み）。

## 動作

`page:fragments` フックで、設定に応じた貢献を全公開ページに注入する:

- **GA4**: `ga4MeasurementId`（`G-XXXX`）→ `gtag/js`（head, async）+ `gtag('config', …)`（head, inline）。
- **GTM**: `gtmContainerId`（`GTM-XXXX`）→ GTM head スニペット + `<body>` 冒頭の noscript iframe。
- **カスタム**: `headHtml` / `bodyStartHtml` / `bodyEndHtml` → それぞれ head / body:start / body:end に生 HTML を注入。

GA4/GTM の ID は厳格検証（`^G-[A-Z0-9]+$` / `^GTM-[A-Z0-9]+$`）し、不正なら無視（ID 経由のスクリプト injection 防止）。カスタム HTML は admin（信頼ソース）提供なので意図的に raw。

## 管理画面

Plugins → Analytics Injector → Settings で `ga4MeasurementId` / `gtmContainerId` / `headHtml` / `bodyStartHtml` / `bodyEndHtml` を設定。

## AI / CLI から使う（REST ルート）

`/_emdash/api/plugins/analytics-injector/<route>`、JSON、admin セッション保護（localhost dev はバイパス）。

| METHOD | route | input | 用途 |
| --- | --- | --- | --- |
| GET | `status` | — | 各連携の設定状態 + `fragmentCount` |
| POST | `settings/save` | `{ ga4MeasurementId?, gtmContainerId?, headHtml?, bodyStartHtml?, bodyEndHtml? }` | 設定保存（部分更新） |
| GET | `preview` | — | 注入される貢献配列をそのまま返す |

```bash
curl -X POST http://localhost:4321/_emdash/api/plugins/analytics-injector/settings/save \
  -H "Content-Type: application/json" -d '{"ga4MeasurementId":"G-XXXXXXX"}'
curl http://localhost:4321/_emdash/api/plugins/analytics-injector/preview
```

## API（再利用・テスト用）

`buildContributions(settings)` を named export（純粋関数）。

## ライセンス

MIT
