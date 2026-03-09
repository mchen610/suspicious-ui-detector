/**
 * This file acts a helper module handling injecting the pipeline bundle and
 * calling it.
 */

import {Page} from "@playwright/test";
import * as path from "path"
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Injects the pipeline bundle into the page and returns the extraction result.
 */
export async function injectPipeline(page: Page) {
    // add bundled script to the page
    await page.addScriptTag({
        path: path.resolve(__dirname, "../fixtures/pipeline.js"),
    });

    // verify script loaded
    const loaded = await page.evaluate(() => {
        return typeof (window as any).__pipeline !== "undefined";
    });

    if (!loaded) {
        throw new Error("Pipeline bundle failed to load on page");
    }
}

/**
 * Runs discoverCandidates in the page context and returns serializable results.
 */
export async function runDiscoverCandidates(
    page: Page,
    configOverrides?: Record<string, any>,
) {
    return page.evaluate((overrides) => {
        const { discoverCandidates, DEFAULT_CONFIG } = (window as any).__pipeline;

        // apply any config overrides
        const config = overrides ? {
            ...DEFAULT_CONFIG,
            ...overrides,
            ignoredTags: overrides.ignoredTags ?
                new Set(overrides.ignoredTags) : DEFAULT_CONFIG.ignoredTags,
        } : DEFAULT_CONFIG;

        const candidates = discoverCandidates(document, config);

        // serialize candidates to plain object-representations of their HTMLElement counterparts
        return candidates.map((el: HTMLElement) => ({
            tagName: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            href: el.getAttribute("href"),
            textContent: (el.textContent || "").trim().slice(0, 200),
            rect: (() => {
                const r = el.getBoundingClientRect();
                return { top: r.top, left: r.left, width: r.width, height: r.height };
            })(),
        }));

    }, configOverrides);
}

/**
 * Runs the full pipeline from candidate discovery to context extraction and
 * returns the ExtractionResult.
 */
export async function runFullPipeline(
    page: Page,
    configOverrides?: Record<string, any>,
) {
    return page.evaluate((overrides) => {
        const { discoverCandidates, extractEvidence, DEFAULT_CONFIG } = (window as any).__pipeline;

        // apply any config overrides
        const config = overrides ? {
            ...DEFAULT_CONFIG,
            ...overrides,
            ignoredTags: overrides.ignoredTags ?
                new Set(overrides.ignoredTags) : DEFAULT_CONFIG.ignoredTags,
        } : DEFAULT_CONFIG;

        const candidates = discoverCandidates(document, config);
        return extractEvidence(candidates, config);

    }, configOverrides);
}
