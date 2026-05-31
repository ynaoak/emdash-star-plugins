# @emdash-star/plugin-email-resend

EmDash のメール送信を **Resend** 経由で配送するトランスポートプラグイン。WordPress の **WP Mail SMTP**（2M+ installs）に相当する。

## なぜ必要か

EmDash コアはメール **パイプライン**（`email:send` / `email:beforeSend` / `email:afterSend`）を持つが、**実際に外部へ配送するトランスポート（`email:deliver`）の具体実装は無い**。本プラグインがその exclusive provider を Resend API で実装する。

## インストール

```bash
pnpm add @emdash-star/plugin-email-resend
```

```ts
// live.config.ts
import { resendEmailPlugin } from "@emdash-star/plugin-email-resend";

export default defineConfig({
  plugins: [resendEmailPlugin()],
});
```

## 設定

1. 管理画面 **Settings → Plugins → Email (Resend)** で:
   - **Resend API Key**（`re_...`）
   - **送信元 (From)**：検証済みドメインの送信元（例 `Acme <no-reply@acme.com>`）
   - **Reply-To**（任意）
2. **Settings → Email** でアクティブな配送 provider として「Email (Resend)」を選択。

API キー・送信元が未設定のまま送信されると、設定を促すエラーで失敗する（サイレントに握り潰さない）。

## 動作

`email:deliver`（exclusive・要 `email:provide` + `network:fetch`、`allowedHosts: ["api.resend.com"]`）で、コアの `EmailMessage { to, subject, text, html? }` を Resend の `POST /emails` に変換して送信する。

- `to` はカンマ区切りを配列化。`html` は存在時のみ付与。`reply_to` は設定時のみ。
- 非 2xx 応答は本文の `message`/`name` を添えて throw（パイプラインに失敗を伝播）。

## AI / CLI から使う（REST ルート）

管理画面のクリック操作に加え、すべての操作を HTTP ルートで駆動できる（AI エージェント・CLI・スクリプト向け）。パスは `/_emdash/api/plugins/email-resend/<route>`、JSON。admin セッションで保護（localhost dev はバイパス）。

| メソッド | ルート | 入力 | 用途 |
| --- | --- | --- | --- |
| GET | `status` | — | 設定状態 `{ configured, hasApiKey, hasFrom, from, hasReplyTo }`（**秘密は返さない**）。 |
| POST | `settings/save` | `{ apiKey?, from?, replyTo? }` | 設定を保存（渡したキーのみ更新）。 |
| POST | `test` | `{ to, subject?, text? }` | この provider で実際にテスト送信。`{ success, id }`。 |

```bash
# 設定（dev / localhost）
curl -X POST http://localhost:4321/_emdash/api/plugins/email-resend/settings/save \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"re_xxx","from":"Acme <no-reply@acme.com>"}'

# 状態確認
curl http://localhost:4321/_emdash/api/plugins/email-resend/status

# テスト送信
curl -X POST http://localhost:4321/_emdash/api/plugins/email-resend/test \
  -H "Content-Type: application/json" -d '{"to":"you@example.com"}'
```

リモートインスタンスは `Authorization: Bearer <EMDASH_TOKEN>` 等を付与（`emdash login` 参照）。

## API（再利用・テスト用）

| export | 用途 |
| --- | --- |
| `resendEmailPlugin()` | プラグイン descriptor |
| `buildResendPayload(message, cfg)` | `EmailMessage` → Resend リクエストボディ |
| `deliverViaResend(fetchFn, message, cfg)` | 1 通送信（非 2xx で throw）。`fetchFn` は `ctx.http.fetch` |

## ライセンス

MIT
