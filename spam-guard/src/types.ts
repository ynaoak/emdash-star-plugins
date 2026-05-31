export const PLUGIN_ID = "spam-guard";
export const PLUGIN_VERSION = "1.0.0";

/** The fields of a comment we classify (subset of EmDash's comment shape). */
export interface CommentInput {
	authorName: string;
	authorEmail: string;
	body: string;
}

export type Mode = "heuristic" | "llm" | "hybrid";
export type ModerationStatus = "approved" | "pending" | "spam";

export interface SpamGuardSettings {
	mode: Mode;
	llmBaseUrl: string;
	llmApiKey: string;
	llmModel: string;
	instructions: string;
	blocklist: string[];
	maxLinks: number;
	trustAfterApproved: number;
	spamThreshold: number;
	approveThreshold: number;
	/** Status to use when the LLM is needed but unavailable. */
	failMode: ModerationStatus;
}

export interface HeuristicResult {
	/** 0..1, higher = more spam-like. */
	score: number;
	reasons: string[];
	/** Definitive spam (e.g. blocklist hit). */
	hardSpam: boolean;
	/** Definitively trusted (skip LLM, approve). */
	trusted: boolean;
}

export interface LlmVerdict {
	spam: boolean;
	/** 0..1 confidence in the `spam` value. */
	confidence: number;
	reason: string;
}

/** Mirrors EmDash's ModerationDecision (comment:moderate return type). */
export interface ModerationDecision {
	status: ModerationStatus;
	reason?: string;
}

export const DEFAULT_SETTINGS: SpamGuardSettings = {
	mode: "hybrid",
	llmBaseUrl: "",
	llmApiKey: "",
	llmModel: "",
	instructions: "",
	blocklist: [],
	maxLinks: 3,
	trustAfterApproved: 3,
	spamThreshold: 0.7,
	approveThreshold: 0.3,
	failMode: "pending",
};
