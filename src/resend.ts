/**
 * Resend transport. Kept free of EmDash/Astro imports so the payload builder
 * and delivery logic are unit-testable with a stub fetch.
 */
import type { EmailMessage, ResendConfig } from "./types.js";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendPayload {
	from: string;
	to: string[];
	subject: string;
	text: string;
	html?: string;
	reply_to?: string;
}

/** Minimal fetch signature — satisfied by `globalThis.fetch` and `ctx.http.fetch`. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Maps EmDash's `EmailMessage` + config to a Resend API request body. */
export function buildResendPayload(message: EmailMessage, cfg: ResendConfig): ResendPayload {
	const to = message.to
		.split(",")
		.map((addr) => addr.trim())
		.filter(Boolean);

	const payload: ResendPayload = {
		from: cfg.from,
		to,
		subject: message.subject,
		text: message.text,
	};
	if (message.html) payload.html = message.html;
	if (cfg.replyTo) payload.reply_to = cfg.replyTo;
	return payload;
}

/** Sends one message through Resend. Throws on any non-2xx response. */
export async function deliverViaResend(
	fetchFn: FetchLike,
	message: EmailMessage,
	cfg: ResendConfig,
): Promise<{ id?: string }> {
	const res = await fetchFn(RESEND_ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(buildResendPayload(message, cfg)),
	});

	if (!res.ok) {
		const detail = await readError(res);
		throw new Error(`Resend delivery failed (${res.status})${detail ? `: ${detail}` : ""}`);
	}

	return (await res.json().catch(() => ({}))) as { id?: string };
}

async function readError(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string; name?: string };
		return body.message || body.name || "";
	} catch {
		return (await res.text().catch(() => "")) || "";
	}
}
