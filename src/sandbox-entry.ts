/**
 * Runtime half of the Resend email transport (standard format).
 *
 * Two operating paths (required by the project's dual-path rule):
 *  - Admin UI: `admin.settingsSchema` (API key / sender / reply-to).
 *  - AI / CLI: REST routes under `/_emdash/api/plugins/email-resend/*`
 *    (status / settings/save / test) so an agent or script can configure and
 *    exercise the transport over HTTP — not click-only.
 *
 * Registers the exclusive `email:deliver` provider. Settings live in the
 * plugin's KV; the testable logic is in `config.ts` / `resend.ts`.
 */
import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { z } from "astro/zod";

import { assertConfigured, buildStatus, readSettings, saveSettings } from "./config.js";
import { deliverViaResend } from "./resend.js";
import type { EmailDeliverEvent, EmailMessage } from "./types.js";

async function sendViaResend(ctx: PluginContext, message: EmailMessage) {
	if (!ctx.http) throw new Error("network:fetch capability unavailable — cannot reach Resend.");
	const cfg = assertConfigured(await readSettings(ctx.kv));
	return deliverViaResend(ctx.http.fetch.bind(ctx.http), message, cfg);
}

export default definePlugin({
	hooks: {
		"email:deliver": {
			// Exactly one provider delivers; this claims that slot.
			exclusive: true,
			handler: async (event: EmailDeliverEvent, ctx: PluginContext) => {
				const { id } = await sendViaResend(ctx, event.message);
				ctx.log.info(`Resend delivered email to ${event.message.to}`, {
					id,
					source: event.source,
				});
			},
		},
	},

	// AI / CLI / script surface. Admin-only by default (no `public: true`),
	// protected by the admin session middleware (dev bypass on localhost).
	routes: {
		// GET — report configuration state without leaking the secret.
		status: {
			handler: async (_routeCtx: any, ctx: PluginContext) => buildStatus(await readSettings(ctx.kv)),
		},

		// POST — set credentials/sender programmatically. Only provided keys change.
		"settings/save": {
			input: z.object({
				apiKey: z.string().optional(),
				from: z.string().optional(),
				replyTo: z.string().optional(),
			}),
			handler: async (routeCtx: any, ctx: PluginContext) => {
				await saveSettings(ctx.kv, routeCtx.input);
				return { success: true, ...buildStatus(await readSettings(ctx.kv)) };
			},
		},

		// POST — send a test email through Resend (this provider directly).
		test: {
			input: z.object({
				to: z.string().email(),
				subject: z.string().optional(),
				text: z.string().optional(),
			}),
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const { to, subject, text } = routeCtx.input as {
					to: string;
					subject?: string;
					text?: string;
				};
				const { id } = await sendViaResend(ctx, {
					to,
					subject: subject ?? "EmDash × Resend test email",
					text:
						text ??
						"Your Resend transport is working — this was delivered via @emdash-star/plugin-email-resend.",
				});
				return { success: true, id: id ?? null, to };
			},
		},
	},

	admin: {
		settingsSchema: {
			apiKey: {
				type: "secret",
				label: "Resend API Key",
				description: "Resend ダッシュボードで発行した API キー（re_... 形式）。",
			},
			from: {
				type: "string",
				label: "送信元 (From)",
				description: "検証済みドメインの送信元。例: Acme <no-reply@acme.com>",
			},
			replyTo: {
				type: "string",
				label: "Reply-To（任意）",
				description: "返信先アドレス。空欄なら設定しない。",
				default: "",
			},
		},
	},
});
