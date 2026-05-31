/**
 * Fast, deterministic spam signals from user settings. Pure — no EmDash/Astro
 * imports — so it's unit-testable.
 */
import type { CommentInput, HeuristicResult, SpamGuardSettings } from "./types.js";

const LINK_RE = /https?:\/\//gi;

export function countLinks(text: string): number {
	const m = text.match(LINK_RE);
	return m ? m.length : 0;
}

export function runHeuristics(
	comment: CommentInput,
	priorApprovedCount: number,
	settings: SpamGuardSettings,
): HeuristicResult {
	// Trusted commenter → approve, skip everything else.
	if (settings.trustAfterApproved > 0 && priorApprovedCount >= settings.trustAfterApproved) {
		return {
			score: 0,
			reasons: [`trusted: ${priorApprovedCount} prior approved comments`],
			hardSpam: false,
			trusted: true,
		};
	}

	const reasons: string[] = [];
	const haystack = `${comment.authorName}\n${comment.body}`.toLowerCase();

	let hardSpam = false;
	for (const word of settings.blocklist) {
		const w = word.trim().toLowerCase();
		if (w && haystack.includes(w)) {
			reasons.push(`blocklist hit: "${word}"`);
			hardSpam = true;
		}
	}

	let score = 0;
	const links = countLinks(comment.body);
	if (settings.maxLinks >= 0 && links > settings.maxLinks) {
		reasons.push(`too many links: ${links} > ${settings.maxLinks}`);
		score += Math.min(0.6, 0.2 * (links - settings.maxLinks));
	}

	if (hardSpam) score = 1;
	return { score: Math.min(1, score), reasons, hardSpam, trusted: false };
}
