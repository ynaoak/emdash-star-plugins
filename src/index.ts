/**
 * Broken Link Checker for EmDash — a port of WordPress' Broken Link Checker.
 *
 * Crawls content (posts, pages, …) for links, checks each over HTTP, and
 * reports the broken ones (4xx/5xx/unreachable). Scans run on a cron schedule
 * or on demand.
 *
 *   // live.config.ts / astro.config.mjs
 *   import { brokenLinkCheckerPlugin } from "@emdash-star/plugin-broken-link-checker";
 *   export default defineConfig({ plugins: [brokenLinkCheckerPlugin()] });
 *
 * This module is the **descriptor** — imported by the Astro config at build
 * time. It must stay import-light (types only); importing `emdash` values here
 * breaks resolution when the package is dev-linked from another repo. The
 * runtime `definePlugin(...)` lives in `./sandbox-entry` (loaded by the host
 * via `entrypoint` at request time, where `emdash` resolves normally).
 *
 * Intended for trusted mode (`plugins: []`): a scan fans out one HTTP request
 * per unique link, exceeding sandbox subrequest/CPU limits on large sites.
 */
import type { PluginDescriptor } from "emdash";

import type { BrokenLinkCheckerOptions } from "./types.js";
import { PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

export type { BrokenLinkCheckerOptions, LinkRecord, ScanSummary } from "./types.js";
// Pure helpers (no `emdash` import) — safe to re-export from the descriptor module.
export { extractUrls, isExternalHttp } from "./extract.js";
export { checkUrl } from "./check.js";
export { runScan, recordId } from "./scan.js";

/** Descriptor factory — referenced in `live.config.ts` / `astro.config.mjs`. */
export function brokenLinkCheckerPlugin(
	options: BrokenLinkCheckerOptions = {},
): PluginDescriptor<BrokenLinkCheckerOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "standard",
		entrypoint: "@emdash-star/plugin-broken-link-checker/sandbox",
		options,
		capabilities: ["content:read", "network:fetch"],
		// Links can point anywhere, so any host must be checkable.
		allowedHosts: ["*"],
		storage: { links: { indexes: ["status", "entrySlug", "checkedAt"] } },
		adminPages: [{ path: "/", label: "Broken Links", icon: "link" }],
		adminWidgets: [{ id: "broken-links", title: "Broken Links", size: "half" }],
	};
}

export default brokenLinkCheckerPlugin;
