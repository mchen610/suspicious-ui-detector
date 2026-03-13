/**
 * The content script orchestrates the DOM parsing and extraction pipeline:
 *  1.  Candidate discovery (selectors.ts)
 *  2.  Context extraction (extractor.ts)
 *  3.  EvidencePacket assembly (extractor.ts)
 *  4.  Passing the 'EvidencePacket' to the background
 *      service worker for SLM inference
 *
 * The content script also retains a packet ID to DOM element mapping used in
 * the visual highlighting of "suspicious" elements flagged by the SLM and
 * returned via the background service worker.
 */

import { ExtractionResult, ClassificationResult } from "../shared/types"
import { discoverCandidates } from "./selectors";
import { extractEvidence, buildElementMap } from "./extractor";
import { DEFAULT_CONFIG } from "./config";
import styles from "./highlight.css?inline";


// maps packet IDs to DOM elements
let elementMap = new Map<number, HTMLElement>();

// --- Overlay / highlight state ---

const overlayMap = new Map<number, { el: HTMLElement; overlay: HTMLDivElement }>();
let flaggedElements = new Set<HTMLElement>();

function injectStyles() {
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.appendChild(style);
}

function positionOverlay(el: HTMLElement, overlay: HTMLDivElement) {
    const rect = el.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
}

function repositionAllOverlays() {
    for (const { el, overlay } of overlayMap.values()) {
        positionOverlay(el, overlay);
    }
}

function removeOverlay(id: number) {
    const entry = overlayMap.get(id);
    if (entry) {
        entry.overlay.remove();
        entry.el.classList.remove("suspicious-ui-detector-highlighted");
        overlayMap.delete(id);
    }
}

function highlightElement(id: number, el: HTMLElement, explanation?: string) {
    if (flaggedElements.has(el)) return;
    flaggedElements.add(el);

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    el.classList.add("suspicious-ui-detector-highlighted");

    const overlay = document.createElement("div");
    overlay.className = "suspicious-ui-detector-glow";
    const badge = document.createElement("span");
    badge.className = "suspicious-ui-detector-badge";
    const label = explanation || "Flagged as suspicious";
    badge.innerHTML = `Suspicious <button class="suspicious-ui-detector-badge-x">&times;</button>`;
    const closeBtn = badge.querySelector(".suspicious-ui-detector-badge-x")!;
    const textNode = badge.childNodes[0] as Text;
    badge.addEventListener("mouseenter", () => {
        textNode.textContent = label + " ";
    });
    badge.addEventListener("mouseleave", () => {
        textNode.textContent = "Suspicious ";
    });
    closeBtn.addEventListener("click", () => removeOverlay(id));
    overlay.appendChild(badge);
    positionOverlay(el, overlay);
    document.body.appendChild(overlay);
    overlayMap.set(id, { el, overlay });
}

// --- Pipeline ---

/**
 * Runs discovery + extraction pipeline. Returns a serializable
 * 'ExtractionResult' for message passing and updates the 'elementMap'.
 */
function runPipeline(): ExtractionResult {
    const candidates = discoverCandidates(document, DEFAULT_CONFIG);
    const result = extractEvidence(candidates, DEFAULT_CONFIG);

    elementMap = buildElementMap(candidates);

    return result;
}

/**
 * Handles classification results received from the background service
 * worker. Highlights suspicious elements.
 */
function handleClassifications(
    classifications: ClassificationResult[]
): void {
    for (const result of classifications) {
        const elem = elementMap.get(result.id);
        if (!elem) continue;

        console.debug(
            `#${result.id} <${elem.tagName.toLowerCase()}>`,
            `classified as ${result.category} (${result.confidence})`,
        );

        if (result.category !== "benign") {
            highlightElement(result.id, elem, result.explanation);
        }
    }
}

// --- Clear all highlights ---

function clearAllOverlays() {
    for (const [id] of overlayMap) {
        removeOverlay(id);
    }
    flaggedElements.clear();
}

// --- Run detection ---

function runDetection() {
    const extractionResult = runPipeline();

    console.debug(
        `extracted ${extractionResult.packets.length} packets`,
        `from ${extractionResult.url}`,
    );

    if (extractionResult.packets.length > 0) {
        chrome.runtime.sendMessage(
            { type: "classify", packets: extractionResult.packets, url: extractionResult.url },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[suspicious-ui-detector] classify error:", chrome.runtime.lastError.message);
                    return;
                }
                const results: ClassificationResult[] = response?.results ?? [];
                console.log("[suspicious-ui-detector] classify results:", results);
                handleClassifications(results);
            },
        );
    }
}

// --- Init ---

injectStyles();
window.addEventListener("scroll", repositionAllOverlays, { passive: true });
window.addEventListener("resize", repositionAllOverlays, { passive: true });

// Listen for toggle messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "detectionToggle") {
        if (message.enabled) {
            runDetection();
        } else {
            clearAllOverlays();
        }
    } else if (message.type === "getDetections") {
        sendResponse({ count: flaggedElements.size });
    }
});

// --- Entry point ---

chrome.storage.local.get(["detectionEnabled", "trustedSites"], (settings) => {
    if (settings.detectionEnabled === false) {
        console.debug("[suspicious-ui-detector] detection disabled, skipping");
        return;
    }
    const trusted: string[] = settings.trustedSites ?? [];
    if (trusted.includes(window.location.hostname)) {
        console.debug("[suspicious-ui-detector] site is trusted, skipping");
        return;
    }
    runDetection();
});
