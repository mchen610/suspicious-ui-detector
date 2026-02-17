/**
 * This file acts as a factory function returning a plain Object
 * that holds every tunable parameter referenced in the extraction
 * pipeline.
 */

export interface ExtractionConfig {
    maxElems: number;
    maxSnippetLength: number;
    maxSurroundingTextLength: number;
    maxSurroundingTextFragments: number;
    maxStyleAncestorDepth: number;  // used in style ancestry walk
    ancestorDepth: number;          // used in the text context walk
    siblingRadius: number;          // number of sibling elements to inspect on each side
    minElemWidth: number;           // min width to be considered (in pixels)
    minElemHeight: number;          // min height to be considered (in pixels)
    interactiveSelectors: string;   // CSS selector string used in 'selector.ts'
    ignoredTags: Set<string>;       // tags to strip during sanitization
}

export const DEFAULT_CONFIG: ExtractionConfig = {
    maxElems: 30,
    maxSnippetLength: 512,
    maxSurroundingTextLength: 200,
    maxSurroundingTextFragments: 5,
    maxStyleAncestorDepth: 30,      // fairly high since nestings >25 observed in practice
                                    // NOTE: Consider unbounded up to <iframe> or <body> boundary
    ancestorDepth: 3,               // relative low since text labels tend to live closer by
    siblingRadius: 2,
    minElemWidth: 10,
    minElemHeight: 10,
    interactiveSelectors: [
        "a[href]",
        "button",
        "iframe",
        "input[type='submit']",
        "input[type='button']",
        "[role='button']",          // 'role' overrides implicit, default role
        "[onclick]",
    ].join(", "),
    ignoredTags: new Set([
        "script",
        "style",
        "noscript",
        "svg",
        "link",
        "meta",
    ]),
}

/**
 * NOTE: For future parameter tuning, consider the following.
 *   =>  'maxElems' controls the total output volume (i.e. packets x per-packet size
 *       = total token to process) and the total extraction time (since each element
 *       triggers 'getComputedStyle()' + DOM traversal). Also, 'maxElem' determines
 *       if we catch all threats, as well as if we surpass the SLM's context window,
 *       thus 'maxElem' is the most important for tuning.
 *   =>  'maxSnippetLength' is the largest field in most 'EvidencePacket's. There is
 *       a clear tradeoff between capturing enough HTML and surpassing the SLM context
 *       window. Therefore, 'maxSnippetLength' and 'maxElems' are inversely
 *       proportional, and need to be maintained as such
 *   =>  'maxStyleAncestryDepth' = n means adds an additional n 'getComputedStyle()'
 *       calls per element. From empirical research, pointer events tend to
 *       concentrate < 20 levels up from the innermost nested "Download" or other
 *       text so preventing 'getComputedStyle()' calls between say 20 and n could
 *       result in a 1.5x speedup.
 *   =>  'interactiveSelectors' determines recall. So this is a correctness parameter,
 *       rather than a performance parameter. Perform testing by running the extractor
 *       on target sites and manually checking what was missed.
 */
