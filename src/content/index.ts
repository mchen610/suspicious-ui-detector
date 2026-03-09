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

import { ExtractionResult } from "../shared/types"
import { discoverCandidates } from "./selectors";
import { extractEvidence, buildElementMap } from "./extractor";
import { DEFAULT_CONFIG } from "./config";


// maps packet IDs to DOM elements
let elementMap = new Map<number, HTMLElement>();

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
 * worker. Delegates highlighting of each classification result to the
 * highlighting module -> TODO
 */
function handleClassifications(
    classifications: Array<{ id: number; category: string; confidence: string }>
): void {
    for (const result of classifications) {
        const elem = elementMap.get(result.id);
        if (!elem) continue;

        // TODO: (SUS-15 Visual Highlighting) apply visual overlay to 'elem' using
        //  result.category and result.confidence

        console.debug(
            `#${result.id} <${elem.tagName.toLowerCase()}>`,
            `classified as ${result.category} (${result.confidence})`,
        );
    }
}

// Entry point

const extractionResult = runPipeline();

console.debug(
    `extracted ${extractionResult.packets.length} packets`,
    `from ${extractionResult.url}`,
);

// TODO: (SUS-10 Message Passing) Send 'extractionResult' to the background service worker
//  via 'chrome.runtime.sendMessage' and wait for a response, then feeding the classification
//  result into 'handleClassifications' which performs the visual highlighting.

// TODO: Consider setting up a MutationObserver or delayed recheck that call 'runPipeline'
//  again after ad networks have injected content (if needed).
