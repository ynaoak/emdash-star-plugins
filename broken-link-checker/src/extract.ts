/**
 * URL extraction from arbitrary content data. Pure — no EmDash/Astro imports.
 *
 * Walks the entry data recursively and collects values of `href` / `url` /
 * `src` keys (which also covers Portable Text link markDefs, image blocks, and
 * embeds). External http(s) only by default; internal root-relative links are
 * opt-in.
 */
const URL_KEYS = new Set(["href", "url", "src"]);

export function isExternalHttp(url: string): boolean {
	return /^https?:\/\//i.test(url);
}

function isInternal(url: string): boolean {
	return url.startsWith("/") && !url.startsWith("//");
}

/** Collect candidate links from an entry's data. Deduplicated, order-stable. */
export function extractUrls(data: unknown, opts: { includeInternal?: boolean } = {}): string[] {
	const found = new Set<string>();

	const add = (raw: string): void => {
		const url = raw.trim();
		if (!url) return;
		if (isExternalHttp(url)) found.add(url);
		else if (opts.includeInternal && isInternal(url)) found.add(url);
		// mailto:, tel:, #anchors, protocol-relative, data: → ignored
	};

	const visit = (node: unknown): void => {
		if (node == null) return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (typeof node === "object") {
			for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
				if (typeof value === "string") {
					if (URL_KEYS.has(key)) add(value);
				} else {
					visit(value);
				}
			}
		}
	};

	visit(data);
	return [...found];
}
