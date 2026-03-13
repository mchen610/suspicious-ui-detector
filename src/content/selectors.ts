/**
 * This file performs element discovery and pre-filtering before
 * returning an array of UI candidate 'Element's to then be passed to the
 * extraction layer.
 */

import { ExtractionConfig, DEFAULT_CONFIG } from "./config";


export function discoverCandidates(
    root: Document | HTMLElement = document,
    config: ExtractionConfig = DEFAULT_CONFIG,
): HTMLElement[] {

    // Discovery

    // query interactive elements first
    const interactive = Array.from(
        root.querySelectorAll<HTMLElement>(config.interactiveSelectors)
    );

    // query ad containers
    const adContainers = Array.from(
        root.querySelectorAll<HTMLElement>(config.adContainerSelectors)
    );

    // deduplicate
    const seen = new Set<HTMLElement>();
    const merged: HTMLElement[] = [];
    for (const elem of [...interactive, ...adContainers]) {
        if (!seen.has(elem)) {
            seen.add(elem);
            merged.push(elem);
        }
    }

    // Filtering

    const filtered = merged.filter((elem) => {
        // check if ignored tag first to avoid 'getComputedStyle()' and 'getBoundingClientRect()' calls
        let curr = elem.parentElement;
        while (curr) {
            if (config.ignoredTags.has(curr.tagName.toLowerCase())) return false;

            curr = curr.parentElement;
        }

        const style = getComputedStyle(elem)
        if (style.display === "none" || style.visibility === "hidden") return false;

        const rect = elem.getBoundingClientRect();
        if (rect.width < config.minElemWidth || rect.height < config.minElemHeight) return false;

        // skip elements with no meaningful content (no text, no href, no src)
        const hasText = (elem.textContent || "").trim().length > 0;
        const hasLink = elem.hasAttribute("href") || elem.hasAttribute("src") || elem.querySelector("a[href], iframe[src]") !== null;
        if (!hasText && !hasLink) return false;

        return true;
    });

    // Priority Capping

    const adSet = new Set(adContainers);

    // check if element itself or if some ancestor is an ad container
    const isAdRelated = (elem: HTMLElement): boolean => {
        if (adSet.has(elem)) return true;
        return elem.closest(config.adContainerSelectors) !== null;
    }

    const interactiveSet = new Set(interactive);

    const adFiltered: HTMLElement[] = [];
    const interactiveFiltered: HTMLElement[] = [];
    for (const elem of filtered) {
        if (isAdRelated(elem)) {
            // Skip ad containers that have interactive descendants already in the
            // candidate list — the child is the actual suspicious element.
            if (adSet.has(elem) && filtered.some(other => interactiveSet.has(other) && elem.contains(other) && other !== elem)) {
                continue;
            }
            adFiltered.push(elem);
        } else {
            interactiveFiltered.push(elem);
        }
    }

    const candidates: HTMLElement[] = [];

    // reserve up to 30% of maxElems slots for ad elements
    const adCap = Math.ceil(config.maxElems * 0.3);
    const used = new Set<HTMLElement>();
    for (const elem of adFiltered) {
        if (candidates.length >= adCap) break;
        candidates.push(elem);
        used.add(elem);
    }

    // fill remaining slots with interactive elements
    for (const elem of interactiveFiltered) {
        if (candidates.length >= config.maxElems) break;
        candidates.push(elem);
        used.add(elem);
    }

    // fill remaining slots (if available) with leftover ad elements
    for (const elem of adFiltered) {
        if (candidates.length >= config.maxElems) break;
        if (!used.has(elem)) {
            candidates.push(elem);
        }
    }

    return candidates;
}
