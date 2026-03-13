import { classifyPacketsWithInference } from "./llm";
import { EvidencePacket } from "../shared/types";

console.log("[suspicious-ui-detector] background service worker initialized");

chrome.runtime.onInstalled.addListener((details) => {
	console.log(`[suspicious-ui-detector] extension ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
	console.log("[suspicious-ui-detector] browser startup detected");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "classify") {
		const packets = message.packets as EvidencePacket[];
		const url = message.url as string | undefined;
		console.log(`[suspicious-ui-detector] received ${packets.length} packets from ${url ?? "unknown"}`);
		classifyPacketsWithInference(packets, url)
			.then(({ results }) => {
				console.log(`[suspicious-ui-detector] classification complete:`, results);
				sendResponse({ results });
			})
			.catch((err) => {
				console.error("[suspicious-ui-detector] classify error:", err ?? "unknown error (null rejection)");
				sendResponse({ results: [] });
			});
		return true; // keep channel open for async sendResponse
	}
});
