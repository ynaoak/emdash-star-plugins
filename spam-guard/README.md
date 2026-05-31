# @emdash-star/plugin-spam-guard

EmDash のコメントスパム対策。**ヒューリスティック（ユーザー設定）+ LLM（ローカル/クラウド）** を組み合わせて柔軟に判定する、AI 強化版の **Akismet 代替**。

## なぜ

EmDash コアはコメント機構を持つが、スパム判定（モデレーション）の中身は空き。本プラグインが `comment:moderate` フックで判定を提供する。Akismet 相当だが、**任意の LLM（ローカル Ollama / LM Studio、またはクラウド OpenAI 互換）+ サイト固有ルール**でより高度・柔軟に判定できる。

## インストール

```bash
pnpm add @emdash-star/plugin-spam-guard
```

```ts
// live.config.ts / astro.config.mjs
import { spamGuardPlugin } from "@emdash-star/plugin-spam-guard";

export default defineConfig({
  plugins: [spamGuardPlugin()], // trusted（plugins:[]）
});
```

## 判定パイプライン

`comment:moderate` で `{ status: "approved" | "pending" | "spam", reason }` を返す。

1. **ヒューリスティック**（高速・設定駆動）: 承認実績のある投稿者は自動承認（`trustAfterApproved`）、ブロックリスト一致は即スパム、リンク過多はスコア加点。
2. **LLM**（`mode` が `llm`/`hybrid`）: OpenAI 互換 Chat Completions に問い合わせ、`{spam, confidence, reason}` を取得。
   - **ローカル**: `llmBaseUrl=http://localhost:11434/v1`（Ollama）/ LM Studio 等、API キー不要。
   - **クラウド**: `llmBaseUrl=https://api.openai.com/v1` + `llmApiKey`、`llmModel=gpt-4o-mini` 等。
   - `instructions` でサイト固有の判定基準を追加できる。
3. **合成**: 最終スコアを `spamThreshold` / `approveThreshold` と比較し spam / approved / 中間は **pending**（管理者レビュー）。
   - **fail-safe**: LLM が必要だが応答しない場合は自動承認/自動拒否せず `failMode`（既定 `pending`）。

## 管理画面（settingsSchema）

`mode` / `llmBaseUrl` / `llmApiKey` / `llmModel` / `instructions` / `blocklist` / `maxLinks` / `trustAfterApproved` / `spamThreshold` / `approveThreshold` / `failMode`。

## AI / CLI から使う（REST ルート）

`/_emdash/api/plugins/spam-guard/<route>`、JSON、admin セッション保護（localhost dev はバイパス）。

| METHOD | route | input | 用途 |
| --- | --- | --- | --- |
| GET | `status` | — | mode / LLM 設定状態（secret 非開示）/ 閾値 / blocklist 件数 |
| POST | `settings/save` | 各設定（部分更新） | 設定保存 |
| POST | `check` | `{ body, authorName?, authorEmail?, priorApprovedCount? }` | サンプルを判定（**チューニング/テスト用**）。decision + heuristics + llm を返す |

```bash
# Ollama をローカルで使う設定例
curl -X POST .../plugins/spam-guard/settings/save -H "Content-Type: application/json" \
  -d '{"mode":"hybrid","llmBaseUrl":"http://localhost:11434/v1","llmModel":"llama3.1"}'
# 判定テスト
curl -X POST .../plugins/spam-guard/check -H "Content-Type: application/json" \
  -d '{"body":"Best casino bonus click here"}'
```

## API（再利用・テスト用）

`runHeuristics` / `classifyWithLLM` / `parseVerdict` / `decide` を named export（純粋寄り）。

## ライセンス

MIT
