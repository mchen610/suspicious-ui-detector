/**
 * This file orchestrates the DOM parsing and extraction pipeline:
 * 'selector.ts' -> candidate list -> 'extractor.ts' ->
 *      'ExtractionResult' list -> 'chrome.runtime.sendMessage()' ->
 *      background service worker -> SLM inference engine
 */

import { discoverCandidates } from "./selectors";
import { extractEvidence } from "./extractor";
import { DEFAULT_CONFIG } from "./config";


const candidateList = discoverCandidates(document, DEFAULT_CONFIG);
const result = extractEvidence(candidateList, DEFAULT_CONFIG);

// Signal bucketing (temp to visualize classification)
const buckets = {
    high: [] as string[],
    medium: [] as string[],
    low: [] as string[],
};

for (const pkt of result.packets) {
    const isFixed = pkt.style.pos === "fixed" || pkt.style.pos === "sticky";
    const viewport = pkt.position.viewportCoverageRatio * 100;
    const hasAdText = pkt.surroundingText.some((t) =>
        /\bads?\b|adverti|sponsor|download|install|continue/i.test(t)
    );
    const hasStrongAdText = pkt.surroundingText.some((t) =>
        /\badvertisement\b|\bsponsored\b/i.test(t)
    );

    const signals = [
        isFixed && "fixed-pos",
        viewport > 2.5 && "large-vp",
        hasStrongAdText && "strong-ad-text",
        hasAdText && !hasStrongAdText && "ad-text",
        pkt.tagName === "iframe" && "is-iframe",
    ].filter(Boolean) as string[];

    const tag =
        `#${pkt.id} <${pkt.tagName}> [${signals.join(", ")}]` +
        ` vp=${viewport.toFixed(2)}%` +
        ` @(${Math.round(pkt.position.top)},${Math.round(pkt.position.left)})` +
        ` ${Math.round(pkt.position.width)}x${Math.round(pkt.position.height)}`;

    if (signals.length >= 2 || hasStrongAdText) buckets.high.push(tag);
    else if (signals.length === 1)              buckets.medium.push(tag);
    else                                        buckets.low.push(tag);
}

// ad-container checker (made a function to support delayed rechecks) since many ad networks
// like Ezoic, Google AdSense, Google Publisher Tag, etc. inject content asynchronously
function checkAdSlots(label: string): void {
    const slots = document.querySelectorAll(
        DEFAULT_CONFIG.adContainerSelectors
    );

    const found: string[] = [];
    for (const elem of slots) {
        const rect = (elem as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(elem);

        if ((rect.width === 0 && rect.height === 0) || style.display === "none") continue;

        const iframes = elem.querySelectorAll("iframe").length;
        const populated = elem.children.length > 0 && (elem as HTMLElement).scrollHeight > 1;

        found.push(
            `<${elem.tagName.toLowerCase()}>` +
            ` ${elem.id || elem.className.toString().slice(0, 40)}` +
            ` @(${Math.round(rect.top)},${Math.round(rect.left)})` +
            ` ${Math.round(rect.width)}x${Math.round(rect.height)}` +
            ` children=${elem.children.length} iframes=${iframes}` +
            ` populated=${populated}`
        );

        console.log(`Ad-slot check [${label}] (${found.length})`);
        found.forEach((slot) => console.log(slot));
    }
}

// console logging
console.log(`HIGH signal (${buckets.high.length}):`, buckets.high);
console.log(`MEDIUM signal (${buckets.medium.length}):`, buckets.medium);
console.log(`LOW signal (${buckets.low.length}):`, buckets.low);

checkAdSlots("t=0s");
// setTimeout(() => checkAdSlots("t=3s"), 3000);
// setTimeout(() => checkAdSlots("t=6s"), 6000);
