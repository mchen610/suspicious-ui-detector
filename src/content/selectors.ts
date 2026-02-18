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
        // Check if ignored tag first to avoid 'getComputedStyle()' and 'getBoundingClientRect()' calls
        let curr = elem.parentElement;
        while (curr) {
            if (config.ignoredTags.has(curr.tagName.toLowerCase())) return false;

            curr = curr.parentElement;
        }

        const style = getComputedStyle(elem)
        if (style.display === "none" || style.visibility === "hidden") return false;

        const rect = elem.getBoundingClientRect();
        if (rect.width < config.minElemWidth || rect.height < config.minElemHeight) return false;

        return true;
    });

    // Capping
    return filtered.slice(0, config.maxElems);

    /** NOTE: Consider sorting by priority prior to capping, if needed. */
}
