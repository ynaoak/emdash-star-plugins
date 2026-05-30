export const PLUGIN_ID = "email-resend";

/**
 * Mirror of EmDash's core `EmailMessage` shape. Defined locally because the
 * type isn't re-exported from the `emdash` package root (only `PluginContext`,
 * `PluginDescriptor`, `definePlugin` are).
 */
export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
}

/** Event passed to the `email:deliver` hook. */
export interface EmailDeliverEvent {
	message: EmailMessage;
	/** "system" for auth emails, otherwise the originating plugin id. */
	source: string;
}

/** Resolved configuration used to build a Resend request. */
export interface ResendConfig {
	apiKey: string;
	/** Verified sender, e.g. `Acme <no-reply@acme.com>`. */
	from: string;
	replyTo?: string;
}
