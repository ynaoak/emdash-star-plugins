/**
 * Single-URL liveness check. `fetchFn` is injected (`ctx.http.fetch`) so this
 * is unit-testable with a stub.
 */
export interface LinkCheckResult {
	url: string;
	ok: boolean;
	statusCode: number | null;
	error: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Status codes where a server rejects HEAD but may answer GET. */
const HEAD_UNSUPPORTED = new Set([403, 405, 501]);

async function fetchWithTimeout(
	fetchFn: FetchLike,
	url: string,
	method: "HEAD" | "GET",
	timeoutMs: number,
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetchFn(url, { method, signal: controller.signal, redirect: "follow" });
	} finally {
		clearTimeout(timer);
	}
}

export async function checkUrl(
	fetchFn: FetchLike,
	url: string,
	opts: { timeoutMs?: number } = {},
): Promise<LinkCheckResult> {
	const timeoutMs = opts.timeoutMs ?? 10_000;
	try {
		let res = await fetchWithTimeout(fetchFn, url, "HEAD", timeoutMs);
		if (HEAD_UNSUPPORTED.has(res.status)) {
			res = await fetchWithTimeout(fetchFn, url, "GET", timeoutMs);
		}
		const ok = res.status < 400;
		return { url, ok, statusCode: res.status, error: ok ? null : `HTTP ${res.status}` };
	} catch (e) {
		return { url, ok: false, statusCode: null, error: (e as Error)?.message || "fetch failed" };
	}
}
