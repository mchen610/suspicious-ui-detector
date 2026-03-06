import { test, expect } from "@playwright/test";
import { injectPipeline, runFullPipeline } from "./helpers/inject";

test.describe("extractEvidence (Real Browser)", () => {

    test.describe("getBoundingClientRect", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/sticky-banner-ad.html");
            await injectPipeline(page);
        });

        test("reports pixel positions for fixed-position banners", async ({ page }) => {
            const res = await runFullPipeline(page);
            const topBannerPkt = res.packets.find(
                (p: any) => p.attributes.href?.includes("https://ad.example.com/top")
            );

            expect(topBannerPkt).toBeDefined();
            expect(topBannerPkt.position.top).toBeLessThan(80); // top pos between 0 and 80 acceptable
            expect(topBannerPkt.position.isInViewport).toBe(true);
        });

        test("reports pixel positions for fixed-position bottom bar", async ({ page }) => {
            const res = await runFullPipeline(page);
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            const bottomBarPkt = res.packets.find(
                (p: any) => p.attributes.href?.includes("https://ad.example.com/bottom")
            );

            expect(bottomBarPkt).toBeDefined();
            expect(bottomBarPkt.position.top).toBeGreaterThan(viewportHeight - 150); // top pos between 'vp' - 150 and 'vp'
            expect(bottomBarPkt.position.isInViewport).toBe(true);
        });

        test("computes nonzero viewportCoverageRatio for large elements", async ({ page }) => {
            const res = await runFullPipeline(page);
            const hasSignificantCoverage = res.packets.filter(
                (p: any) => p.style.pos === "fixed"
            ).some(
                (p: any) => p.position.viewportCoverageRatio > 0.01
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
                (p: any) => p.style.pos === "fixed"
            );

            expect(hasFixed).toBe(true);
        });

        test("extracts cursor style", async ({ page }) => {
            await page.goto("/fake-download-page.html");
            await injectPipeline(page);

            const res = await runFullPipeline(page);

            const ptrPkts = res.packets.filter(
                (p: any) => p.style.cursor === "pointer"
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
                (p: any) => p.attributes.href?.includes("ad.example.com/deep")
            );

            expect(link).toBeDefined();
            expect(link.styleAncestry.length).toEqual(12);  // 12 nestings present and 12 < 30 = maxStyleAncestorDepth

            const ancestorPositions = link.styleAncestry.map(
                (a: any) => a.pos
            );

            expect(ancestorPositions).toContain("relative"); // from 10 levels up
            expect(ancestorPositions).toContain("absolute"); // from 7 levels up
        });

        test("records correct depth ordering", async ({ page }) => {
            const res = await runFullPipeline(page);
            const link = res.packets.find(
                (p: any) => p.attributes.href?.includes("ad.example.com/deep")
            );

            for (let i = 0; i < link.styleAncestry.length; i++) {
                expect(link.styleAncestry[i].depth).toBe(i + 1)
            }
        });

        test("respects body/html boundary stopping condition", async ({ page }) => {
            const res = await runFullPipeline(page);
            const link = res.packets.find(
                (p: any) => p.attributes.href?.includes("ad.example.com/deep")
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
                (p: any) => p.attributes.href?.includes("ad-network.example.com/click")
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
                (p: any) => p.tagName === "iframe"
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
