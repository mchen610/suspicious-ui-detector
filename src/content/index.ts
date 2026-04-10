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


const SAFE_IFRAME_HOSTS = new Set([
    "www.youtube.com",
    "youtube.com",
    "player.vimeo.com",
    "platform.twitter.com",
    "www.instagram.com",
    // add other common embed providers as needed
])

// frame-specific ID offset (top-level = 0, subframes > 0)
let idOffset = 0;

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

function getVisibleRect(el: HTMLElement): DOMRect {
    let rect = el.getBoundingClientRect();

    let parent = el.offsetParent as HTMLElement | null;
    while (parent && parent !== document.documentElement) {
        const style = getComputedStyle(parent);

        // check if parent capable of cropping children
        const overflows = style.overflow + style.overflowX + style.overflowY;
        if (overflows.includes("hidden") || overflows.includes("clip")) {
            const parentRect = parent.getBoundingClientRect();
            const top = Math.max(rect.top, parentRect.top);
            const left = Math.max(rect.left, parentRect.left);
            const bottom = Math.min(rect.bottom, parentRect.bottom);
            const right = Math.min(rect.right, parentRect.right);

            // if entirely clipped
            if (right <= left || bottom <= top) {
                return new DOMRect(left, top, 0, 0);    // zero-size rect
            }

            // o.w. update to visible rect
            rect = new DOMRect(left, top, right - left, bottom - top);
        }

        parent = parent.offsetParent as HTMLElement | null;
    }

    // clip to viewport
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const right = Math.min(rect.right, window.innerWidth);

    if (right <= left || bottom <= top) {
        return new DOMRect(left, top, 0, 0); // zero-size rect
    }

    return new DOMRect(left, top, right - left, bottom - top);
}

function positionOverlay(el: HTMLElement, overlay: HTMLDivElement) {
    const rect = getVisibleRect(el);

    // hide overlay is zero-sized visible rect
    if (rect.width === 0 || rect.height === 0) {
        overlay.style.display = "none";
        return
    }

    overlay.style.display = "";
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

    // containment deduplication
    for (const flagged of flaggedElements) {
        if (flagged.contains(el) || el.contains(flagged)) return
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    flaggedElements.add(el);
    el.classList.add("suspicious-ui-detector-highlighted");

    const overlay = document.createElement("div");
    overlay.className = "suspicious-ui-detector-glow";

    const badge = document.createElement("span");
    badge.className = "suspicious-ui-detector-badge";

    const label = explanation || "Flagged as suspicious";
    badge.innerHTML = `<button class="suspicious-ui-detector-badge-x">&times;</button>Suspicious `;

    const closeBtn = badge.querySelector(".suspicious-ui-detector-badge-x")!;
    const textNode = badge.childNodes[1] as Text;
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

    for (const pkt of result.packets) {
        pkt.id += idOffset;
    }

    elementMap = buildElementMap(candidates, idOffset);

    return result;
}

/**
 * Handles classification results received from the background service
 * worker. Highlights suspicious elements.
 */
function handleClassifications(classifications: ClassificationResult[]): void {
    for (const result of classifications) {
        const elem = elementMap.get(result.id);
        if (!elem) continue;

        console.debug(
            `#${result.id} <${elem.tagName.toLowerCase()}>`,
            `classified as ${result.category} (${result.confidence})`,
        );

        if (result.category !== "benign") {
            // if inside iframe defer visual highlighting to parent
            if (window !== window.top) {
                chrome.runtime.sendMessage(
                    {type: "iframeFlag", explanation: result.explanation},
                    () => void chrome.runtime.lastError
                );
            } else {
                highlightElement(result.id, elem, result.explanation);
            }
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

function observeAdContainers() {
    const containers = document.querySelectorAll<HTMLElement>(DEFAULT_CONFIG.adContainerSelectors);
    if (containers.length === 0) return;

    const observer = new MutationObserver((mutations) => {
        const newCandidates: HTMLElement[] = [];

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;

                // check inserted node
                const el = node as HTMLElement;
                if (el.matches(DEFAULT_CONFIG.interactiveSelectors)) {
                    newCandidates.push(el);
                }

                // check descendants of inserted node
                for (const child of el.querySelectorAll<HTMLElement>(DEFAULT_CONFIG.interactiveSelectors)) {
                    newCandidates.push(child);
                }
            }
        }

        if (newCandidates.length === 0) return;

        console.debug(
            `[suspicious-ui-detector] MutationObserver found ${newCandidates.length} new candidates`
        );

        const result = extractEvidence(newCandidates, DEFAULT_CONFIG);

        // apply frame-specific ID offset
        for (const pkt of result.packets) {
            pkt.id += idOffset;
        }

        // merge new elements into existing element map
        const startID = Math.max(...elementMap.keys(), -1) + 1;
        const newMap = new Map(
            newCandidates.map((e, i) => [startID + i, e])
        );

        for (const [id, el] of newMap) {
            elementMap.set(id, el);
        }

        // resolve existing packet IDs
        for (let i = 0; i < result.packets.length; i++) {
            result.packets[i].id = startID + i;
        }

        // increase idOffset pass the new batch to avoid collisions
        idOffset += newCandidates.length;

        if (result.packets.length > 0) {
            chrome.runtime.sendMessage(
                { type: "classify", packets: result.packets, url: result.url },
                () => void chrome.runtime.lastError,
            );
        }
    });

    for (const container of containers) {
        observer.observe(container, { childList: true, subtree: true });
    }

    console.debug(
        `[suspicious-ui-detector] observing ${containers.length} ad containers for late injection`
    );
}

function runDetection() {
    const extractionResult = runPipeline();

    console.debug(
        `extracted ${extractionResult.packets.length} packets`,
        `from ${extractionResult.url}`,
    );

    if (extractionResult.packets.length > 0) {
        chrome.runtime.sendMessage(
            { type: "classify", packets: extractionResult.packets, url: extractionResult.url },
            () => void chrome.runtime.lastError,
        );
    }

    // start watching for late injected ad content
    observeAdContainers();
}

if ((window as any).__suspiciousUiDetectorRan) {
    console.debug("[suspicious-ui-detector] skipping duplicate run in frame");
} else {
    (window as any).__suspiciousUiDetectorRan = true;

    if (window !== window.top && SAFE_IFRAME_HOSTS.has(window.location.hostname)) {
        console.debug("[suspicious-ui-detector] skipping safe embed iframe")
        // skip detection for safe iframe hosts
    } else {
        // --- Init ---

        injectStyles();
        window.addEventListener("scroll", repositionAllOverlays, { passive: true });
        window.addEventListener("resize", repositionAllOverlays, { passive: true });

        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            // listen for toggle messages from the background worker
            if (message.type === "classificationResult") {
                handleClassifications([message.result]);
            } else if (message.type === "detectionToggle") {
                if (message.enabled) {
                    runDetection();
                } else {
                    clearAllOverlays();
                }
            } else if (message.type === "getDetections") {
                sendResponse({ count: flaggedElements.size });
            }

            // listen for relayed iframe flag messages from the background worker
            if (message.type === "iframeFlagRelay") {
                if (window !== window.top) return

                const sourceHost = safeHostname(message.sourceURL)
                if (!sourceHost) return;

                const iframes = document.querySelectorAll("iframe");
                for (const iframe of iframes) {
                    const iframeHost = safeHostname(iframe.src)
                    if (iframeHost && iframeHost == sourceHost) {
                        const id = 10000 + Array.from(iframes).indexOf(iframe);
                        highlightElement(id, iframe, message.explanation);
                        break;
                    }
                }
            }
        });

        // --- Entry point ---

        // ask background if detection should run for the current hostname
        chrome.runtime.sendMessage(
            {type: "contentReady", hostname: window.location.hostname},
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[suspicious-ui-detector] contentReady handshake failed:",
                        chrome.runtime.lastError.message);
                    return;
                }

                if (response?.shouldRun) {
                    idOffset = response.idOffset ?? 0;
                    runDetection();
                } else {
                    console.debug("[suspicious-ui-detector] background says skip detection for this page")
                }
            }
        );
    }

    /** Helper that extracts domain from url */
    function safeHostname(url?: string): string | null {
        if (!url) return null;
        try { return new URL(url).hostname; }
        catch { return null;}
    }
}
