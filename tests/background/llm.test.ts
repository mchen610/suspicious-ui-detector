import { describe, it, expect } from "vitest";
import { _testing } from "../../src/background/llm";
import { EvidencePacket } from "../../src/shared/types";

const { buildPrompt, classifyOne, SYSTEM_PROMPT } = _testing;

/** Build a minimal EvidencePacket for testing. */
function makePacket(overrides: Partial<EvidencePacket> = {}): EvidencePacket {
	return {
		id: 0,
		tagName: "a",
		HTMLSnippet: '<a href="/download">Download Now</a>',
		attributes: { href: "/download" },
		style: { pos: "static", zIndex: "auto", opacity: "1", display: "block", ptrEvents: "auto", cursor: "pointer" },
		position: { top: 100, left: 50, width: 200, height: 40, viewportCoverageRatio: 0.01, isInViewport: true },
		styleAncestry: [],
		elementText: "Download Now",
		isInIFrame: false,
		...overrides,
	};
}

// --- buildPrompt ---

describe("buildPrompt", () => {
	it("includes tag and HTML snippet", () => {
		const prompt = buildPrompt(makePacket({ tagName: "button" }));
		expect(prompt).toContain("<button>");
		expect(prompt).toContain("Download Now");
	});

	it("includes href when present", () => {
		const prompt = buildPrompt(makePacket({ attributes: { href: "https://example.com" } }));
		expect(prompt).toContain("href=https://example.com");
	});

	it("omits href line when not present", () => {
		const prompt = buildPrompt(makePacket({ attributes: {}, HTMLSnippet: "<button>Click</button>" }));
		expect(prompt).not.toContain("\nhref=");
	});

	it("includes pos when non-static", () => {
		const prompt = buildPrompt(makePacket({
			style: { pos: "fixed", zIndex: "auto", opacity: "1", display: "block", ptrEvents: "auto", cursor: "pointer" },
		}));
		expect(prompt).toContain("pos=fixed");
	});

	it("omits pos when static", () => {
		const prompt = buildPrompt(makePacket());
		expect(prompt).not.toContain("pos=");
	});

	it("includes iframe flag when true", () => {
		const prompt = buildPrompt(makePacket({ isInIFrame: true }));
		expect(prompt).toContain("iframe=true");
	});

	it("omits iframe flag when false", () => {
		const prompt = buildPrompt(makePacket({ isInIFrame: false }));
		expect(prompt).not.toContain("iframe");
	});

	it("includes elementText", () => {
		const prompt = buildPrompt(makePacket({ elementText: "Download Now" }));
		expect(prompt).toContain("elementText: Download Now");
	});

	it("truncates long HTML snippets", () => {
		const longHtml = "<a>" + "x".repeat(500) + "</a>";
		const prompt = buildPrompt(makePacket({ HTMLSnippet: longHtml }));
		// First line: "<tag> <snippet>" — snippet capped at 120
		const firstLine = prompt.split("\n")[0];
		expect(firstLine.length).toBeLessThanOrEqual(130); // tag + space + 120
	});
});

// --- classifyOne ---

describe("classifyOne", () => {
	function mockEngine(content: string) {
		return {
			chat: {
				completions: {
					create: async () => ({
						choices: [{ message: { content } }],
					}),
				},
			},
		} as any;
	}

	it("returns suspicious when last line is SUSPICIOUS", async () => {
		const r = await classifyOne(mockEngine("This looks like a fake download.\nSUSPICIOUS"), "test");
		expect(r.suspicious).toBe(true);
	});

	it("returns suspicious for bare SUSPICIOUS", async () => {
		expect((await classifyOne(mockEngine("SUSPICIOUS"), "test")).suspicious).toBe(true);
	});

	it("returns suspicious case-insensitive", async () => {
		expect((await classifyOne(mockEngine("reasoning here\nSuspicious"), "test")).suspicious).toBe(true);
	});

	it("returns safe when last line is SAFE even if reasoning mentions suspicious", async () => {
		const response = "The button does not contain any suspicious signals.\nSAFE";
		expect((await classifyOne(mockEngine(response), "test")).suspicious).toBe(false);
	});

	it("returns safe for SAFE", async () => {
		expect((await classifyOne(mockEngine("SAFE"), "test")).suspicious).toBe(false);
	});

	it("returns safe for empty response", async () => {
		expect((await classifyOne(mockEngine(""), "test")).suspicious).toBe(false);
	});

	it("returns safe for garbage response", async () => {
		expect((await classifyOne(mockEngine("I don't know"), "test")).suspicious).toBe(false);
	});

	it("preserves raw response for transcript logging", async () => {
		const response = "Normal subscribe button.\nSAFE";
		const r = await classifyOne(mockEngine(response), "test");
		expect(r.raw).toBe(response);
	});
});
