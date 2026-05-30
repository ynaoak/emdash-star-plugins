/**
 * Settings read/write + status, decoupled from EmDash so it's unit-testable
 * with an in-memory KV. `ctx.kv` satisfies `KVLike`.
 */
import type { ResendConfig } from "./types.js";

export interface KVLike {
	get<T = unknown>(key: string): Promise<T | undefined | null>;
	set(key: string, value: unknown): Promise<void>;
}

export interface ResendSettings {
	apiKey: string;
	from: string;
	replyTo?: string;
}

export async function readSettings(kv: KVLike): Promise<ResendSettings> {
	const apiKey = (await kv.get<string>("settings:apiKey")) ?? "";
	const from = (await kv.get<string>("settings:from")) ?? "";
	const replyTo = (await kv.get<string>("settings:replyTo")) ?? "";
	return { apiKey, from, replyTo: replyTo || undefined };
}

/** Persists only the keys that were provided (partial update). */
export async function saveSettings(
	kv: KVLike,
	input: { apiKey?: string; from?: string; replyTo?: string },
): Promise<void> {
	if (input.apiKey !== undefined) await kv.set("settings:apiKey", input.apiKey);
	if (input.from !== undefined) await kv.set("settings:from", input.from);
	if (input.replyTo !== undefined) await kv.set("settings:replyTo", input.replyTo);
}

/** Throws an actionable error if API key or sender is missing; otherwise returns config. */
export function assertConfigured(settings: ResendSettings): ResendConfig {
	if (!settings.apiKey) {
		throw new Error(
			"Resend API key not set — set it in Settings → Plugins → Email (Resend), or POST settings/save.",
		);
	}
	if (!settings.from) {
		throw new Error(
			"Resend sender (From) not set — set it in Settings → Plugins → Email (Resend), or POST settings/save.",
		);
	}
	return { apiKey: settings.apiKey, from: settings.from, replyTo: settings.replyTo };
}

/** Status object for the `status` route — never includes the secret value. */
export function buildStatus(settings: ResendSettings) {
	return {
		provider: "resend" as const,
		configured: Boolean(settings.apiKey && settings.from),
		hasApiKey: Boolean(settings.apiKey),
		hasFrom: Boolean(settings.from),
		from: settings.from || null,
		hasReplyTo: Boolean(settings.replyTo),
	};
}
