import { classifyPacketsWithInference, getStatus } from "./llm";
import { EvidencePacket } from "../shared/types";

interface ClassifyMessage {
	type: "classify";
	packets: EvidencePacket[];
	url?: string;
}

console.log("[suspicious-ui-detector] background service worker initialized");

chrome.runtime.onInstalled.addListener((details) => {
	console.log(`[suspicious-ui-detector] extension ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
	console.log("[suspicious-ui-detector] browser startup detected");
});

async function handleClassify({ packets, url }: ClassifyMessage) {
	console.log(`[suspicious-ui-detector] received ${packets.length} packets from ${url}`);
	try {
		const { results } = await classifyPacketsWithInference(packets, url);
		console.log("[suspicious-ui-detector] classification complete:", results);
		return { results };
	} catch (err) {
		console.error("[suspicious-ui-detector] classify error:", err);
		return { results: [] };
	}
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "classify") {
		handleClassify(message as ClassifyMessage).then(sendResponse);
		return true;
	} else if (message.type === "getStatus") {
		sendResponse(getStatus());
	}
});
