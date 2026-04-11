import { CreateMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";
import { EvidencePacket, ClassificationResult } from "../shared/types";
import { DEFAULT_MODEL_ID } from "../shared/models";

const SYSTEM_PROMPT =
`You classify web UI elements as SUSPICIOUS or SAFE.

SUSPICIOUS means the element tries to TRICK the user. When uncertain, choose SAFE.

SUSPICIOUS — any element that deceives:
- Links/buttons that say "Download" but href goes to an ad network or unrelated domain
- Text like "Your file is ready", "Update required", "Your computer is infected"
- An iframe or element inside a known ad container (adContainer=true) on a file-hosting or download page, regardless of whether it is labeled "Advertisement" — the ad is positioned to visually interfere with the user's intended action
- Fake system dialogs, fake antivirus warnings, fake browser notifications
- "Click Allow to continue", "Enable notifications to verify"
- An ad that disguises itself as a download button or system message

SAFE — everything else, including:
- Legitimate download links (href points to an actual file like .apk, .exe, .zip)
- Links where href domain matches the page domain (first-party navigation, downloads, upsells)
- Links to well-known app stores (play.google.com, apps.apple.com)
- FAQ/help/support links (href contains /faq, /help, /support, or element text is a help icon like [?])
- Software suggestion links on file hosting sites ("Open with...", "Can be opened with...")
- First-party premium upsells ("Try Ultra", "Go Pro", "Upgrade", "Download Faster")
- Normal buttons and links (Subscribe, Sign up, Learn more)
- A site's own download button (href subdomain matches page domain, e.g., download.example.com on example.com)
- Ad container wrapper elements (div, ins) that are empty or contain only standard ad labels, on pages where they do NOT overlap with a primary user action (e.g., a download button)- Standard ad labels ("Advertisement", "Sponsored")
- onclick, alert(), analytics, UI toggles

Key rule: if an element says "Download" but its href goes to an ad network (not a real file), it is SUSPICIOUS. The fact that it is inside an ad does NOT make it safe.

Think step-by-step in 1-2 plain sentences first. No markdown, no bullet points, no formatting. Then, your very last word MUST be either SUSPICIOUS or SAFE. Nothing else may come after it. If your last word is anything other than SUSPICIOUS or SAFE, your output is invalid.`;

let currentModelId = DEFAULT_MODEL_ID;
let engine: MLCEngineInterface | null = null;
let engineInitPromise: Promise<MLCEngineInterface> | null = null;

const modelIdReady = new Promise<void>((resolve) => {
	chrome.storage.local.get(["modelId"], (result) => {
		if (result.modelId) currentModelId = result.modelId;
		resolve();
	});
});

export async function setModelId(newId: string): Promise<void> {
	currentModelId = newId;
	const oldEngine = engine;
	engine = null;
	engineInitPromise = null;
	if (oldEngine) {
		try { await oldEngine.unload(); } catch { /* ignore */ }
	}
}

export type PipelineStatus =
	| { stage: "idle" }
	| { stage: "loading"; modelId: string; progress: number }
	| { stage: "classifying"; total: number; done: number }
	| { stage: "done" };

const tabStatus = new Map<number, PipelineStatus>();

function broadcastStatus(status: PipelineStatus, tabId?: number) {
	if (tabId !== undefined) tabStatus.set(tabId, status);
	chrome.runtime.sendMessage({ type: "statusUpdate", status, tabId }).catch(() => {});
}

export function getStatusForTab(tabId: number): PipelineStatus {
	return tabStatus.get(tabId) ?? { stage: "idle" };
}

export async function getEngine(): Promise<MLCEngineInterface> {
	await modelIdReady;
	if (engine) return engine;
	if (engineInitPromise) return engineInitPromise;

	console.log("[suspicious-ui-detector] loading model:", currentModelId);
	engineInitPromise = CreateMLCEngine(currentModelId, {
		initProgressCallback: ({ text, progress }) => {
			console.log(`[suspicious-ui-detector] ${(progress * 100).toFixed(0)}% — ${text}`);
			broadcastStatus({ stage: "loading", modelId: currentModelId, progress });
		},
	}).then((e) => {
		engine = e;
		console.log("[suspicious-ui-detector] model ready");
		return e;
	}).catch((err) => {
		engineInitPromise = null;
		console.error("[suspicious-ui-detector] failed to load model:", err);
		throw new Error(`Model failed to load: ${err}`);
	});

	return engineInitPromise;
}

function buildPrompt(p: EvidencePacket, url?: string): string {
	const parts: string[] = [];
	if (url) {
		try { parts.push(`page=${new URL(url).hostname}`); }
		catch { /* skip */ }
	}
	parts.push(`<${p.tagName}> ${p.HTMLSnippet.slice(0, 200)}`)

	const href = p.attributes.href;
	if (href) {
		parts.push(`href=${href.slice(0, 150)}`);
		if (url && isSameSite(href, url)) {
			parts.push("sameOrigin=true");
		}
	}

	const ariaLabel = p.attributes["aria-label"];
	if (ariaLabel) parts.push(`ariaLabel=${ariaLabel.slice(0, 60)}`);

	const title = p.attributes["title"];
	if (title) parts.push(`title=${title.slice(0, 60)}`);

	if (p.style.pos !== "static") parts.push(`pos=${p.style.pos}`);
	if (p.isInIFrame) parts.push("iframe=true");
	if (p.isInAdContainer) parts.push("adContainer=true");

	// aggressively cap (3 text fragments, 120 total characters)
	const ctx = p.surroundingText?.filter(Boolean).slice(0, 3).join(" | ").slice(0, 120);
	if (ctx) parts.push(`context: ${ctx}`)

	return parts.join("\n");
}

// NOTE: Fails on edge cases like 'example.co.uk' but covers majority of site domains
function isSameSite(href: string, url: string): boolean {
	try {
		const hrefHost = new URL(href, url).hostname;
		const pageHost = new URL(url).hostname;
		const tld =
			(host: string) => host.split('.').slice(-2).join('.');
		return tld(hrefHost) == tld(pageHost);
	} catch {
		return false;
	}
}

async function classifyOne(eng: MLCEngineInterface, prompt: string): Promise<{ suspicious: boolean; raw: string }> {
	const completion = await eng.chat.completions.create({
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: prompt + "\n\n/no_think" },
		],
		max_tokens: 128,
		temperature: 0,
	});

	const raw = completion.choices[0]?.message?.content ?? "";
	const lastWord = raw.trim().split(/\s+/).pop()?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
	return { suspicious: lastWord === "SUSPICIOUS", raw };
}

export async function classifyPacketsWithInference(packets: EvidencePacket[], url?: string, tabId?: number): Promise<void> {
	const eng = await getEngine();

	console.log(`[suspicious-ui-detector] classifying ${packets.length} packets from ${url}`);

	const hostname = url
		? (() => { try { return new URL(url).hostname; } catch { return url; } })() : "unknown";

	let done = 0;
	broadcastStatus({ stage: "classifying", total: packets.length, done: 0 }, tabId);

	for (const pkt of packets) {
		const prompt = buildPrompt(pkt, url);
		let suspicious = false;
		let raw = "";
		try {
			const result = await classifyOne(eng, prompt);
			suspicious = result.suspicious;
			raw = result.raw;
		} catch (err) {
			console.error(`[suspicious-ui-detector] classify error for #${pkt.id}:`, err);
			raw = String(err);
		}

		// console.log(`[suspicious-ui-detector] #${pkt.id} <${pkt.tagName}> → ${suspicious ? "SUSPICIOUS" : "SAFE"}\nprompt:\n${prompt}\nresponse:\n${raw.trim()}`);

		const explanation = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || undefined;

		console.log(
			`[suspicious-ui-detector] #${pkt.id} <${pkt.tagName}> [${hostname}] → ${suspicious ? "SUSPICIOUS" : "SAFE"}` +
			`\nprompt:\n${prompt}` +
			`\nresponse:\n${explanation ?? "(empty)"}`
		);

		const classification: ClassificationResult = {
			id: pkt.id,
			category: suspicious ? "suspicious" : "benign",
			confidence: suspicious ? "medium" : "low",
			explanation,
		};

		// Stream result to content script as soon as it's ready
		if (tabId !== undefined) {
			chrome.tabs.sendMessage(tabId, { type: "classificationResult", result: classification }).catch(() => {});
		}

		broadcastStatus({ stage: "classifying", total: packets.length, done: ++done }, tabId);
	}

	broadcastStatus({ stage: "done" }, tabId);
}

export const _testing = { buildPrompt, classifyOne, SYSTEM_PROMPT };
