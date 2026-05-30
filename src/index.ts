/**
 * Email transport for EmDash via Resend — the WP Mail SMTP equivalent.
 *
 * EmDash core ships the email *pipeline* (`email:send`, `email:beforeSend`,
 * `email:afterSend`) but no concrete transport. This plugin fills that gap by
 * implementing the exclusive `email:deliver` provider against the Resend API.
 *
 *   // live.config.ts
 *   import { resendEmailPlugin } from "@emdash-star/plugin-email-resend";
 *   export default defineConfig({ plugins: [resendEmailPlugin()] });
 *
 * Then set the API key + sender in Settings → Plugins → Email (Resend), and
 * select it as the active provider in Settings → Email.
 */
import type { PluginDescriptor } from "emdash";

import { PLUGIN_ID } from "./types.js";

export type { EmailMessage, EmailDeliverEvent, ResendConfig } from "./types.js";
export { buildResendPayload, deliverViaResend, RESEND_ENDPOINT } from "./resend.js";
export type { ResendPayload, FetchLike } from "./resend.js";

const PLUGIN_VERSION = "1.0.0";

/** Descriptor factory — referenced in `live.config.ts` / `astro.config.mjs`. */
export function resendEmailPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "standard",
		entrypoint: "@emdash-star/plugin-email-resend/sandbox",
		options: {},
		capabilities: ["email:provide", "network:fetch"],
		allowedHosts: ["api.resend.com"],
	};
}

export default resendEmailPlugin;
