export const PLUGIN_ID = "broken-link-checker";
export const PLUGIN_VERSION = "1.0.0";

export interface BrokenLinkCheckerOptions {
	/** Collections to scan. Defaults to ["posts", "pages"]. */
	collections?: string[];
	/** Cron schedule for automatic scans. Defaults to "@weekly". */
	schedule?: string;
	/** Also check root-relative internal links (default false — external http(s) only). */
	includeInternal?: boolean;
	/** Hard cap on unique URLs checked per scan (default 500). */
	maxLinks?: number;
}

/** One stored link occurrence: a URL found in a specific entry, with its last check result. */
export interface LinkRecord {
	url: string;
	collection: string;
	entrySlug: string;
	entryTitle: string;
	status: "ok" | "broken";
	statusCode: number | null;
	error: string | null;
	checkedAt: string;
}

export interface ScanSummary {
	scannedAt: string;
	/** Entries scanned. */
	entries: number;
	/** Unique URLs checked. */
	checked: number;
	broken: number;
	ok: number;
	/** True if maxLinks was hit and some links were left unchecked. */
	truncated: boolean;
}
