import { classifyPacketsWithInference, getStatusForTab } from "./llm";

console.log("[suspicious-ui-detector] background service worker initialized");

chrome.runtime.onInstalled.addListener((details) => {
	console.log(`[suspicious-ui-detector] extension ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
	console.log("[suspicious-ui-detector] browser startup detected");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "classify") {
		classifyPacketsWithInference(message.packets, message.url, sender.tab?.id).catch((err) => {
			console.error("[suspicious-ui-detector] classify error:", err);
		});
	} else if (message.type === "getStatus") {
		const tabId = message.tabId;
		sendResponse(tabId !== undefined ? getStatusForTab(tabId) : { stage: "idle" });
	} else if (message.type === "getDetections") {
		const tabId = message.tabId;
		if (tabId === undefined) {
			sendResponse({ count: 0 });
			return;
		}
		chrome.tabs.sendMessage(tabId, { type: "getDetections" }, (response) => {
			if (chrome.runtime.lastError) {
				sendResponse({ count: 0 });
				return;
			}
			sendResponse(response);
		});
		return true; // keep message channel open for async sendResponse
	}
});
