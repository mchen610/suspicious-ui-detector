import { classifyPacketsWithInference, getStatusForTab } from "./llm";
import { EvidencePacket, BackgroundMessage, unreachable } from "../shared/types";


let nextFrameBlock = 10000;
const FRAME_BLOCK_SIZE = 10000;

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

// Storage helpers

async function getSettings(): Promise<{ detectionEnabled: boolean, trustedSites: string[] }> {
	return new Promise((resolve) => {
		chrome.storage.local.get(["detectionEnabled", "trustedSites"], (result) => {
			resolve({
				detectionEnabled: result["detectionEnabled"] !== false,
				trustedSites: result["trustedSites"] ?? [],
			});
		});
	});
}

async function setDetectionEnabled(enabled: boolean): Promise<void> {
	return new Promise((resolve) => {
		chrome.storage.local.set({ detectionEnabled: enabled}, resolve);
	});
}

async function setTrustedSites(sites: string[]): Promise<void> {
	return new Promise((resolve) => {
		chrome.storage.local.set({ trustedSites: sites}, resolve);
	});
}

// Content script relay helpers

async function sendToTab(tabId: number, message: unknown): Promise<unknown> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, message, (response) => {
			if (chrome.runtime.lastError) {
				resolve(undefined);
			} else {
				resolve(response);
			}
		})
	});
}

async function getActiveTabId(): Promise<number | undefined> {
	return new Promise((resolve) => {
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			resolve(tabs[0]?.id)
		});
	});
}

// Classify handler

async function handleClassify({ packets, url }: ClassifyMessage, tabId?: number) {
	console.log(`[suspicious-ui-detector] received ${packets.length} packets from ${url}`);
	try {
		await classifyPacketsWithInference(packets, url, tabId);
		console.log("[suspicious-ui-detector] classification complete");
	} catch (err) {
		console.error("[suspicious-ui-detector] classify error:", err);
	}
}

// Central message router

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	const message = msg as BackgroundMessage;
	switch (message.type) {

		// content script messages
		case "contentReady": {
			const hostname: string = message.hostname;
			getSettings().then((settings) => {
				const shouldRun = settings.detectionEnabled && !settings.trustedSites.includes(hostname);

				let idOffset = 0;
				if (sender.frameId !== 0) {
					idOffset = nextFrameBlock;
					nextFrameBlock += FRAME_BLOCK_SIZE;
				}
				sendResponse({ shouldRun, idOffset });
			});

			return true;
		}

		case "classify": {
			handleClassify(message as ClassifyMessage, sender.tab?.id).then(sendResponse);
			return true;
		}

		case "iframeFlag": {
			const tabId = sender.tab?.id;

			if (tabId !== undefined) {
				// relay to top-level document
				chrome.tabs.sendMessage(
					tabId,
					{
						type: "iframeFlagRelay",
						explanation: message.explanation,
						sourceURL: sender.url,
					},
					{ frameId: 0 }
				);
			}

			return false;
		}

		// popup messages
		case "getSettings": {
			getSettings().then((settings) => sendResponse(settings));
			return true;
		}

		case "getStatus": {
			const tabId = message.tabId;
			sendResponse(tabId !== undefined ? getStatusForTab(tabId) : { stage: "idle" });
			return false;
		}

		case "getDetections": {
			const tabId: number | undefined = message.tabId;
			if (tabId === undefined) {
				sendResponse({count: 0});
				return false;
			}

			sendToTab(tabId, {type: "getDetections"}).then((response) => {
				sendResponse({count: (response as any)?.count ?? 0});
			});

			return true;
		}

		case "setDetectionEnabled": {
			const enabled: boolean = message.enabled;

			(async () => {
				await setDetectionEnabled(enabled);

				// tell content script to stop when disabled/run again when enabled
				const tabId = message.tabId ?? (await getActiveTabId());
				if (tabId !== undefined) {
					await sendToTab(tabId, {type: "detectionToggle", enabled});
				}

				sendResponse({ok: true});
			})();

			return true;
		}

		case "setTrustSite": {
			const hostname: string = message.hostname;
			const trusted: boolean = message.trusted;

			(async () => {
				const settings = await getSettings();
				const updated = trusted ? [...new Set([...settings.trustedSites, hostname])]
					: settings.trustedSites.filter((h) => h !== hostname);

				await setTrustedSites(updated);

				// tell content script to stop when trusted/run again when untrusted
				const tabId = message.tabId ?? (await getActiveTabId());
				if (tabId !== undefined) {
					await sendToTab(tabId, {type: "detectionToggle", enabled: !trusted});
				}

				sendResponse({ok: true});
			})();

			return true;
		}

		default:
			unreachable(message);
			return false;
	}
});
