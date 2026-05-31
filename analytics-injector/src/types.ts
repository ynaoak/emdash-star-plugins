export const PLUGIN_ID = "analytics-injector";
export const PLUGIN_VERSION = "1.0.0";

export interface AnalyticsSettings {
	/** GA4 measurement id, e.g. "G-XXXXXXX". */
	ga4MeasurementId?: string;
	/** Google Tag Manager container id, e.g. "GTM-XXXXXX". */
	gtmContainerId?: string;
	/** Raw HTML injected into <head>. */
	headHtml?: string;
	/** Raw HTML injected right after <body>. */
	bodyStartHtml?: string;
	/** Raw HTML injected right before </body>. */
	bodyEndHtml?: string;
}

export type Placement = "head" | "body:start" | "body:end";

/** Mirrors EmDash's PageFragmentContribution (page:fragments hook return type). */
export type FragmentContribution =
	| { kind: "external-script"; placement: Placement; src: string; async?: boolean; defer?: boolean; key?: string }
	| { kind: "inline-script"; placement: Placement; code: string; key?: string }
	| { kind: "html"; placement: Placement; html: string; key?: string };
