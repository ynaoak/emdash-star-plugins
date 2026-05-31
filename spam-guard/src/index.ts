/**
 * Spam Guard for EmDash — an AI-enhanced Akismet alternative for comments.
 *
 * Classifies comments with heuristics (blocklist, link count, trusted authors)
 * + an LLM (local Ollama / LM Studio, or cloud OpenAI-compatible) and returns a
 * moderation decision (approved / pending / spam) via `comment:moderate`.
 *
 *   // live.config.ts / astro.config.mjs
 *   import { spamGuardPlugin } from "@emdash-star/plugin-spam-guard";
 *   export default defineConfig({ plugins: [spamGuardPlugin()] });
 *
 * Descriptor module: type-only `emdash` import (resolves when dev-linked across
 * repos). Runtime `definePlugin(...)` is in `./sandbox-entry`. Trusted mode
 * (LLM endpoint is user-configured — local or any cloud).
 */
import type { PluginDescriptor } from "emdash";

import { PLUGIN_ID, PLUGIN_VERSION } from "./types.js";

export type {
	CommentInput,
	SpamGuardSettings,
	HeuristicResult,
	LlmVerdict,
	ModerationDecision,
	Mode,
} from "./types.js";
export { runHeuristics, countLinks } from "./heuristics.js";
export { buildMessages, parseVerdict, classifyWithLLM } from "./llm.js";
export { decide } from "./decide.js";

/** Descriptor factory — referenced in `live.config.ts` / `astro.config.mjs`. */
export function spamGuardPlugin(): PluginDescriptor {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "standard",
		entrypoint: "@emdash-star/plugin-spam-guard/sandbox",
		options: {},
		capabilities: ["network:fetch"],
		// LLM endpoint is user-configured (local or any cloud).
		allowedHosts: ["*"],
	};
}

export default spamGuardPlugin;
