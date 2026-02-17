/**
 * This file defines the shape of what the extraction pipeline produces.
 * All fields are non-Optional since they are either required by the SLM
 * for classification, the background service worker for routing or the
 * popup for display.
 */

/**
 * Structured context extracted from a single interactive DOM element.
 * Designed to be token-efficient for SLM consumption.
 */
export interface EvidencePacket {
    id: number;                     // incremental ID unique to a given extraction pass
    tagName: string;                // Ex. "a", "button", "iframe"
    HTMLSnippet: string;            // truncated outerHTML bounded by config limits
    attributes: Record<string, string>; // Ex. { "href": "www.ufl.edu",  "src": *, "alt": *, "title": *,
                                        // "aria-label": *, "download": *, "target": * }
    style: StyleData;
    position: PositionData;
    styleAncestry: AncestorStyleEntry[];
    surroundingText: string[];      // Ex. ["Ad", "Sponsored", "Download", ... "Your file is ready"]
    isInIFrame: boolean;
}

/** Subset of computed style properties relevant to deceptive UI detection. */
export interface StyleData {
    pos: string;
    zIndex: string;
    opacity: string;
    display: string;
    ptrEvents: string;
    cursor: string;
}

/** Positional metadata derived from 'getBoundingClientRect()'. */
export interface PositionData {
    top: number;
    left: number;
    width: number;
    height: number;
    viewportCoverageRatio: number;  // element area as a fraction of the viewport area
    isInViewport: boolean;
}

/** Compact subset of 'StyleData' for an ancestor of a DOM element of interest. */
export interface AncestorStyleEntry {
   depth: number;                   // number of levels above the target element, where 1 ~ parent
   tagName: string;
   pos: string;
   zIndex: string;
   ptrEvents: string;
   opacity: string;
}

/** Output of one extraction pass on a given Web page. */
export interface ExtractionResult {
    url: string;
    timestamp: string;              // ISO formatted
    candidateCount: number;         // Number of UI elements found (prior to capping)
    packets: EvidencePacket[];      // capped at 'config.maxElems'
}
