import { test, expect } from "@playwright/test";
import { injectPipeline, runFullPipeline } from "./helpers/inject";
import {AncestorStyleEntry, EvidencePacket} from "../../src/shared/types";
import {EventData} from "node:test";

test.describe("extractEvidence: General Functionality Tests", () => {

    test.describe("getBoundingClientRect", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/sticky-banner-ad.html");
            await injectPipeline(page);
        });

        test("reports pixel positions for fixed-position banners", async ({ page }) => {
            const res = await runFullPipeline(page);
            const topBannerPkt = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("https://ad.example.com/top")
            );

            expect(topBannerPkt).toBeDefined();
            expect(topBannerPkt.position.top).toBeLessThan(80); // top pos between 0 and 80 acceptable
            expect(topBannerPkt.position.isInViewport).toBe(true);
        });

        test("reports pixel positions for fixed-position bottom bar", async ({ page }) => {
            const res = await runFullPipeline(page);
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            const bottomBarPkt = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("https://ad.example.com/bottom")
            );

            expect(bottomBarPkt).toBeDefined();
            expect(bottomBarPkt.position.top).toBeGreaterThan(viewportHeight - 150); // top pos between 'vp' - 150 and 'vp'
            expect(bottomBarPkt.position.isInViewport).toBe(true);
        });

        test("computes nonzero viewportCoverageRatio for large elements", async ({ page }) => {
            const res = await runFullPipeline(page);
            const hasSignificantCoverage = res.packets.filter(
                (p: EvidencePacket) => p.style.pos === "fixed"
            ).some(
                (p: EvidencePacket) => p.position.viewportCoverageRatio > 0.01
            );

            expect(hasSignificantCoverage).toBe(true);
        });
    });

    test.describe("getComputedStyle", () => {
        test("extracts computed position values", async ({ page }) => {
            await page.goto("/sticky-banner-ad.html");
            await injectPipeline(page);

            const res = await runFullPipeline(page);

            const hasFixed = res.packets.some(
                (p: EvidencePacket) => p.style.pos === "fixed"
            );

            expect(hasFixed).toBe(true);
        });

        test("extracts cursor style", async ({ page }) => {
            await page.goto("/fake-download-page.html");
            await injectPipeline(page);

            const res = await runFullPipeline(page);

            const ptrPkts = res.packets.filter(
                (p: EvidencePacket) => p.style.cursor === "pointer"
            );

            expect(ptrPkts.length).toEqual(3);
        });
    });

    test.describe("style ancestry walk", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/deeply-nested-ad.html");
            await injectPipeline(page);
        });

        test("captures ancestry through deeply nested elements", async ({ page }) => {
            const res = await runFullPipeline(page);
            const link = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("ad.example.com/deep")
            );

            expect(link).toBeDefined();
            expect(link.styleAncestry.length).toEqual(12);  // 12 nestings present and 12 < 30 = maxStyleAncestorDepth

            const ancestorPositions = link.styleAncestry.map(
                (a: AncestorStyleEntry) => a.pos
            );

            expect(ancestorPositions).toContain("relative"); // from 10 levels up
            expect(ancestorPositions).toContain("absolute"); // from 7 levels up
        });

        test("records correct depth ordering", async ({ page }) => {
            const res = await runFullPipeline(page);
            const link = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("ad.example.com/deep")
            );

            for (let i = 0; i < link.styleAncestry.length; i++) {
                expect(link.styleAncestry[i].depth).toBe(i + 1)
            }
        });

        test("respects body/html boundary stopping condition", async ({ page }) => {
            const res = await runFullPipeline(page);
            const link = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("ad.example.com/deep")
            );

            const tags = link.styleAncestry.map((a: any) => a.tagName);

            expect(tags).not.toContain("body");
            expect(tags).not.toContain("html");
        });
    });

    test.describe("surrounding text extraction", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/fake-download-page.html");
            await injectPipeline(page);
        });

        test("captures ad-realted text", async ({ page }) => {
            const res = await runFullPipeline(page);

            const fakeDownloadPkt = res.packets.find(
                (p: EvidencePacket) => p.attributes.href?.includes("ad-network.example.com/click")
            );

            expect(fakeDownloadPkt).toBeDefined();

            const text = fakeDownloadPkt.surroundingText.join(" ").toLowerCase();

            expect(text).toMatch(/advertisement|download/i);
        });

        test("respects maxSurroundingTextFragments", async ({ page }) => {
            const res = await runFullPipeline(
                page, { maxSurroundingTextFragments: 2 },
            );

            for (const pkt of res.packets) {
                expect(pkt.surroundingText.length).toBeLessThanOrEqual(2);
            }
        });
    });

    test.describe("iframe handling", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/iframe-ad.html");
            await injectPipeline(page);
        });

        test("discovers iframe elements", async ({ page }) => {
            const res = await runFullPipeline(page);

            const iframePkts = res.packets.filter(
                (p: EvidencePacket) => p.tagName === "iframe"
            );

            expect(iframePkts.length).toEqual(2);
        });

        test("reports isInIFrame as false for elements in the top-level page", async ({ page }) => {
            const res = await runFullPipeline(page);

            for (const pkt of res.packets) {
                expect(pkt.isInIFrame).toBe(false);
            }
        });
    });
});

test.describe("extractEvidence: Capping Stress Tests", () => {
   test.beforeEach(async ({ page }) => {
       await page.goto("/high-element-count.html");
       await injectPipeline(page);
   });

   test("fixed top banner has correct positional data on dense page", async ({ page }) => {
       const res = await runFullPipeline(page);

       const topBanner = res.packets.find(
           (p: EvidencePacket) =>
               p.attributes.href?.includes("ad.example.com/top-banner")
       );

       expect(topBanner).toBeDefined();
       expect(topBanner.position.top).toBeLessThan(80);
       expect(topBanner.position.isInViewport).toBe(true);
   });

   test("disguised download button packet contains \"download\" in surrounding text", async ({ page }) => {
       const res = await runFullPipeline(page);

       const disguised = res.packets.find(
           (p: EvidencePacket) =>
               p.attributes.href?.includes("ad.example.com/disguised-download")
       );

       expect(disguised).toBeDefined();

       const text = disguised.surroundingText.join(" ").toLowerCase();
       expect(text).toMatch(/download/i);
   });

    test("evidence packets include ad containers on dense pages", async ({ page }) => {
        const res = await runFullPipeline(page);

        const adPkts = res.packets.filter((p: any) =>
            p.HTMLSnippet.includes("adsbygoogle") ||
            p.HTMLSnippet.includes("data-ad-slot") ||
            p.HTMLSnippet.includes("data-ad")
        );

        expect(adPkts.length).toBeGreaterThanOrEqual(1);
    });
});

test.describe("extractEvidence: Advertisement Label in Sibling Tests", () => {
   test.beforeEach(async ({ page }) => {
       await page.goto("/adsbygoogle-nested.html");
       await injectPipeline(page);
   });

   test("captures sibling \"Advertisement\" text for at least one ins.adsbygoogle elements", async ({ page }) => {
       const res = await runFullPipeline(page);

       const insPkts = res.packets.filter(
           (p: EvidencePacket) =>
               p.tagName === "ins" && p.HTMLSnippet.includes("adsbygoogle")
       );

       expect(insPkts.length).toBeGreaterThanOrEqual(1); // at least one ins.adsbygoogle element found

       const hasAdLabel = insPkts.some(
           (p: EvidencePacket) =>
               p.surroundingText.join(" ").toLowerCase().includes("advertisement")
       );

       expect(hasAdLabel).toBe(true); // at least one found element has ad surrounding text
   });

   test("captures sibling label outside the ad container", async ({ page }) => {
       const res = await runFullPipeline(page);

       const firstAd = res.packets.find(
           (p: EvidencePacket) =>
               p.tagName === "ins" && p.HTMLSnippet.includes("1111111111")
       );

       expect(firstAd).toBeDefined();

       const text = firstAd.surroundingText.join(" ").toLowerCase();

       expect(text).toContain("advertisement");
   });

    test("captures advertisement label through intervening wrapper div", async ({ page }) => {
        const res = await runFullPipeline(page);

        const ezoicIns = res.packets.find(
            (p: EvidencePacket) =>
                p.tagName === "ins" && p.HTMLSnippet.includes("3333333333")
        );

        expect(ezoicIns).toBeDefined();

        const text = ezoicIns.surroundingText.join(" ").toLowerCase();

        expect(text).toContain("advertisement");
    });
});

test.describe("extractEvidence: Wrapper Isolated Ad Link Tests", () => {
   test.beforeEach(async ({ page }) => {
       await page.goto("/wrapper-isolated-ad.html");
       await injectPipeline(page);
   });

   // the bare minimum
   test("captures label from parent's <span> sibling", async ({ page }) => {
       const res = await runFullPipeline(page);

       const pkt = res.packets.find(
           (p: EvidencePacket) => p.attributes.href?.includes("click?id=3")
       );

       expect(pkt).toBeDefined();

       const text = pkt.surroundingText.join(" ").toLowerCase();

       expect(text).toContain("advertisement");
   });

   // more aggressive than previous test case
   test("captures label from parent's <p> sibling", async ({ page }) => {
       const res = await runFullPipeline(page);

       const pkt = res.packets.find(
           (p: EvidencePacket) => p.attributes.href?.includes("click?id=1")
       );

       expect(pkt).toBeDefined();

       const text = pkt.surroundingText.join(" ").toLowerCase();

       expect(text).toContain("your file is ready for download");
   });

   test("captures sibling label inside wrapper", async ({ page }) => {
       const res = await runFullPipeline(page);

       const pkt = res.packets.find(
           (p: EvidencePacket) => p.attributes.href?.includes("click?id=2")
       );

       expect(pkt).toBeDefined();

       const text = pkt.surroundingText.join(" ").toLowerCase();

       expect(text).toContain("advertisement");
   });
});

test.describe("extractEvidence: ATTR_NAMES Tests", () => {
   test.beforeEach(async ({ page }) => {
       await page.goto("/adsbygoogle.html");
       await injectPipeline(page);
   });

   test("ins.adsbygoogle packets include data-ad-slot in attributes", async ({ page }) => {
       const res = await runFullPipeline(page);

       const insPackets = res.packets.filter(
           (p: any) => p.tagName === "ins" && p.HTMLSnippet.includes("adsbygoogle")
       );

       expect(insPackets.length).toBeGreaterThanOrEqual(1);

       for (const pkt of insPackets) {
           expect(pkt.attributes["data-ad-slot"]).toBeDefined();
       }
   });

   test("ad container packets include data-ad-client in attributes", async ({ page }) => {
       const res = await runFullPipeline(page);

       const insPackets = res.packets.filter(
           (p: any) => p.tagName === "ins" && p.HTMLSnippet.includes("adsbygoogle")
       );

       const hasClient = insPackets.some(
           (p: any) => p.attributes["data-ad-client"] !== undefined
       );

       expect(hasClient).toBe(true);
   });
});
