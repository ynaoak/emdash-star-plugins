/**
 * Runtime half of the Broken Link Checker.
 *
 * Loaded by the host via the descriptor's `entrypoint` at request time (where
 * `emdash` resolves). `definePlugin(...)` must include `id` + `version`.
 *
 * Dual-path operation:
 *  - Admin UI: settingsSchema + a Block Kit report page ("/") with "Scan now".
 *  - AI / CLI: REST routes status / scan / results.
 */
import { definePlugin } from "emdash";
import type { PluginContext, RouteContext } from "emdash";

import { runScan, type ScanDeps } from "./scan.js";
import type { ScanSummary } from "./types.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

const DEFAULT_COLLECTIONS = ["posts", "pages"];
const DEFAULT_SCHEDULE = "@weekly";
const DEFAULT_MAX_LINKS = 500;
const SUMMARY_KEY = "summary:last";

interface ResolvedSettings {
	schedule: string;
	includeInternal: boolean;
	maxLinks: number;
	collections: string[];
}

async function readSettings(ctx: PluginContext): Promise<ResolvedSettings> {
	const schedule = (await ctx.kv.get<string>("settings:schedule")) || DEFAULT_SCHEDULE;
	const includeInternal = (await ctx.kv.get<string>("settings:includeInternal")) === "true";
	const maxLinksRaw = Number.parseInt(String((await ctx.kv.get<string>("settings:maxLinks")) ?? ""), 10);
	const maxLinks = Number.isFinite(maxLinksRaw) && maxLinksRaw > 0 ? maxLinksRaw : DEFAULT_MAX_LINKS;
	const collectionsRaw = await ctx.kv.get<string>("settings:collections");
	const collections =
		typeof collectionsRaw === "string" && collectionsRaw.trim()
			? collectionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
			: DEFAULT_COLLECTIONS;
	return { schedule, includeInternal, maxLinks, collections };
}

async function runAndSummarize(
	ctx: PluginContext,
	overrides: Partial<ResolvedSettings> = {},
): Promise<ScanSummary> {
	if (!ctx.content) throw new Error("content:read capability unavailable.");
	if (!ctx.http) throw new Error("network:fetch capability unavailable.");
	const settings = { ...(await readSettings(ctx)), ...overrides };

	const deps: ScanDeps = {
		content: ctx.content as unknown as ScanDeps["content"],
		fetchFn: ctx.http.fetch.bind(ctx.http),
		store: ctx.storage.links as unknown as ScanDeps["store"],
		collections: settings.collections,
		includeInternal: settings.includeInternal,
		maxLinks: settings.maxLinks,
		log: (msg, meta) => ctx.log.info(`[broken-link-checker] ${msg}`, meta),
	};

	const summary = await runScan(deps);
	await ctx.kv.set(SUMMARY_KEY, summary);
	return summary;
}

export default definePlugin({
	id: PLUGIN_ID,
	version: PLUGIN_VERSION,
	capabilities: ["content:read", "network:fetch"],
	allowedHosts: ["*"],
	storage: { links: { indexes: ["status", "entrySlug", "checkedAt"] } },

	hooks: {
		"plugin:activate": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				if (ctx.cron) {
					const { schedule } = await readSettings(ctx);
					await ctx.cron.schedule("scan", { schedule });
				}
			},
		},
		cron: {
			handler: async (event: { name: string }, ctx: PluginContext) => {
				if (event.name === "scan") await runAndSummarize(ctx);
			},
		},
	},

	routes: {
		status: {
			handler: async (_routeCtx: RouteContext, ctx: PluginContext) => {
				const summary = (await ctx.kv.get<ScanSummary>(SUMMARY_KEY)) ?? null;
				return { lastScan: summary };
			},
		},

		scan: {
			handler: async (routeCtx: RouteContext<{ maxLinks?: number }>, ctx: PluginContext) => {
				const overrides = routeCtx.input?.maxLinks ? { maxLinks: routeCtx.input.maxLinks } : {};
				const summary = await runAndSummarize(ctx, overrides);
				return { success: true, summary };
			},
		},

		results: {
			handler: async (routeCtx: RouteContext, ctx: PluginContext) => {
				const url = new URL(routeCtx.request.url);
				const status = url.searchParams.get("status") ?? undefined;
				const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
				const cursor = url.searchParams.get("cursor") ?? undefined;
				const store = ctx.storage.links as unknown as {
					query(o: unknown): Promise<{ items: Array<{ id: string; data: Record<string, unknown> }>; cursor?: string | null; hasMore?: boolean }>;
				};
				const result = await store.query({
					where: status ? { status } : undefined,
					orderBy: { checkedAt: "desc" },
					limit,
					cursor,
				});
				return {
					items: result.items.map((i) => ({ id: i.id, ...i.data })),
					cursor: result.cursor ?? null,
					hasMore: Boolean(result.hasMore),
				};
			},
		},

		// Block Kit admin report page (declared as adminPages "/" in the descriptor).
		admin: {
			handler: async (routeCtx: RouteContext, ctx: PluginContext) => {
				const interaction = (routeCtx.input ?? {}) as { type?: string; action_id?: string };

				let toast: { message: string; type: "success" | "info" | "error" } | undefined;
				if (interaction.action_id === "scan") {
					try {
						const s = await runAndSummarize(ctx);
						toast = {
							message: `Scanned ${s.checked} links — ${s.broken} broken`,
							type: s.broken > 0 ? "info" : "success",
						};
					} catch (e) {
						toast = { message: (e as Error).message, type: "error" };
					}
				}

				const summary = (await ctx.kv.get<ScanSummary>(SUMMARY_KEY)) ?? null;
				const store = ctx.storage.links as unknown as {
					query(o: unknown): Promise<{ items: Array<{ id: string; data: Record<string, unknown> }> }>;
				};
				const broken = await store.query({
					where: { status: "broken" },
					orderBy: { checkedAt: "desc" },
					limit: 100,
				});

				const blocks: unknown[] = [{ type: "header", text: "Broken Link Checker" }];

				if (summary) {
					blocks.push({
						type: "stats",
						stats: [
							{ label: "Links checked", value: String(summary.checked) },
							{ label: "Broken", value: String(summary.broken) },
							{ label: "OK", value: String(summary.ok) },
						],
					});
					blocks.push({
						type: "context",
						text: `Last scan: ${summary.scannedAt}${summary.truncated ? " (truncated — raise maxLinks)" : ""}`,
					});
				} else {
					blocks.push({
						type: "banner",
						description: "No scan has run yet. Click “Scan now”.",
						variant: "default",
					});
				}

				blocks.push({
					type: "actions",
					elements: [{ type: "button", text: "Scan now", action_id: "scan", style: "primary" }],
				});

				if (broken.items.length > 0) {
					blocks.push({
						type: "table",
						columns: [
							{ key: "url", label: "URL" },
							{ key: "entry", label: "Entry" },
							{ key: "detail", label: "Problem" },
							{ key: "checkedAt", label: "Checked" },
						],
						rows: broken.items.map((i) => ({
							url: i.data.url,
							entry: `${i.data.collection}/${i.data.entrySlug}`,
							detail: i.data.statusCode ? `HTTP ${i.data.statusCode}` : i.data.error || "unreachable",
							checkedAt: i.data.checkedAt,
						})),
					});
				} else if (summary) {
					blocks.push({ type: "section", text: "No broken links found. 🎉" });
				}

				return { blocks, toast };
			},
		},
	},

	admin: {
		settingsSchema: {
			schedule: {
				type: "string",
				label: "スキャン頻度 (cron)",
				description: "自動スキャンのスケジュール。例: @weekly, @daily, '0 3 * * 1'。空欄なら @weekly。",
				default: "@weekly",
			},
			collections: {
				type: "string",
				label: "対象コレクション",
				description: "走査するコレクションをカンマ区切りで指定。空欄なら posts,pages。",
				default: "posts,pages",
			},
			includeInternal: {
				type: "string",
				label: "内部リンクも検査",
				description: '"true" でルート相対の内部リンク (/...) も検査。既定は外部 http(s) のみ。',
				default: "false",
			},
			maxLinks: {
				type: "string",
				label: "1 回の上限リンク数",
				description: "1 スキャンで検査するユニーク URL の上限。空欄なら 500。",
				default: "500",
			},
		},
	},
});
