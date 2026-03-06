import { test, expect } from "@playwright/test";
import { injectPipeline, runDiscoverCandidates } from "./helpers/inject";

test.describe("discoverCandidates (Real Browser)", () => {

    test.describe("fake download page", () => {
       test.beforeEach(async ({ page }) => {
           await page.goto("/fake-download-page.html");
           await injectPipeline(page);
       });

       test("discovers both real and fake download links", async ({ page }) => {
            const candidates = await runDiscoverCandidates(page);

            const hrefs = candidates.map((c: any) => c.href).filter(Boolean);

            expect(hrefs).toContain("/files/superapp-3.2.1.apk");
            expect(hrefs.some((ref: any) => ref.includes("ad-network.example.com"))).toBe(true);
       });

       test("discovers ad container elements", async ({ page }) => {
           const candidates = await runDiscoverCandidates(page);

           const ad_candidates = candidates.filter((c: any) =>
               c.id.startsWith("ezwrp") || c.className.includes("adsbygoogle") || c.tagName === "ins"
           );

           expect(ad_candidates.length).toEqual(2);
       });

       test("respects minELemWidth and minElemHeight", async ({ page }) => {
           const candidates = await runDiscoverCandidates(page);

           for (const c of candidates) {
               expect(c.rect.width).toBeGreaterThanOrEqual(10);
               expect(c.rect.height).toBeGreaterThanOrEqual(10);
           }
       });
    });

    test.describe("hidden elements filtering", () => {
        test.beforeEach(async ({ page }) => {
            await page.goto("/hidden-elements.html");
            await injectPipeline(page);
        });

        test("filters out display:none elements", async ({ page }) => {
            const candidates = await runDiscoverCandidates(page);
            const texts = candidates.map((c: any) => c.textContent);

            expect(texts).not.toContain("Hidden Link (display:none");
        });

        test("filters out visibility:hidden elements", async ({ page }) => {
            const candidates = await runDiscoverCandidates(page);
            const texts = candidates.map((c: any) => c.textContent);

            expect(texts).not.toContain("Hidden Button (visibility:hidden");
        });

        test("retains visible interactive elements", async ({ page }) => {
            const candidates = await runDiscoverCandidates(page);
            const texts = candidates.map((c: any) => c.textContent);

            expect(texts).toContain("Visible Button");
            expect(texts).toContain("Visible Link");
            expect(texts).toContain("Role Button");
        });

        test("retains offscreen elements with valid size and visibility", async ({ page }) => {
            const candidates = await runDiscoverCandidates(page);
            const texts = candidates.map((c: any) => c.textContent);

            expect(texts).toContain("Offscreen Link");
        });
    });


    test.describe("capping", () => {
        test("respects maxElems cap", async ({ page }) => {
            await page.goto("/fake-download-page.html");
            await injectPipeline(page);

            const candidates = await runDiscoverCandidates(page, { maxElems: 2 });
            expect(candidates.length).toBeLessThanOrEqual(2)
        });
    });
});
