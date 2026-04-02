import { CreateMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";
import { EvidencePacket, ClassificationResult } from "../shared/types";

export const MODEL_ID = "Qwen3-4B-q4f16_1-MLC";

const SYSTEM_PROMPT = `You classify web UI elements as SUSPICIOUS or SAFE.

SUSPICIOUS means the element tries to TRICK the user. When uncertain, choose SAFE.

SUSPICIOUS — any element that deceives:
- Links/buttons that say "Download" but href goes to an ad network or unrelated domain
- Text like "Your file is ready", "Update required", "Your computer is infected"
- Fake system dialogs, fake antivirus warnings, fake browser notifications
- "Click Allow to continue", "Enable notifications to verify"
- An ad that disguises itself as a download button or system message

SAFE — everything else, including:
- Legitimate download links (href points to an actual file like .apk, .exe, .zip)
- Normal buttons and links (Subscribe, Sign up, Learn more)
- Ad container wrapper elements (div, ins, iframe) that do NOT themselves contain deceptive text
- Standard ad labels ("Advertisement", "Sponsored")
- onclick, alert(), analytics, UI toggles

Key rule: if an element says "Download" but its href goes to an ad network (not a real file), it is SUSPICIOUS. The fact that it is inside an ad does NOT make it safe.

Think step-by-step in 1-2 plain sentences first. No markdown, no bullet points, no formatting. Then, your very last word MUST be either SUSPICIOUS or SAFE. Nothing else may come after it. If your last word is anything other than SUSPICIOUS or SAFE, your output is invalid.`;

let engine: MLCEngineInterface | null = null;
let engineInitPromise: Promise<MLCEngineInterface> | null = null;

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

export function getEngine(): Promise<MLCEngineInterface> {
	if (engine) return Promise.resolve(engine);
	if (engineInitPromise) return engineInitPromise;

	console.log("[suspicious-ui-detector] loading model:", MODEL_ID);
	engineInitPromise = CreateMLCEngine(MODEL_ID, {
		initProgressCallback: ({ text, progress }) => {
			console.log(`[suspicious-ui-detector] ${(progress * 100).toFixed(0)}% — ${text}`);
			broadcastStatus({ stage: "loading", modelId: MODEL_ID, progress });
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
	parts.push(`<${p.tagName}> ${p.HTMLSnippet.slice(0, 120)}`)

	const href = p.attributes.href;
	if (href) {
		parts.push(`href=${href.slice(0, 150)}`);
		if (url && isSameSite(href, url)) {
			parts.push("sameOrigin=true");
		}
	}

	if (p.style.pos !== "static") parts.push(`pos=${p.style.pos}`);
	if (p.isInIFrame) parts.push("iframe=true");

	const elementText = p.elementText?.slice(0, 60);
	if (elementText) parts.push(`elementText: ${elementText}`);

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

		console.log(`[suspicious-ui-detector] #${pkt.id} <${pkt.tagName}> → ${suspicious ? "SUSPICIOUS" : "SAFE"}\nprompt:\n${prompt}\nresponse:\n${raw.trim()}`);

		const explanation = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || undefined;

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
