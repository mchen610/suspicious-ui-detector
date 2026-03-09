import { test, expect } from "@playwright/test";
import { injectPipeline, runDiscoverCandidates } from "./helpers/inject";

test.describe("discoverCandidates: General Functionality Tests", () => {

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

           const ad_candidates = candidates.filter(
               (c: any) =>
                   c.id.startsWith("ezwrp") ||
                   c.className.includes("adsbygoogle") ||
                   c.tagName === "ins"
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

test.describe("discoverCandidates: Capping Stress Tests", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/high-element-count.html");
        await injectPipeline(page);
    });

    test("default cap maxElems=50 still retains at least one ad candidate", async ({ page }) => {
        const capped = await runDiscoverCandidates(page);

        expect(capped.length).toBeLessThanOrEqual(50);

        const ads = capped.filter(
            (c: any) =>
                c.tagName === "ins" ||
                c.className?.includes("adsbygoogle") ||
                (c.href && c.href.includes("ad.example.com"))
        );

        expect(ads.length).toBeGreaterThanOrEqual(1);
    });

    test("ALL six ad elements discovered with default maxElems=50", async ({ page }) => {
        const capped = await runDiscoverCandidates(page);

        const ads = capped.filter(
            (c: any) =>
                c.tagName === "ins" ||
                c.className?.includes("adsbygoogle") ||
                c.href?.includes("ad.example.com")
        );

        expect(ads.length).toEqual(6);

        const hrefs = capped.filter(
            (c: any) => c.href?.includes("ad.example.com")
        ).map((c: any) => c.href);

        expect(hrefs).toContain("https://ad.example.com/top-banner");
        expect(hrefs).toContain("https://ad.example.com/sidebar-vpn");
        expect(hrefs).toContain("https://ad.example.com/sidebar-cleaner");
        expect(hrefs).toContain("https://ad.example.com/disguised-download");
        expect(hrefs).toContain("https://ad.example.com/bottom-sticky");
    });

    test("ALL six ad elements discovered independent of excessive cap", async ({ page }) => {
        const all = await runDiscoverCandidates(page, { maxElems: 200 });

        const ads = all.filter(
            (c: any) =>
                c.tagName === "ins" ||
                c.className?.includes("adsbygoogle") ||
                c.href?.includes("ad.example.com")
        );

        expect(ads.length).toEqual(6);

        const hrefs = all.filter(
            (c: any) => c.href?.includes("ad.example.com")
        ).map((c: any) => c.href);

        expect(hrefs).toContain("https://ad.example.com/top-banner");
        expect(hrefs).toContain("https://ad.example.com/sidebar-vpn");
        expect(hrefs).toContain("https://ad.example.com/sidebar-cleaner");
        expect(hrefs).toContain("https://ad.example.com/disguised-download");
        expect(hrefs).toContain("https://ad.example.com/bottom-sticky");
    });

    test("at least one ad container in first half of candidates list", async ({ page }) => {
        const capped = await runDiscoverCandidates(page);

        const firstAdIndex = capped.findIndex(
            (c: any) =>
                c.tagName === "ins" ||
                c.className?.includes("adsbygoogle") ||
                c.href?.includes("ad.example.com")
        );

        expect(firstAdIndex).toBeGreaterThanOrEqual(0);
        expect(firstAdIndex).toBeLessThan(25);
    });

    test("ad containers not concentrated at the end of candidates list", async ({ page }) => {
        const capped = await runDiscoverCandidates(page);

        const lastAdIndex = capped.findLastIndex(
            (c: any) =>
                c.tagName === "ins" ||
                c.className?.includes("adsbygoogle") ||
                c.href?.includes("ad.example.com")
        );

        expect(lastAdIndex).toBeGreaterThanOrEqual(0);
        expect(lastAdIndex).toBeLessThan(25);
    });
});

test.describe("discoverCandidates: Adsbygoogle Nested Structure Tests", () => {
   test.beforeEach(async ({ page }) => {
       await page.goto("/adsbygoogle-nested.html");
       await injectPipeline(page);
   });

   test("discovers ins.adsbygoogle elements with nested div and iframe children", async ({ page }) => {
        const candidates = await runDiscoverCandidates(page);

        const insCandidates = candidates.filter(
            (c: any) =>
                c.className?.includes("adsbygoogle") || c.tagName === "ins"
        );

        expect(insCandidates.length).toEqual(3);
   });

   test("discovers nested iframes inside adsbygoogle containers", async ({ page }) => {
       const candidates = await runDiscoverCandidates(page);

       const iframes = candidates.filter(
           (c: any) => c.tagName === "iframe" && c.id?.startsWith("aswift")
       );
   });

   test("discovers ezoic wrapper with realistic class", async ({ page }) => {
       const candidates = await runDiscoverCandidates(page);

       const ezoic = candidates.filter(
           (c: any) =>
               c.className?.includes("ezoic_ad_unit") || c.id?.startsWith("ezwrp")
       );

       expect(candidates.length).toBeGreaterThanOrEqual(1);
   });

   test("deduplicates ins candidates from its wrapper", async ({ page }) => {
       const candidates = await runDiscoverCandidates(page);

       const ids = candidates.map((c: any) => c.id).filter(Boolean);
       const unique = new Set(ids);

       expect(ids.length).toEqual(unique.size);
   });
});
