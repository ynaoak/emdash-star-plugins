/**
 * Runtime half (standard format). Registers `comment:moderate` (no register
 * capability required) plus dual-path REST routes. Settings live in plugin KV.
 */
import { definePlugin } from "emdash";
import type { PluginContext, RouteContext } from "emdash";
import { z } from "astro/zod";

import { decide } from "./decide.js";
import { runHeuristics } from "./heuristics.js";
import { classifyWithLLM } from "./llm.js";
import type { CommentInput, Mode, ModerationDecision, ModerationStatus, SpamGuardSettings } from "./types.js";
import { DEFAULT_SETTINGS, PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

const MODES: Mode[] = ["heuristic", "llm", "hybrid"];
const STATUSES: ModerationStatus[] = ["approved", "pending", "spam"];

function num(raw: string | undefined, fallback: number): number {
	const n = Number.parseFloat(String(raw ?? ""));
	return Number.isFinite(n) ? n : fallback;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

async function readSettings(ctx: PluginContext): Promise<SpamGuardSettings> {
	const get = (k: string) => ctx.kv.get<string>(`settings:${k}`);
	const modeRaw = (await get("mode")) as Mode;
	const failRaw = (await get("failMode")) as ModerationStatus;
	const blocklistRaw = (await get("blocklist")) ?? "";

	const spamThreshold = clamp(num(await get("spamThreshold"), DEFAULT_SETTINGS.spamThreshold), 0.01, 1);
	let approveThreshold = clamp(num(await get("approveThreshold"), DEFAULT_SETTINGS.approveThreshold), 0, 0.99);
	// Invariant: approveThreshold < spamThreshold, else the "pending" band inverts.
	if (approveThreshold >= spamThreshold) approveThreshold = DEFAULT_SETTINGS.approveThreshold < spamThreshold ? DEFAULT_SETTINGS.approveThreshold : 0;

	return {
		mode: MODES.includes(modeRaw) ? modeRaw : DEFAULT_SETTINGS.mode,
		llmBaseUrl: (await get("llmBaseUrl")) ?? "",
		llmApiKey: (await get("llmApiKey")) ?? "",
		llmModel: (await get("llmModel")) ?? "",
		instructions: (await get("instructions")) ?? "",
		blocklist: blocklistRaw
			.split(/[\n,]/)
			.map((s) => s.trim())
			.filter(Boolean),
		maxLinks: Math.max(0, Math.floor(num(await get("maxLinks"), DEFAULT_SETTINGS.maxLinks))),
		trustAfterApproved: Math.max(0, Math.floor(num(await get("trustAfterApproved"), DEFAULT_SETTINGS.trustAfterApproved))),
		spamThreshold,
		approveThreshold,
		failMode: STATUSES.includes(failRaw) ? failRaw : DEFAULT_SETTINGS.failMode,
	};
}

/** Full classification pipeline: heuristics → (maybe) LLM → decision. */
async function classify(
	ctx: PluginContext,
	comment: CommentInput,
	priorApprovedCount: number,
	settings: SpamGuardSettings,
): Promise<{ decision: ModerationDecision; heuristics: ReturnType<typeof runHeuristics>; llm: unknown; llmAttempted: boolean }> {
	const heuristics = runHeuristics(comment, priorApprovedCount, settings);

	// Short-circuit: no LLM call when already decisive.
	if (heuristics.trusted || heuristics.hardSpam || settings.mode === "heuristic") {
		return { decision: decide(heuristics, null, settings, false), heuristics, llm: null, llmAttempted: false };
	}

	// Only mark the LLM "attempted" when we actually call it — otherwise the
	// fail-safe in decide() would quarantine every comment if ctx.http is absent.
	let llm = null;
	let llmAttempted = false;
	if (ctx.http) {
		llmAttempted = true;
		llm = await classifyWithLLM(ctx.http.fetch.bind(ctx.http), comment, settings);
	}
	return { decision: decide(heuristics, llm, settings, llmAttempted), heuristics, llm, llmAttempted };
}

export default definePlugin({
	id: PLUGIN_ID,
	version: PLUGIN_VERSION,
	capabilities: ["network:fetch"],
	allowedHosts: ["*"],

	hooks: {
		"comment:moderate": {
			handler: async (event: any, ctx: PluginContext): Promise<ModerationDecision> => {
				// Fail-safe: never let an unexpected error block comment submission.
				try {
					const c = event.comment ?? {};
					const comment: CommentInput = {
						authorName: c.authorName ?? "",
						authorEmail: c.authorEmail ?? "",
						body: c.body ?? "",
					};
					const settings = await readSettings(ctx);
					const { decision } = await classify(ctx, comment, event.priorApprovedCount ?? 0, settings);
					ctx.log.info(`[spam-guard] ${decision.status}: ${decision.reason ?? ""}`);
					return decision;
				} catch (e) {
					ctx.log.error(`[spam-guard] classification error — holding for review: ${(e as Error).message}`);
					return { status: "pending", reason: "spam-guard error — held for review" };
				}
			},
		},
	},

	routes: {
		status: {
			handler: async (_routeCtx: RouteContext, ctx: PluginContext) => {
				const s = await readSettings(ctx);
				return {
					mode: s.mode,
					// Do not expose the endpoint URL (may be an internal/local address); model name is not secret.
					llm: { configured: Boolean(s.llmBaseUrl && s.llmModel), hasApiKey: Boolean(s.llmApiKey), model: s.llmModel || null },
					blocklistCount: s.blocklist.length,
					maxLinks: s.maxLinks,
					trustAfterApproved: s.trustAfterApproved,
					spamThreshold: s.spamThreshold,
					approveThreshold: s.approveThreshold,
					failMode: s.failMode,
				};
			},
		},

		"settings/save": {
			input: z.object({
				mode: z.enum(["heuristic", "llm", "hybrid"]).optional(),
				llmBaseUrl: z.string().optional(),
				llmApiKey: z.string().optional(),
				llmModel: z.string().optional(),
				instructions: z.string().optional(),
				blocklist: z.string().optional(),
				maxLinks: z.union([z.string(), z.number()]).optional(),
				trustAfterApproved: z.union([z.string(), z.number()]).optional(),
				spamThreshold: z.union([z.string(), z.number()]).optional(),
				approveThreshold: z.union([z.string(), z.number()]).optional(),
				failMode: z.enum(["approved", "pending", "spam"]).optional(),
			}),
			handler: async (routeCtx: RouteContext, ctx: PluginContext) => {
				const input = routeCtx.input as Record<string, unknown>;
				for (const [k, v] of Object.entries(input)) {
					if (v !== undefined) await ctx.kv.set(`settings:${k}`, String(v));
				}
				return { success: true };
			},
		},

		// AI/CLI: run the classifier on a sample comment (tuning / testing).
		check: {
			input: z.object({
				body: z.string(),
				authorName: z.string().optional(),
				authorEmail: z.string().optional(),
				priorApprovedCount: z.number().optional(),
			}),
			handler: async (routeCtx: RouteContext, ctx: PluginContext) => {
				const i = routeCtx.input as { body: string; authorName?: string; authorEmail?: string; priorApprovedCount?: number };
				const settings = await readSettings(ctx);
				const result = await classify(
					ctx,
					{ authorName: i.authorName ?? "tester", authorEmail: i.authorEmail ?? "test@example.com", body: i.body },
					i.priorApprovedCount ?? 0,
					settings,
				);
				return { decision: result.decision, heuristics: result.heuristics, llm: result.llm, llmAttempted: result.llmAttempted };
			},
		},
	},

	admin: {
		settingsSchema: {
			mode: {
				type: "string",
				label: "判定モード",
				description: "heuristic（ルールのみ）/ llm（LLMのみ）/ hybrid（両方・推奨）。",
				default: "hybrid",
			},
			llmBaseUrl: {
				type: "string",
				label: "LLM エンドポイント (OpenAI互換)",
				description: "例: ローカル http://localhost:11434/v1（Ollama）/ クラウド https://api.openai.com/v1",
				default: "",
			},
			llmApiKey: {
				type: "secret",
				label: "LLM API キー",
				description: "クラウド LLM 用。ローカル（Ollama 等）は空でよい。",
			},
			llmModel: {
				type: "string",
				label: "LLM モデル名",
				description: "例: llama3.1 / gpt-4o-mini",
				default: "",
			},
			instructions: {
				type: "string",
				label: "追加の判定基準（サイト固有）",
				description: "LLM に渡す追加ルール。例: 『日本語以外の宣伝コメントはスパム』など。",
				default: "",
			},
			blocklist: {
				type: "string",
				label: "ブロックリスト",
				description: "スパム語をカンマ/改行区切りで。一致で即スパム。",
				default: "",
			},
			maxLinks: {
				type: "string",
				label: "本文リンク数上限",
				description: "これを超えるとスパム寄りに加点。既定 3。",
				default: "3",
			},
			trustAfterApproved: {
				type: "string",
				label: "信頼する承認済み件数",
				description: "同一メールの承認済みコメントがこの数以上なら自動承認。既定 3。",
				default: "3",
			},
			spamThreshold: {
				type: "string",
				label: "スパム閾値 (0..1)",
				description: "最終スコアがこれ以上で spam。既定 0.7。",
				default: "0.7",
			},
			approveThreshold: {
				type: "string",
				label: "承認閾値 (0..1)",
				description: "最終スコアがこれ以下で approved。間は pending。既定 0.3。",
				default: "0.3",
			},
			failMode: {
				type: "string",
				label: "LLM 失敗時の扱い",
				description: "approved / pending / spam。既定 pending（事故防止）。",
				default: "pending",
			},
		},
	},
});
