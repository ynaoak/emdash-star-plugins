/**
 * Runtime half (standard format). Registers the trusted-only `page:fragments`
 * hook plus dual-path REST routes. Settings live in plugin KV.
 */
import { definePlugin } from "emdash";
import type { PluginContext, RouteContext } from "emdash";
import { z } from "astro/zod";

import { buildContributions } from "./contributions.js";
import type { AnalyticsSettings } from "./types.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

const SETTING_KEYS = [
	"ga4MeasurementId",
	"gtmContainerId",
	"headHtml",
	"bodyStartHtml",
	"bodyEndHtml",
] as const;

async function readSettings(ctx: PluginContext): Promise<AnalyticsSettings> {
	const s: Record<string, string> = {};
	for (const k of SETTING_KEYS) s[k] = (await ctx.kv.get<string>(`settings:${k}`)) ?? "";
	return s as AnalyticsSettings;
}

export default definePlugin({
	id: PLUGIN_ID,
	version: PLUGIN_VERSION,
	// Required to register page:fragments (enforced at runtime).
	capabilities: ["hooks.page-fragments:register"],

	hooks: {
		// Trusted-only: contribute analytics/custom fragments to every public page.
		"page:fragments": {
			handler: async (_event: unknown, ctx: PluginContext) => {
				const contributions = buildContributions(await readSettings(ctx));
				return contributions.length > 0 ? contributions : null;
			},
		},
	},

	routes: {
		status: {
			handler: async (_routeCtx: RouteContext, ctx: PluginContext) => {
				const s = await readSettings(ctx);
				return {
					ga4: Boolean(s.ga4MeasurementId),
					gtm: Boolean(s.gtmContainerId),
					customHead: Boolean(s.headHtml),
					customBodyStart: Boolean(s.bodyStartHtml),
					customBodyEnd: Boolean(s.bodyEndHtml),
					ga4MeasurementId: s.ga4MeasurementId || null,
					gtmContainerId: s.gtmContainerId || null,
					fragmentCount: buildContributions(s).length,
				};
			},
		},

		"settings/save": {
			input: z.object({
				ga4MeasurementId: z.string().optional(),
				gtmContainerId: z.string().optional(),
				headHtml: z.string().optional(),
				bodyStartHtml: z.string().optional(),
				bodyEndHtml: z.string().optional(),
			}),
			handler: async (routeCtx: RouteContext, ctx: PluginContext) => {
				const input = routeCtx.input as Record<string, string | undefined>;
				for (const k of SETTING_KEYS) {
					if (input[k] !== undefined) await ctx.kv.set(`settings:${k}`, input[k]);
				}
				return { success: true, fragmentCount: buildContributions(await readSettings(ctx)).length };
			},
		},

		// AI/CLI: exact fragments that would be injected.
		preview: {
			handler: async (_routeCtx: RouteContext, ctx: PluginContext) => {
				return { contributions: buildContributions(await readSettings(ctx)) };
			},
		},
	},

	admin: {
		settingsSchema: {
			ga4MeasurementId: {
				type: "string",
				label: "GA4 測定 ID",
				description: "G-XXXXXXX 形式。設定すると gtag.js を全公開ページの <head> に注入。",
				default: "",
			},
			gtmContainerId: {
				type: "string",
				label: "GTM コンテナ ID",
				description: "GTM-XXXXXX 形式。設定すると Google Tag Manager スニペットを注入。",
				default: "",
			},
			headHtml: {
				type: "string",
				label: "head 内カスタムコード",
				description: "<head> に注入する任意の HTML/スクリプト（信頼できる内容のみ）。",
				default: "",
			},
			bodyStartHtml: {
				type: "string",
				label: "body 冒頭カスタムコード",
				description: "<body> 直後に注入する任意の HTML。",
				default: "",
			},
			bodyEndHtml: {
				type: "string",
				label: "body 末尾カスタムコード",
				description: "</body> 直前に注入する任意の HTML。",
				default: "",
			},
		},
	},
});
