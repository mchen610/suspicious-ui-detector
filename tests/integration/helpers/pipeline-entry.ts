/**
 * This file acts as the entry point for Vite injection into Playwright
 * Web pages. This allows our functions `discoverCandidates` and
 * `extractEvidence` to be run inside the browser page contents.
 */

import { discoverCandidates } from "../../../src/content/selectors";
import { extractEvidence } from "../../../src/content/extractor";
import { DEFAULT_CONFIG} from "../../../src/content/config";

// Expose selectors/extractor functions to the global window so that
// Playwright can access them
(window as any).__pipeline = {
    discoverCandidates,
    extractEvidence,
    DEFAULT_CONFIG,
};