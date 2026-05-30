/**
 * Scan orchestration: list content → extract URLs → check each unique URL →
 * persist a LinkRecord per (entry, url). Dependencies are injected so the whole
 * flow is unit-testable with stubs (no EmDash/Astro imports here).
 */
import { checkUrl, type FetchLike, type LinkCheckResult } from "./check.js";
import { extractUrls } from "./extract.js";
import type { LinkRecord, ScanSummary } from "./types.js";

export interface ContentItemLike {
	id: string;
	slug: string | null;
	status: string;
	data: Record<string, unknown>;
}

export interface ContentLister {
	list(
		collection: string,
		options?: { limit?: number; cursor?: string },
	): Promise<{ items: ContentItemLike[]; cursor?: string | null; hasMore?: boolean }>;
}

export interface RecordStore {
	put(id: string, data: LinkRecord): Promise<void>;
}

export interface ScanDeps {
	content: ContentLister;
	fetchFn: FetchLike;
	store: RecordStore;
	collections: string[];
	includeInternal?: boolean;
	maxLinks?: number;
	pageSize?: number;
	publishedOnly?: boolean;
	now?: () => string;
	log?: (msg: string, meta?: Record<string, unknown>) => void;
}

/** FNV-1a (32-bit) hex — stable, sync, sandbox-safe id for (collection, slug, url). */
export function recordId(collection: string, slug: string, url: string): string {
	let h = 0x811c9dc5;
	const s = `${collection}\n${slug}\n${url}`;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

interface Occurrence {
	collection: string;
	slug: string;
	title: string;
	url: string;
}

export async function runScan(deps: ScanDeps): Promise<ScanSummary> {
	const now = deps.now ?? (() => new Date().toISOString());
	const maxLinks = deps.maxLinks ?? 500;
	const pageSize = deps.pageSize ?? 100;
	const publishedOnly = deps.publishedOnly ?? true;

	const occurrences: Occurrence[] = [];
	const uniqueUrls = new Set<string>();
	let entries = 0;
	let truncated = false;

	collect: for (const collection of deps.collections) {
		let cursor: string | undefined;
		do {
			const page = await deps.content.list(collection, { limit: pageSize, cursor });
			for (const item of page.items) {
				if (publishedOnly && item.status !== "published") continue;
				entries++;
				const slug = item.slug ?? item.id;
				const title = (item.data?.title as string) || slug;
				for (const url of extractUrls(item.data, { includeInternal: deps.includeInternal })) {
					if (!uniqueUrls.has(url) && uniqueUrls.size >= maxLinks) {
						truncated = true;
						break collect;
					}
					uniqueUrls.add(url);
					occurrences.push({ collection, slug, title, url });
				}
			}
			cursor = page.hasMore ? page.cursor ?? undefined : undefined;
		} while (cursor);
	}

	if (truncated) {
		deps.log?.(`maxLinks (${maxLinks}) reached — some links left unchecked`, { maxLinks });
	}

	// Check each unique URL once.
	const results = new Map<string, LinkCheckResult>();
	for (const url of uniqueUrls) {
		results.set(url, await checkUrl(deps.fetchFn, url));
	}

	// Persist a record per occurrence (so the report shows which entry).
	const checkedAt = now();
	for (const occ of occurrences) {
		const r = results.get(occ.url)!;
		const record: LinkRecord = {
			url: occ.url,
			collection: occ.collection,
			entrySlug: occ.slug,
			entryTitle: occ.title,
			status: r.ok ? "ok" : "broken",
			statusCode: r.statusCode,
			error: r.error,
			checkedAt,
		};
		await deps.store.put(recordId(occ.collection, occ.slug, occ.url), record);
	}

	let broken = 0;
	let ok = 0;
	for (const r of results.values()) r.ok ? ok++ : broken++;

	return { scannedAt: checkedAt, entries, checked: uniqueUrls.size, broken, ok, truncated };
}
