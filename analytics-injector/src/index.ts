/**
 * Analytics / header-footer code injector for EmDash — a port of WordPress'
 * Insert Headers and Footers / Site Kit snippet injection.
 *
 * Injects GA4 / GTM tags and arbitrary head/body code into every public page
 * via the trusted-only `page:fragments` hook.
 *
 *   // live.config.ts / astro.config.mjs
 *   import { analyticsInjectorPlugin } from "@emdash-star/plugin-analytics-injector";
 *   export default defineConfig({ plugins: [analyticsInjectorPlugin()] });
 *
 * Descriptor module: type-only `emdash` import (so it resolves when dev-linked
 * across repos). Runtime `definePlugin(...)` is in `./sandbox-entry`.
 *
 * `page:fragments` is **trusted-only** — install in `plugins: []`, not sandboxed.
 * Requires the site layout to render EmDash contributions (`<EmDashHead>` /
 * `<EmDashBodyStart>` / `<EmDashBodyEnd>` — standard in the blog template).
 */
import type { PluginDescriptor } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

export type { AnalyticsSettings, FragmentContribution } from "./types.js";
export { buildContributions } from "./contributions.js";

/** Descriptor factory — referenced in `live.config.ts` / `astro.config.mjs`. */
export function analyticsInjectorPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "standard",
		entrypoint: "@emdash-star/plugin-analytics-injector/sandbox",
		options: {},
		// page:fragments requires this register capability (enforced at runtime,
		// despite the hooks reference listing "—"). Settings live in KV.
		capabilities: ["hooks.page-fragments:register"],
	};
}

export default analyticsInjectorPlugin;
