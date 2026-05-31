/**
 * Builds page:fragments contributions from settings. Pure — no EmDash/Astro
 * imports — so it's unit-testable.
 *
 * Security: GA4/GTM ids are interpolated into inline scripts, so they are
 * strictly validated and dropped if malformed (prevents script injection via a
 * crafted id). Custom head/body HTML is raw by design — it comes from the admin
 * (a trusted source).
 */
import type { AnalyticsSettings, FragmentContribution } from "./types.js";

const GA4_RE = /^G-[A-Z0-9]+$/;
const GTM_RE = /^GTM-[A-Z0-9]+$/;

export function buildContributions(settings: AnalyticsSettings): FragmentContribution[] {
	const out: FragmentContribution[] = [];

	const ga4 = (settings.ga4MeasurementId ?? "").trim();
	if (GA4_RE.test(ga4)) {
		out.push({
			kind: "external-script",
			placement: "head",
			src: `https://www.googletagmanager.com/gtag/js?id=${ga4}`,
			async: true,
			key: "ga4-lib",
		});
		out.push({
			kind: "inline-script",
			placement: "head",
			code: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4}');`,
			key: "ga4-config",
		});
	}

	const gtm = (settings.gtmContainerId ?? "").trim();
	if (GTM_RE.test(gtm)) {
		out.push({
			kind: "inline-script",
			placement: "head",
			code: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');`,
			key: "gtm-head",
		});
		out.push({
			kind: "html",
			placement: "body:start",
			html: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtm}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
			key: "gtm-noscript",
		});
	}

	const headHtml = (settings.headHtml ?? "").trim();
	if (headHtml) out.push({ kind: "html", placement: "head", html: headHtml, key: "custom-head" });

	const bodyStartHtml = (settings.bodyStartHtml ?? "").trim();
	if (bodyStartHtml) out.push({ kind: "html", placement: "body:start", html: bodyStartHtml, key: "custom-body-start" });

	const bodyEndHtml = (settings.bodyEndHtml ?? "").trim();
	if (bodyEndHtml) out.push({ kind: "html", placement: "body:end", html: bodyEndHtml, key: "custom-body-end" });

	return out;
}
