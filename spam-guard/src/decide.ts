/**
 * Combines heuristic + LLM signals into a ModerationDecision. Pure.
 *
 * fail-safe: if the LLM was needed but unavailable, never auto-approve/auto-spam
 * silently — use the configured `failMode` (default "pending").
 */
import type { HeuristicResult, LlmVerdict, ModerationDecision, SpamGuardSettings } from "./types.js";

export function decide(
	heur: HeuristicResult,
	llm: LlmVerdict | null,
	settings: SpamGuardSettings,
	llmAttempted: boolean,
): ModerationDecision {
	if (heur.trusted) {
		return { status: "approved", reason: heur.reasons[0] ?? "trusted commenter" };
	}
	if (heur.hardSpam) {
		return { status: "spam", reason: heur.reasons.join("; ") || "blocklist" };
	}

	// LLM was required but failed → fail-safe.
	if ((settings.mode === "llm" || settings.mode === "hybrid") && llmAttempted && !llm) {
		return { status: settings.failMode, reason: "LLM unavailable — fail-safe" };
	}

	const reasons = [...heur.reasons];
	let score = heur.score;
	if (llm) {
		const llmScore = llm.spam ? llm.confidence : 1 - llm.confidence;
		score = settings.mode === "llm" ? llmScore : Math.max(score, llmScore);
		if (llm.reason) reasons.push(`LLM: ${llm.reason}`);
	}

	let status: ModerationDecision["status"];
	if (score >= settings.spamThreshold) status = "spam";
	else if (score <= settings.approveThreshold) status = "approved";
	else status = "pending";

	const reason = (reasons.join("; ") || `score ${score.toFixed(2)}`).replace(/\s+/g, " ").slice(0, 500);
	return { status, reason };
}
