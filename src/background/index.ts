console.log("[suspicious-ui-detector] background service worker initialized");

chrome.runtime.onInstalled.addListener((details) => {
	console.log(`[suspicious-ui-detector] extension ${details.reason}`);
});

chrome.runtime.onStartup.addListener(() => {
	console.log("[suspicious-ui-detector] browser startup detected");
});
